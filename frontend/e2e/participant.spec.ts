import { test, expect } from '@playwright/test';
const session = '11111111-1111-4111-8111-111111111111';
const url = `/participante/${session}/entry-code`;

test('participant joins, leaves, returns safely with a new song and forgets access', async ({
  page,
}) => {
  let joined = false,
    exited = false,
    outside = false,
    failReturn = true,
    fail = true,
    active = false;
  const operations: string[] = [];
  const returns: string[] = [];
  const requests = [
    {
      id: 'first',
      participantId: 'self',
      title: 'Equalize',
      artist: 'Pitty',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    },
  ];
  const own = () => ({
    session: { id: session, name: 'Café Tão', status: 'OPEN', createdAt: new Date().toISOString() },
    participant: {
      id: 'self',
      name: 'Ana',
      status: outside ? 'LEFT' : 'ACTIVE',
      origin: 'SELF',
      completedPerformances: 3,
    },
    requests,
    active: active ? { title: 'Equalize', artist: 'Pitty' } : null,
    history: [],
    suggested: !active && !outside,
    canReturn: outside,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (request.method() === 'POST') expect(request.headers()['x-csrf-token']).toBe('csrf');
    if (path.includes('/public/'))
      return route.fulfill({ json: { name: 'Café Tão', status: 'OPEN' } });
    if (path.endsWith('/prepare')) return route.fulfill({ status: 204 });
    if (path.endsWith('/join')) {
      joined = true;
      return route.fulfill({ json: own() });
    }
    if (path.endsWith('/me'))
      return joined && !exited ? route.fulfill({ json: own() }) : route.fulfill({ status: 401 });
    if (path.endsWith('/requests')) {
      const data = request.postDataJSON();
      operations.push(data.operationId);
      if (!requests.some((r) => r.id === data.operationId))
        requests.push({
          id: data.operationId,
          participantId: 'self',
          title: data.title,
          artist: data.artist,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        });
      if (fail) {
        fail = false;
        return route.abort();
      }
      return route.fulfill({ json: own() });
    }
    if (path.endsWith('/cancel')) {
      requests[1].status = 'CANCELLED';
      return route.fulfill({ json: own() });
    }
    if (path.endsWith('/leave')) {
      outside = true;
      active = false;
      requests.forEach((r) => {
        if (r.status !== 'COMPLETED') r.status = 'CANCELLED';
      });
      return route.fulfill({ json: own() });
    }
    if (path.endsWith('/return')) {
      const data = request.postDataJSON();
      returns.push(data.operationId);
      if (!requests.some((r) => r.id === data.operationId))
        requests.push({
          id: data.operationId,
          participantId: 'self',
          title: data.title,
          artist: data.artist,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        });
      outside = false;
      if (failReturn) {
        failReturn = false;
        return route.abort();
      }
      return route.fulfill({ json: own() });
    }
    if (path.endsWith('/forget')) {
      exited = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto(url);
  await page.getByLabel('Seu nome').fill('Ana');
  await page.getByLabel('Primeira música', { exact: true }).fill('Equalize');
  await page.getByRole('button', { name: 'Entrar com minha música' }).click();
  await expect(page.getByRole('heading', { name: 'Meus pedidos' })).toBeVisible();
  await page.getByLabel('Música', { exact: true }).fill('Na Sua Estante');
  await page.getByRole('button', { name: 'Pedir música' }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível confirmar');
  await page.getByRole('button', { name: 'Pedir música' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Música adicionada' })).toBeVisible();
  expect(operations).toHaveLength(2);
  expect(operations[0]).toBe(operations[1]);
  await page
    .locator('article')
    .filter({ hasText: 'Na Sua Estante' })
    .getByRole('button', { name: 'Cancelar pedido' })
    .click();
  await expect(page.locator('article').filter({ hasText: 'Na Sua Estante' })).toContainText(
    'Cancelada',
  );
  active = true;
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'É a sua vez!' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Meus pedidos' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Sair da fila', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar saída da fila', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Você está fora da fila' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meus pedidos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pedir música' })).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Você está fora da fila' })).toBeVisible();
  await page.getByLabel('Música para voltar').fill('Voltei para cantar');
  await page.getByRole('button', { name: 'Voltar com esta música' }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível confirmar');
  await page.getByRole('button', { name: 'Voltar com esta música' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Retorno confirmado' })).toBeVisible();
  expect(returns).toHaveLength(2);
  expect(returns[0]).toBe(returns[1]);
  await expect(page.getByText('3 apresentações concluídas')).toBeVisible();
  await expect(page.locator('article').filter({ hasText: 'Voltei para cantar' })).toHaveCount(1);
  await expect(page.locator('article').filter({ hasText: 'Equalize' })).toContainText('Cancelada');
  await page.getByRole('button', { name: 'Sair da fila', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar saída da fila', exact: true }).click();
  await page.getByRole('button', { name: 'Esquecer meu acesso neste aparelho' }).click();
  await expect(page.getByRole('heading', { name: 'Meus pedidos' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar esquecimento do acesso' }).click();
  await expect(
    page.getByRole('heading', { name: 'Acesso esquecido neste aparelho' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meus pedidos' })).not.toBeVisible();
});

test('closed session and expired access never offer a new registration silently', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => {
    if (route.request().url().includes('/public/'))
      return route.fulfill({ json: { name: 'Café Tão', status: 'CLOSED' } });
    return route.fulfill({ status: 401 });
  });
  await page.goto(url);
  await expect(page.getByText('Esta sessão não está recebendo inscrições.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar com minha música' })).not.toBeVisible();
});

test('host displays a local QR and confirms link rotation', async ({ page }) => {
  let rotations = 0;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { email: 'host@example.test' } });
    if (path.endsWith('/auth/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path === '/api/sessions')
      return route.fulfill({
        json: [
          { id: session, name: 'Café Tão', status: 'OPEN', createdAt: new Date().toISOString() },
        ],
      });
    if (path.endsWith('/rotate')) {
      rotations++;
      return route.fulfill({
        json: { url: `http://127.0.0.1:4200/participante/${session}/new-code` },
      });
    }
    if (path.endsWith('/entry-link'))
      return route.fulfill({ json: { url: `http://127.0.0.1:4200${url}` } });
    if (path.endsWith('/stage'))
      return route.fulfill({ json: { suggestions: [], active: null, history: [], waits: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/anfitriao');
  await page.getByRole('button', { name: 'Café Tão Aberta' }).click();
  await page.getByRole('button', { name: 'Mostrar link e QR Code' }).click();
  await expect(page.getByAltText('QR Code para entrar nesta sessão')).toHaveAttribute(
    'src',
    /^data:image\/png/,
  );
  await page.getByRole('button', { name: 'Trocar link', exact: true }).click();
  expect(rotations).toBe(0);
  await page.getByRole('button', { name: 'Confirmar troca do link' }).click();
  await expect(page.getByLabel('Link da sessão')).toHaveValue(/new-code$/);
  expect(rotations).toBe(1);
});

for (const state of ['OPEN', 'CLOSED']) {
  test(`does not offer self-return when server disallows it (${state})`, async ({ page }) => {
    await page.route('**/api/**', (route) =>
      route.fulfill({
        json: {
          session: {
            id: session,
            name: 'Café Tão',
            status: state,
            createdAt: new Date().toISOString(),
          },
          participant: { id: 'self', name: 'Ana', status: 'LEFT', completedPerformances: 2 },
          requests: [],
          active: null,
          history: [],
          suggested: false,
          canReturn: false,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      }),
    );
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Você está fora da fila' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Voltar com esta música' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Pedir música' })).not.toBeVisible();
    if (state === 'OPEN')
      await expect(
        page.getByText('Seu retorno precisa ser liberado pelo anfitrião.', { exact: false }),
      ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
  });
}
