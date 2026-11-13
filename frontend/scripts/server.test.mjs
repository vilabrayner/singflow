import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createFrontendServer, parseServerEnvironment } from '../server.js';
import { loadBuildEnvironment } from './environment.mjs';
import { prepareHosting } from './prepare-hosting.mjs';

function fixture(t) {
  const directory = mkdtempSync(resolve(tmpdir(), 'singflow-node-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(resolve(directory, 'index.html'), '<!doctype html><title>SingFlow test</title>');
  writeFileSync(
    resolve(directory, 'config.json'),
    JSON.stringify({ apiBaseUrl: '/api', primeUiLicense: 'test-only' }),
  );
  writeFileSync(resolve(directory, 'main-ABCDEFGH.js'), 'console.log("test")');
  writeFileSync(resolve(directory, 'server.js'), 'PRIVATE SERVER');
  writeFileSync(resolve(directory, 'package.json'), '{}');
  mkdirSync(resolve(directory, 'scripts'));
  writeFileSync(resolve(directory, 'scripts/secret.mjs'), 'PRIVATE SCRIPT');
  return directory;
}
async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise((done) => {
        server.close(done);
        server.closeAllConnections();
      }),
  );
  return 'http://127.0.0.1:' + server.address().port;
}
async function frontend(t, options = {}) {
  const upstream =
    options.upstream ??
    createServer((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"detail":"not found"}');
    });
  const backendUrl = await listen(t, upstream);
  const directory = fixture(t);
  const server = createFrontendServer({ backendUrl, staticDirectory: directory, ...options });
  return { url: await listen(t, server), backendUrl, directory };
}

test('requires an explicit backend origin and valid platform port without exposing supplied values', () => {
  assert.deepEqual(parseServerEnvironment({ BACKEND_URL: 'https://example.test', PORT: '4321' }), {
    backendUrl: 'https://example.test',
    port: 4321,
  });
  assert.equal(parseServerEnvironment({ BACKEND_URL: 'http://127.0.0.1:8080/' }).port, 3000);
  for (const value of [
    undefined,
    '',
    'bad',
    'https://user:private@example.test',
    'https://example.test/api',
    'https://example.test?key=private',
    'https://example.test/#x',
    'https://example.test/\n',
    'http://remote.test',
    'file:///tmp',
  ]) {
    assert.throws(
      () => parseServerEnvironment({ BACKEND_URL: value }),
      (error) => error.message.includes('BACKEND_URL') && !error.message.includes('private'),
    );
  }
  for (const port of ['0', '65536', 'bad', '3000.5', ''])
    assert.throws(
      () => parseServerEnvironment({ BACKEND_URL: 'https://example.test', PORT: port }),
      /PORT/,
    );
});

test('environment overrides local .env without changing source or rebuilding', (t) => {
  const directory = fixture(t);
  writeFileSync(resolve(directory, '.env'), 'BACKEND_URL=https://local.example\nPORT=3001\n');
  assert.equal(loadBuildEnvironment(directory, {}).BACKEND_URL, 'https://local.example');
  assert.equal(
    loadBuildEnvironment(directory, { BACKEND_URL: 'https://deploy.example' }).BACKEND_URL,
    'https://deploy.example',
  );
});

test('serves SPA navigation, HEAD and fingerprinted assets with appropriate cache policy', async (t) => {
  const { url } = await frontend(t);
  for (const path of ['/', '/anfitriao', '/participante/session/code', '/musico', '/admin']) {
    const response = await fetch(url + path, { headers: { Accept: 'text/html' } });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /SingFlow test/);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
  }
  const asset = await fetch(url + '/main-ABCDEFGH.js');
  assert.match(asset.headers.get('content-type'), /javascript/);
  assert.match(asset.headers.get('cache-control'), /immutable/);
  const head = await fetch(url + '/anfitriao', {
    method: 'HEAD',
    headers: { Accept: 'text/html' },
  });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const missing = await fetch(url + '/missing.js', { headers: { Accept: 'text/html' } });
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type'), /problem/);
  assert.equal((await fetch(url + '/anfitriao', { method: 'POST' })).status, 405);
});

test('config stays same-origin and uncached; runtime license overrides the artifact without publishing backend settings', async (t) => {
  const { url } = await frontend(t, { primeUiLicense: 'runtime-test-only' });
  const response = await fetch(url + '/config.json');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    apiBaseUrl: '/api',
    primeUiLicense: 'runtime-test-only',
  });
});

test('fails startup on absent or invalid config instead of returning SPA HTML', (t) => {
  const directory = fixture(t);
  for (const value of [
    'broken',
    JSON.stringify({ apiBaseUrl: 'https://remote.example', primeUiLicense: '' }),
  ]) {
    writeFileSync(resolve(directory, 'config.json'), value);
    assert.throws(
      () =>
        createFrontendServer({ backendUrl: 'http://127.0.0.1:8080', staticDirectory: directory }),
      /config.json/,
    );
  }
});

test('proxy preserves method, path, query, body, CSRF and session cookies across login and logout', async (t) => {
  const seen = [];
  const upstream = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    seen.push({ method: req.method, path: req.url, headers: req.headers, body });
    if (req.url === '/api/auth/login') {
      res.writeHead(204, {
        'Set-Cookie': [
          'JSESSIONID=test-session; Domain=127.0.0.1; Path=/; Secure; HttpOnly; SameSite=Lax',
          'other=test; Path=/; HttpOnly',
        ],
      });
      res.end();
    } else if (req.url === '/api/auth/logout') {
      res.writeHead(204, { 'Set-Cookie': 'JSESSIONID=; Path=/; Max-Age=0; HttpOnly' });
      res.end();
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    }
  });
  const { url } = await frontend(t, { upstream });
  const login = await fetch(url + '/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': 'test-csrf',
      'X-Forwarded-Proto': 'https',
      'X-Forwarded-For': 'spoofed',
    },
    body: 'email=test%40example.test&password=test-only',
  });
  assert.equal(login.status, 204);
  assert.equal(login.headers.getSetCookie().length, 2);
  assert.match(login.headers.getSetCookie()[0], /Secure; HttpOnly; SameSite=Lax/);
  assert.doesNotMatch(login.headers.getSetCookie()[0], /Domain=/i);
  const data = await fetch(url + '/api/sessions?status=OPEN', {
    headers: { Cookie: 'JSESSIONID=test-session' },
  });
  assert.deepEqual(await data.json(), { ok: true });
  assert.equal(data.headers.get('cache-control'), 'no-store');
  await fetch(url + '/api/auth/logout', {
    method: 'POST',
    headers: { Cookie: 'JSESSIONID=test-session', 'X-CSRF-TOKEN': 'test-csrf' },
  });
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].headers['x-csrf-token'], 'test-csrf');
  assert.equal(seen[0].body, 'email=test%40example.test&password=test-only');
  assert.equal(seen[0].headers['x-forwarded-host'], new URL(url).host);
  assert.equal(seen[0].headers['x-forwarded-proto'], 'https');
  assert.notEqual(seen[0].headers['x-forwarded-for'], 'spoofed');
  assert.equal(seen[1].path, '/api/sessions?status=OPEN');
  assert.equal(seen[1].headers.cookie, 'JSESSIONID=test-session');
  assert.equal(seen[2].path, '/api/auth/logout');
});

test('backend errors and health responses never fall back to the Angular index', async (t) => {
  const upstream = createServer((req, res) => {
    res.writeHead(req.url === '/actuator/health' ? 200 : 403, {
      'Content-Type': 'application/json',
    });
    res.end(req.url === '/actuator/health' ? '{"status":"UP"}' : '{"detail":"denied"}');
  });
  const { url } = await frontend(t, { upstream });
  const denied = await fetch(url + '/api/denied', { headers: { Accept: 'text/html' } });
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { detail: 'denied' });
  assert.deepEqual(await (await fetch(url + '/actuator/health')).json(), { status: 'UP' });
});

test('rewrites upstream redirects to the frontend path and preserves unrelated redirects', async (t) => {
  const upstream = createServer((req, res) => {
    res.writeHead(302, {
      Location:
        req.url === '/api/local'
          ? 'http://' + req.headers.host + '/anfitriao?again=1'
          : 'https://external.example/help',
    });
    res.end();
  });
  const { url } = await frontend(t, { upstream });
  assert.equal(
    (await fetch(url + '/api/local', { redirect: 'manual' })).headers.get('location'),
    '/anfitriao?again=1',
  );
  assert.equal(
    (await fetch(url + '/api/other', { redirect: 'manual' })).headers.get('location'),
    'https://external.example/help',
  );
});

test('returns sanitized gateway errors on refusal and timeout', async (t) => {
  const { url } = await frontend(t, { upstream: createServer(() => {}), proxyTimeoutMs: 30 });
  const timedOut = await fetch(url + '/api/test');
  assert.equal(timedOut.status, 504);
  assert.doesNotMatch(await timedOut.text(), /127.0.0.1|ECONN|stack/i);
  const directory = fixture(t);
  const unused = createServer();
  unused.listen(0, '127.0.0.1');
  await once(unused, 'listening');
  const port = unused.address().port;
  await new Promise((done) => unused.close(done));
  const refused = await listen(
    t,
    createFrontendServer({ backendUrl: 'http://127.0.0.1:' + port, staticDirectory: directory }),
  );
  assert.equal((await fetch(refused + '/api/test')).status, 502);
});

test('does not publish server files, dotfiles, symlink escapes or traversal paths', async (t) => {
  const { url, directory } = await frontend(t);
  const outside = resolve(directory, '../outside-' + directory.split('/').at(-1) + '.txt');
  writeFileSync(outside, 'private');
  t.after(() => rmSync(outside, { force: true }));
  symlinkSync(outside, resolve(directory, 'escape.txt'));
  for (const path of [
    '/server.js',
    '/package.json',
    '/scripts/secret.mjs',
    '/.env',
    '/.git/config',
    '/escape.txt',
    '/%2e%2e%2fprivate',
    '/%ZZ',
  ]) {
    const status = await new Promise((done, reject) => {
      request(url + path, (res) => {
        res.resume();
        done(res.statusCode);
      })
        .on('error', reject)
        .end();
    });
    assert.ok([400, 404].includes(status), path + ' returned ' + status);
  }
});

test('packages a standalone Node entry point and removes stale Netlify artifacts', async (t) => {
  const source = fileURLToPath(new URL('../', import.meta.url));
  const directory = fixture(t),
    output = resolve(directory, 'dist/singflow-web/browser');
  mkdirSync(output, { recursive: true });
  writeFileSync(
    resolve(directory, 'scripts/environment.mjs'),
    readFileSync(resolve(source, 'scripts/environment.mjs')),
  );
  writeFileSync(resolve(directory, 'server.js'), readFileSync(resolve(source, 'server.js')));
  for (const file of ['index.html', 'config.json'])
    writeFileSync(resolve(output, file), readFileSync(resolve(directory, file)));
  writeFileSync(resolve(output, '_redirects'), 'stale');
  writeFileSync(resolve(output, '_headers'), 'stale');
  prepareHosting(directory);
  const packaged = await import(pathToFileURL(resolve(output, 'server.js')));
  const url = await listen(
    t,
    packaged.createFrontendServer({ backendUrl: 'http://127.0.0.1:8080', staticDirectory: output }),
  );
  assert.equal((await fetch(url + '/anfitriao', { headers: { Accept: 'text/html' } })).status, 200);
  assert.equal(
    JSON.parse(readFileSync(resolve(output, 'package.json'), 'utf8')).scripts.start,
    'node server.js',
  );
  for (const file of ['_redirects', '_headers'])
    assert.throws(() => readFileSync(resolve(output, file)));
});

test('switches upstreams using the same static artifact without changing frontend files', async (t) => {
  const directory = fixture(t);
  const configBefore = readFileSync(resolve(directory, 'config.json'), 'utf8');
  for (const name of ['first', 'second']) {
    const backendUrl = await listen(
      t,
      createServer((_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ name }));
      }),
    );
    const settings = parseServerEnvironment({ BACKEND_URL: backendUrl });
    const url = await listen(t, createFrontendServer({ ...settings, staticDirectory: directory }));
    assert.deepEqual(await (await fetch(url + '/api/test')).json(), { name });
  }
  assert.equal(readFileSync(resolve(directory, 'config.json'), 'utf8'), configBefore);
});
