import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareConfig } from './configure.mjs';
import { loadRuntimeConfig, parseRuntimeConfig } from '../src/app/core/config/runtime-config.ts';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'singflow-config-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(
    join(dir, 'config.example.json'),
    JSON.stringify({ apiBaseUrl: '/api', primeUiLicense: '' }),
  );
  return dir;
}

test('creates config once and preserves local edits even if environment changes', (t) => {
  const dir = fixture(t);
  assert.equal(prepareConfig(dir, { PRIMEUI_LICENSE_KEY: 'test-only' }), 'created');
  const before = readFileSync(join(dir, 'config.json'), 'utf8');
  assert.equal(prepareConfig(dir, { PRIMEUI_LICENSE_KEY: 'different-test-value' }), 'preserved');
  assert.equal(readFileSync(join(dir, 'config.json'), 'utf8'), before);
});

test('migrates legacy JSON configuration without executing JavaScript', (t) => {
  const dir = fixture(t);
  writeFileSync(join(dir, 'config.js'), 'window.SINGFLOW_CONFIG = {"primeUiLicense":"test-only"};');
  prepareConfig(dir, {});
  assert.equal(
    JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')).primeUiLicense,
    'test-only',
  );
});

test('invalid local config fails without overwriting', (t) => {
  const dir = fixture(t);
  writeFileSync(join(dir, 'config.json'), '{broken');
  assert.throws(() => prepareConfig(dir, {}));
  assert.equal(readFileSync(join(dir, 'config.json'), 'utf8'), '{broken');
});

test('validates runtime types and same-origin API paths', () => {
  for (const value of [
    null,
    {},
    { apiBaseUrl: '//external', primeUiLicense: '' },
    { apiBaseUrl: '/api', primeUiLicense: 12 },
  ]) {
    assert.throws(() => parseRuntimeConfig(value));
  }
  assert.deepEqual(parseRuntimeConfig({ apiBaseUrl: '/api/', primeUiLicense: ' test-only ' }), {
    apiBaseUrl: '/api',
    primeUiLicense: 'test-only',
  });
});

test('loads configuration relative to base URL without caching', async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'https://example.test/singflow/config.json');
    assert.equal(options.cache, 'no-store');
    return new Response(JSON.stringify({ apiBaseUrl: '/api', primeUiLicense: '' }));
  };
  assert.equal((await loadRuntimeConfig('https://example.test/singflow/')).apiBaseUrl, '/api');
  globalThis.fetch = async () => new Response('', { status: 404 });
  await assert.rejects(loadRuntimeConfig('https://example.test/'));
});
