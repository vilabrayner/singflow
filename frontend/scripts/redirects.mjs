import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBuildEnvironment } from './environment.mjs';

export function prepareRedirects(target, environment = process.env) {
  const value = environment.BACKEND_URL ?? 'https://singflow.onrender.com';
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('BACKEND_URL inválida. Informe somente a origem do backend.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    /\s/.test(value) ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('BACKEND_URL inválida. Use uma origem HTTPS sem caminho ou credenciais.');
  }
  const template = readFileSync(new URL('./redirects.template', import.meta.url), 'utf8');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, template.replaceAll('{{BACKEND_URL}}', url.origin));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const frontend = fileURLToPath(new URL('../', import.meta.url));
    prepareRedirects(
      resolve(frontend, 'dist/singflow-web/browser/_redirects'),
      loadBuildEnvironment(frontend),
    );
    console.log('SingFlow: _redirects gerado com o backend configurado.');
  } catch {
    console.error(
      'SingFlow: falha ao gerar _redirects. Confira BACKEND_URL; use uma origem HTTPS sem caminho ou credenciais.',
    );
    process.exitCode = 1;
  }
}
