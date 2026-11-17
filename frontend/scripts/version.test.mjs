import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

test('app, npm lock and backend declare the same release version', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
  const pom = readFileSync(new URL('../../backend/pom.xml', import.meta.url), 'utf8');
  const backendVersion = pom.match(
    /<artifactId>singflow<\/artifactId>\s*<version>([^<]+)<\/version>/,
  )?.[1];
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(backendVersion, pkg.version);
});
