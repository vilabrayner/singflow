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
      expect(typeof request.postDataJSON().allowOutOfOrder).toBe('boolean');
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
  await expect(page.getByRole('button', { name: 'Chamar Bruno', exact: true })).toBeEnabled();
  await page.getByLabel('Buscar na fila').fill('Ana');
  await page.getByRole('button', { name: 'Chamar Ana', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chamar Ana?' })).toBeFocused();
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  expect(api.calls).toHaveLength(0);
  await page.getByRole('button', { name: 'Chamar Ana', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('alert')).toContainText('A fila mudou');
  await expect(page.locator('.current-call')).toHaveCount(0);
  expect(api.calls).toEqual(['ana']);
});

test('assisted registration retains data and operation id after a failure', async ({
  page,
}, testInfo) => {
  const api = await setup(page);
  await page.getByRole('tab', { name: 'Participantes', exact: true }).click();
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
  await expect(page.getByRole('tab', { name: 'Fila', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Participantes', exact: true }).click();
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
  await page.getByRole('tab', { name: 'Participantes', exact: true }).click();
  const directory = page.getByRole('region', { name: 'Participantes', exact: true });
  await directory.evaluate((element) => element.setAttribute('data-flow-instance', 'retained'));
  await directory.locator('.sf-person-row').filter({ hasText: 'Ana' }).click();
  await expect(page.getByRole('dialog', { name: 'Ana', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ana', exact: true })).toBeFocused();
  await expect(page.getByText('Inscrição assistida', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Origem da inscrição' }).click();
  await expect(
    page.getByText('Participante criado pelo anfitrião.', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Ana', exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('participante.png'),
    fullPage: true,
    scale: 'css',
  });
  await page.getByRole('button', { name: 'Opções do participante' }).click();
  await page.getByRole('menuitem', { name: 'Pausar participação' }).click();
  await page.getByRole('button', { name: 'Cancelar alteração' }).click();
  expect(api.availability).toHaveLength(0);
  await page.getByRole('button', { name: 'Opções do participante' }).click();
  await page.getByRole('menuitem', { name: 'Pausar participação' }).click();
  await page.getByRole('button', { name: 'Confirmar participação' }).click();
  await page.getByRole('button', { name: 'Opções do participante' }).click();
  await expect(page.getByRole('menuitem', { name: 'Retomar participação' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Opções do participante' }).click();
  await page.getByRole('menuitem', { name: 'Retomar participação' }).click();
  await page.getByRole('button', { name: 'Confirmar participação' }).click();
  await page.getByRole('button', { name: 'Opções do participante' }).click();
  await expect(page.getByRole('menuitem', { name: 'Pausar participação' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Voltar à lista' }).click();
  await expect(page.getByRole('region', { name: 'Participantes', exact: true })).toHaveAttribute(
    'data-flow-instance',
    'retained',
  );
  await page.getByRole('button', { name: 'Fora da fila', exact: true }).click();
  await expect(
    page.locator('.sf-person-row').filter({ has: page.getByText('Ana', { exact: true }) }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: /Diego.*apresentações/ }).click();
  await page.getByRole('button', { name: 'Opções do participante' }).click();
  await page.getByRole('menuitem', { name: 'Reativar participante' }).click();
  await expect(page.getByText(/chegada será registrada novamente/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar participação' }).click();
  await page.getByRole('button', { name: 'Opções do participante' }).click();
  await expect(page.getByRole('menuitem', { name: 'Pausar participação' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(api.availability).toEqual(['pause', 'resume', 'reactivate']);
  expect(api.people.find((p) => p.id === 'ana')!.completedPerformances).toBe(2);
  expect(api.songs).toHaveLength(2);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('host drags the active queue, calls outside the order and pauses or resumes participants', async ({
  page,
}, testInfo) => {
  const api = await setup(page);
  await expect(
    page.getByRole('button', { name: 'Chamar Ana', exact: true }).locator('.fa-bullhorn'),
  ).toBeVisible();
  let order = ['ana', 'bruno'];
  let active: any = null;
  const reorders: any[] = [];
  const calls: any[] = [];
  const choice = (p: any) => {
    const song = api.songs.find((s) => s.participantId === p.id);
    return {
      participantId: p.id,
      name: p.name,
      completed: p.completedPerformances,
      tableLabel: p.tableLabel,
      requestId: song?.id ?? null,
      title: song?.title ?? null,
      artist: song?.artist ?? null,
      reason: 'Fila',
    };
  };
  const view = () => ({
    active,
    history: [],
    waits: [],
    suggestions: api.people
      .filter((p) => p.status === 'ACTIVE' && p.id !== active?.participantId)
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
      .map(choice),
    paused: api.people.filter((p) => p.status === 'PAUSED').map(choice),
  });
  await page.route('**/stage', (route) => route.fulfill({ json: view() }));
  await page.route('**/stage/reorder', (route) => {
    const body = route.request().postDataJSON();
    reorders.push(body);
    order = body.order;
    return route.fulfill({ json: view() });
  });
  await page.route('**/stage/calls', (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    active = {
      id: body.operationId,
      participantId: body.participantId,
      participantName: 'Ana',
      requestId: body.expectedRequestId,
      title: 'Evidências',
      artist: 'Chitãozinho & Xororó',
      status: 'CALLED',
      acceptedAt: null,
    };
    return route.fulfill({ json: view() });
  });
  await page.route('**/stage/participants/*/*', (route) => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const action = parts.at(-1),
      id = parts.at(-2);
    api.people.find((p) => p.id === id)!.status = action === 'pause' ? 'PAUSED' : 'ACTIVE';
    return route.fulfill({ json: view() });
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Chamar Bruno', exact: true })).toBeEnabled();
  await page.getByLabel('Buscar na fila').fill('Bruno');
  await expect(page.getByRole('button', { name: /^Ordenar Bruno/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.getByLabel('Buscar na fila').fill('');
  const handle = page.getByRole('button', { name: /^Ordenar Bruno/ });
  await handle.evaluate((element) =>
    element.scrollIntoView({ block: 'center', behavior: 'instant' }),
  );
  const from = await handle.boundingBox(),
    target = await page.getByRole('button', { name: /^Ordenar Ana/ }).boundingBox();
  const originalLayout = await handle.locator('..').evaluate((row) => {
    const bounds = row.getBoundingClientRect();
    return Array.from(
      row.querySelectorAll('.sf-host-queue-grip,.sf-host-queue-copy,.sf-host-queue-actions'),
    ).map((el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x - bounds.x, y: rect.y - bounds.y, width: rect.width, height: rect.height };
    });
  });
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2 - 8, { steps: 4 });
  const preview = page.locator('.sf-host-queue-item.cdk-drag-preview');
  await expect(preview).toBeVisible();
  const previewLayout = await preview.evaluate((row) => {
    const bounds = row.getBoundingClientRect();
    return Array.from(
      row.querySelectorAll('.sf-host-queue-grip,.sf-host-queue-copy,.sf-host-queue-actions'),
    ).map((el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x - bounds.x, y: rect.y - bounds.y, width: rect.width, height: rect.height };
    });
  });
  for (let index = 0; index < originalLayout.length; index++)
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(Math.abs(previewLayout[index][key] - originalLayout[index][key])).toBeLessThan(2);
  await page.screenshot({
    path: testInfo.outputPath('host-queue-during-drag.png'),
    fullPage: true,
    scale: 'css',
  });
  await page.mouse.move(target!.x + 16, target!.y + 5, { steps: 20 });
  await page.mouse.up();
  await expect.poll(() => reorders.length).toBe(1);
  expect(reorders[0]).toMatchObject({ expectedOrder: ['ana', 'bruno'], order: ['bruno', 'ana'] });
  await expect(page.locator('.sf-queue-person').first()).toContainText('Bruno');
  await page.reload();
  await expect(page.locator('.sf-queue-person').first()).toContainText('Bruno');
  await page.getByRole('button', { name: 'Chamar Ana', exact: true }).click();
  await expect(
    page.getByText('Esta pessoa será chamada antes das demais, fora da ordem sugerida.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toMatchObject({
    participantId: 'ana',
    expectedRequestId: 'song-ana',
    allowOutOfOrder: true,
  });
  await expect(page.getByRole('button', { name: 'Chamar Bruno', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Pausar Bruno', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar pausa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retomar Bruno', exact: true })).toBeVisible();
  await expect(page.locator('.sf-queue-person').filter({ hasText: 'Bruno' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retomar Bruno', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar retomada', exact: true }).click();
  await expect(page.locator('.sf-queue-person').filter({ hasText: 'Bruno' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retomar Bruno', exact: true })).toHaveCount(0);
  expect(api.songs.every((s) => s.status === 'PENDING')).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('host-manual-queue.png'),
    fullPage: true,
    scale: 'css',
  });
});

test('host bottom tabs isolate sections and preserve the workspace and participant draft', async ({
  page,
}, testInfo) => {
  await setup(page);
  const navigation = page.getByRole('navigation', { name: 'Navegação do anfitrião', exact: true });
  await expect(navigation.getByRole('tab')).toHaveCount(4);
  await expect(navigation.getByRole('tab', { name: 'Fila', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(navigation.getByRole('tab', { selected: true })).toHaveCount(1);
  await expect(navigation.getByRole('tab', { name: 'Fila', exact: true })).toHaveCSS(
    'background-color',
    'rgb(240, 234, 255)',
  );
  await expect(page.getByRole('button', { name: 'Criar participante', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('region', { name: 'Fila do karaokê', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Histórico do palco', exact: true })).toHaveCount(
    0,
  );
  await page
    .locator('app-stage-panel')
    .evaluate((el) => el.setAttribute('data-workspace', 'retained'));
  await navigation.getByRole('tab', { name: 'Participantes', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Participantes', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Fila do karaokê', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Criar participante', exact: true }).click();
  await page.getByLabel('Nome do participante', { exact: true }).fill('Rascunho');
  await navigation.getByRole('tab', { name: 'Histórico', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Histórico do palco', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar participante', exact: true })).toHaveCount(
    0,
  );
  await navigation.getByRole('tab', { name: 'Participantes', exact: true }).click();
  await expect(page.getByLabel('Nome do participante', { exact: true })).toHaveValue('Rascunho');
  await page.getByRole('button', { name: 'Cancelar inscrição', exact: true }).click();
  await page.locator('.sf-person-row').filter({ hasText: 'Ana' }).click();
  await expect(page.getByRole('dialog', { name: 'Ana', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar à lista', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Participantes', exact: true })).toBeVisible();
  await expect(page.locator('app-stage-panel')).toHaveAttribute('data-workspace', 'retained');
  await page.screenshot({
    path: testInfo.outputPath('host-tab-participants.png'),
    fullPage: true,
    scale: 'css',
  });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.sf-host-tab-viewport').evaluate((el) => (el.scrollTop = el.scrollHeight));
  const navBox = await navigation.boundingBox(),
    last = await page.locator('.sf-person-row').last().boundingBox();
  expect(navBox!.y + navBox!.height).toBeCloseTo(740, 0);
  expect(last!.y + last!.height).toBeLessThan(navBox!.y);
  await navigation.getByRole('tab', { name: 'Fila', exact: true }).click();
  await expect(navigation.getByRole('tab', { name: 'Fila', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(navigation.getByRole('tab', { selected: true })).toHaveCount(1);
  await expect(navigation.getByRole('tab', { name: 'Fila', exact: true })).toHaveCSS(
    'background-color',
    'rgb(240, 234, 255)',
  );
  await expect(page.locator('app-stage-panel')).toHaveAttribute('data-workspace', 'retained');
  await page.screenshot({
    path: testInfo.outputPath('host-tab-queue.png'),
    fullPage: true,
    scale: 'css',
  });
});

test('history tab reports a loading failure while other tabs remain usable', async ({ page }) => {
  await setup(page);
  await page.route('**/stage', (route) =>
    route.fulfill({ status: 503, json: { detail: 'Palco temporariamente indisponível.' } }),
  );
  await page.reload();
  await page.getByRole('tab', { name: 'Histórico', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Histórico do palco', exact: true }).getByRole('alert'),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Participantes', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Participantes', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar participante', exact: true })).toBeEnabled();
});

async function setupLongHostQueue(page: Page) {
  const api = await setup(page);
  for (let index = 0; index < 18; index++)
    api.people.push({
      ...api.people[0],
      id: 'extra-' + index,
      name: 'Participante ' + index,
      tableLabel: String(index + 10),
      checkInOrder: index + 10,
      status: 'ACTIVE',
    });
  await page.reload();
  await expect(page.locator('.sf-host-queue-grip')).toHaveCount(20);
  return api;
}

test('PrimeNG host scroll area keeps the page fixed and remembers each tab', async ({
  page,
}, testInfo) => {
  await setupLongHostQueue(page);
  const viewport = page.locator('.sf-host-tab-viewport');
  const header = page.locator('.sf-panel-header'),
    nav = page.getByRole('navigation', { name: 'Navegação do anfitrião', exact: true });
  await expect(page.locator('p-scrollarea')).toHaveCount(1);
  const headerBefore = await header.boundingBox(),
    navBefore = await nav.boundingBox();
  await viewport.hover();
  if (testInfo.project.use.browserName === 'webkit' && testInfo.project.use.hasTouch) {
    await viewport.evaluate((el) => el.scrollTo(0, 350));
  } else {
    await page.mouse.wheel(0, 350);
  }
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  const queueScroll = await viewport.evaluate((el) => el.scrollTop);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await header.boundingBox()).toEqual(headerBefore);
  expect(await nav.boundingBox()).toEqual(navBefore);
  await expect(page.locator('.sf-session-card')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(
    true,
  );
  await nav.getByRole('tab', { name: 'Participantes', exact: true }).click();
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(0);
  await viewport.evaluate((el) => (el.scrollTop = 220));
  await nav.getByRole('tab', { name: 'Histórico', exact: true }).click();
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(0);
  await nav.getByRole('tab', { name: 'Fila', exact: true }).click();
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeCloseTo(queueScroll, 0);
  await nav.getByRole('tab', { name: 'Participantes', exact: true }).click();
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(220);
  await page.setViewportSize({ width: 390, height: 460 });
  await page.getByRole('button', { name: 'Criar participante', exact: true }).click();
  await page.getByLabel('Nome do participante', { exact: true }).fill('Teste de formulário');
  await page
    .getByRole('button', { name: 'Inscrever com música', exact: true })
    .evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const button = await page
      .getByRole('button', { name: 'Inscrever com música', exact: true })
      .boundingBox(),
    bounds = await viewport.boundingBox(),
    dock = await nav.boundingBox();
  expect(button!.y + button!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height + 1);
  if (!testInfo.project.use.hasTouch) {
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(dock!.y + 1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  } else {
    await expect(page.locator('.sf-host-touch-registration')).toHaveCount(1);
  }
  await page.screenshot({ path: testInfo.outputPath('host-internal-scroll.png'), scale: 'css' });
});

test('host drag automatically scrolls the PrimeNG viewport near its lower edge', async ({
  page,
}) => {
  const api = await setupLongHostQueue(page);
  const operations: any[] = [];
  await page.route('**/stage/reorder', (route) => {
    const body = route.request().postDataJSON();
    operations.push(body);
    return route.fulfill({
      json: {
        active: null,
        history: [],
        waits: [],
        paused: [],
        suggestions: body.order.map((id: string) => {
          const p = api.people.find((p) => p.id === id)!;
          const song = api.songs.find((s) => s.participantId === id);
          return {
            participantId: id,
            name: p.name,
            tableLabel: p.tableLabel,
            completed: p.completedPerformances,
            requestId: song?.id ?? null,
            title: song?.title ?? null,
            artist: song?.artist ?? null,
            reason: 'Ordem manual',
          };
        }),
      },
    });
  });
  const viewport = page.locator('.sf-host-tab-viewport');
  const handle = page.getByRole('button', { name: /^Ordenar Ana/ });
  await handle.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const source = await handle.boundingBox(),
    bounds = await viewport.boundingBox(),
    before = await viewport.evaluate((el) => el.scrollTop);
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2 + 10, {
    steps: 4,
  });
  await expect(page.locator('.cdk-drag-preview')).toBeVisible();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height - 8, {
    steps: 20,
  });
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(before + 30);
  await page.mouse.up();
  await expect.poll(() => operations.length).toBe(1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

for (const [name, title] of [
  ['Ana', 'Ana - Adicionar música'],
  ['Maria Clara de Souza', 'Maria S. - Adicionar música'],
]) {
  test(`host song dialog keeps search fixed and abbreviates ${name}`, async ({
    page,
  }, testInfo) => {
    const api = await setup(page);
    api.people[0].name = name;
    await page.route('**/api/public/songs/catalog*', (route) =>
      route.fulfill({
        json: {
          total: 20,
          items: Array.from({ length: 20 }, (_, index) => ({
            title: 'Música ' + index,
            artist: 'Artista',
          })),
        },
      }),
    );
    await page.reload();
    await page.getByRole('tab', { name: 'Participantes', exact: true }).click();
    await page.locator('.sf-person-row').filter({ hasText: name }).click();
    await page.getByRole('button', { name: 'Adicionar música', exact: true }).click();
    const modal = page.getByRole('dialog', { name: title, exact: true });
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Músicas de ' + name, { exact: true })).toHaveCount(0);
    const search = modal.getByRole('textbox', { name: 'Buscar música ou artista', exact: true });
    await expect(modal.locator('.picker-list li')).toHaveCount(20);
    await modal.evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    await expect(modal.locator('p-scrollarea')).toHaveCount(1);
    expect(
      await modal.locator('.picker-hint').evaluate((el) => !!el.closest('[dialog-subheader]')),
    ).toBe(true);
    const before = await search.boundingBox();
    const cancel = modal.getByRole('button', { name: 'Cancelar música', exact: true });
    const footerBefore = await cancel.boundingBox();
    const list = modal.locator('.picker-results');
    await expect(list.locator('li')).toHaveCount(20);
    await list.evaluate((element) => (element.scrollTop = 500));
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
    expect(await search.boundingBox()).toEqual(before);
    expect(await cancel.boundingBox()).toEqual(footerBefore);
    await page.screenshot({
      path: testInfo.outputPath('song-picker-scrollarea.png'),
      scale: 'css',
    });
    await search.fill('Ab');
    await expect(
      modal.getByText('Digite pelo menos 3 caracteres para buscar.', { exact: true }),
    ).toBeVisible();
    expect(await search.evaluate((el) => !!el.closest('[dialog-subheader]'))).toBe(true);
    await modal.getByRole('button', { name: 'Adicionar “Ab” manualmente', exact: true }).click();
    await expect(modal.getByLabel('Artista (opcional)', { exact: true })).toBeVisible();
    await expect(
      modal.getByRole('button', { name: 'Não encontrei minha música', exact: true }),
    ).toHaveCount(0);
    await cancel.click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Adicionar música', exact: true })).toBeFocused();
  });
}

test('host catalogue appends ten results, keeps scroll, and retries failed search pages without duplicates', async ({
  page,
}) => {
  await setup(page);
  let failNext = true;
  const requests: string[] = [];
  await page.route('**/api/public/songs/catalog*', (route) => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get('page')) * 10;
    expect(url.searchParams.get('size')).toBe('10');
    return route.fulfill({
      json: {
        total: 20,
        items: Array.from({ length: 10 }, (_, i) => ({
          title: 'Catálogo ' + (offset + i),
          artist: 'Artista',
        })),
      },
    });
  });
  let finishOld: (() => void) | undefined;
  const oldGate = new Promise<void>((resolve) => (finishOld = resolve));
  await page.route('**/api/public/songs/search-page*', async (route) => {
    const url = new URL(route.request().url()),
      q = url.searchParams.get('q'),
      source = url.searchParams.get('source');
    requests.push(q + ':' + source + ':' + url.searchParams.get('page'));
    if (q === 'Antiga') {
      await oldGate;
      return route.fulfill({
        json: {
          items: [{ title: 'Antiga', artist: 'Artista' }],
          hasMore: false,
          nextSource: 'internet',
          nextPage: 1,
        },
      });
    }
    if (q === 'Nova')
      return route.fulfill({
        json: {
          items: [{ title: 'Nova', artist: 'Artista' }],
          hasMore: false,
          nextSource: 'internet',
          nextPage: 1,
        },
      });
    if (source === 'catalog')
      return route.fulfill({
        json: {
          items: [{ title: 'Canção local', artist: 'Artista' }],
          hasMore: true,
          nextSource: 'internet',
          nextPage: 0,
        },
      });
    if (failNext) {
      failNext = false;
      return route.fulfill({ status: 503 });
    }
    return route.fulfill({
      json: {
        items: [
          { title: 'Canção local', artist: 'Artista' },
          { title: 'Canção Internet', artist: 'Outro', source: 'LASTFM' },
        ],
        hasMore: false,
        nextSource: 'internet',
        nextPage: 1,
      },
    });
  });
  await page.getByRole('tab', { name: 'Participantes', exact: true }).click();
  await page.locator('.sf-person-row').filter({ hasText: 'Ana' }).click();
  await page.getByRole('button', { name: 'Adicionar música', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Ana - Adicionar música', exact: true });
  const list = modal.locator('.picker-results'),
    search = modal.getByRole('textbox', { name: 'Buscar música ou artista', exact: true });
  await expect(list.locator('li')).toHaveCount(10);
  await modal.evaluate(async (el) => {
    await Promise.all(
      el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined)),
    );
  });
  await list.evaluate((el) => (el.scrollTop = 500));
  const scroll = await list.evaluate((el) => el.scrollTop);
  await list
    .getByRole('button', { name: 'Carregar mais', exact: true })
    .evaluate((el: HTMLButtonElement) => el.click());
  await expect(list.locator('li')).toHaveCount(20);
  expect(await list.evaluate((el) => el.scrollTop)).toBe(scroll);
  await expect(list.getByRole('button', { name: 'Carregar mais', exact: true })).toHaveCount(0);
  await search.fill('Canção');
  await expect(list.locator('li')).toHaveCount(1);
  await list.getByRole('button', { name: 'Carregar mais', exact: true }).click();
  await expect(
    modal.getByText(
      'Não foi possível carregar mais. Tente novamente; suas músicas continuam na lista.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(list.locator('li')).toHaveCount(1);
  await list.getByRole('button', { name: 'Carregar mais', exact: true }).click();
  await expect(list.locator('li')).toHaveCount(2);
  await expect(list.getByRole('button', { name: 'Carregar mais', exact: true })).toHaveCount(0);
  expect(requests.filter((q) => q === 'Canção:internet:0')).toHaveLength(2);
  await search.fill('Antiga');
  await expect.poll(() => requests.includes('Antiga:catalog:0')).toBe(true);
  await search.fill('Nova');
  await expect(list.locator('li')).toHaveCount(1);
  await expect(list.locator('li')).toContainText('Nova');
  finishOld!();
  await expect(list.locator('li')).not.toContainText('Antiga');
});

test('touch registration focuses the song field without opening optional table after name blur and viewport restoration', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'Sequência específica de toque');
  await setup(page);
  await page.getByRole('tab', { name: 'Participantes', exact: true }).tap();
  await page.getByRole('button', { name: 'Criar participante', exact: true }).tap();
  const name = page.getByLabel('Nome do participante', { exact: true });
  await expect(name).not.toBeFocused();
  await expect(page.locator('.sf-host-touch-registration')).toHaveCount(1);
  expect(
    await name.evaluate((el) => {
      for (let node = el.parentElement; node; node = node.parentElement) {
        if (getComputedStyle(node).position === 'fixed') return true;
      }
      return false;
    }),
  ).toBe(false);
  await name.tap();
  await page.keyboard.type('Pessoa no Safari');
  const original = page.viewportSize()!;
  await page.setViewportSize({ width: original.width, height: 420 });
  await page.getByRole('heading', { name: 'Criar participante', exact: true }).tap();
  await page.setViewportSize(original);
  const song = page.getByRole('combobox', { name: 'Primeira música', exact: true });
  await song.scrollIntoViewIfNeeded();
  await song.tap();
  await page.keyboard.type('Equalize');
  await expect(song).toBeFocused();
  await expect(song).toHaveValue('Equalize');
  await expect(page.locator('.sf-disclosure')).not.toHaveAttribute('open', '');
  await expect(name).toHaveValue('Pessoa no Safari');
});

test('registration preserves physical keyboard navigation on touch and desktop', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('tab', { name: 'Participantes', exact: true }).click();
  const create = page.getByRole('button', { name: 'Criar participante', exact: true });
  await create.focus();
  await page.keyboard.press('Enter');
  const name = page.getByLabel('Nome do participante', { exact: true });
  await expect(name).toBeFocused();
  await page.keyboard.type('Pessoa com teclado');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('combobox', { name: 'Primeira música', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Cancelar inscrição', exact: true }).click();
  await expect(page.locator('.sf-host-touch-registration')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Criar participante', exact: true })).toBeVisible();
});

test('successful touch registration restores clickable host dock after scrolling the form', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'Fluxo de toque');
  await setup(page);
  await page.getByRole('tab', { name: 'Participantes', exact: true }).tap();
  await page.getByRole('button', { name: 'Criar participante', exact: true }).tap();
  await page.getByLabel('Nome do participante', { exact: true }).fill('Fernanda');
  await page.getByLabel('Primeira música', { exact: true }).fill('Equalize');
  const save = page.getByRole('button', { name: 'Inscrever com música', exact: true });
  await save.scrollIntoViewIfNeeded();
  await save.tap();
  await expect(page.getByRole('alert')).toBeVisible();
  await save.tap();
  await expect(page.getByRole('tab', { name: 'Fila', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.sf-queue-person').filter({ hasText: 'Fernanda' })).toBeVisible();
  await expect(page.locator('.sf-host-touch-registration')).toHaveCount(0);
  for (const label of ['Fila', 'Histórico', 'Participantes']) {
    const tab = page.getByRole('tab', { name: label, exact: true });
    await expect(tab).toBeEnabled();
    await tab.tap();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }
});
