import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

export function loadBuildEnvironment(directory, environment = process.env) {
  const path = resolve(directory, '.env');
  const local = existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
  return { ...local, ...environment };
}
