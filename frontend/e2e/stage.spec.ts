import { test, expect, Page } from '@playwright/test';

type Call = {
  id: string;
  participantId: string;
  participantName: string;
  requestId: string | null;
  title: string | null;
  artist: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
};
async function setup(page: Page) {
  let status = 'ACTIVE',
    completed = 0,
    absences = 0;
  let active: Call | null = null;
  const history: Call[] = [];
  let requestsCreated = 0;
  const snapshot = () => ({
    active,
    history,
    waits:
      status === 'SUSPENDED'
        ? [{ participantId: 'ana', name: 'Ana', manualRelease: true, remaining: 0 }]
        : [],
    suggestions:
      status === 'ACTIVE' && !active
        ? [
            {
              participantId: 'ana',
              name: 'Ana',
              tableLabel: '3',
              completed,
              requestId: null,
              title: null,
              artist: null,
              reason: 'Menos apresentações · música a escolher',
            },
          ]
        : [],
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { email: 'host@example.test' } });
    if (path.endsWith('/auth/csrf'))
      return route.fulfill({ json: { token: 'test-token', headerName: 'X-CSRF-TOKEN' } });
    if (request.method() === 'POST') expect(request.headers()['x-csrf-token']).toBe('test-token');
    if (path === '/api/sessions')
      return route.fulfill({
        json: [
          {
            id: 'test-session',
            name: 'Ensaio palco',
            status: 'OPEN',
            createdAt: new Date().toISOString(),
          },
        ],
      });
    if (path.endsWith('/stage')) return route.fulfill({ json: snapshot() });
    if (path.endsWith('/stage/calls')) {
      const body = request.postDataJSON();
      expect(body.expectedRequestId).toBeNull();
      expect(body.title).toBe('Canção escolhida');
      active = {
        id: body.operationId,
        participantId: 'ana',
        participantName: 'Ana',
        requestId: null,
        title: body.title,
        artist: body.artist || null,
        status: 'CALLED',
        createdAt: new Date().toISOString(),
        resolvedAt: null,
      };
      return route.fulfill({ json: snapshot() });
    }
    if (path.endsWith('/resolve')) {
      const body = request.postDataJSON();
      if (body.outcome === 'COMPLETED') {
        expect(body).toEqual({ outcome: 'COMPLETED' });
        completed++;
      }
      if (body.outcome === 'ABSENT') {
        absences++;
        status = 'SUSPENDED';
      }
      history.push({
        ...active!,
        status: body.outcome,
        resolvedAt: new Date().toISOString(),
      });
      active = null;
      return route.fulfill({ json: snapshot() });
    }
    if (path.endsWith('/resume')) {
      status = 'ACTIVE';
      return route.fulfill({ json: snapshot() });
    }
    if (path.endsWith('/participants'))
      return route.fulfill({
        json: [
          {
            id: 'ana',
            name: 'Ana',
            tableLabel: '3',
            status,
            origin: 'ASSISTED',
            checkedInAt: new Date().toISOString(),
            queueJoinedAt: new Date().toISOString(),
            checkInOrder: 1,
            completedPerformances: completed,
            consecutiveAbsences: absences,
          },
        ],
      });
    if (path.endsWith('/requests')) {
      if (request.method() === 'POST') requestsCreated++;
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto('/anfitriao');
  await expect(page.getByRole('heading', { name: 'Ensaio palco', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fila do karaokê' })).toBeVisible();
  return () => requestsCreated;
}
async function callNext(page: Page, artist = '') {
  if (artist)
    await page.route('**/api/public/songs/search*', (route) =>
      route.fulfill({ json: [{ title: 'Canção escolhida', artist }] }),
    );
  await expect(page.getByRole('button', { name: 'Pausar Ana', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Chamar Ana', exact: true }).click();
  const confirm = page.getByRole('button', { name: 'Confirmar', exact: true });
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Música escolhida', { exact: true }).fill('Canção escolhida');
  if (artist) await page.getByRole('option').filter({ hasText: artist }).click();
  await confirm.click();
  await expect(page.locator('.current-call')).toBeVisible();
}

test('concludes opportunity without request only after song is chosen', async ({
  page,
}, testInfo) => {
  const requestsCreated = await setup(page);
  await callNext(page);
  await page.screenshot({
    path: testInfo.outputPath('convocacao.png'),
    fullPage: true,
    scale: 'css',
  });
  await expect(page.locator('.current-call')).toContainText('Canção escolhida');
  await page.getByRole('button', { name: 'Concluir apresentação', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirmar resultado', exact: true }).click();
  await expect(page.locator('.current-call')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Histórico', exact: true }).click();
  const history = page.getByRole('region', { name: 'Histórico do palco', exact: true });
  await expect(history).toBeVisible();
  await expect(history).toContainText('Concluída');
  await expect(history).toContainText('Canção escolhida');
  await expect(page.getByRole('dialog', { name: /Histórico do palco/ })).toHaveCount(0);
  await expect(history.locator('small')).toHaveCount(0);
  const itemBox = await history.locator('article').first().boundingBox();
  expect(itemBox!.height).toBeLessThan(110);
  await page.screenshot({
    path: testInfo.outputPath('host-history-card.png'),
    fullPage: true,
    scale: 'css',
  });
  await expect(page.getByRole('region', { name: 'Fila do karaokê', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Fila', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Chamar Ana', exact: true })).toBeVisible();
  expect(requestsCreated()).toBe(0);
});

test('first absence with no other participant requires host release', async ({ page }) => {
  await setup(page);
  await callNext(page);
  await page.getByRole('button', { name: 'Registrar falta', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar resultado', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Liberar segunda tentativa', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chamar Ana', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Liberar segunda tentativa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Chamar Ana', exact: true })).toBeVisible();
  await expect(page.locator('.current-call')).toHaveCount(0);
});

test('host history shows the latest participation first with descending numbered side rails', async ({
  page,
}) => {
  await setup(page);
  await page.route('**/api/sessions/*/stage', (route) =>
    route.fulfill({
      json: {
        active: null,
        suggestions: [],
        waits: [],
        history: [
          {
            id: 'new',
            participantId: 'ana',
            participantName: 'Ana',
            title: 'Segunda música',
            artist: 'Artista',
            status: 'COMPLETED',
            createdAt: '2026-11-13T12:00:00Z',
            resolvedAt: '2026-11-13T12:05:00Z',
          },
          {
            id: 'old',
            participantId: 'bruno',
            participantName: 'Bruno',
            title: 'Primeira música',
            artist: null,
            status: 'COMPLETED',
            createdAt: '2026-11-13T11:00:00Z',
            resolvedAt: '2026-11-13T11:05:00Z',
          },
        ],
      },
    }),
  );
  await page.reload();
  await page.getByRole('tab', { name: 'Histórico', exact: true }).click();
  const history = page.getByRole('region', { name: 'Registros do palco', exact: true });
  await expect(history.locator('.history-order')).toHaveText(['2', '1']);
  await expect(history.locator('article').first()).toContainText('Ana');
  await expect(history.locator('article').last()).toContainText('Bruno');
  await expect(history.getByRole('button')).toHaveCount(0);
  const rail = history.locator('.history-order').first();
  await expect(rail).toHaveCSS('background-color', 'rgb(231, 235, 242)');
  const railBox = await rail.boundingBox();
  const itemBox = await history.locator('article').first().boundingBox();
  expect(railBox!.height).toBeGreaterThan(itemBox!.height - 4);
});

test('active call combines participant details and shows three direct confirmed actions', async ({
  page,
}, testInfo) => {
  await setup(page);
  await callNext(page, 'Artista');
  const call = page.locator('.current-call');
  await expect(call.getByRole('button', { name: 'Ver participante', exact: true })).toHaveCount(0);
  await expect(call.getByRole('button', { name: 'Outras ações', exact: true })).toHaveCount(0);
  await expect(call.locator('.sf-call-song')).toHaveText('Canção escolhida - Artista');
  const actions = call.getByRole('group', { name: 'Outras ações da convocação', exact: true });
  await expect(actions.getByRole('button')).toHaveCount(3);
  const main = await call
    .getByRole('button', { name: 'Concluir apresentação', exact: true })
    .boundingBox();
  const row = await actions.boundingBox();
  expect(row!.width).toBeCloseTo(main!.width, 0);
  const boxes = await Promise.all(
    (await actions.getByRole('button').all()).map((button) => button.boundingBox()),
  );
  expect(
    Math.max(...boxes.map((box) => box!.y)) - Math.min(...boxes.map((box) => box!.y)),
  ).toBeLessThan(1);
  for (const label of ['Registrar falta', 'Agora não', 'Cancelar']) {
    await call.getByRole('button', { name: label, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Voltar', exact: true }).click();
    await expect(call.getByRole('button', { name: label, exact: true })).toBeFocused();
    await expect(call).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath('active-call-actions.png'), scale: 'css' });
  await call.getByRole('button', { name: 'Ana', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Ana', exact: true })).toBeVisible();
});
