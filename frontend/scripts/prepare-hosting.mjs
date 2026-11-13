import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function prepareHosting(frontendDirectory) {
  const output = resolve(frontendDirectory, 'dist/singflow-web/browser');
  mkdirSync(resolve(output, 'scripts'), { recursive: true });
  copyFileSync(resolve(frontendDirectory, 'server.js'), resolve(output, 'server.js'));
  copyFileSync(
    resolve(frontendDirectory, 'scripts/environment.mjs'),
    resolve(output, 'scripts/environment.mjs'),
  );
  writeFileSync(
    resolve(output, 'package.json'),
    JSON.stringify(
      {
        name: 'singflow-web-runtime',
        private: true,
        type: 'module',
        scripts: { start: 'node server.js' },
        engines: { node: '>=22.22.3' },
      },
      null,
      2,
    ) + '\n',
  );
  for (const name of ['_redirects', '_headers']) rmSync(resolve(output, name), { force: true });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareHosting(fileURLToPath(new URL('../', import.meta.url)));
  console.log('SingFlow: pacote Node.js de produção preparado.');
}
