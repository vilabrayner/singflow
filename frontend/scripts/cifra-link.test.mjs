import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cifraLink } from '../src/app/shared/cifra-link.ts';
const base = 'https://www.cifraclub.com.br/shakira/estoy-aqui/';
test('absolute pitch mapping, negative shifts, enharmonics and octave wrapping', () => {
  for (const [key, shift, index] of [
    ['D', -2, 3],
    ['C', 2, 5],
    ['A', 3, 3],
    ['B', 1, 3],
    ['Db', 1, 5],
    ['C#', 1, 5],
    ['Am', -1, 11],
    ['C', -13, 2],
  ]) {
    assert.equal(new URL(cifraLink(base, key, shift)).searchParams.get('keyShape'), String(index));
  }
});
test('all twelve destination pitches use the supplied A-based table', () => {
  for (let shift = 1; shift <= 12; shift++)
    assert.equal(
      new URL(cifraLink(base, 'A', shift)).searchParams.get('keyShape'),
      String(shift % 12),
    );
});
test('missing original or alteration never forwards a saved keyShape', () => {
  for (const [key, shift] of [
    [null, 2],
    ['', -1],
    ['D', 0],
    ['D', undefined],
    ['invalid', 2],
    ['D', 1.5],
    ['D', NaN],
  ]) {
    const result = new URL(cifraLink(base + '?keyShape=7&foo=bar#version', key, shift));
    assert.equal(result.searchParams.has('keyShape'), false);
    assert.equal(result.searchParams.get('foo'), 'bar');
    assert.equal(result.hash, '#version');
  }
});
test('overrides saved transposition without changing the persisted URL', () => {
  const saved = base + 'simplificada.html?keyShape=7&foo=bar';
  assert.equal(cifraLink(saved, 'D', -2), base + 'simplificada.html?foo=bar&keyShape=3');
  assert.ok(saved.includes('keyShape=7'));
});
test('navigation rejects untrusted destinations', () => {
  for (const value of [
    null,
    'javascript:alert(1)',
    'https://evil.test/a/b/',
    'http://www.cifraclub.com.br/a/b/',
    'https://user@www.cifraclub.com.br/a/b/',
  ])
    assert.equal(cifraLink(value, 'D', -2), null);
});
