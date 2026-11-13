import { expect, Page, test } from '@playwright/test';

type Session = { id: string; name: string; status: string; createdAt: string };
const date = '2026-11-10T12:00:00Z';
async function setup(page: Page, sessions: Session[] = [], signedIn = true) {
  let authenticated = signedIn;
  let rejectLogin = false;
  let rejectClose = false;
  let creates = 0;
  let opens = 0;
  let closes = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/entry-link'))
      return route.fulfill({ json: { url: 'https://singflow.example/participante/test/entry' } });
    if (path.endsWith('/auth/me'))
      return authenticated
        ? route.fulfill({ json: { email: 'host@example.test' } })
        : route.fulfill({ status: 401 });
    if (path.endsWith('/auth/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (request.method() === 'POST') expect(request.headers()['x-csrf-token']).toBe('csrf');
    if (path.endsWith('/auth/login')) {
      if (rejectLogin) return route.fulfill({ status: 401 });
      authenticated = true;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith('/auth/logout')) {
      authenticated = false;
      return route.fulfill({ status: 204 });
    }
    if (path === '/api/sessions' && request.method() === 'GET')
      return route.fulfill({ json: sessions });
    if (path === '/api/sessions' && request.method() === 'POST') {
      creates++;
      const body = request.postDataJSON();
      const created = { id: body.operationId, name: body.name, status: 'DRAFT', createdAt: date };
      sessions.unshift(created);
      return route.fulfill({ json: created });
    }
    if (path.endsWith('/open') || path.endsWith('/close')) {
      const item = sessions.find((s) => path.includes(s.id))!;
      if (path.endsWith('/close')) {
        closes++;
        if (rejectClose)
          return route.fulfill({
            status: 409,
            json: { detail: 'Resolva a convocação ativa antes de encerrar.' },
          });
        item.status = 'CLOSED';
      } else {
        opens++;
        item.status = 'OPEN';
      }
      return route.fulfill({ json: item });
    }
    if (
      path.endsWith('/participants') ||
      path.endsWith('/requests') ||
      path.endsWith('/musicians') ||
      path.endsWith('/musicians/available')
    )
      return route.fulfill({ json: [] });
    if (path.endsWith('/stage'))
      return route.fulfill({ json: { active: null, suggestions: [], history: [], waits: [] } });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/anfitriao');
  return {
    rejectLogin: (value: boolean) => {
      rejectLogin = value;
    },
    rejectClose: (value: boolean) => {
      rejectClose = value;
    },
    counts: () => ({ creates, opens, closes }),
  };
}

test('login supports password visibility, failure and recovery without exposing the account menu', async ({
  page,
}, testInfo) => {
  const api = await setup(page, [], false);
  await expect(page.getByRole('heading', { name: 'Entrar como anfitrião' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Experiências' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Opções da conta' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
  await page.getByLabel('E-mail', { exact: true }).fill('invalido');
  await page.getByLabel('Senha', { exact: true }).fill('senha-apenas-de-teste');
  await expect(page.getByText('Informe um e-mail válido.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Mostrar senha' }).click();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ocultar senha' }).click();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByLabel('E-mail', { exact: true }).fill('host@example.test');
  api.rejectLogin(true);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Entrar como anfitrião' })).toBeVisible();
  api.rejectLogin(false);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Vamos começar?' })).toBeVisible();
});

test('create, cancel, open and register empty session retain a mobile layout and deliberate transitions', async ({
  page,
}, testInfo) => {
  const api = await setup(page);
  await expect(page.getByRole('heading', { name: 'Vamos começar?' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('sem-sessao.png'), fullPage: true });
  await page.getByRole('button', { name: 'Criar sessão', exact: true }).click();
  await expect(page.getByLabel('Nome da sessão')).toBeFocused();
  await page.getByLabel('Nome da sessão').fill('Não criar');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Criar sessão', exact: true })).toBeFocused();
  expect(api.counts().creates).toBe(0);
  await page.getByRole('button', { name: 'Criar sessão', exact: true }).click();
  await page.getByLabel('Nome da sessão').fill('Ensaio Café Tão');
  await page.getByRole('button', { name: 'Criar sessão', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ensaio Café Tão', exact: true })).toBeFocused();
  await expect(page.getByText('Rascunho', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('rascunho.png'), fullPage: true });
  await expect(page.getByRole('button', { name: 'Criar participante', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Excluir rascunho' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir sessão', exact: true }).click();
  await expect(page.locator('#host-session-title')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar participante', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('tab', { name: 'Participantes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Participantes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Criar participante', exact: true }).click();
  await expect(page.getByLabel('Nome do participante', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Cancelar inscrição', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Criar participante', exact: true })).toBeFocused();
  expect(api.counts()).toEqual({ creates: 1, opens: 1, closes: 0 });
  await page.screenshot({ path: testInfo.outputPath('sessao-aberta.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const create = await page
    .getByRole('button', { name: 'Criar participante', exact: true })
    .boundingBox();
  expect(create!.height).toBeGreaterThanOrEqual(44);
});

test('session options cancel and recover a rejected closure, then keep closed session read only', async ({
  page,
}) => {
  const api = await setup(page, [
    { id: 'open-session', name: 'Café Tão', status: 'OPEN', createdAt: date },
  ]);
  await page.getByRole('button', { name: 'Opções da conta', exact: true }).click();
  await page.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Encerrar sessão?' })).toBeFocused();
  await page.getByRole('button', { name: 'Cancelar encerramento' }).click();
  expect(api.counts().closes).toBe(0);
  await expect(page.getByRole('button', { name: 'Opções da conta', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Opções da conta', exact: true }).click();
  await page.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
  api.rejectClose(true);
  await page.getByRole('button', { name: 'Confirmar encerramento' }).click();
  await expect(page.getByRole('alert')).toContainText('Resolva a convocação ativa');
  await expect(page.locator('#host-session-title')).toBeVisible();
  api.rejectClose(false);
  await page.getByRole('button', { name: 'Confirmar encerramento' }).click();
  await expect(page.getByRole('heading', { name: 'Vamos começar?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar participante', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Abrir sessão', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Criar sessão', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Opções da conta' }).click();
  await page.getByRole('button', { name: 'Histórico de sessões', exact: true }).click();
  await page.getByRole('button', { name: 'Café Tão Encerrada' }).click();
  await page.getByRole('button', { name: 'Opções da conta', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Sessão atual', exact: true })).toContainText(
    'Encerrada',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Criar nova sessão' })).toBeVisible();
});

test('account disclosure preserves session selection, cancellation, keyboard escape and logout', async ({
  page,
}) => {
  await setup(page, [
    { id: 'past', name: 'Evento anterior', status: 'CLOSED', createdAt: date },
    { id: 'draft', name: 'Próxima festa', status: 'DRAFT', createdAt: date },
    { id: 'current', name: 'Café Tão', status: 'OPEN', createdAt: date },
  ]);
  await expect(page.getByRole('heading', { name: 'Café Tão', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Opções da conta' }).click();
  const menu = page.locator('#host-account-options');
  await expect(page.locator('.sf-menu-backdrop')).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Opções da conta' })).toBeFocused();
  await page.getByRole('button', { name: 'Opções da conta' }).click();
  await menu.getByRole('button', { name: 'Trocar sessão', exact: true }).click();
  await expect(menu.getByRole('button', { name: 'Café Tão Aberta' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Evento anterior Encerrada' })).toHaveCount(0);
  await expect(menu.getByRole('button', { name: 'Próxima festa Rascunho' })).toHaveCount(0);
  await menu.getByRole('button', { name: 'Histórico de sessões', exact: true }).click();
  await expect(menu.getByRole('heading', { name: 'Histórico de sessões' })).toBeFocused();
  await expect(menu.getByRole('button', { name: 'Café Tão Aberta' })).toHaveCount(0);
  await menu.getByRole('button', { name: 'Voltar às sessões abertas' }).click();
  await expect(menu.getByRole('button', { name: 'Café Tão Aberta' })).toBeVisible();
  await page.getByRole('button', { name: 'Histórico de sessões', exact: true }).click();
  await page.getByRole('button', { name: 'Evento anterior Encerrada' }).click();
  await expect(page.getByRole('heading', { name: 'Evento anterior', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Opções da conta' }).click();
  await page.getByRole('button', { name: 'Criar outra sessão' }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evento anterior', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Opções da conta' }).click();
  await page.getByRole('button', { name: 'Rascunhos', exact: true }).click();
  await page.getByRole('button', { name: 'Próxima festa Rascunho' }).click();
  await expect(page.getByRole('button', { name: 'Abrir sessão', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Opções da conta' }).click();
  await page.getByRole('button', { name: 'Sair da conta' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Opções da conta' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Sair da conta' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Opções da conta' }).click();
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByLabel('E-mail', { exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Opções da conta' })).toHaveCount(0);
});

test('floating session menu preserves layout and modal cancellation restores focus', async ({
  page,
}, testInfo) => {
  const api = await setup(page, [
    { id: 'open-session', name: 'Café Tão', status: 'OPEN', createdAt: date },
  ]);
  await expect(page.getByAltText('QR Code para entrar nesta sessão')).toBeVisible();
  const bounds = await page.locator('.sf-panel-header').boundingBox();
  await page.getByRole('button', { name: 'Opções da conta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Atualizar sessão', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Opções da conta', exact: true })).toHaveCSS(
    'background-color',
    'rgb(244, 246, 250)',
  );
  await expect(page.locator('.sf-menu-backdrop')).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(page.getByRole('button', { name: 'Atualizar sessão', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Opções da conta', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Opções da conta', exact: true }).click();
  expect(await page.locator('.sf-panel-header').boundingBox()).toEqual(bounds);
  await page.screenshot({
    path: testInfo.outputPath('menu-flutuante.png'),
    scale: 'css',
  });
  await page.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Encerrar sessão?', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('heading', { name: 'Encerrar sessão?' })).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath('confirmacao.png'),
    scale: 'css',
  });
  for (let index = 0; index < 5; index++) {
    await page.keyboard.press('Tab');
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
      .toBe(true);
  }
  await page.mouse.click(2, 2);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Opções da conta', exact: true })).toBeFocused();
  expect(api.counts().closes).toBe(0);
});

test('confirmation cannot dismiss or double submit while its operation is pending', async ({
  page,
}) => {
  const session = { id: 'open-session', name: 'Café Tão', status: 'OPEN', createdAt: date };
  await setup(page, [session]);
  let complete!: () => void;
  const gate = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let posts = 0;
  await page.route('**/api/sessions/open-session/close', async (route) => {
    posts++;
    await gate;
    session.status = 'CLOSED';
    await route.fulfill({ json: session });
  });
  await page.getByRole('button', { name: 'Opções da conta', exact: true }).click();
  await page.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar encerramento' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar encerramento' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancelar encerramento' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Encerrar sessão?' })).toBeVisible();
  expect(posts).toBe(1);
  complete();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Vamos começar?' })).toBeVisible();
});

test('closing a session selects the remaining open session instead of a draft', async ({
  page,
}) => {
  await setup(page, [
    { id: 'current', name: 'Café Tão', status: 'OPEN', createdAt: date },
    { id: 'draft', name: 'Próxima festa', status: 'DRAFT', createdAt: date },
    { id: 'other', name: 'Outro evento', status: 'OPEN', createdAt: date },
  ]);
  await page.getByRole('button', { name: 'Opções da conta', exact: true }).click();
  await page.getByRole('button', { name: 'Encerrar sessão', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar encerramento' }).click();
  await expect(page.getByRole('heading', { name: 'Outro evento', exact: true })).toBeFocused();
  await expect(page.locator('#host-session-title')).toBeVisible();
});

test('closing a floating menu preserves page scroll and restores its trigger', async ({ page }) => {
  await setup(page, [{ id: 'open-session', name: 'Café Tão', status: 'OPEN', createdAt: date }]);
  const trigger = page.getByRole('button', { name: 'Opções da conta', exact: true });
  const viewport = page.locator('.sf-host-tab-viewport');
  await page.locator('.sf-host-tab-content').evaluate((content) => {
    const tail = document.createElement('div');
    tail.style.height = '1500px';
    content.append(tail);
  });
  await viewport.evaluate((el) => (el.scrollTop = 600));
  // Safari may keep focus on a previous control when a button is tapped.
  await page.locator('.sf-panel-header a').first().focus();
  await trigger.evaluate((button) =>
    button.addEventListener('mousedown', (event) => event.preventDefault(), { once: true }),
  );
  await trigger.scrollIntoViewIfNeeded();
  const before = await viewport.evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(500);
  await trigger.click();
  await expect(page.getByRole('button', { name: 'Sair da conta', exact: true })).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(page.locator('.sf-menu-backdrop')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeCloseTo(before, 0);
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeCloseTo(before, 0);
});

test('host bottom navigation handles empty and closed sessions and keyboard selection', async ({
  page,
}) => {
  await setup(page, [
    { id: 'open-session', name: 'Café Tão', status: 'OPEN', createdAt: date },
    { id: 'closed-session', name: 'Sessão antiga', status: 'CLOSED', createdAt: date },
  ]);
  const nav = page.getByRole('navigation', { name: 'Navegação do anfitrião', exact: true });
  await expect(nav).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar participante', exact: true })).toHaveCount(
    0,
  );
  await nav.getByRole('tab', { name: 'Fila', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(nav.getByRole('tab', { name: 'Participantes', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(nav.getByRole('tab', { name: 'Participantes', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Criar participante', exact: true })).toBeEnabled();
  await nav.getByRole('tab', { name: 'Histórico', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Histórico do palco', exact: true })).toContainText(
    'Nenhuma convocação resolvida.',
  );
  await expect(page.getByRole('button', { name: 'Criar participante', exact: true })).toHaveCount(
    0,
  );
  await nav.getByRole('tab', { name: 'Fila', exact: true }).click();
  await expect(page.getByAltText('QR Code para entrar nesta sessão')).toBeVisible();
  await page.getByRole('button', { name: 'Opções da conta', exact: true }).click();
  await page.getByRole('button', { name: 'Histórico de sessões', exact: true }).click();
  await page.getByRole('button', { name: /Sessão antiga/ }).click();
  await expect(nav.getByRole('tab', { name: 'Fila', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await nav.getByRole('tab', { name: 'Participantes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Participantes', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar participante', exact: true })).toHaveCount(
    0,
  );
  await nav.getByRole('tab', { name: 'Histórico', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Histórico do palco', exact: true })).toBeVisible();
  await nav.getByRole('tab', { name: 'Músicos', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Músicos da sessão', exact: true })).toContainText(
    'A sessão está encerrada.',
  );
  await page.getByRole('button', { name: 'Opções da conta', exact: true }).click();
  const refreshAction = page.getByRole('button', { name: 'Atualizar sessão', exact: true });
  await expect(refreshAction).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Opções da conta', exact: true }).click();
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect(nav).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Entrar como anfitrião', exact: true }),
  ).toBeVisible();
});

test('host session context stays compact in the header across tabs and exposes actions only in its menu', async ({
  page,
}, testInfo) => {
  const name = 'Karaokê no Café Tão com uma sessão de nome muito longo para caber no celular';
  await setup(page, [{ id: 'open-session', name, status: 'OPEN', createdAt: date }]);
  const header = page.locator('.sf-panel-header');
  const title = header.getByRole('heading', { name, exact: true });
  await expect(title).toBeVisible();
  await expect(title).toHaveCSS('text-overflow', 'ellipsis');
  await expect(title).toHaveCSS('letter-spacing', 'normal');
  const headerBounds = await header.boundingBox();
  expect(headerBounds!.height).toBeLessThanOrEqual(74);
  const menu = page.getByRole('button', { name: 'Opções da conta', exact: true });
  const titleBounds = await title.boundingBox(),
    menuBounds = await menu.boundingBox();
  expect(titleBounds!.x + titleBounds!.width).toBeLessThan(menuBounds!.x);
  for (const tab of ['Fila', 'Participantes', 'Histórico', 'Músicos']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expect(title).toHaveText(name);
    await expect(page.locator('.sf-session-card')).toHaveCount(0);
    expect(await header.boundingBox()).toEqual(headerBounds);
  }
  await page.screenshot({ path: testInfo.outputPath('host-header-session.png'), scale: 'css' });
  await menu.click();
  const current = page.getByRole('region', { name: 'Sessão atual', exact: true });
  await expect(current).toContainText(name);
  await expect(current).toContainText('Aberta');
  await expect(current.getByRole('button', { name: 'Encerrar sessão', exact: true })).toBeEnabled();
  await expect(page.locator('#host-account-options .session-list')).toHaveCount(0);
  await page.getByRole('button', { name: 'Atualizar sessão', exact: true }).click();
  await expect(current).toHaveCount(0);
  await expect(title).toHaveText(name);
  await page.setViewportSize({ width: 320, height: 640 });
  expect((await header.boundingBox())!.height).toBeLessThanOrEqual(74);
  await expect(title).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const mode of ['modern', 'missing', 'rejected', 'blocked'] as const) {
  test(`copy session link handles ${mode} clipboard`, async ({ page }) => {
    await page.addInitScript((mode) => {
      const state = window as typeof window & { copiedLink?: string };
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value:
          mode === 'missing' || mode === 'blocked'
            ? undefined
            : {
                writeText: async (value: string) => {
                  if (mode === 'rejected') throw new Error('denied');
                  state.copiedLink = value;
                },
              },
      });
      document.execCommand = (command: string) => {
        if (mode === 'blocked') return false;
        if (command === 'copy') {
          state.copiedLink = (document.activeElement as HTMLTextAreaElement)?.value;
          return true;
        }
        return false;
      };
    }, mode);
    await setup(page, [{ id: 'open-session', name: 'Café Tão', status: 'OPEN', createdAt: date }]);
    await page.getByRole('button', { name: 'Copiar link', exact: true }).click();
    if (mode === 'blocked') {
      await expect(
        page.getByText('Selecione o link acima e copie manualmente.', { exact: true }),
      ).toBeVisible();
      await expect(page.getByText('Link copiado.', { exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByText('Link copiado.', { exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => (window as typeof window & { copiedLink?: string }).copiedLink),
      ).toBe('https://singflow.example/participante/test/entry');
      await expect(
        page.getByText('Selecione o link acima e copie manualmente.', { exact: true }),
      ).toHaveCount(0);
    }
  });
}
