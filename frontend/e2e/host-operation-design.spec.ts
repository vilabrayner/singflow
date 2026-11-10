import { expect, Page, test } from '@playwright/test';

async function setup(page: Page) {
  const date = '2026-11-10T12:00:00Z';
  const people = [
    { id: 'ana', name: 'Ana', status: 'ACTIVE' },
    { id: 'bruno', name: 'Bruno', status: 'ACTIVE' },
    { id: 'carla', name: 'Carla', status: 'PAUSED' },
    { id: 'diego', name: 'Diego', status: 'LEFT' },
  ].map((p, index) => ({
    ...p,
    tableLabel: String(index + 1),
    origin: 'ASSISTED',
    checkedInAt: date,
    queueJoinedAt: date,
    checkInOrder: index + 1,
    completedPerformances: 2,
    consecutiveAbsences: 0,
  }));
  const songs = [
    {
      id: 'song-ana',
      participantId: 'ana',
      title: 'Evidências',
      artist: 'Chitãozinho & Xororó',
      status: 'PENDING',
      createdAt: date,
    },
    {
      id: 'song-bruno',
      participantId: 'bruno',
      title: 'Tempo Perdido',
      artist: 'Legião Urbana',
      status: 'PENDING',
      createdAt: date,
    },
  ];
  let rejectRegistration = true;
  const registrations: string[] = [];
  const availability: string[] = [];
  const calls: string[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { email: 'host@example.test' } });
    if (path.endsWith('/auth/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (request.method() === 'POST') expect(request.headers()['x-csrf-token']).toBe('csrf');
    if (path === '/api/sessions')
      return route.fulfill({
        json: [{ id: 'operation-test', name: 'Café Tão', status: 'OPEN', createdAt: date }],
      });
    if (path.endsWith('/stage'))
      return route.fulfill({
        json: {
          active: null,
          history: [],
          waits: [],
          suggestions: people
            .filter((p) => p.status === 'ACTIVE')
            .map((p) => {
              const song = songs.find((s) => s.participantId === p.id && s.status === 'PENDING');
              return {
                participantId: p.id,
                name: p.name,
                tableLabel: p.tableLabel,
                completed: p.completedPerformances,
                requestId: song?.id ?? null,
                title: song?.title ?? null,
                artist: song?.artist ?? null,
                reason: 'Menos apresentações',
              };
            }),
        },
      });
    if (path.endsWith('/stage/calls')) {
      calls.push(request.postDataJSON().participantId);
      return route.fulfill({
        status: 409,
        json: { detail: 'A fila mudou. Atualize antes de convocar.' },
      });
    }
    const change = path.match(/\/stage\/participants\/([^/]+)\/(pause|resume|reactivate)$/);
    if (change) {
      availability.push(change[2]);
      people.find((p) => p.id === change[1])!.status = change[2] === 'pause' ? 'PAUSED' : 'ACTIVE';
      return route.fulfill({ json: {} });
    }
    if (path.endsWith('/participants') && request.method() === 'GET')
      return route.fulfill({ json: people });
    if (path.endsWith('/requests') && request.method() === 'GET')
      return route.fulfill({ json: songs });
    if (path.endsWith('/participants') && request.method() === 'POST') {
      const body = request.postDataJSON();
      registrations.push(body.operationId);
      if (rejectRegistration) {
        rejectRegistration = false;
        return route.fulfill({ status: 503 });
      }
      people.push({
        id: body.operationId,
        name: body.name,
        status: 'ACTIVE',
        tableLabel: body.tableLabel,
        origin: 'ASSISTED',
        checkedInAt: date,
        queueJoinedAt: date,
        checkInOrder: people.length + 1,
        completedPerformances: 0,
        consecutiveAbsences: 0,
      });
      songs.push({
        id: body.operationId,
        participantId: body.operationId,
        title: body.title,
        artist: body.artist,
        status: 'PENDING',
        createdAt: date,
      });
      return route.fulfill({ json: {} });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto('/anfitriao');
  await expect(page.getByRole('heading', { name: 'Café Tão', exact: true })).toBeVisible();
  return { people, songs, registrations, availability, calls };
}

test('queue search never promotes a filtered participant and a stale call stays a suggestion', async ({
  page,
}, testInfo) => {
  const api = await setup(page);
  await expect(page.locator('.sf-queue-person')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('fila.png'), fullPage: true, scale: 'css' });
  await page.getByLabel('Buscar na fila').fill('Legião');
  await expect(page.locator('.sf-queue-person')).toHaveCount(1);
  await expect(page.locator('.sf-queue-person')).toContainText('Bruno');
  await expect(page.getByRole('button', { name: 'Aprovar e convocar' })).toHaveCount(0);
  await page.getByLabel('Buscar na fila').fill('Ana');
  await page.getByRole('button', { name: 'Aprovar e convocar' }).click();
  await expect(page.getByRole('heading', { name: 'Convocar Ana?' })).toBeFocused();
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  expect(api.calls).toHaveLength(0);
  await page.getByRole('button', { name: 'Aprovar e convocar' }).click();
  await page.getByRole('button', { name: 'Confirmar convocação' }).click();
  await expect(page.getByRole('alert')).toContainText('A fila mudou');
  await expect(page.locator('.current-call')).toHaveCount(0);
  expect(api.calls).toEqual(['ana']);
});

test('assisted registration retains data and operation id after a failure', async ({
  page,
}, testInfo) => {
  const api = await setup(page);
  await page.getByRole('button', { name: 'Criar participante', exact: true }).click();
  await page.getByLabel('Nome do participante', { exact: true }).fill('Fernanda');
  await page.getByLabel('Primeira música', { exact: true }).fill('Equalize');
  await page.screenshot({
    path: testInfo.outputPath('inscricao.png'),
    fullPage: true,
    scale: 'css',
  });
  await page.getByRole('button', { name: 'Inscrever com música' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Nome do participante', { exact: true })).toHaveValue('Fernanda');
  await expect(page.getByLabel('Primeira música', { exact: true })).toHaveValue('Equalize');
  await page.getByRole('button', { name: 'Inscrever com música' }).click();
  await expect(
    page.locator('.sf-person-row').filter({ has: page.getByText('Fernanda', { exact: true }) }),
  ).toBeVisible();
  expect(api.registrations).toHaveLength(2);
  expect(api.registrations[0]).toBe(api.registrations[1]);
  expect(api.people.filter((p) => p.name === 'Fernanda')).toHaveLength(1);
});

test('participant details confirm pauses and returns without losing history', async ({
  page,
}, testInfo) => {
  const api = await setup(page);
  await page
    .locator('.sf-queue-person')
    .filter({ has: page.getByText('Ana', { exact: true }) })
    .click();
  await expect(page.getByRole('heading', { name: 'Ana', exact: true })).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath('participante.png'),
    fullPage: true,
    scale: 'css',
  });
  await page.getByRole('button', { name: 'Pausar participação' }).click();
  await page.getByRole('button', { name: 'Cancelar alteração' }).click();
  expect(api.availability).toHaveLength(0);
  await page.getByRole('button', { name: 'Pausar participação' }).click();
  await page.getByRole('button', { name: 'Confirmar participação' }).click();
  await expect(page.getByRole('button', { name: 'Retomar participação' })).toBeVisible();
  await page.getByRole('button', { name: 'Retomar participação' }).click();
  await page.getByRole('button', { name: 'Confirmar participação' }).click();
  await expect(page.getByRole('button', { name: 'Pausar participação' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar à lista' }).click();
  await page.getByRole('button', { name: 'Fora da fila', exact: true }).click();
  await expect(
    page.locator('.sf-person-row').filter({ has: page.getByText('Ana', { exact: true }) }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: /Diego.*apresentações/ }).click();
  await page.getByRole('button', { name: 'Reativar participante' }).click();
  await expect(page.getByText(/chegada será registrada novamente/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar participação' }).click();
  await expect(page.getByRole('button', { name: 'Pausar participação' })).toBeVisible();
  expect(api.availability).toEqual(['pause', 'resume', 'reactivate']);
  expect(api.people.find((p) => p.id === 'ana')!.completedPerformances).toBe(2);
  expect(api.songs).toHaveLength(2);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
