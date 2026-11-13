import { expect, test } from '@playwright/test';

const session = {
  id: 'music-session',
  name: 'Café Tão',
  status: 'OPEN',
  createdAt: '2026-11-11T12:00:00Z',
};

test('musician signs in, receives a session, reads the full queue and tracks the stage', async ({
  page,
}, testInfo) => {
  let loggedIn = false;
  let granted = false;
  let accepted = false;
  const writes: string[] = [];
  const suggestions = Array.from({ length: 14 }, (_, index) => ({
    participantId: 'person-' + index,
    name: index === 0 ? 'Ana' : 'Participante ' + (index + 1),
    title: 'Música ' + (index + 1),
    artist: 'Artista ' + (index + 1),
    requestId: 'song-' + index,
    completed: 0,
    tableLabel: null,
    reason: 'Próxima oportunidade',
  }));
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path.endsWith('/auth/me'))
      return loggedIn
        ? route.fulfill({ json: { email: 'music@example.test', role: 'MUSICIAN' } })
        : route.fulfill({ status: 401 });
    if (request.method() === 'POST') {
      writes.push(path);
      expect(request.headers()['x-csrf-token']).toBe('csrf');
    }
    if (path.endsWith('/public/musicians/register')) {
      expect(request.postDataJSON()).toEqual({
        email: 'music@example.test',
        password: 'musician-password-2026',
      });
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith('/auth/login')) {
      loggedIn = true;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith('/auth/logout')) {
      loggedIn = false;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith('/musicians/sessions'))
      return route.fulfill({ json: granted ? [session] : [] });
    if (path.endsWith('/musicians/sessions/' + session.id))
      return granted
        ? route.fulfill({
            json: {
              session,
              stage: {
                active: accepted
                  ? {
                      id: 'call',
                      participantId: 'person-0',
                      participantName: 'Ana',
                      title: 'Música 1',
                      artist: 'Artista 1',
                      status: 'CALLED',
                      acceptedAt: new Date().toISOString(),
                    }
                  : null,
                suggestions: accepted ? suggestions.slice(1) : suggestions,
                history: [
                  {
                    id: 'past',
                    participantName: 'Carlos',
                    title: 'Evidências',
                    status: 'COMPLETED',
                    resolvedAt: new Date().toISOString(),
                  },
                ],
                waits: [],
              },
            },
          })
        : route.fulfill({ status: 404 });
    return route.fulfill({ status: 403 });
  });
  await page.goto('/musico');
  await page.getByLabel('E-mail', { exact: true }).fill('music@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('musician-password-2026');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Aguardando uma sessão' })).toBeVisible();
  granted = true;
  await page.getByRole('button', { name: 'Atualizar sessões', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Café Tão', exact: true })).toBeVisible();
  await expect(page.locator('.sf-queue-line')).toHaveCount(14);
  await page.getByLabel('Buscar na fila', { exact: true }).fill('Música 14');
  await expect(page.locator('.sf-queue-line')).toHaveCount(1);
  await expect(page.locator('.sf-queue-line')).toContainText('Artista 14');
  await page.getByLabel('Buscar na fila', { exact: true }).fill('');
  accepted = true;
  await expect(page.getByText('Ida confirmada', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('heading', { name: 'Ana', exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('musico-fila.png'),
    fullPage: true,
    scale: 'css',
  });

  for (const label of ['Chamar', 'Pular', 'Concluir apresentação', 'Criar participante']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Opções do músico' }).click();
  await page.getByRole('menuitem', { name: 'Histórico do palco', exact: true }).click();
  const history = page.getByRole('dialog', { name: 'Histórico do palco', exact: true });
  await expect(history).toContainText('Evidências');
  await history.getByRole('button', { name: 'Fechar', exact: true }).click();
  granted = false;
  await expect(page.getByRole('heading', { name: 'Aguardando uma sessão' })).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByRole('heading', { name: 'Ana', exact: true })).toHaveCount(0);
  await page.goto('/anfitriao');
  await expect(page.getByRole('heading', { name: 'Entrar como anfitrião' })).toBeVisible();
  await page.goto('/musico');
  await expect(page.getByRole('heading', { name: 'Aguardando uma sessão' })).toBeVisible();
  await page.getByRole('button', { name: 'Opções do músico' }).click();
  await page.getByRole('menuitem', { name: 'Sair da conta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entrar como músico' })).toBeVisible();
  expect(writes).toEqual(['/api/auth/login', '/api/auth/logout']);
});

test('host grants musician access and confirms revocation without repeating a grant after failure', async ({
  page,
}) => {
  let granted = false;
  const operations: string[] = [];
  let revocations = 0;
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({ json: { email: 'host@example.test', role: 'HOST' } });
    if (path.endsWith('/auth/csrf'))
      return route.fulfill({ json: { token: 'csrf', headerName: 'X-CSRF-TOKEN' } });
    if (path === '/api/sessions') return route.fulfill({ json: [session] });
    if (path.endsWith('/entry-link'))
      return route.fulfill({ json: { url: 'https://singflow.example/participante/entry' } });
    if (path.endsWith('/musicians/available'))
      return route.fulfill({
        json: [{ id: '33333333-3333-4333-8333-333333333333', name: 'João Silva' }],
      });
    if (path.endsWith('/musicians') && request.method() === 'POST') {
      const body = request.postDataJSON();
      expect(body.musicianId).toBe('33333333-3333-4333-8333-333333333333');
      expect(body).not.toHaveProperty('email');
      operations.push(body.operationId);
      granted = true;
      if (operations.length === 1) return route.fulfill({ status: 503 });
    }
    if (path.endsWith('/musicians/revoke')) {
      revocations++;
      granted = false;
      return route.fulfill({ json: [] });
    }
    if (path.endsWith('/musicians'))
      return route.fulfill({
        json: granted
          ? [{ id: '33333333-3333-4333-8333-333333333333', name: 'João Silva', enabled: true }]
          : [],
      });
    return route.fulfill({ json: [] });
  });
  await page.goto('/anfitriao');
  await page.getByRole('tab', { name: 'Músicos', exact: true }).click();
  const access = page.getByRole('region', { name: 'Músicos da sessão', exact: true });
  await expect(access.getByText(/Escolha pelo nome quem vai/)).toHaveCount(0);
  const select = access.getByRole('combobox', { name: 'Músico', exact: true });
  const memberList = access.getByRole('list', { name: 'Músicos vinculados', exact: true });
  expect((await select.boundingBox())!.y).toBeLessThan((await memberList.boundingBox())!.y);
  await access.getByRole('combobox', { name: 'Músico', exact: true }).click();
  await page.getByPlaceholder('Buscar pelo nome').fill('João');
  await page.getByRole('option', { name: 'João Silva', exact: true }).click();
  await expect(access).not.toContainText('music@example.test');
  await access.getByRole('button', { name: 'Liberar acesso', exact: true }).click();
  await expect(access.getByRole('alert')).toContainText('Não foi possível confirmar');
  await access.getByRole('button', { name: 'Liberar acesso', exact: true }).click();
  await expect.poll(() => operations.length).toBe(2);
  await expect(access.locator('.sf-musician-member')).toContainText('João Silva');
  await expect(access.locator('.sf-musician-member')).toHaveCSS('border-radius', '12px');
  await expect(access.locator('.sf-musician-member')).toHaveCSS('border-top-width', '1px');
  expect(operations[0]).toBe(operations[1]);
  await access.getByRole('button', { name: 'Revogar acesso de João Silva', exact: true }).click();
  await page.getByRole('button', { name: 'Manter acesso', exact: true }).click();
  expect(revocations).toBe(0);
  await access.getByRole('button', { name: 'Revogar acesso de João Silva', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar revogação', exact: true }).click();
  await expect(access.locator('.sf-musician-member')).toHaveCount(0);
  expect(revocations).toBe(1);
  await page.getByRole('tab', { name: 'Fila', exact: true }).click();
  await expect(access).toHaveCount(0);
});
