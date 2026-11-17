import { songDetails } from './helpers/song-details';
import { test, expect, Page } from '@playwright/test';
const song = {
  id: 'song',
  title: 'Giz',
  artist: 'Legião Urbana',
  status: 'PENDING',
  source: 'REQUEST',
  version: 0,
};
const spotify = { type: 'spotify', label: 'Spotify', icon: 'fa-spotify' };
const spotifyUrl = 'https://open.spotify.com/track/0123456789abcdefghijkl';
const cifraUrl = 'https://www.cifraclub.com.br/legiao-urbana/giz/';
async function fixture(page: Page, state = 'READY') {
  let external = 0,
    reads = 0;
  const writes: any[] = [];
  await page.route('**/api/**', (r) => {
    const req = r.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith('/auth/me'))
      return r.fulfill({
        json: {
          email: 'admin@example.test',
          role: 'HOST',
          administrator: true,
          emailVerified: true,
          status: 'APPROVED',
        },
      });
    if (path.endsWith('/csrf'))
      return r.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path.includes('/enrichment/')) {
      reads++;
      const type = path.split('/').pop()!;
      return r.fulfill({
        json: {
          type,
          state,
          message: '',
          candidates:
            state === 'READY'
              ? [
                  {
                    type,
                    id: 'id',
                    title: 'Giz',
                    artist: 'Legião Urbana',
                    album: 'Album',
                    durationMs: 120000,
                    url: type === 'cifra' ? cifraUrl : spotifyUrl,
                    recommended: type === 'cifra',
                  },
                ]
              : [],
        },
      });
    }
    if (path.endsWith('/details') && req.method() === 'GET')
      return r.fulfill({ json: songDetails(song, {}, [spotify]) });
    if (path.endsWith('/details')) {
      writes.push({ path, body: req.postDataJSON() });
      return r.fulfill({ json: { ...song, version: 1 } });
    }
    if (path.endsWith('/streaming/providers')) return r.fulfill({ json: [spotify] });
    if (path.endsWith('/search')) {
      external++;
      return r.fulfill({ json: { provider: spotify, items: [], page: 1, hasMore: false } });
    }
    if (path.endsWith('/chords')) {
      if (req.method() === 'POST') writes.push({ path, body: req.postDataJSON() });
      return r.fulfill({
        json: {
          songId: 'song',
          officialUrl: req.method() === 'POST' ? req.postDataJSON().url : null,
          version: req.method() === 'POST' ? 1 : 0,
          personalUrl: null,
          personalVersion: 0,
          effectiveUrl: null,
          source: 'CATALOG',
          alternatives: [],
        },
      });
    }
    if (path.endsWith('/streaming/spotify')) {
      if (req.method() === 'POST') writes.push({ path, body: req.postDataJSON() });
      return r.fulfill({
        json: {
          ...spotify,
          songId: 'song',
          version: req.method() === 'POST' ? 1 : 0,
          url: req.method() === 'POST' ? req.postDataJSON().url : null,
        },
      });
    }
    if (path.includes('/catalog/songs'))
      return r.fulfill({ json: { items: [song], total: 1, page: 0, size: 10 } });
    return r.fulfill({ json: { items: [], total: 0, page: 0, size: 25 } });
  });
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  await page
    .getByRole('button', { name: 'Informações de Giz — Legião Urbana', exact: true })
    .click();
  return { external: () => external, reads: () => reads, writes };
}
test('stored streaming suggestions are reviewed and explicitly saved without repeating provider search', async ({
  page,
}, info) => {
  const api = await fixture(page);
  await page.getByRole('tab', { name: 'Spotify', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Detalhes da música', exact: true });
  await expect(modal.getByRole('radio')).toHaveCount(1);
  expect(api.external()).toBe(0);
  expect(api.writes).toHaveLength(0);
  await expect(modal).toContainText('Sugestões preparadas em segundo plano');
  await modal.getByRole('radio').check();
  const reads = api.reads();
  await modal.getByRole('tab', { name: 'Dados', exact: true }).click();
  await modal.getByRole('tab', { name: 'Spotify', exact: true }).click();
  await expect(modal.getByRole('radio')).toBeChecked();
  expect(api.reads()).toBe(reads);
  expect(api.external()).toBe(0);
  await expect(page.locator('p-progress-spinner')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('prepared-streaming.png') });
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(api.writes[0].body.references).toEqual({ spotify: spotifyUrl });
});
test('stored chord suggestion keeps top result preselected but does not approve without confirmation', async ({
  page,
}) => {
  const api = await fixture(page);
  await page.getByRole('tab', { name: 'Cifra', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Detalhes da música', exact: true });
  await expect(modal.getByRole('radio')).toBeChecked();
  expect(api.external()).toBe(0);
  expect(api.writes).toHaveLength(0);
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(api.writes[0].body.references.cifra).toEqual(cifraUrl);
});
test('pending preparation can be refreshed without spending a provider search', async ({
  page,
}) => {
  const api = await fixture(page, 'QUEUED');
  await page.getByRole('tab', { name: 'Spotify', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Detalhes da música', exact: true });
  await expect(modal).toContainText('Sugestões em preparação');
  await expect(modal.getByText('Nenhuma versão encontrada.', { exact: false })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Atualizar sugestões preparadas', exact: true }).click();
  await expect.poll(api.reads).toBe(2);
  expect(api.external()).toBe(0);
  await modal.getByRole('button', { name: 'Pesquisar no streaming', exact: true }).click();
  await expect.poll(api.external).toBe(1);
});
