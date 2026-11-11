import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { prepareRedirects } from './redirects.mjs';
import { loadBuildEnvironment } from './environment.mjs';

function fixture(t) {
  const directory = mkdtempSync(resolve(tmpdir(), 'singflow-redirects-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('generates Render proxy rules before the SPA fallback and replaces the host on rebuild', (t) => {
  const target = resolve(fixture(t), 'browser/_redirects');
  prepareRedirects(target, {});
  let result = readFileSync(target, 'utf8');
  assert.ok(result.includes('/api/*  https://singflow.onrender.com/api/:splat  200'));
  assert.ok(
    result.includes('/actuator/health  https://singflow.onrender.com/actuator/health  200'),
  );
  assert.ok(result.trimEnd().endsWith('/*  /index.html  200'));
  prepareRedirects(target, { BACKEND_URL: 'https://other.example/' });
  result = readFileSync(target, 'utf8');
  assert.ok(result.includes('https://other.example/api/:splat'));
  assert.ok(!result.includes('onrender.com'));
});

test('rejects credentials, paths, queries and malformed backend origins', (t) => {
  const target = resolve(fixture(t), '_redirects');
  for (const value of [
    '',
    'bad',
    'https://user:password@example.com',
    'https://example.com/api',
    'https://example.com?secret=value',
    'https://example.com/#fragment',
    'https://example.com/\n',
    'http://example.com',
    'file:///tmp',
  ]) {
    assert.throws(() => prepareRedirects(target, { BACKEND_URL: value }), /BACKEND_URL/);
  }
});

test('loads frontend .env while giving the deploy environment precedence', (t) => {
  const directory = fixture(t);
  assert.deepEqual(loadBuildEnvironment(directory, {}), {});
  writeFileSync(resolve(directory, '.env'), 'BACKEND_URL="https://local.example"\n# comment\n');
  assert.equal(loadBuildEnvironment(directory, {}).BACKEND_URL, 'https://local.example');
  assert.equal(
    loadBuildEnvironment(directory, { BACKEND_URL: 'https://deploy.example' }).BACKEND_URL,
    'https://deploy.example',
  );
});
