import { test, expect, Page } from '@playwright/test';
const base = '/api/admin/catalog/sync';
const run = {
  id: 'run-one',
  status: 'COMPLETED',
  startedBy: 'admin@example.test',
  createdAt: '2026-11-12T12:00:00Z',
  message: '',
};
const item = {
  id: 'item-one',
  runId: run.id,
  songId: 'song-one',
  title: 'Equalize',
  artist: '',
  songVersion: 0,
  state: 'REVIEW',
  revision: 2,
  attempts: 1,
  message: 'Confira as correspondências.',
  updatedAt: '2026-11-12T12:01:00Z',
};
const target = {
  id: 'song-target',
  title: 'Equalize',
  artist: 'Pitty',
  status: 'APPROVED',
  version: 4,
};
const candidate = {
  position: 0,
  title: 'Equalize',
  artist: 'Pitty',
  url: 'https://www.last.fm/music/Pitty/_/Equalize',
  mbid: '',
  score: 100,
  existing: target,
};
function counts(overrides = {}) {
  return {
    total: 3,
    processed: 3,
    automatic: 1,
    approved: 0,
    review: 1,
    failed: 1,
    skipped: 0,
    queued: 0,
    processing: 0,
    ...overrides,
  };
}
async function shell(page: Page) {
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({
      json: {
        email: 'admin@example.test',
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
  await page.route('**/api/admin/catalog/songs**', (r) =>
    r.fulfill({ json: { items: [], total: 0, page: 0, size: 25 } }),
  );
}
async function enter(page: Page) {
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Catálogo', exact: true }).click();
  await page.getByRole('button', { name: 'Sincronizar provisórias', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Sincronizar provisórias', exact: true }),
  ).toBeVisible();
}

test('sync progress updates while paused runs resume and survives leaving the screen', async ({
  page,
}, testInfo) => {
  await shell(page);
  let started = false,
    phase = 0,
    status = 'RUNNING';
  let starts = 0;
  await page.route('**/api/admin/catalog/sync/**', async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    if (route.request().method() === 'POST') {
      expect(route.request().headers()['x-csrf-token']).toBe('csrf');
      if (path === base + '/runs') {
        started = true;
        starts++;
        return route.fulfill({ json: { ...run, status } });
      }
      if (path.endsWith('/pause')) status = 'PAUSED';
      else if (path.endsWith('/resume')) status = 'RUNNING';
      return route.fulfill({ json: { ...run, status } });
    }
    if (path === base + '/runs')
      return route.fulfill({ json: started ? [{ ...run, status }] : [] });
    if (path.endsWith('/items'))
      return route.fulfill({
        json: {
          items: phase
            ? [
                {
                  ...item,
                  id: 'automatic',
                  artist: 'Pitty',
                  state: 'AUTO_APPROVED',
                  message: 'Título e artista exatos.',
                },
                item,
              ]
            : [],
          total: phase ? 2 : 0,
          page: 0,
          size: 20,
        },
      });
    return route.fulfill({
      json: {
        run: { ...run, status },
        counts: phase
          ? counts({ processed: 2, review: 1, failed: 0, queued: 1 })
          : counts({ processed: 0, automatic: 0, review: 0, failed: 0, queued: 3 }),
        currentTitle: '',
      },
    });
  });
  await enter(page);
  await page.getByRole('button', { name: 'Iniciar sincronização', exact: true }).click();
  expect(starts).toBe(0);
  await page
    .getByRole('dialog', { name: 'Iniciar sincronização?', exact: true })
    .getByRole('button', { name: 'Confirmar início', exact: true })
    .click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  phase = 1;
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2', {
    timeout: 7000,
  });
  await expect(page.getByRole('list', { name: 'Atividade da sincronização' })).toContainText(
    'Aprovada automaticamente',
  );
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retomar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retomar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar ao catálogo', exact: true }).click();
  await page.getByRole('button', { name: 'Sincronizar provisórias', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  expect(starts).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('sync-progress.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('sync correspondence shows before and after and requires explicit link confirmation', async ({
  page,
}) => {
  await shell(page);
  let approved = false;
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/admin/catalog/sync/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (path.endsWith('/preview'))
        return route.fulfill({
          json: {
            item,
            title: candidate.title,
            artist: candidate.artist,
            url: candidate.url,
            mbid: '',
            existing: target,
          },
        });
      writes.push(body);
      approved = true;
      return route.fulfill({
        json: { item: { ...item, state: 'MERGED', revision: 3 }, candidates: [] },
      });
    }
    if (path === base + '/runs') return route.fulfill({ json: [run] });
    if (path.endsWith('/items'))
      return route.fulfill({
        json: { items: approved ? [] : [item], total: approved ? 0 : 1, page: 0, size: 20 },
      });
    if (path.includes('/items/')) return route.fulfill({ json: { item, candidates: [candidate] } });
    return route.fulfill({
      json: {
        run,
        counts: counts({ review: approved ? 0 : 1, approved: approved ? 1 : 0 }),
        currentTitle: '',
      },
    });
  });
  await enter(page);
  await page.getByRole('button', { name: 'Precisam de revisão', exact: true }).click();
  await page
    .getByRole('button', { name: /Equalize Artista não informado Precisa de revisão/ })
    .click();
  let modal = page.getByRole('dialog', { name: 'Revisar música', exact: true });
  await modal.getByRole('radio', { name: /Equalize Pitty/ }).check();
  await modal.getByRole('button', { name: 'Revisar alteração', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirmar aprovação?', exact: true });
  await expect(confirm.getByRole('region', { name: 'Dados atuais' })).toContainText(
    'Artista não informado',
  );
  await expect(confirm.getByRole('region', { name: 'Dados propostos' })).toContainText('Pitty');
  await expect(confirm).toContainText('Já existe um cadastro no SingFlow');
  expect(writes).toHaveLength(0);
  await confirm.getByRole('button', { name: 'Vincular e aprovar', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  expect(writes).toEqual([{ revision: 2, position: 0, targetId: 'song-target', targetVersion: 4 }]);
});

test('sync manual review keeps edits during polling and reports stale approval without false success', async ({
  page,
}) => {
  await shell(page);
  let previews = 0,
    approvals = 0;
  const empty = { ...item, message: 'Nenhuma correspondência encontrada.' };
  await page.route('**/api/admin/catalog/sync/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') {
      if (path.endsWith('/preview')) {
        previews++;
        const body = route.request().postDataJSON();
        return route.fulfill({
          json: {
            item: empty,
            title: body.title,
            artist: body.artist,
            url: '',
            mbid: '',
            existing: null,
          },
        });
      }
      approvals++;
      return route.fulfill({
        status: 409,
        json: { detail: 'O cadastro foi alterado. Consulte novamente antes de aprovar.' },
      });
    }
    if (path === base + '/runs') return route.fulfill({ json: [run] });
    if (path.endsWith('/items'))
      return route.fulfill({ json: { items: [empty], total: 1, page: 0, size: 20 } });
    if (path.includes('/items/')) return route.fulfill({ json: { item: empty, candidates: [] } });
    return route.fulfill({ json: { run, counts: counts(), currentTitle: '' } });
  });
  await enter(page);
  await page
    .getByRole('button', { name: /Equalize Artista não informado Precisa de revisão/ })
    .click();
  const modal = page.getByRole('dialog', { name: 'Revisar música', exact: true });
  await expect(
    modal.getByRole('button', { name: 'Usar dados manuais', exact: true }),
  ).toBeDisabled();
  await modal.getByLabel('Título da música', { exact: true }).fill('Equalize corrigida');
  await modal.getByLabel('Artista', { exact: true }).fill('Pitty');
  await page.waitForTimeout(2300);
  await expect(modal.getByLabel('Título da música', { exact: true })).toHaveValue(
    'Equalize corrigida',
  );
  expect(previews).toBe(0);
  await modal.getByRole('button', { name: 'Usar dados manuais', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar aprovação', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirmar aprovação?', exact: true });
  await expect(confirm.getByRole('alert')).toContainText('O cadastro foi alterado');
  expect(approvals).toBe(1);
  await confirm.getByRole('button', { name: 'Voltar à revisão', exact: true }).click();
  await expect(modal.getByLabel('Artista', { exact: true })).toHaveValue('Pitty');
  await modal.getByRole('button', { name: 'Deixar para depois', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(approvals).toBe(1);
});

test('sync failed lookup can be retried and reopening keeps the pending batch', async ({
  page,
}) => {
  await shell(page);
  let retried = false;
  const failure = {
    ...item,
    state: 'FAILED',
    attempts: 3,
    revision: 6,
    message: 'Consulta indisponível após três tentativas.',
  };
  await page.route('**/api/admin/catalog/sync/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const currentRun = { ...run, status: retried ? 'RUNNING' : 'COMPLETED' };
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ revision: 6 });
      retried = true;
      return route.fulfill({
        json: { item: { ...failure, state: 'QUEUED', revision: 7 }, candidates: [] },
      });
    }
    if (path === base + '/runs') return route.fulfill({ json: [currentRun] });
    if (path.endsWith('/items'))
      return route.fulfill({
        json: { items: retried ? [] : [failure], total: retried ? 0 : 1, page: 0, size: 20 },
      });
    if (path.includes('/items/')) return route.fulfill({ json: { item: failure, candidates: [] } });
    return route.fulfill({
      json: {
        run: currentRun,
        counts: counts({
          failed: retried ? 0 : 1,
          queued: retried ? 1 : 0,
          processed: retried ? 2 : 3,
        }),
        currentTitle: '',
      },
    });
  });
  await enter(page);
  await page
    .getByRole('button', { name: /Equalize Artista não informado Falha na consulta/ })
    .click();
  const modal = page.getByRole('dialog', { name: 'Revisar música', exact: true });
  await modal.getByRole('button', { name: 'Opções da revisão', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Consultar dados salvos', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  expect(retried).toBe(true);
});

test('sync refined lookup uses the draft and keeps approval explicit', async ({ page }) => {
  await shell(page);
  let searched = false,
    approved = false;
  const queries: Record<string, unknown>[] = [];
  const approvals: Record<string, unknown>[] = [];
  const original = { ...item, title: 'Gis', artist: '' };
  const refined = { ...original, revision: 3 };
  const match = { ...candidate, title: 'Giz', artist: 'Legião Urbana', existing: null };
  await page.route('**/api/admin/catalog/sync/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (path.endsWith('/search')) {
        queries.push(body);
        searched = true;
        return route.fulfill({ json: { item: refined, candidates: [match] } });
      }
      if (path.endsWith('/preview'))
        return route.fulfill({
          json: {
            item: refined,
            title: match.title,
            artist: match.artist,
            url: match.url,
            mbid: '',
            existing: null,
          },
        });
      approved = true;
      approvals.push(body);
      return route.fulfill({ json: { item: { ...refined, state: 'APPROVED' }, candidates: [] } });
    }
    if (path === base + '/runs') return route.fulfill({ json: [run] });
    if (path.endsWith('/items'))
      return route.fulfill({
        json: { items: approved ? [] : [original], total: approved ? 0 : 1, page: 0, size: 20 },
      });
    if (path.includes('/items/'))
      return route.fulfill({
        json: {
          item: searched ? refined : original,
          candidates: searched
            ? [match]
            : [{ ...candidate, title: 'Gis', artist: 'Outro artista', existing: null }],
        },
      });
    return route.fulfill({ json: { run, counts: counts(), currentTitle: '' } });
  });
  await enter(page);
  await page.getByRole('button', { name: /Gis Artista não informado Precisa de revisão/ }).click();
  let modal = page.getByRole('dialog', { name: 'Revisar música', exact: true });
  await modal.getByRole('button', { name: 'Refinar busca', exact: true }).click();
  await modal.getByLabel('Título da música', { exact: true }).fill('Giz');
  await modal.getByLabel('Artista', { exact: true }).fill('Legião Urbana');
  await modal.getByRole('button', { name: 'Buscar novamente no Last.fm', exact: true }).click();
  await expect(modal.getByRole('radio', { name: /Giz Legião Urbana/ })).toBeVisible();
  expect(queries).toEqual([{ revision: 2, title: 'Giz', artist: 'Legião Urbana' }]);
  expect(approvals).toHaveLength(0);
  await expect(modal.getByRole('radio', { name: /Gis Outro artista/ })).toHaveCount(0);
  await expect(modal.getByLabel('Artista', { exact: true })).toHaveValue('Legião Urbana');
  await modal.getByRole('radio', { name: /Giz Legião Urbana/ }).check();
  await modal.getByRole('button', { name: 'Revisar alteração', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirmar aprovação?', exact: true });
  await expect(confirm.getByRole('region', { name: 'Dados atuais' })).toContainText('Gis');
  await expect(confirm.getByRole('region', { name: 'Dados propostos' })).toContainText('Giz');
  expect(approvals).toHaveLength(0);
  await confirm.getByRole('button', { name: 'Confirmar aprovação', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  expect(approvals[0]).toMatchObject({ revision: 3, position: 0 });
});

test('sync refined failure keeps the draft and no matches still allows manual approval', async ({
  page,
}) => {
  await shell(page);
  let fail = true;
  const original = { ...item, title: 'Gis', artist: '' };
  const old = { ...candidate, title: 'Gis', artist: 'Anterior', existing: null };
  let manual: Record<string, unknown> | undefined;
  await page.route('**/api/admin/catalog/sync/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') {
      if (path.endsWith('/search')) {
        if (fail) {
          fail = false;
          return route.fulfill({
            status: 503,
            json: { detail: 'Busca temporariamente indisponível.' },
          });
        }
        return route.fulfill({ json: { item: { ...original, revision: 3 }, candidates: [] } });
      }
      manual = route.request().postDataJSON();
      return route.fulfill({
        json: {
          item: { ...original, revision: 3 },
          title: 'Giz',
          artist: 'Legião Urbana',
          url: '',
          mbid: '',
          existing: null,
        },
      });
    }
    if (path === base + '/runs') return route.fulfill({ json: [run] });
    if (path.endsWith('/items'))
      return route.fulfill({ json: { items: [original], total: 1, page: 0, size: 20 } });
    if (path.includes('/items/'))
      return route.fulfill({ json: { item: original, candidates: [old] } });
    return route.fulfill({ json: { run, counts: counts(), currentTitle: '' } });
  });
  await enter(page);
  await page.getByRole('button', { name: /Gis Artista não informado Precisa de revisão/ }).click();
  const modal = page.getByRole('dialog', { name: 'Revisar música', exact: true });
  await modal.getByRole('button', { name: 'Refinar busca', exact: true }).click();
  await modal.getByLabel('Título da música', { exact: true }).fill('Giz');
  await modal.getByLabel('Artista', { exact: true }).fill('Legião Urbana');
  await modal.getByRole('button', { name: 'Buscar novamente no Last.fm', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Busca temporariamente indisponível');
  await expect(modal.getByLabel('Título da música', { exact: true })).toHaveValue('Giz');
  await expect(modal.getByRole('radio', { name: /Gis Anterior/ })).toBeVisible();
  await modal.getByRole('button', { name: 'Buscar novamente no Last.fm', exact: true }).click();
  await expect(modal.getByRole('radio')).toHaveCount(0);
  await expect(
    modal.getByText('Nenhuma correspondência encontrada. Você pode usar os dados manuais.', {
      exact: true,
    }),
  ).toBeVisible();
  await modal.getByRole('button', { name: 'Usar dados manuais', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Confirmar aprovação?', exact: true }),
  ).toBeVisible();
  expect(manual).toEqual({ revision: 3, position: null, title: 'Giz', artist: 'Legião Urbana' });
});

test('sync last approval returns to catalog with one info notification', async ({ page }) => {
  await shell(page);
  let approved = false;
  const original = { ...item, title: 'Giz', artist: '' };
  await page.route('**/api/admin/catalog/sync/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') {
      if (path.endsWith('/preview'))
        return route.fulfill({
          json: {
            item: original,
            title: 'Giz',
            artist: 'Legião Urbana',
            url: '',
            mbid: '',
            existing: null,
          },
        });
      approved = true;
      return route.fulfill({ json: { item: { ...original, state: 'APPROVED' }, candidates: [] } });
    }
    if (path === base + '/runs') return route.fulfill({ json: [run] });
    if (path.endsWith('/items'))
      return route.fulfill({
        json: { items: approved ? [] : [original], total: approved ? 0 : 1, page: 0, size: 20 },
      });
    if (path.includes('/items/'))
      return route.fulfill({ json: { item: original, candidates: [] } });
    return route.fulfill({
      json: {
        run,
        counts: counts({
          total: 1,
          processed: 1,
          automatic: 0,
          review: approved ? 0 : 1,
          approved: approved ? 1 : 0,
          failed: 0,
        }),
        pendingReview: approved ? 0 : 1,
        currentTitle: '',
      },
    });
  });
  await enter(page);
  await page.getByRole('button', { name: /Giz Artista não informado Precisa de revisão/ }).click();
  const modal = page.getByRole('dialog', { name: 'Revisar música', exact: true });
  await modal.getByLabel('Artista', { exact: true }).fill('Legião Urbana');
  await modal.getByRole('button', { name: 'Usar dados manuais', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar aprovação', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Catálogo de músicas', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.p-toast-message-info')).toContainText(
    'Sincronização finalizada com sucesso',
  );
  await expect(page.getByText('Existem músicas pendentes de revisão', { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText('Música aprovada.', { exact: true })).toHaveCount(0);
});

for (const exit of ['back', 'tab'] as const) {
  test(`sync exit with pending review warns once (${exit})`, async ({ page }) => {
    await shell(page);
    const writes: string[] = [];
    await page.route('**/api/admin/catalog/sync/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'POST') writes.push(path);
      if (path === base + '/runs') return route.fulfill({ json: [run] });
      if (path.endsWith('/items'))
        return route.fulfill({ json: { items: [item], total: 1, page: 0, size: 20 } });
      return route.fulfill({
        json: {
          run,
          counts: counts({ total: 1, processed: 1, automatic: 0, review: 1, failed: 0 }),
          pendingReview: 1,
          currentTitle: '',
        },
      });
    });
    await enter(page);
    await expect(page.getByRole('progressbar')).toBeVisible();
    if (exit === 'back')
      await page.getByRole('button', { name: 'Voltar ao catálogo', exact: true }).click();
    else await page.getByRole('button', { name: 'Cadastros', exact: true }).click();
    await expect(page.locator('.p-toast-message-warn')).toHaveCount(1);
    await expect(page.locator('.p-toast-message-warn')).toContainText(
      'Existem músicas pendentes de revisão',
    );
    await expect(
      page.getByText('Sincronização finalizada com sucesso', { exact: true }),
    ).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}

test('sync does not finish while skipped catalog entries remain provisional', async ({ page }) => {
  await shell(page);
  await page.route('**/api/admin/catalog/sync/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === base + '/runs') return route.fulfill({ json: [run] });
    if (path.endsWith('/items'))
      return route.fulfill({
        json: { items: [{ ...item, state: 'SKIPPED' }], total: 1, page: 0, size: 20 },
      });
    return route.fulfill({
      json: {
        run,
        counts: counts({ total: 1, processed: 1, automatic: 0, review: 0, failed: 0, skipped: 1 }),
        pendingReview: 1,
        currentTitle: '',
      },
    });
  });
  await enter(page);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await expect(
    page.getByRole('heading', { name: 'Sincronizar provisórias', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Sincronização finalizada com sucesso', { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Voltar ao catálogo', exact: true }).click();
  await expect(page.locator('.p-toast-message-warn')).toContainText(
    'Existem músicas pendentes de revisão',
  );
});
