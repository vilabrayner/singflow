import { expect, test } from '@playwright/test';

const csrf = { token: 'csrf', headerName: 'X-CSRF-TOKEN' };
const pending = {
  email: 'new@example.test',
  name: 'Nova pessoa',
  role: 'HOST',
  status: 'PENDING',
  emailVerified: true,
  administrator: false,
  version: 1,
  createdAt: '2026-11-11T12:00:00Z',
};

test('host registers without automatic login and must confirm email before approval', async ({
  page,
}) => {
  const writes: string[] = [];
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: csrf });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 401 });
    if (route.request().method() === 'POST') writes.push(path);
    if (path.endsWith('/accounts/register')) {
      expect(route.request().headers()['x-csrf-token']).toBe('csrf');
      expect(route.request().postDataJSON()).toEqual({
        name: 'Nova pessoa',
        email: 'new@example.test',
        password: 'password-long-2026',
        role: 'HOST',
      });
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 500 });
  });
  await page.goto('/anfitriao');
  await page.getByRole('link', { name: 'Criar conta de anfitrião' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Nova pessoa');
  await page.getByLabel('E-mail', { exact: true }).fill('new@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('password-long-2026');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('different-password');
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page.getByRole('alert')).toContainText('senhas precisam ser iguais');
  expect(writes).toEqual([]);
  await page.getByLabel('Confirmar senha', { exact: true }).fill('password-long-2026');
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
  await expect(
    page.getByText(
      'Depois de confirmar o e-mail, seu cadastro precisa da aprovação do administrador.',
    ),
  ).toBeVisible();
  expect(writes).toEqual(['/api/public/accounts/register']);
});

test('musician signup uses the same approval workflow', async ({ page }) => {
  await page.route('**/api/auth/me', (r) => r.fulfill({ status: 401 }));
  await page.goto('/musico');
  await page.getByRole('button', { name: 'Criar conta de músico', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Criar conta de músico' })).toBeVisible();
  await expect(
    page.getByText('Confirme seu e-mail e aguarde a aprovação para usar o painel.'),
  ).toBeVisible();
});

test('email confirmation requires an explicit action and a pending login opens account status', async ({
  page,
}) => {
  let verified = false,
    approved = false,
    loggedIn = false;
  const token = 'x'.repeat(43);
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: csrf });
    if (path.endsWith('/accounts/verify')) {
      expect(route.request().postDataJSON()).toEqual({ token });
      verified = true;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith('/auth/login')) {
      loggedIn = true;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith('/auth/me'))
      return loggedIn
        ? route.fulfill({
            json: {
              ...pending,
              role: 'MUSICIAN',
              emailVerified: verified,
              status: approved ? 'APPROVED' : 'PENDING',
            },
          })
        : route.fulfill({ status: 401 });
    if (path.endsWith('/musicians/sessions')) return route.fulfill({ json: [] });
    return route.fulfill({ status: 500 });
  });
  await page.goto('/confirmar-email#token=' + token);
  await expect(page.getByRole('button', { name: 'Confirmar e-mail' })).toBeVisible();
  expect(verified).toBe(false);
  expect(page.url()).not.toContain(token);
  await page.getByRole('button', { name: 'Confirmar e-mail' }).click();
  await expect(page.getByRole('heading', { name: 'E-mail confirmado' })).toBeVisible();
  await page.getByRole('link', { name: 'Entrar como músico' }).click();
  await page.getByLabel('E-mail', { exact: true }).fill('new@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('password-long-2026');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/conta$/);
  await expect(page.getByRole('heading', { name: 'Aguardando aprovação' })).toBeVisible();
  approved = true;
  await page.getByRole('button', { name: 'Atualizar situação' }).click();
  await expect(page.getByRole('heading', { name: 'Aguardando uma sessão' })).toBeVisible();
});

test('an ordinary host cannot open administration', async ({ page }) => {
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({ json: { ...pending, status: 'APPROVED' } }),
  );
  await page.goto('/admin');
  await expect(page.getByRole('alert')).toContainText('não possui acesso administrativo');
  await expect(page.getByRole('heading', { name: 'Cadastros', exact: true })).toHaveCount(0);
});

test('administrator approves and suspends with confirmation, reason and account version', async ({
  page,
}) => {
  let account = { ...pending };
  const decisions: unknown[] = [];
  await page.route('**/api/**', (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: csrf });
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: { ...pending, email: 'admin@example.test', status: 'APPROVED', administrator: true },
      });
    if (path.endsWith('/accounts/history')) return route.fulfill({ json: [] });
    if (path.endsWith('/accounts/decision')) {
      const input = request.postDataJSON();
      decisions.push(input);
      expect(input.version).toBe(account.version);
      account = { ...account, status: input.status, version: account.version + 1 };
      return route.fulfill({ json: account });
    }
    if (path.endsWith('/admin/accounts')) {
      const status = url.searchParams.get('status');
      const items = !status || status === account.status ? [account] : [];
      return route.fulfill({ json: { items, total: items.length, page: 0, size: 25 } });
    }
    return route.fulfill({ status: 500 });
  });
  await page.goto('/admin');
  await page.getByRole('button', { name: /Nova pessoa/ }).click();
  await page.getByRole('button', { name: 'Ações do cadastro' }).click();
  await page.getByRole('menuitem', { name: 'Aprovar cadastro', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Confirmar aprovação' })).toBeVisible();
  expect(decisions).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirmar aprovação', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(decisions).toHaveLength(1);
  await page.getByRole('button', { name: 'Opções dos cadastros' }).click();
  await page.getByRole('menuitem', { name: 'Filtrar cadastros' }).click();
  await page.getByLabel('Situação', { exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await page.getByRole('button', { name: /Nova pessoa/ }).click();
  await page.getByRole('button', { name: 'Ações do cadastro' }).click();
  await page.getByRole('menuitem', { name: 'Suspender acesso' }).click();
  await expect(
    page.getByRole('button', { name: 'Confirmar suspensão', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Motivo', { exact: true }).fill('Acesso revisado pelo responsável');
  await page.getByRole('button', { name: 'Confirmar suspensão', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(decisions).toHaveLength(2);
  await expect(page.getByRole('button', { name: /Nova pessoa/ })).toContainText('Acesso suspenso');
});

test('opening either registration from a scrolled login keeps the card below the fixed header', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await page.route('**/api/auth/me', (r) => r.fulfill({ status: 401 }));
  for (const role of ['anfitriao', 'musico']) {
    await page.goto('/' + role);
    await expect(
      page.getByRole('heading', {
        name: role === 'anfitriao' ? 'Entrar como anfitrião' : 'Entrar como músico',
        exact: true,
      }),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    const name = role === 'anfitriao' ? 'Criar conta de anfitrião' : 'Criar conta de músico';
    await page.getByRole(role === 'anfitriao' ? 'link' : 'button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    const header = await page.locator('.sf-panel-header').boundingBox();
    const card = await page.locator('app-surface-card').boundingBox();
    expect(card!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  }
});

test('duplicate registration highlights only the email field and clears when corrected', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: csrf });
    if (path.endsWith('/accounts/register'))
      return route.fulfill({
        status: 409,
        json: { detail: 'Já existe uma conta com este e-mail. Entre na sua conta.' },
      });
    return route.fulfill({ status: 401 });
  });
  await page.goto('/cadastro/musico');
  await page.getByLabel('Nome', { exact: true }).fill('Nova pessoa');
  await page.getByLabel('E-mail', { exact: true }).fill('existing@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('password-long-2026');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('password-long-2026');
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  const email = page.getByLabel('E-mail', { exact: true });
  const message = page.locator('#registration-email-error');
  await expect(message).toContainText('Já existe uma conta');
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(email).toHaveAttribute('aria-describedby', 'registration-email-error');
  await expect(email).toHaveClass(/p-invalid/);
  await expect(email).toBeFocused();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('aria-invalid', 'false');
  // PrimeNG transitions border colors; wait for the invalid appearance to settle.
  await expect
    .poll(async () => {
      const border = await email.evaluate((el) => getComputedStyle(el).borderTopColor);
      const rgb = border.match(/\d+/g)!.map(Number);
      return rgb[0] > rgb[1] * 2 && rgb[0] > rgb[2] * 2;
    })
    .toBe(true);
  const positions = await page.evaluate(() => ({
    field: document.querySelector('#registration-email')!.getBoundingClientRect().bottom,
    message: document.querySelector('#registration-email-error')!.getBoundingClientRect().top,
    next: document.querySelector('#registration-password')!.getBoundingClientRect().top,
  }));
  expect(positions.message).toBeGreaterThanOrEqual(positions.field);
  expect(positions.message).toBeLessThan(positions.next);
  await email.fill('corrected@example.test');
  await expect(message).toHaveCount(0);
  await expect(email).toHaveAttribute('aria-invalid', 'false');
});

test('field validation stays next to inputs while delivery failures use a form alert', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: csrf });
    if (path.endsWith('/accounts/register'))
      return route.fulfill({
        status: 503,
        json: { detail: 'O envio de e-mail está indisponível. Tente novamente mais tarde.' },
      });
    return route.fulfill({ status: 401 });
  });
  await page.goto('/cadastro/anfitriao');
  const email = page.getByLabel('E-mail', { exact: true });
  await email.fill('invalid');
  await email.blur();
  await expect(page.locator('#registration-email-error')).toContainText(
    'Informe um e-mail válido.',
  );
  await email.fill('new@example.test');
  await page.getByLabel('Nome', { exact: true }).fill('Nova pessoa');
  const password = page.getByLabel('Senha', { exact: true });
  await password.fill('short');
  await password.blur();
  await expect(page.locator('#registration-password-error')).toContainText(
    'pelo menos 12 caracteres',
  );
  await password.fill('password-long-2026');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('password-long-2026');
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page.getByRole('alert')).toContainText('envio de e-mail está indisponível');
  await expect(email).toHaveAttribute('aria-invalid', 'false');
  await expect(password).toHaveAttribute('aria-invalid', 'false');
  await expect(page.locator('form .registration-form-error')).toBeVisible();
});

test('admin login and the direct logout button reveal each page below the fixed header', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 500 });
  let loggedIn = false;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: csrf });
    if (path.endsWith('/auth/login')) {
      loggedIn = true;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith('/auth/logout')) {
      loggedIn = false;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith('/auth/me'))
      return loggedIn
        ? route.fulfill({ json: { ...pending, status: 'APPROVED', administrator: true } })
        : route.fulfill({ status: 401 });
    if (path.endsWith('/admin/accounts'))
      return route.fulfill({
        json: {
          items: Array.from({ length: 12 }, (_, i) => ({
            ...pending,
            email: `person${i}@example.test`,
            name: 'Pessoa ' + i,
          })),
          total: 12,
          page: 0,
          size: 25,
        },
      });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/admin');
  await page.getByLabel('E-mail', { exact: true }).fill('admin@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('password-long-2026');
  const login = page.getByRole('button', { name: 'Entrar', exact: true });
  await login.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await login.click();
  await expect(page.getByRole('heading', { name: 'Cadastros', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  const header = await page.locator('.sf-panel-header').boundingBox();
  const card = await page.locator('app-surface-card').boundingBox();
  expect(card!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(400);
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Entrar como administrador', exact: true }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  const loginCard = await page.locator('app-surface-card').boundingBox();
  expect(loginCard!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
});
