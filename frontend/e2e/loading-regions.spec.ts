import { test, expect, Page } from '@playwright/test';
const admin = {
  email: 'admin@example.test',
  role: 'HOST',
  administrator: true,
  emailVerified: true,
  status: 'APPROVED',
};
const session = {
  id: 'session',
  name: 'Karaokê de teste',
  status: 'OPEN',
  createdAt: '2026-11-16T12:00:00Z',
};
const account = {
  email: 'rita@example.test',
  name: 'Rita',
  role: 'HOST',
  status: 'PENDING',
  emailVerified: true,
  administrator: false,
  version: 0,
  createdAt: session.createdAt,
};
const gate = () => {
  let release!: () => void;
  const wait = new Promise<void>((r) => (release = r));
  return { wait, release };
};
async function auth(page: Page, value = admin) {
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: value }));
}

test('one fullscreen loading mask releases on failure and preserves keyboard focus', async ({
  page,
}, info) => {
  await auth(page);
  let reads = 0;
  const pending = gate();
  await page.route('**/api/admin/accounts**', async (r) => {
    reads++;
    if (reads > 1) {
      await pending.wait;
      return r.fulfill({ status: 503, json: { detail: 'Indisponível' } });
    }
    return r.fulfill({ json: { items: [account], total: 1, page: 0, size: 25 } });
  });
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: /Rita/ }).first()).toBeVisible();
  await expect(page.locator('p-progress-spinner')).toHaveCount(0);
  const refresh = page.getByRole('button', { name: 'Atualizar cadastros', exact: true });
  await refresh.click();
  await expect(
    page.getByRole('progressbar', { name: 'Carregando dados', exact: true }),
  ).toBeVisible();
  await expect(page.locator('app-loading-region')).toHaveCount(1);
  await expect(page.locator('[data-loading-overlay]')).toHaveCount(0);
  const mask = await page.locator('.sf-application-loading').boundingBox();
  expect(mask!.x).toBeCloseTo(0, 0);
  expect(mask!.y).toBeCloseTo(0, 0);
  expect(mask!.width).toBeCloseTo(page.viewportSize()!.width, 0);
  expect(mask!.height).toBeCloseTo(page.viewportSize()!.height, 0);
  await expect(
    page.getByRole('navigation', { name: 'Navegação administrativa', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('admin-list-loading.png'),
    animations: 'disabled',
  });
  pending.release();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('p-progress-spinner')).toHaveCount(0);
  await page.getByLabel('Buscar cadastro', { exact: true }).focus();
  await expect(page.getByLabel('Buscar cadastro', { exact: true })).toBeFocused();
});

for (const experience of ['musician', 'participant'] as const) {
  test(`${experience} polling never displays a blocking overlay`, async ({ page }) => {
    await page.clock.install();
    const pending = gate();
    let reads = 0;
    if (experience === 'musician') {
      await auth(page, { ...admin, administrator: false, role: 'MUSICIAN' });
      await page.route('**/api/musicians/sessions', (r) => r.fulfill({ json: [session] }));
      await page.route('**/api/musicians/sessions/session', async (r) => {
        reads++;
        if (reads > 1) await pending.wait;
        return r.fulfill({
          json: {
            session,
            stage: { active: null, suggestions: [], history: [], waits: [] },
            chords: {},
            streaming: {},
          },
        });
      });
      await page.goto('/musico');
      await expect(page.getByRole('heading', { name: 'No palco', exact: true })).toBeVisible();
    } else {
      const id = '11111111-1111-4111-8111-111111111111';
      await page.route(`**/api/participation/${id}/me`, async (r) => {
        reads++;
        if (reads > 1) await pending.wait;
        return r.fulfill({
          json: {
            session: { ...session, id },
            participant: {
              id: 'self',
              name: 'Ana',
              status: 'ACTIVE',
              origin: 'SELF',
              completedPerformances: 0,
            },
            requests: [],
            active: null,
            history: [],
            suggested: false,
            queuePosition: 1,
            canReturn: false,
            expiresAt: null,
          },
        });
      });
      await page.goto(`/participante/${id}/vinculado`);
      await expect(page.getByRole('tab', { name: 'Pedidos', exact: true })).toBeVisible();
    }
    await expect(page.locator('p-progress-spinner')).toHaveCount(0);
    await page.clock.fastForward(experience === 'musician' ? 4500 : 10500);
    await expect.poll(() => reads).toBeGreaterThanOrEqual(2);
    await expect(page.locator('p-progress-spinner')).toHaveCount(0);
    await expect(page.locator('.sf-application-loading:visible')).toHaveCount(0);
    pending.release();
  });
}

test('admin session polling is silent while manual detail loading is local to the modal', async ({
  page,
}) => {
  await page.clock.install();
  await auth(page);
  let reads = 0;
  const pending = gate();
  const summary = { session, host: { name: 'Rita', email: 'rita@example.test' } };
  await page.route('**/api/admin/accounts**', (r) =>
    r.fulfill({ json: { items: [], total: 0, page: 0, size: 25 } }),
  );
  await page.route('**/api/admin/sessions', (r) => r.fulfill({ json: [summary] }));
  await page.route('**/api/admin/sessions/session', async (r) => {
    reads++;
    if (reads > 1) await pending.wait;
    return r.fulfill({
      json: {
        ...summary,
        musicians: [],
        stage: { active: null, suggestions: [], history: [], waits: [] },
      },
    });
  });
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Sessões', exact: true }).click();
  await page
    .getByRole('button', { name: /Karaokê de teste/ })
    .first()
    .click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await expect(page.locator('p-progress-spinner')).toHaveCount(0);
  await page.clock.fastForward(4500);
  await expect.poll(() => reads).toBeGreaterThanOrEqual(2);
  await expect(modal.locator('p-progress-spinner')).toHaveCount(0);
  pending.release();
  await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(modal).toHaveCount(0);
});

test('concurrent foreground reads share one overlay until the last request completes', async ({
  page,
}) => {
  await auth(page, { ...admin, administrator: false });
  const people = gate(),
    requests = gate();
  let started = 0;
  await page.route('**/api/sessions**', async (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/api/sessions') return r.fulfill({ json: [session] });
    if (path.endsWith('/participants')) {
      started++;
      await people.wait;
      return r.fulfill({ json: [] });
    }
    if (path.endsWith('/requests')) {
      started++;
      await requests.wait;
      return r.fulfill({ json: [] });
    }
    return r.fulfill({ json: { suggestions: [], active: null, history: [], waits: [] } });
  });
  await page.goto('/anfitriao');
  await expect.poll(() => started).toBe(2);
  const spinner = page.getByRole('progressbar', { name: 'Carregando dados', exact: true });
  await expect(spinner).toBeVisible();
  await expect(page.locator('app-loading-region')).toHaveCount(1);
  people.release();
  await expect(spinner).toBeVisible();
  requests.release();
  await expect(spinner).toHaveCount(0);
  await expect(
    page.getByRole('navigation', { name: 'Navegação do anfitrião', exact: true }),
  ).toBeVisible();
});

test('entry autocomplete remains editable during an external lookup without global loading', async ({
  page,
}) => {
  const pending = gate();
  let requested = false;
  await page.route('**/api/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith('/songs/search')) {
      if (url.searchParams.get('q') === 'Equ') {
        requested = true;
        await pending.wait;
      }
      return r.fulfill({ json: [{ title: 'Equalize', artist: 'Pitty' }] });
    }
    if (url.pathname.includes('/public/'))
      return r.fulfill({ json: { name: 'Karaokê de teste', status: 'OPEN' } });
    return r.fulfill({ status: 401 });
  });
  await page.goto('/participante/11111111-1111-4111-8111-111111111111/entry-code');
  const input = page.getByRole('combobox', { name: 'Primeira música' });
  await expect(page.locator('p-progress-spinner')).toHaveCount(0);
  await input.fill('Equ');
  await expect.poll(() => requested).toBe(true);
  await expect(page.locator('p-progress-spinner')).toHaveCount(0);
  await input.pressSequentially('alize');
  await expect(input).toHaveValue('Equalize');
  pending.release();
  await expect(page.getByRole('option', { name: 'Equalize — Pitty' })).toBeVisible();
});

test('admin catalogue autocomplete does not block typing while results are pending', async ({
  page,
}) => {
  await auth(page);
  const pending = gate();
  let requested = false;
  await page.route('**/api/admin/**', async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith('/search-page')) {
      if (url.searchParams.get('q') === 'Equal') {
        requested = true;
        await pending.wait;
      }
      return r.fulfill({ json: { items: [], hasMore: false, nextSource: 'catalog', nextPage: 0 } });
    }
    return r.fulfill({ json: { items: [], total: 0, page: 0, size: 10 } });
  });
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Catálogo', exact: true }).click();
  await expect(page.locator('p-progress-spinner')).toHaveCount(0);
  const input = page.getByRole('textbox', { name: 'Buscar música ou artista', exact: true });
  await input.fill('Equal');
  await expect.poll(() => requested).toBe(true);
  await expect(page.locator('p-progress-spinner')).toHaveCount(0);
  await input.fill('Giz');
  await expect(input).toHaveValue('Giz');
  pending.release();
});
