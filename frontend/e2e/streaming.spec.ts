import { songDetails } from './helpers/song-details';
import { test, expect, Page } from '@playwright/test';
const id = '0123456789abcdefghijkl',
  other = 'abcdefghijkl0123456789';
const url = 'https://open.spotify.com/track/' + id,
  second = 'https://open.spotify.com/track/' + other;
const spotify = { type: 'spotify', label: 'Spotify', icon: 'fa-spotify' };
const youtube = { type: 'youtube', label: 'YouTube', icon: 'fa-youtube' };
const song = {
  id: 'song',
  title: 'Giz',
  artist: 'Legião Urbana',
  status: 'APPROVED',
  source: 'ADMIN',
  version: 4,
  mergedInto: null,
};
const track = {
  type: 'spotify',
  id,
  title: 'Giz',
  artist: 'Legião Urbana',
  album: 'O Descobrimento do Brasil',
  durationMs: 120000,
  url,
};
async function auth(page: Page, musician = false) {
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({
      json: {
        email: 'account@example.test',
        role: musician ? 'MUSICIAN' : 'HOST',
        administrator: !musician,
        emailVerified: true,
        status: 'APPROVED',
      },
    }),
  );
  await page.route('**/api/auth/csrf', (r) =>
    r.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } }),
  );
}
async function openAdmin(page: Page) {
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  await page
    .getByRole('button', { name: 'Informações de Giz — Legião Urbana', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Spotify', exact: true }).click();
  return page.getByRole('dialog', { name: 'Detalhes da música', exact: true });
}
async function admin(page: Page, failed = false) {
  await auth(page);
  const writes: any[] = [];
  const queries: string[] = [];
  let version = 4;
  const refs: Record<string, string | null> = { spotify: null, youtube: null };
  await page.route('**/api/admin/**', async (r) => {
    const req = r.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith('/streaming/providers')) return r.fulfill({ json: [spotify, youtube] });
    if (path.endsWith('/details') && req.method() === 'GET')
      return r.fulfill({ json: songDetails({ ...song, version }, refs, [spotify, youtube]) });
    if (path.endsWith('/details')) {
      const body = req.postDataJSON();
      writes.push({ path, body });
      if (failed)
        return r.fulfill({
          status: 409,
          json: { detail: 'A música mudou. Atualize antes de salvar.' },
        });
      Object.assign(refs, body.references);
      version++;
      return r.fulfill({ json: { ...song, version } });
    }
    if (path.includes('/streaming/')) {
      const provider = path.includes('/youtube') ? youtube : spotify;
      if (path.endsWith('/search')) {
        queries.push(req.url());
        if (failed)
          return r.fulfill({
            status: 503,
            json: { detail: 'A busca está indisponível. Informe o link manualmente.' },
          });
        const pageNumber = Number(new URL(req.url()).searchParams.get('page'));
        return r.fulfill({
          json: {
            provider,
            items:
              provider.type === 'youtube'
                ? [
                    {
                      ...track,
                      type: 'youtube',
                      id: 'Abcde_12-XY',
                      url: 'https://www.youtube.com/watch?v=Abcde_12-XY',
                    },
                  ]
                : pageNumber === 1
                  ? [track, { ...track, id: 'unsafe', url: 'javascript:alert(1)' }]
                  : [{ ...track, id: other, title: 'Giz — Ao vivo', url: second }],
            page: pageNumber,
            hasMore: provider.type === 'spotify' && pageNumber === 1,
          },
        });
      }
      return r.fulfill({
        json: { ...provider, songId: 'song', url: refs[provider.type], version },
      });
    }
    if (path.includes('/catalog/songs'))
      return r.fulfill({ json: { items: [{ ...song, version }], total: 1, page: 0, size: 10 } });
    return r.fulfill({ json: { items: [], total: 0, page: 0, size: 25 } });
  });
  return { writes, queries };
}
test('admin searches incrementally and explicitly confirms a platform version', async ({
  page,
}) => {
  const { writes, queries } = await admin(page);
  const modal = await openAdmin(page);
  await expect(modal.getByRole('radio')).toHaveCount(1);
  await expect(modal.getByRole('radio').first()).not.toBeChecked();
  expect(writes).toHaveLength(0);
  await expect(
    modal.getByRole('link', { name: 'Conferir Giz no Spotify' }).locator('i'),
  ).toHaveClass('fa-solid fa-up-right-from-square');
  await modal.getByRole('button', { name: 'Carregar mais', exact: true }).click();
  await expect(modal.getByRole('radio')).toHaveCount(2);
  expect(queries[1]).toContain('page=2');
  await expect(modal).toContainText('O Descobrimento do Brasil');
  await modal.getByRole('radio').nth(1).check();
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(writes[0].body.references).toEqual({ spotify: second });
});
test('saved streaming references are reopened without searches until the admin requests a replacement', async ({
  page,
}) => {
  const { writes, queries } = await admin(page);
  let modal = await openAdmin(page);
  await modal.getByRole('radio').first().check();
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  const count = queries.length;
  modal = await openAdmin(page);
  await expect(
    modal.getByRole('tabpanel').getByLabel('Link da música', { exact: true }),
  ).toHaveValue(url);
  await expect(modal.getByRole('radio')).toHaveCount(0);
  expect(queries).toHaveLength(count);
  await modal.getByRole('tab', { name: 'YouTube', exact: true }).click();
  await expect(modal.getByRole('radio')).toHaveCount(1);
  expect(queries).toHaveLength(count + 1);
  await modal.getByRole('tab', { name: 'Spotify', exact: true }).click();
  await expect(
    modal.getByRole('tabpanel').getByLabel('Link da música', { exact: true }),
  ).toHaveValue(url);
  expect(queries).toHaveLength(count + 1);
  await modal.getByRole('button', { name: 'Pesquisar no streaming', exact: true }).click();
  await expect(modal.getByRole('radio')).toHaveCount(1);
  expect(queries).toHaveLength(count + 2);
  expect(writes).toHaveLength(1);
});
test('one picker uses the selected platform and clears a YouTube reference through the draft', async ({
  page,
}) => {
  const { writes } = await admin(page);
  let modal = await openAdmin(page);
  await modal.getByRole('tab', { name: 'YouTube', exact: true }).click();
  await modal.getByRole('tabpanel', { name: 'YouTube', exact: true }).getByRole('radio').check();
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(writes[0].body.references.youtube).toBe('https://www.youtube.com/watch?v=Abcde_12-XY');
  modal = await openAdmin(page);
  await modal.getByRole('tab', { name: 'YouTube', exact: true }).click();
  await expect(
    modal.getByRole('tabpanel').getByLabel('Link da música', { exact: true }),
  ).toHaveValue('https://www.youtube.com/watch?v=Abcde_12-XY');
  await modal.getByRole('button', { name: 'Limpar link da música', exact: true }).click();
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(writes[1].body.references.youtube).toBe('');
});
test('search failures keep manual entry available and conflicts preserve the form', async ({
  page,
}) => {
  const { writes } = await admin(page, true);
  const modal = await openAdmin(page);
  await expect(modal.getByRole('alert')).toContainText('link manualmente');
  const input = modal.getByRole('tabpanel').getByLabel('Link da música', { exact: true });
  await input.fill('https://evil.test/track/' + id);
  await expect(modal.getByRole('button', { name: 'Salvar', exact: true })).toBeDisabled();
  await input.fill(url);
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal.getByRole('alert').first()).toContainText('A música mudou');
  await expect(input).toHaveValue(url);
  expect(writes).toHaveLength(1);
});
test('musician opens a typed streaming reference in stage and queue alongside the chord action', async ({
  page,
}, info) => {
  await auth(page, true);
  const session = {
    id: 'session',
    name: 'Café Tão',
    status: 'OPEN',
    createdAt: new Date().toISOString(),
  };
  await page.route('**/api/musicians/**', (r) => {
    if (new URL(r.request().url()).pathname.endsWith('/sessions'))
      return r.fulfill({ json: [session] });
    return r.fulfill({
      json: {
        session,
        stage: {
          active: {
            id: 'call',
            participantName: 'Ana',
            catalogSongId: 'song',
            title: 'Giz',
            artist: 'Legião Urbana',
          },
          suggestions: [
            {
              participantId: 'bruno',
              name: 'Bruno',
              completed: 0,
              catalogSongId: 'song',
              requestId: 'request',
              title: 'Giz',
              artist: 'Legião Urbana',
            },
          ],
          history: [],
          waits: [],
        },
        streaming: {
          song: [
            { ...spotify, songId: 'song', url, version: 5 },
            {
              type: 'youtube',
              label: 'YouTube',
              icon: 'fa-youtube',
              songId: 'song',
              url: 'https://www.youtube.com/watch?v=Abcde_12-XY',
              version: 5,
            },
          ],
        },
      },
    });
  });
  await page.goto('/musico');
  await expect(
    page.getByRole('link', { name: 'Abrir Giz no Spotify', exact: true }).first(),
  ).toHaveAttribute('href', url);
  await expect(
    page
      .getByRole('link', { name: 'Abrir Giz no Spotify', exact: true })
      .first()
      .locator('i')
      .first(),
  ).toHaveClass('fa-brands fa-spotify');
  await page.getByRole('tab', { name: 'Fila', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Abrir Giz no Spotify', exact: true }).last(),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Abrir Giz no YouTube', exact: true }).last(),
  ).toHaveAttribute('href', 'https://www.youtube.com/watch?v=Abcde_12-XY');
  await expect(
    page
      .getByRole('link', { name: 'Abrir Giz no YouTube', exact: true })
      .last()
      .locator('i')
      .first(),
  ).toHaveClass('fa-brands fa-youtube');
  await page.screenshot({ path: info.outputPath('streaming-musician.png') });
});
