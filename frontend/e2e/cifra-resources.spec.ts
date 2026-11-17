import { songDetails } from './helpers/song-details';
import { test, expect, Page } from '@playwright/test';
const official = 'https://www.cifraclub.com.br/legiao-urbana/giz/';
const personal = 'https://www.cifraclub.com.br/legiao-urbana/giz/simplificada.html';
const resource = (overrides: any = {}) => ({
  songId: 'song',
  officialUrl: null,
  version: 4,
  personalUrl: null,
  personalVersion: 0,
  effectiveUrl: null,
  source: 'CATALOG',
  alternatives: [],
  ...overrides,
});
const candidates = [
  {
    id: 'cm_3283',
    title: 'Giz',
    artist: 'Legião Urbana',
    url: official,
    verified: true,
    recommended: true,
  },
  {
    id: 'other',
    title: 'Giz simplificada',
    artist: 'Legião Urbana',
    url: personal,
    verified: false,
    recommended: false,
  },
];
async function auth(page: Page, role = 'HOST') {
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({
      json: {
        email: role === 'HOST' ? 'admin@example.test' : 'musician@example.test',
        role,
        administrator: role === 'HOST',
        emailVerified: true,
        status: 'APPROVED',
      },
    }),
  );
  await page.route('**/api/auth/csrf', (r) =>
    r.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } }),
  );
}
test('admin reviews the preselected top result and explicitly saves an official reference', async ({
  page,
}, info) => {
  await auth(page);
  const writes: any[] = [];
  const searches: string[] = [];
  const prepared: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/chords/search')) searches.push(req.url());
    if (req.url().includes('/enrichment/cifra')) prepared.push(req.url());
  });
  let link = resource();
  await page.route('**/api/admin/**', (r) => {
    const req = r.request(),
      url = new URL(req.url());
    if (url.pathname.endsWith('/details') && req.method() === 'GET')
      return r.fulfill({
        json: songDetails(
          {
            id: 'song',
            title: 'Giz',
            artist: 'Legião Urbana',
            status: 'APPROVED',
            source: 'ADMIN',
            version: link.version,
          },
          { cifra: link.officialUrl },
        ),
      });
    if (url.pathname.endsWith('/details')) {
      writes.push(req.postDataJSON());
      link = resource({
        officialUrl: req.postDataJSON().references.cifra,
        effectiveUrl: req.postDataJSON().references.cifra,
        version: 5,
      });
      return r.fulfill({
        json: {
          id: 'song',
          title: 'Giz',
          artist: 'Legião Urbana',
          status: 'APPROVED',
          source: 'ADMIN',
          version: 5,
        },
      });
    }
    if (url.pathname.endsWith('/chords/search'))
      return r.fulfill({
        json: {
          items: [...candidates, { ...candidates[0], id: 'unsafe', url: 'javascript:alert(1)' }],
          page: 1,
          hasMore: false,
        },
      });
    if (url.pathname.endsWith('/chords')) {
      if (req.method() === 'POST') {
        writes.push(req.postDataJSON());
        link = resource({
          officialUrl: req.postDataJSON().url,
          effectiveUrl: req.postDataJSON().url,
          version: 5,
        });
      }
      return r.fulfill({ json: link });
    }
    if (url.pathname.includes('/catalog/songs'))
      return r.fulfill({
        json: {
          items: [
            {
              id: 'song',
              title: 'Giz',
              artist: 'Legião Urbana',
              status: 'APPROVED',
              source: 'ADMIN',
              version: 4,
            },
          ],
          total: 1,
          page: 0,
          size: 10,
        },
      });
    return r.fulfill({ json: { items: [], total: 0, page: 0, size: 25 } });
  });
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  await page
    .getByRole('button', { name: 'Informações de Giz — Legião Urbana', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Cifra', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Detalhes da música', exact: true });
  await expect(modal.getByRole('radio')).toHaveCount(2);
  await expect(modal.getByRole('radio').first()).toBeChecked();
  await expect(modal.getByLabel('Link da cifra', { exact: true })).toHaveValue(official);
  expect(writes).toHaveLength(0);
  await modal.getByRole('radio').nth(1).check();
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  await expect(modal).toHaveCount(0);
  expect(writes[0].references).toEqual({ cifra: personal });
  await expect(page.getByText('Música salva no catálogo.', { exact: true })).toBeVisible();
  const previousSearches = searches.length;
  const previousPrepared = prepared.length;
  await page
    .getByRole('button', { name: 'Informações de Giz — Legião Urbana', exact: true })
    .click();
  await modal.getByRole('tab', { name: 'Cifra', exact: true }).click();
  await expect(modal.getByLabel('Link da cifra', { exact: true })).toHaveValue(personal);
  await expect(modal.getByRole('radio')).toHaveCount(0);
  expect(searches).toHaveLength(previousSearches);
  expect(prepared).toHaveLength(previousPrepared);
  await modal.getByRole('button', { name: 'Pesquisar cifras', exact: true }).click();
  await expect(modal.getByRole('radio')).toHaveCount(2);
  expect(searches).toHaveLength(previousSearches + 1);

  await page.screenshot({ path: info.outputPath('admin-chord.png') });
});
async function musician(page: Page, failed = false) {
  await auth(page, 'MUSICIAN');
  let link = resource({ officialUrl: official, effectiveUrl: official });
  const writes: any[] = [];
  await page.route('**/api/musicians/**', (r) => {
    const req = r.request(),
      url = new URL(req.url());
    if (url.pathname.endsWith('/chords/search'))
      return failed
        ? r.fulfill({
            status: 503,
            json: { detail: 'A busca está indisponível. Informe o link manualmente.' },
          })
        : r.fulfill({ json: { items: candidates, page: 1, hasMore: false } });
    if (url.pathname.endsWith('/chords')) {
      if (req.method() === 'POST') {
        writes.push({ path: url.pathname, body: req.postDataJSON() });
        if (failed)
          return r.fulfill({
            status: 409,
            json: { detail: 'A referência mudou. Atualize antes de salvar.' },
          });
        link = resource({
          officialUrl: official,
          effectiveUrl: req.postDataJSON().url ?? official,
          personalUrl: req.postDataJSON().url,
          personalVersion: link.personalVersion + 1,
          source: req.postDataJSON().url ? 'PERSONAL' : 'CATALOG',
        });
      }
      return r.fulfill({ json: link });
    }
    const session = {
      id: 'session',
      name: 'Café Tão',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    if (url.pathname.endsWith('/sessions')) return r.fulfill({ json: [session] });
    return r.fulfill({
      json: {
        session,
        stage: {
          active: {
            id: 'call',
            participantName: 'Ana',
            title: 'Giz',
            artist: 'Legião Urbana',
            catalogSongId: 'song',
            keyLabel: 'Original',
          },
          suggestions: [],
          history: [],
          waits: [],
        },
        chords: { song: link },
      },
    });
  });
  await page.goto('/musico');
  await page.getByRole('button', { name: 'Escolher cifra de Giz', exact: true }).click();
  return writes;
}
test('musician saves a private preference and returns to the catalogue reference', async ({
  page,
}, info) => {
  const searches: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/chords/search')) searches.push(req.url());
  });
  const writes = await musician(page);
  const modal = page.getByRole('dialog', { name: 'Minha cifra', exact: true });
  await expect(modal).toContainText('A referência do catálogo não muda');
  await expect(modal.getByLabel('Link da cifra', { exact: true })).toHaveValue(official);
  expect(searches).toHaveLength(0);
  await modal.getByRole('button', { name: 'Pesquisar cifras', exact: true }).click();
  await modal.getByRole('radio').nth(1).check();
  await modal.getByRole('button', { name: 'Salvar minha preferência', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Abrir cifra de Giz', exact: true })).toHaveAttribute(
    'href',
    personal,
  );
  expect(writes[0]).toEqual({
    path: '/api/musicians/sessions/session/songs/song/chords',
    body: { version: 0, url: personal },
  });
  await page.getByRole('button', { name: 'Escolher cifra de Giz', exact: true }).click();
  await expect(modal.getByLabel('Link da cifra', { exact: true })).toHaveValue(personal);
  await expect(modal.getByRole('radio')).toHaveCount(0);
  expect(searches).toHaveLength(1);
  await modal.getByRole('button', { name: 'Usar referência do catálogo', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(writes[1].body).toEqual({ version: 1, url: null });
  await expect(page.getByRole('link', { name: 'Abrir cifra de Giz', exact: true })).toHaveAttribute(
    'href',
    official,
  );
  await expect(
    page.getByRole('link', { name: 'Abrir cifra de Giz', exact: true }).locator('.sf-cifra-icon'),
  ).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('musician-chord.png') });
});
test('failed search allows manual association and a conflicting write preserves the form', async ({
  page,
}) => {
  const writes = await musician(page, true);
  const modal = page.getByRole('dialog', { name: 'Minha cifra', exact: true });
  await modal.getByRole('button', { name: 'Pesquisar cifras', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Informe o link manualmente');
  const input = modal.getByLabel('Link da cifra', { exact: true });
  await input.fill('https://evil.test/artist/song/');
  await expect(
    modal.getByRole('button', { name: 'Salvar minha preferência', exact: true }),
  ).toBeDisabled();
  await input.fill(personal);
  await modal.getByRole('button', { name: 'Salvar minha preferência', exact: true }).click();
  await expect(modal).toBeVisible();
  await expect(input).toHaveValue(personal);
  await expect(modal.getByRole('alert').first()).toContainText('A referência mudou');
  expect(writes).toHaveLength(1);
  await expect(page.getByText('Preferência de cifra atualizada.', { exact: true })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Voltar', exact: true }).click();
});

test('stage and queue links use the requested pitch without changing saved references', async ({
  page,
}) => {
  await auth(page, 'MUSICIAN');
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
            participantId: 'ana',
            participantName: 'Ana',
            title: 'Giz',
            artist: 'Legião Urbana',
            catalogSongId: 'song',
            originalKey: 'D',
            semitones: -2,
            keyLabel: 'C',
          },
          suggestions: [
            {
              participantId: 'bruno',
              name: 'Bruno',
              completed: 0,
              requestId: 'request',
              title: 'Giz',
              artist: 'Legião Urbana',
              catalogSongId: 'song',
              originalKey: null,
              semitones: 2,
              keyLabel: '+2',
            },
            {
              participantId: 'carla',
              name: 'Carla',
              completed: 0,
              requestId: 'request2',
              title: 'Giz',
              artist: 'Legião Urbana',
              catalogSongId: 'song',
              originalKey: 'C',
              semitones: 2,
              keyLabel: 'D',
            },
          ],
          history: [],
          waits: [],
        },
        chords: {
          song: resource({ officialUrl: official, effectiveUrl: official + '?keyShape=7&foo=bar' }),
        },
      },
    });
  });
  await page.goto('/musico');
  const links = page.getByRole('link', { name: 'Abrir cifra de Giz', exact: true });
  await expect(links.first()).toHaveAttribute('href', official + '?foo=bar&keyShape=3');
  await expect(links.nth(1)).toHaveAttribute('href', official + '?foo=bar');
  await page.getByRole('tab', { name: 'Fila', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Abrir cifra de Giz', exact: true }).last(),
  ).toHaveAttribute('href', official + '?foo=bar&keyShape=5');
});
