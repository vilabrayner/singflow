import { songDetails } from './helpers/song-details';
import { expect, test, Page } from '@playwright/test';
const base = '/api/admin/catalog/songs';
const song = (n: number) => ({
  id: 'song-' + n,
  title: 'Música ' + n,
  artist: 'Artista',
  status: 'PENDING',
  source: 'ADMIN',
  version: 2,
});
async function shell(page: Page) {
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({
      json: {
        email: 'admin@example.test',
        role: 'HOST',
        administrator: true,
        status: 'APPROVED',
        emailVerified: true,
      },
    }),
  );
  await page.route('**/api/auth/csrf', (r) =>
    r.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } }),
  );
  await page.route('**/api/admin/accounts**', (r) =>
    r.fulfill({ json: { items: [], total: 0, page: 0, size: 25 } }),
  );
}
async function enter(page: Page) {
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Catálogo', exact: true }).click();
}

test('catalogue appends pages, keeps state after failure and blocks deletion with associations @release', async ({
  page,
}, info) => {
  await shell(page);
  let failPage = true,
    removed = false,
    allowDelete = false;
  const deletes: any[] = [];
  await page.route('**/api/admin/catalog/songs**', (r) => {
    const req = r.request(),
      url = new URL(req.url());
    if (url.pathname.endsWith('/details')) return r.fulfill({ json: songDetails(song(0)) });
    if (url.pathname.endsWith('/delete')) {
      deletes.push(req.postDataJSON());
      if (!allowDelete)
        return r.fulfill({
          status: 409,
          json: { detail: 'Esta música possui associações e não pode ser excluída.' },
        });
      removed = true;
      return r.fulfill({ status: 200 });
    }
    const p = Number(url.searchParams.get('page') ?? 0);
    expect(url.searchParams.get('size')).toBe('10');
    if (p === 1 && failPage) {
      failPage = false;
      return r.fulfill({ status: 503 });
    }
    return r.fulfill({
      json: {
        items: Array.from({ length: 10 }, (_, i) => song((removed ? 1 : 0) + p * 10 + i)),
        total: removed ? 19 : 20,
        page: p,
        size: 10,
      },
    });
  });
  await enter(page);
  const list = page.getByRole('list', { name: 'Músicas do catálogo', exact: true });
  await expect(list.getByRole('listitem')).toHaveCount(10);
  await expect(list.locator('app-status-badge')).toHaveCount(0);
  const viewport = page.getByRole('region', {
    name: 'Listagem do catálogo administrativo',
    exact: true,
  });
  await viewport.evaluate((el) => {
    el.scrollTop = 300;
  });
  await page.getByRole('button', { name: 'Carregar mais', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveCount(10);
  await page.getByRole('button', { name: 'Carregar mais', exact: true }).click();
  await expect(list.getByRole('listitem')).toHaveCount(20);
  await page
    .getByRole('button', { name: 'Informações de Música 0 — Artista', exact: true })
    .click();
  const detail = page.getByRole('dialog', { name: 'Detalhes da música', exact: true });
  await expect(detail.getByText('Provisória', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir Música 0 — Artista', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Excluir música?', exact: true });
  await dialog.getByRole('button', { name: 'Voltar', exact: true }).click();
  expect(deletes).toHaveLength(0);
  await page.getByRole('button', { name: 'Excluir Música 0 — Artista', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('possui associações');
  await expect(list.getByRole('listitem')).toHaveCount(20);
  await expect(page.getByText('Música excluída do catálogo.', { exact: true })).toHaveCount(0);
  allowDelete = true;
  await dialog.getByRole('button', { name: 'Confirmar exclusão', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Informações de Música 0 — Artista', exact: true }),
  ).toHaveCount(0);
  expect(deletes).toEqual([{ version: 2 }, { version: 2 }]);
  await page.screenshot({ path: info.outputPath('catalog-actions.png'), scale: 'css' });
});

test('admin autocomplete waits for three letters and imports an internet choice once after a lost response', async ({
  page,
}) => {
  await shell(page);
  let searches = 0,
    imports: any[] = [],
    first = true;
  const external = {
    id: null,
    title: 'Internet song',
    artist: 'Artist',
    status: 'EXTERNAL',
    source: 'LASTFM',
    version: 0,
    selectionToken: '11111111-1111-4111-8111-111111111111',
  };
  await page.route('**/api/admin/catalog/songs**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith('/from-internet')) {
      imports.push(r.request().postDataJSON());
      expect(r.request().headers()['x-csrf-token']).toBe('csrf');
      if (first) {
        first = false;
        return r.fulfill({ status: 503 });
      }
      return r.fulfill({
        json: { ...external, id: 'imported', source: 'ADMIN', status: 'APPROVED', version: 1 },
      });
    }
    if (url.pathname.endsWith('/search-page')) {
      searches++;
      return r.fulfill({
        json: { items: [external], nextSource: 'internet', nextPage: 1, hasMore: false },
      });
    }
    return r.fulfill({ json: { items: [], total: 0, page: 0, size: 10 } });
  });
  await enter(page);
  const search = page.getByLabel('Buscar música ou artista', { exact: true });
  await search.fill('In');
  await page.waitForTimeout(500);
  expect(searches).toBe(0);
  await search.fill('Int');
  await expect(
    page.getByRole('button', { name: 'Adicionar Internet song — Artist', exact: true }),
  ).toBeVisible();
  expect(searches).toBe(1);
  await page.getByRole('button', { name: 'Adicionar Internet song — Artist', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar Internet song — Artist', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Informações de Internet song — Artist', exact: true }),
  ).toBeVisible();
  expect(imports).toHaveLength(2);
  expect(imports[0]).toEqual(imports[1]);
  await expect(
    page.getByRole('list', { name: 'Músicas do catálogo', exact: true }).getByRole('listitem'),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpar busca', exact: true }).click();
  await expect(search).toHaveValue('');
});

test('completed synchronization opens a clean workspace and automatic approvals never appear as review items', async ({
  page,
}) => {
  await shell(page);
  let started = false,
    finished = false;
  const operations: string[] = [];
  const run = {
    id: 'sync-run',
    status: 'RUNNING',
    createdAt: '2026-11-16T10:00:00Z',
    startedBy: 'admin@example.test',
    message: '',
  };
  const progress = () => ({
    run: { ...run, status: finished ? 'COMPLETED' : 'RUNNING' },
    pendingReview: finished ? 0 : 1,
    currentTitle: '',
    counts: {
      total: 1,
      processed: finished ? 1 : 0,
      automatic: finished ? 1 : 0,
      approved: 0,
      review: 0,
      failed: 0,
      skipped: 0,
      queued: finished ? 0 : 1,
      processing: 0,
    },
  });
  await page.route('**/api/admin/catalog/**', (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith('/songs'))
      return r.fulfill({ json: { items: [], total: 0, page: 0, size: 10 } });
    if (url.pathname.endsWith('/workspace'))
      return r.fulfill({ json: { current: started && !finished ? progress() : null } });
    if (url.pathname.endsWith('/runs') && r.request().method() === 'POST') {
      operations.push(r.request().postDataJSON().operationId);
      started = true;
      finished = false;
      return r.fulfill({ json: run });
    }
    if (url.pathname.endsWith('/items')) {
      expect(url.searchParams.get('view')).toBe('attention');
      return r.fulfill({
        json: {
          items: finished
            ? [
                {
                  id: 'automatic',
                  songId: 'song',
                  title: 'Automatic title',
                  artist: 'Artist',
                  state: 'AUTO_APPROVED',
                },
              ]
            : [],
          total: 0,
          page: 0,
          size: 20,
        },
      });
    }
    return r.fulfill({ json: progress() });
  });
  await enter(page);
  await page.getByRole('tab', { name: 'Sincronizar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Vamos organizar o catálogo?', exact: true }),
  ).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Iniciar sincronização', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar início', exact: true }).click();
    await expect(
      page.getByRole('progressbar', { name: 'Progresso da sincronização', exact: true }),
    ).toBeVisible();
    finished = true;
    await expect(
      page.getByRole('progressbar', { name: 'Progresso da sincronização', exact: true }),
    ).toHaveCount(0, { timeout: 7000 });
    await expect(page.getByRole('list', { name: 'Músicas para revisão' })).toHaveCount(0);
    await expect(page.getByText('Automatic title', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Sincronizar', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  }
  expect(operations).toHaveLength(2);
  expect(operations[0]).not.toBe(operations[1]);
});
