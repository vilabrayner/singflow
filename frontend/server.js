import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBuildEnvironment } from './scripts/environment.mjs';

const applicationDirectory = dirname(fileURLToPath(import.meta.url));
const hopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export function parseServerEnvironment(environment) {
  let backend;
  try {
    backend = new URL(environment.BACKEND_URL);
  } catch {
    /* validated below */
  }
  const local = backend && ['localhost', '127.0.0.1', '[::1]'].includes(backend.hostname);
  if (
    !backend ||
    /\s/.test(environment.BACKEND_URL) ||
    (backend.protocol !== 'https:' && !(local && backend.protocol === 'http:')) ||
    backend.username ||
    backend.password ||
    backend.pathname !== '/' ||
    backend.search ||
    backend.hash
  ) {
    throw new Error(
      'BACKEND_URL deve ser uma origem HTTPS sem caminho ou credenciais (HTTP apenas em loopback).',
    );
  }
  const port = environment.PORT ?? '3000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('PORT deve ser uma porta entre 1 e 65535.');
  }
  return { backendUrl: backend.origin, port: Number(port) };
}

function filteredHeaders(headers) {
  const blocked = new Set([
    ...hopHeaders,
    ...String(headers.connection ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase()),
  ]);
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !blocked.has(key.toLowerCase())),
  );
}

function problem(response, status, detail) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(status, {
    'Content-Type': 'application/problem+json',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify({ status, detail }));
}

export function createFrontendServer({
  backendUrl,
  staticDirectory,
  primeUiLicense,
  proxyTimeoutMs = 30000,
}) {
  // Validate at startup, never accept a proxy destination from the browser.
  const backend = new URL(parseServerEnvironment({ BACKEND_URL: backendUrl }).backendUrl);
  const directory = realpathSync(staticDirectory);
  if (!statSync(resolve(directory, 'index.html')).isFile())
    throw new Error('Build Angular ausente. Execute npm run build.');
  let config;
  try {
    const value = JSON.parse(readFileSync(resolve(directory, 'config.json'), 'utf8'));
    if (value.apiBaseUrl !== '/api' || typeof value.primeUiLicense !== 'string') throw new Error();
    config = JSON.stringify({
      apiBaseUrl: '/api',
      primeUiLicense: primeUiLicense ?? value.primeUiLicense,
    });
  } catch {
    throw new Error('config.json inválido ou ausente. Prepare o build com apiBaseUrl=/api.');
  }

  function proxy(request, response) {
    const headers = filteredHeaders(request.headers);
    headers.host = backend.host;
    // Replace forwarded headers rather than propagating an arbitrary client chain.
    delete headers.forwarded;
    headers['x-forwarded-host'] = request.headers.host;
    headers['x-forwarded-for'] = request.socket.remoteAddress;
    const protocol = String(request.headers['x-forwarded-proto'] ?? '')
      .split(',')[0]
      .trim();
    headers['x-forwarded-proto'] = request.socket.encrypted
      ? 'https'
      : protocol === 'https'
        ? 'https'
        : 'http';
    const send = backend.protocol === 'https:' ? httpsRequest : httpRequest;
    let timedOut = false;
    const upstream = send(
      {
        protocol: backend.protocol,
        hostname: backend.hostname.replace(/^\[|\]$/g, ''),
        port: backend.port || undefined,
        method: request.method,
        path: request.url,
        headers,
      },
      (incoming) => {
        const outgoing = filteredHeaders(incoming.headers);
        outgoing['cache-control'] = 'no-store';
        // Session cookies must belong to the public frontend origin. Keep all other attributes.
        if (outgoing['set-cookie'])
          outgoing['set-cookie'] = outgoing['set-cookie'].map((cookie) =>
            cookie.replace(/;\s*Domain=[^;]*/gi, ''),
          );
        if (outgoing.location) {
          try {
            const location = new URL(outgoing.location, backend);
            if (location.origin === backend.origin)
              outgoing.location = location.pathname + location.search + location.hash;
          } catch {
            delete outgoing.location;
          }
        }
        response.writeHead(incoming.statusCode ?? 502, outgoing);
        incoming.on('error', () => response.destroy());
        incoming.pipe(response);
      },
    );
    upstream.setTimeout(proxyTimeoutMs, () => {
      timedOut = true;
      upstream.destroy();
    });
    upstream.on('error', () =>
      problem(
        response,
        timedOut ? 504 : 502,
        timedOut
          ? 'O backend demorou para responder. Tente novamente.'
          : 'Não foi possível acessar o backend. Tente novamente.',
      ),
    );
    request.on('aborted', () => upstream.destroy());
    request.on('error', () => upstream.destroy());
    response.on('close', () => {
      if (!response.writableEnded) upstream.destroy();
    });
    request.pipe(upstream);
  }

  return createServer((request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    let path;
    try {
      if (!request.url?.startsWith('/') || request.url.startsWith('//')) throw new Error();
      path = decodeURIComponent(request.url.split('?')[0]);
      if (
        path.includes('\\') ||
        path.includes('\0') ||
        path.split('/').some((part) => part === '..' || part.startsWith('.'))
      )
        throw new Error();
    } catch {
      problem(response, 400, 'Caminho inválido.');
      return;
    }
    if (path === '/api' || path.startsWith('/api/') || path === '/actuator/health') {
      proxy(request, response);
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      problem(response, 405, 'Método não permitido.');
      return;
    }
    if (path === '/config.json') {
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(request.method === 'HEAD' ? undefined : config);
      return;
    }
    // Server sources and deployment metadata may share the artifact, but are never public assets.
    if (
      ['/server.js', '/package.json', '/package-lock.json', '/_redirects', '/_headers'].includes(
        path,
      ) ||
      path.startsWith('/scripts/')
    ) {
      problem(response, 404, 'Arquivo não encontrado.');
      return;
    }
    let file = resolve(directory, '.' + path);
    try {
      file = realpathSync(file);
      if (!file.startsWith(directory + sep) || !statSync(file).isFile()) throw new Error();
    } catch {
      // Only browser navigation receives the SPA, never missing assets or API errors.
      if (
        extname(path) ||
        (path !== '/' && !(request.headers.accept ?? '').includes('text/html'))
      ) {
        problem(response, 404, 'Arquivo não encontrado.');
        return;
      }
      file = resolve(directory, 'index.html');
    }
    const extension = extname(file);
    response.writeHead(200, {
      'Content-Type': contentTypes[extension] ?? 'application/octet-stream',
      'Content-Length': statSync(file).size,
      'Cache-Control':
        extension === '.html'
          ? 'no-cache'
          : /-[a-zA-Z0-9_-]{8,}\.(js|css|woff2?)$/.test(file)
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    const stream = createReadStream(file);
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  });
}

export function startFrontend(environment = loadBuildEnvironment(applicationDirectory)) {
  const { backendUrl, port } = parseServerEnvironment(environment);
  // Same entry point works from the source tree and from the standalone build artifact.
  const staticDirectory = existsSync(resolve(applicationDirectory, 'index.html'))
    ? applicationDirectory
    : resolve(applicationDirectory, 'dist/singflow-web/browser');
  const server = createFrontendServer({
    backendUrl,
    staticDirectory,
    primeUiLicense: environment.PRIMEUI_LICENSE_KEY,
  });
  server.on('error', () => {
    console.error('SingFlow: não foi possível iniciar o servidor frontend.');
    process.exitCode = 1;
  });
  server.listen(port, '0.0.0.0', () =>
    console.log(`SingFlow: servidor frontend na porta ${port}.`),
  );
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.once(signal, () => {
      server.close();
      const timer = setTimeout(() => {
        server.closeAllConnections();
      }, 5000);
      timer.unref();
    });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    startFrontend();
  } catch {
    console.error('SingFlow: configuração inválida. Confira BACKEND_URL, PORT e o build Angular.');
    process.exitCode = 1;
  }
}
