import { test, expect, Page } from '@playwright/test';

const provisional = {
  id: 'song-source',
  title: 'Equalize',
  artist: 'Pitty',
  status: 'PENDING',
  source: 'REQUEST',
  mergedInto: null,
  version: 0,
};
const approved = {
  ...provisional,
  id: 'song-target',
  title: 'Equalize oficial',
  status: 'APPROVED',
  source: 'ADMIN',
  version: 2,
};
const base = '/api/admin/catalog/songs';
async function auth(page: Page) {
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({
      json: {
        email: 'admin@example.test',
        name: 'Admin',
        role: 'HOST',
        administrator: true,
        emailVerified: true,
        status: 'APPROVED',
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
  await page.getByRole('button', { name: 'Catálogo', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Catálogo de músicas', exact: true }),
  ).toBeVisible();
}

test('catalog admin edits and approves a provisional song and reads its audit history', async ({
  page,
}, testInfo) => {
  await auth(page);
  let song = { ...provisional };
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/admin/catalog/songs**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST') {
      expect(route.request().headers()['x-csrf-token']).toBe('csrf');
      const body = route.request().postDataJSON();
      writes.push(body);
      if (url.pathname.endsWith('/review'))
        song = { ...song, status: body.status, version: song.version + 1 };
      else song = { ...song, title: body.title, artist: body.artist, version: song.version + 1 };
      return route.fulfill({ json: song });
    }
    if (url.pathname.endsWith('/history'))
      return route.fulfill({
        json: [
          {
            actor: 'admin@example.test',
            action: 'APPROVED',
            reason: '',
            occurredAt: new Date().toISOString(),
          },
        ],
      });
    const status = url.searchParams.get('status');
    const items = !status || status === song.status ? [song] : [];
    return route.fulfill({ json: { items, total: items.length, page: 0, size: 25 } });
  });
  await enter(page);
  await expect(page.getByRole('button', { name: 'Todas', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Equalize Pitty Provisória/ }).click();
  let dialog = page.getByRole('dialog', { name: 'Detalhes da música', exact: true });
  await dialog.getByLabel('Título da música', { exact: true }).fill('Equalize corrigida');
  await dialog.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toEqual({ version: 0, title: 'Equalize corrigida', artist: 'Pitty' });
  await page.getByRole('button', { name: /Equalize corrigida Pitty Provisória/ }).click();
  await dialog.getByRole('button', { name: 'Opções da música', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Aprovar música', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Aprovar música?', exact: true })
    .getByRole('button', { name: 'Confirmar aprovação', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: /Equalize corrigida Pitty Aprovada/ }),
  ).toBeVisible();
  expect(writes[1]).toEqual({ version: 1, status: 'APPROVED', reason: '' });
  await page.getByRole('button', { name: 'Todas', exact: true }).click();
  const filters = page.getByRole('dialog', { name: 'Filtrar catálogo', exact: true });
  await filters.getByRole('combobox', { name: 'Situação', exact: true }).selectOption('APPROVED');
  await filters.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await page.getByRole('button', { name: 'Buscar no catálogo', exact: true }).click();
  await page.getByRole('button', { name: /Equalize corrigida Pitty Aprovada/ }).click();
  await dialog.getByRole('button', { name: 'Opções da música', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Histórico de alterações', exact: true }).click();
  const history = page.getByRole('dialog', { name: 'Histórico da música', exact: true });
  await expect(history).toContainText('Música aprovada');
  await expect(history).toContainText('admin@example.test');
  await page.screenshot({ path: testInfo.outputPath('catalog-history.png'), fullPage: true });
  await history.getByRole('button', { name: 'Voltar aos detalhes', exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('catalog merge requires a destination and reason and preserves both versions', async ({
  page,
}) => {
  await auth(page);
  let merged = false;
  let payload: Record<string, unknown> | undefined;
  await page.route('**/api/admin/catalog/songs**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST') {
      payload = route.request().postDataJSON();
      merged = true;
      return route.fulfill({
        json: { ...provisional, status: 'MERGED', mergedInto: approved.id, version: 1 },
      });
    }
    const targets = url.searchParams.get('status') === 'APPROVED';
    const items = targets ? [approved] : merged ? [] : [provisional];
    return route.fulfill({ json: { items, total: items.length, page: 0, size: 25 } });
  });
  await enter(page);
  await page.getByRole('button', { name: /Equalize Pitty Provisória/ }).click();
  await page.getByRole('button', { name: 'Opções da música', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Unificar duplicata', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Unificar duplicata', exact: true });
  await expect(
    dialog.getByRole('button', { name: 'Confirmar unificação', exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel('Buscar música de destino', { exact: true }).fill('Equalize');
  await dialog.getByRole('button', { name: 'Buscar destino', exact: true }).click();
  await dialog.getByRole('radio', { name: 'Equalize oficial — Pitty', exact: true }).check();
  await dialog.getByLabel('Motivo', { exact: true }).fill('Duplicidade confirmada');
  await dialog.getByRole('button', { name: 'Confirmar unificação', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(payload).toEqual({
    version: 0,
    targetId: 'song-target',
    targetVersion: 2,
    reason: 'Duplicidade confirmada',
  });
});

test('catalog create safely retries lost responses and a stale edit stays visible', async ({
  page,
}) => {
  await auth(page);
  let fail = true;
  let created = false;
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/admin/catalog/songs**', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (!body.operationId)
        return route.fulfill({
          status: 409,
          json: { detail: 'A música mudou. Atualize o catálogo.' },
        });
      if (fail) {
        fail = false;
        return route.fulfill({ status: 503 });
      }
      created = true;
      return route.fulfill({ json: { ...approved, title: body.title } });
    }
    return route.fulfill({
      json: { items: created ? [approved] : [], total: created ? 1 : 0, page: 0, size: 25 },
    });
  });
  await enter(page);
  await page.getByRole('button', { name: 'Cadastrar música', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cadastrar música', exact: true });
  await dialog.getByLabel('Título da música', { exact: true }).fill('Nova música');
  await dialog.getByLabel('Artista', { exact: true }).fill('Artista');
  await dialog.getByRole('button', { name: 'Cadastrar música', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('Título da música', { exact: true })).toHaveValue('Nova música');
  await dialog.getByRole('button', { name: 'Cadastrar música', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0].operationId).toBe(writes[1].operationId);
  await page.getByRole('button', { name: /Equalize oficial Pitty Aprovada/ }).click();
  const detail = page.getByRole('dialog', { name: 'Detalhes da música', exact: true });
  await detail.getByLabel('Título da música', { exact: true }).fill('Correção concorrente');
  await detail.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(detail.getByRole('alert')).toContainText('A música mudou');
  await expect(detail.getByLabel('Título da música', { exact: true })).toHaveValue(
    'Correção concorrente',
  );
});
