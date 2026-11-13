import {
  prepareManual,
  refreshParticipant,
  openParticipantCatalog,
} from './participant-ui-helpers';
import { test, expect } from '@playwright/test';
const session = '11111111-1111-4111-8111-111111111111';
const url = `/participante/${session}/entry-code`;

test('participant joins, leaves, returns safely with a new song and forgets access', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.crypto, 'randomUUID', { value: undefined });
  });
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
    {
      id: 'completed',
      participantId: 'self',
      title: 'Evidências',
      artist: 'Chitãozinho & Xororó',
      status: 'COMPLETED',
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
    active: active
      ? { id: 'call-initial', title: 'Equalize', artist: 'Pitty', acceptedAt: null }
      : null,
    history: [
      {
        id: 'performance',
        title: 'Evidências',
        artist: 'Chitãozinho & Xororó',
        status: 'COMPLETED',
      },
      { id: 'repeat', title: 'Tempo Perdido', artist: 'Legião Urbana', status: 'COMPLETED' },
    ],
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
      expect(data.operationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
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
      requests.find((song) => song.id === path.split('/').at(-2))!.status = 'CANCELLED';
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
  await expect(page.getByRole('heading', { name: 'Sua vez de soltar a voz' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Experiências' })).toHaveCount(0);
  await page.getByLabel('Seu nome').fill('Ana');
  await page.getByLabel('Primeira música', { exact: true }).fill('Equalize');
  await page.getByRole('button', { name: 'Entrar com minha música' }).click();
  await expect(page.getByRole('heading', { name: 'Meus pedidos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Você está na fila' })).toBeVisible();
  await page.getByRole('tab', { name: 'Histórico', exact: true }).click();
  const history = page.getByRole('region', { name: 'Meu histórico de palco' });
  const performed = history.locator('article').filter({ hasText: 'Evidências' });
  await expect(performed).toContainText('Chitãozinho & Xororó');
  await expect(performed).toContainText('Concluída');
  await expect(history.locator('article').filter({ hasText: 'Tempo Perdido' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Meus pedidos' }).getByText('Evidências'),
  ).toHaveCount(0);

  await page.getByRole('tab', { name: 'Pedidos', exact: true }).click();
  const songDialog = await openParticipantCatalog(page);
  await prepareManual(songDialog, 'Na Sua Estante');
  await songDialog.getByRole('button', { name: 'Adicionar música', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível confirmar');
  await expect(songDialog.getByLabel('Buscar música ou artista', { exact: true })).toHaveValue(
    'Na Sua Estante',
  );
  await songDialog.getByRole('button', { name: 'Adicionar música', exact: true }).click();
  const songNotice = page.getByRole('status').filter({ hasText: 'Música adicionada' });
  await expect(songNotice).toBeVisible();
  await expect(songDialog).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Navegação do participante', exact: true })
    .getByRole('tab', { name: 'Pedidos', exact: true })
    .click();
  const headerHeight = await page
    .locator('.sf-panel-header')
    .evaluate((header) => header.offsetHeight);
  await expect(page.locator('p-toast')).toHaveCSS('top', `${headerHeight + 12}px`);
  expect(operations).toHaveLength(2);
  expect(operations[0]).toBe(operations[1]);
  await page
    .locator('article')
    .filter({ hasText: 'Na Sua Estante' })
    .getByRole('button', { name: 'Cancelar pedido' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Cancelar pedido?' })).toBeVisible();
  await page.getByRole('button', { name: 'Manter pedido', exact: true }).click();
  await expect(
    page
      .locator('article')
      .filter({ hasText: 'Na Sua Estante' })
      .getByRole('button', { name: 'Cancelar pedido' }),
  ).toBeFocused();
  await expect(page.locator('article').filter({ hasText: 'Na Sua Estante' })).toContainText(
    'Pendente',
  );
  await page
    .locator('article')
    .filter({ hasText: 'Na Sua Estante' })
    .getByRole('button', { name: 'Cancelar pedido' })
    .click();
  await page.getByRole('button', { name: 'Confirmar cancelamento do pedido' }).click();
  await page.getByRole('tab', { name: 'Histórico', exact: true }).click();
  await expect(page.locator('article').filter({ hasText: 'Na Sua Estante' })).toContainText(
    'Cancelada',
  );
  active = true;
  await refreshParticipant(page);
  await expect(page.getByRole('heading', { name: 'É a sua vez!' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Meus pedidos' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Opções da participação' }).click();
  await page.getByRole('button', { name: 'Sair da fila', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar saída da fila', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Você está fora da fila' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meus pedidos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar música' })).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Você está fora da fila' })).toBeVisible();
  await page.getByLabel('Música para voltar').fill('Voltei para cantar');
  await page.getByRole('button', { name: 'Voltar com esta música' }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível confirmar');
  await page.getByRole('button', { name: 'Voltar com esta música' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Retorno confirmado' })).toBeVisible();
  expect(returns).toHaveLength(2);
  expect(returns[0]).toBe(returns[1]);
  await expect(page.locator('article').filter({ hasText: 'Voltei para cantar' })).toHaveCount(1);
  await page.getByRole('tab', { name: 'Histórico', exact: true }).click();
  await expect(page.locator('article').filter({ hasText: 'Equalize' })).toContainText('Cancelada');
  await page.getByRole('tab', { name: 'Pedidos', exact: true }).click();
  await page.getByRole('button', { name: 'Opções da participação' }).click();
  await page.getByRole('button', { name: 'Sair da fila', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar saída da fila', exact: true }).click();
  await page.getByRole('button', { name: 'Opções da participação', exact: true }).click();
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
  let joinedQueue = false;
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
    if (path.endsWith('/participants'))
      return route.fulfill({
        json: joinedQueue
          ? [{ id: 'guest', name: 'Ana', status: 'ACTIVE', completedPerformances: 0 }]
          : [],
      });
    if (path.endsWith('/stage'))
      return route.fulfill({ json: { suggestions: [], active: null, history: [], waits: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/anfitriao');
  await expect(page.getByRole('heading', { name: 'Café Tão', exact: true })).toBeVisible();
  await expect(page.getByAltText('QR Code para entrar nesta sessão')).toHaveAttribute(
    'src',
    /^data:image\/png/,
  );
  joinedQueue = true;
  const share = page.getByRole('button', { name: 'Compartilhar link e QR Code', exact: true });
  await expect(share).toBeVisible({ timeout: 10000 });
  await expect(page.getByAltText('QR Code para entrar nesta sessão')).toHaveCount(0);
  await share.click();
  const dialog = page.getByRole('dialog', { name: 'Compartilhar link e QR Code' });
  await expect(dialog.getByAltText('QR Code para entrar nesta sessão')).toBeVisible();
  await dialog.getByRole('button', { name: 'Opções do link e QR Code' }).click();
  await page.getByRole('menuitem', { name: 'Trocar link', exact: true }).click();
  expect(rotations).toBe(0);
  await page.getByRole('button', { name: 'Confirmar troca do link' }).click();
  await expect(page.getByLabel('Link da sessão')).toHaveValue(/new-code$/);
  expect(rotations).toBe(1);
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(share).toBeFocused();
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
    await expect(page.getByRole('button', { name: 'Adicionar música' })).not.toBeVisible();
    if (state === 'OPEN')
      await expect(
        page.getByText('Seu retorno precisa ser liberado pelo anfitrião.', { exact: false }),
      ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
  });
}

test('participant can skip without leaving and confirm a later call', async ({ page }) => {
  let active: { id: string; title: string; artist: string; acceptedAt: string | null } | null = {
    id: 'first',
    title: 'Equalize',
    artist: 'Pitty',
    acceptedAt: null,
  };
  let paused = false;
  let skips = 0;
  const own = () => ({
    session: { id: session, name: 'Café Tão', status: 'OPEN' },
    participant: {
      name: 'Ana',
      status: paused ? 'PAUSED' : 'ACTIVE',
      selfPaused: paused,
      completedPerformances: 0,
    },
    requests: [],
    history: [],
    active,
    suggested: false,
    canReturn: false,
  });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path.endsWith('/calls/first/skip')) {
      skips++;
      paused = true;
      active = null;
    } else if (path.endsWith('/resume')) paused = false;
    else if (path.endsWith('/calls/second/accept')) active!.acceptedAt = new Date().toISOString();
    else if (!path.endsWith('/me')) return route.fulfill({ status: 404 });
    return route.fulfill({ json: own() });
  });
  await page.goto(url);
  await page.getByRole('button', { name: 'Pular esta vez', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Voltar', exact: true }).click();
  expect(skips).toBe(0);
  await page.getByRole('button', { name: 'Pular esta vez', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar que vou pular' }).click();
  await expect(page.getByRole('heading', { name: 'Sua participação está pausada' })).toBeVisible();
  await page.getByRole('button', { name: 'Estou pronto para voltar' }).click();
  await expect(page.getByRole('heading', { name: 'Você está na fila' })).toBeVisible();
  active = { id: 'second', title: 'Equalize', artist: 'Pitty', acceptedAt: null };
  await refreshParticipant(page);
  await page.getByRole('button', { name: 'Confirmar ida', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ida confirmada' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ida confirmada' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pular esta vez', exact: true })).toHaveCount(0);
  expect(skips).toBe(1);
});

test('host grants individual QR access and the phone confirms a replacement explicitly', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.crypto, 'randomUUID', { value: undefined });
  });
  const participant = {
    id: 'assisted',
    name: 'Ana',
    origin: 'ASSISTED',
    status: 'ACTIVE',
    completedPerformances: 0,
  };
  const event = {
    id: session,
    name: 'Café Tão',
    status: 'OPEN',
    createdAt: new Date().toISOString(),
  };
  const code = 'a'.repeat(43);
  const invitation = `/participante/${session}/vincular#${code}`;
  let issued = false;
  let linked = false;
  let emissions = 0;
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { email: 'host@example.test' } });
    if (path.endsWith('/auth/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path === '/api/sessions') return route.fulfill({ json: [event] });
    if (path.endsWith('/participants')) return route.fulfill({ json: [participant] });
    if (path.endsWith('/stage'))
      return route.fulfill({ json: { suggestions: [], active: null, history: [], waits: [] } });
    if (path.endsWith('/participants/assisted/mobile-access')) {
      if (request.method() === 'GET')
        return route.fulfill({ json: { linked, pending: issued && !linked } });
      issued = true;
      emissions++;
      return route.fulfill({
        json: {
          url: `http://127.0.0.1:4200${invitation}`,
          expiresAt: new Date(Date.now() + 300000),
        },
      });
    }
    if (path.endsWith('/mobile-access/preview')) {
      expect(request.postDataJSON()).toEqual({ code });
      return route.fulfill({
        json: { name: 'Ana', sessionName: event.name, currentId: 'previous', currentName: 'Bruno' },
      });
    }
    if (path.endsWith('/mobile-access/claim')) {
      expect(request.postDataJSON()).toEqual({ code, replaceParticipantId: 'previous' });
      linked = true;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith('/participation/' + session + '/requests') && request.method() === 'POST') {
      const data = request.postDataJSON();
      expect(data.operationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      return route.fulfill({
        json: {
          session: event,
          participant,
          requests: [{ id: data.operationId, title: data.title, status: 'PENDING' }],
          history: [],
          active: null,
        },
      });
    }
    if (path.endsWith('/participation/' + session + '/me'))
      return route.fulfill({
        json: {
          session: event,
          participant,
          requests: [{ id: 'first', title: 'Equalize', status: 'PENDING' }],
          history: [],
          active: null,
        },
      });
    return route.fulfill({ json: [] });
  });
  await page.goto('/anfitriao');
  await page.getByRole('tab', { name: 'Participantes', exact: true }).click();
  await page.locator('.sf-person-row').filter({ hasText: 'Ana' }).click();
  await page.getByRole('button', { name: 'Opções do participante' }).click();
  await page.getByRole('menuitem', { name: 'Acesso pelo celular', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Conceder acesso a Ana' })).toBeVisible();
  await expect(page.getByLabel('Link de acesso individual')).toHaveValue(
    `http://127.0.0.1:4200${invitation}`,
  );
  await expect(page.getByAltText('QR Code de acesso individual')).toHaveAttribute(
    'src',
    /^data:image\/png/,
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Conceder acesso a Ana' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Ana', exact: true })).toBeVisible();

  await page.goto(invitation);
  await expect(page.getByText(/já está vinculado à participação de Bruno/)).toBeVisible();
  expect(linked).toBe(false);
  await page.getByRole('button', { name: 'Confirmar troca de participação' }).click();
  await expect(page).toHaveURL(new RegExp('/vinculado$'));
  await expect(page.getByRole('heading', { name: 'Você está na fila' })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Músicas pendentes' }).getByText('Equalize', { exact: true }),
  ).toBeVisible();
  const songDialog = await openParticipantCatalog(page);
  await prepareManual(songDialog, 'Teste');
  await songDialog.getByRole('button', { name: 'Adicionar música', exact: true }).click();
  await expect(songDialog).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Navegação do participante', exact: true })
    .getByRole('tab', { name: 'Pedidos', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Meus pedidos' }).getByText('Teste', { exact: true }),
  ).toBeVisible();

  await page.goto('/anfitriao');
  await page.getByRole('tab', { name: 'Participantes', exact: true }).click();
  await page.getByRole('button', { name: 'Acesso pelo celular de Ana' }).click();
  await expect(page.getByText('Celular vinculado', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Opções do acesso pelo celular' })).toBeVisible();
  await expect(page.getByAltText('QR Code de acesso individual')).toHaveCount(0);
  expect(emissions).toBe(1);
  await page.getByRole('button', { name: 'Opções do acesso pelo celular' }).click();
  await page.getByRole('menuitem', { name: 'Trocar celular' }).click();
  await expect(page.getByAltText('QR Code de acesso individual')).toBeVisible();
  expect(emissions).toBe(2);
  expect(linked).toBe(true);
});

test('expired individual QR never offers another check-in', async ({ page }) => {
  await page.route('**/api/**', (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/auth/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    return route.fulfill({
      status: 404,
      json: { detail: 'QR Code expirado ou já utilizado. Peça outro ao anfitrião.' },
    });
  });
  await page.goto(`/participante/${session}/vincular#${'a'.repeat(43)}`);
  await expect(page.getByRole('alert')).toContainText('QR Code expirado ou já utilizado');
  await expect(page.getByRole('button', { name: 'Confirmar vínculo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Entrar com minha música' })).toHaveCount(0);
});

test('participant reopening restores the session and distinguishes position, next and called states', async ({
  page,
  context,
}) => {
  let position: number | null = 3;
  let called = false;
  let closed = false;
  const own = () => ({
    session: { id: session, name: 'Café Tão', status: 'OPEN' },
    participant: {
      id: 'self',
      name: 'Vila',
      status: 'ACTIVE',
      origin: 'ASSISTED',
      completedPerformances: 0,
    },
    requests: [],
    history: [],
    active: called ? { id: 'call', title: 'Será', artist: null, acceptedAt: null } : null,
    queuePosition: position,
    expiresAt: null,
    canReturn: false,
  });
  await context.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me'))
      return closed ? route.fulfill({ status: 401 }) : route.fulfill({ json: own() });
    return route.fulfill({ status: 404 });
  });
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Você está na fila' })).toBeVisible();
  await expect(page.getByText('Posição sugerida · 3º', { exact: true })).toBeVisible();
  position = 1;
  await refreshParticipant(page);
  await expect(page.getByRole('heading', { name: 'Sua vez está chegando!' })).toBeVisible();
  await expect(page.getByText('Posição sugerida · 1º', { exact: true })).toBeVisible();
  called = true;
  position = null;
  await refreshParticipant(page);
  await expect(page.getByRole('heading', { name: 'É a sua vez!' })).toBeVisible();
  await expect(page.getByText(/Posição sugerida/)).toHaveCount(0);

  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(reopened).toHaveURL(new RegExp('/participante/' + session + '/vinculado$'));
  await expect(reopened.getByRole('heading', { name: 'É a sua vez!' })).toBeVisible();
  await reopened.goto('/participante');
  await expect(reopened).toHaveURL(new RegExp('/participante/' + session + '/vinculado$'));
  await reopened.goto('/participante/' + session);
  await expect(reopened.getByRole('heading', { name: 'É a sua vez!' })).toBeVisible();
  closed = true;
  await reopened.goto('/');
  await expect(reopened).toHaveURL('/');
  await expect(reopened.getByRole('heading', { name: /Sua voz no palco/ })).toBeVisible();
  expect(
    await reopened.evaluate(() => localStorage.getItem('singflow.lastParticipation')),
  ).toBeNull();
});

test('temporary connection failure retains remembered access and a revoked grant clears it', async ({
  page,
}) => {
  let online = false;
  let revoked = false;
  await page.route('**/api/**', (route) => {
    if (!new URL(route.request().url()).pathname.endsWith('/me'))
      return route.fulfill({ status: 404 });
    if (revoked) return route.fulfill({ status: 401 });
    if (!online) return route.abort();
    return route.fulfill({
      json: {
        session: { id: session, name: 'Café Tão', status: 'OPEN' },
        participant: { id: 'self', name: 'Vila', status: 'ACTIVE', completedPerformances: 0 },
        requests: [],
        history: [],
        active: null,
        queuePosition: 2,
      },
    });
  });
  await page.goto('/nao-existe');
  await page.evaluate((id) => localStorage.setItem('singflow.lastParticipation', id), session);
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp('/participante/' + session + '/vinculado$'));
  await expect(page.getByRole('button', { name: 'Tentar novamente', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('singflow.lastParticipation'))).toBe(
    session,
  );
  online = true;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByText('Posição sugerida · 2º', { exact: true })).toBeVisible();
  revoked = true;
  await page.goto('/participante');
  await expect(page).toHaveURL('/participante');
  expect(await page.evaluate(() => localStorage.getItem('singflow.lastParticipation'))).toBeNull();
});
