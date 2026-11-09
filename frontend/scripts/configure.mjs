import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseRuntimeConfig } from '../src/app/core/config/runtime-config.ts';

export function prepareConfig(directory, environment = process.env) {
  const target = resolve(directory, 'config.json');
  if (existsSync(target)) {
    parseRuntimeConfig(JSON.parse(readFileSync(target, 'utf8')));
    return 'preserved';
  }
  const example = JSON.parse(readFileSync(resolve(directory, 'config.example.json'), 'utf8'));
  if (environment.PRIMEUI_LICENSE_KEY) example.primeUiLicense = environment.PRIMEUI_LICENSE_KEY;
  // Migrate an existing generated config without executing JavaScript or printing its value.
  const legacy = resolve(directory, 'config.js');
  if (!example.primeUiLicense && existsSync(legacy)) {
    const match = readFileSync(legacy, 'utf8').match(
      /^\s*window\.SINGFLOW_CONFIG\s*=\s*(\{[^]*\})\s*;?\s*$/,
    );
    if (match) example.primeUiLicense = JSON.parse(match[1]).primeUiLicense ?? '';
  }
  const config = parseRuntimeConfig(example);
  writeFileSync(target, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
  return 'created';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const state = prepareConfig(fileURLToPath(new URL('../public/', import.meta.url)));
    console.log(
      `SingFlow: config.json ${state === 'created' ? 'criado a partir do modelo' : 'preservado'}.`,
    );
  } catch {
    console.error(
      'SingFlow: configuração inválida. Confira public/config.json e public/config.example.json. Nenhum valor foi exibido.',
    );
    process.exitCode = 1;
  }
}
