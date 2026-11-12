import { expect, test } from '@playwright/test';

test('admin reads host, musicians and live queue without operating the session', async ({
  page,
}, testInfo) => {
  let closed = false,
    updated = false;
  const writes: string[] = [];
  const session = {
    id: 'session-beta',
    name: 'Karaokê no Café',
    status: 'OPEN',
    createdAt: '2026-11-11T12:00:00Z',
  };
  const summary = { session, host: { name: 'Rita Alves', email: 'rita@example.test' } };
  await page.route('**/api/**', (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') writes.push(path);
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          email: 'admin@example.test',
          role: 'HOST',
          status: 'APPROVED',
          emailVerified: true,
          administrator: true,
        },
      });
    if (path.endsWith('/admin/accounts'))
      return route.fulfill({ json: { items: [], total: 0, page: 0, size: 25 } });
    if (path === '/api/admin/sessions')
      return route.fulfill({
        json: closed
          ? []
          : [
              summary,
              {
                session: { ...session, id: 'another-session', name: 'Festa particular' },
                host: { name: 'Paulo Santos', email: 'paulo@example.test' },
              },
            ],
      });
    if (path === '/api/admin/sessions/session-beta') {
      if (closed)
        return route.fulfill({ status: 409, json: { detail: 'A sessão precisa estar aberta.' } });
      return route.fulfill({
        json: {
          ...summary,
          musicians: [{ id: 'musician-joao', name: 'João Silva', enabled: true }],
          stage: {
            active: {
              id: 'active-call',
              participantName: 'Ana',
              title: 'Evidências',
              artist: 'Chitãozinho e Xororó',
              acceptedAt: null,
              status: 'CALLED',
            },
            suggestions: [
              {
                participantId: 'bruno',
                name: 'Bruno',
                title: updated ? 'Primeiros Erros' : 'Tempo Perdido',
                artist: 'Legião Urbana',
                completed: 0,
                tableLabel: '4',
                requestId: 'request-bruno',
              },
            ],
            waits: [],
            history: [],
          },
        },
      });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Sessões abertas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sessões abertas', exact: true })).toBeVisible();
  await page.getByLabel('Buscar sessão ou anfitrião').fill('Rita');
  await expect(page.getByRole('button', { name: /Festa particular/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Karaokê no Café/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Karaokê no Café', exact: true });
  await expect(dialog.getByRole('region', { name: 'Anfitrião da sessão' })).toContainText(
    'Rita Alves',
  );
  await expect(dialog.getByRole('region', { name: 'Músicos da sessão' })).toContainText(
    'João Silva',
  );
  await expect(dialog.getByRole('region', { name: 'Convocação atual' })).toContainText('Ana');
  await expect(dialog.getByRole('region', { name: 'Fila sugerida' })).toContainText(
    'Tempo Perdido',
  );
  for (const name of [
    'Chamar',
    'Pular',
    'Concluir apresentação',
    'Encerrar sessão',
    'Liberar acesso',
  ])
    await expect(dialog.getByRole('button', { name, exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('admin-session-mobile.png'), fullPage: true });
  updated = true;
  await expect(dialog.getByRole('region', { name: 'Fila sugerida' })).toContainText(
    'Primeiros Erros',
    { timeout: 10000 },
  );
  closed = true;
  await expect(dialog.getByRole('alert')).toContainText('Esta sessão foi encerrada', {
    timeout: 10000,
  });
  await expect(dialog.getByRole('region', { name: 'Fila sugerida' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar sessões', exact: true }).click();
  await page.getByLabel('Buscar sessão ou anfitrião').fill('');
  await expect(page.getByText('Nenhuma sessão aberta no momento.', { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});
