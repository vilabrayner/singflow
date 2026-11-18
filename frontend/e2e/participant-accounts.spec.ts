import { expect, test } from '@playwright/test';

const session = '11111111-1111-4111-8111-111111111111';
const csrf = { token: 'csrf', headerName: 'X-CSRF-TOKEN' };
const account = {
  email: 'ana@example.test',
  name: 'Ana',
  role: 'PARTICIPANT',
  emailVerified: true,
  status: 'APPROVED',
  administrator: false,
  version: 0,
};

test('optional participant registration activates after email without staff approval @release', async ({
  page,
}) => {
  let sent = false;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: csrf });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 401 });
    if (path.endsWith('/accounts/register')) {
      expect(route.request().postDataJSON()).toEqual({
        name: 'Ana',
        email: 'ana@example.test',
        password: 'participant-test-2026',
        role: 'PARTICIPANT',
      });
      sent = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 500 });
  });
  await page.goto('/cadastro/participante');
  await page.getByLabel('Nome', { exact: true }).fill('Ana');
  await page.getByLabel('E-mail', { exact: true }).fill('ana@example.test');
  await page.getByLabel('Senha', { exact: true }).fill('participant-test-2026');
  await page.getByLabel('Confirmar senha', { exact: true }).fill('participant-test-2026');
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
  expect(sent).toBe(true);
  await expect(page.getByText('seu cadastro precisa da aprovação', { exact: false })).toHaveCount(
    0,
  );
});

test('account recovery confirms replacement and preserves participant identity @release', async ({
  page,
}) => {
  let restored: unknown = null;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: csrf });
    if (path.endsWith('/auth/me')) return route.fulfill({ json: account });
    if (path.endsWith('/participant-account/me'))
      return route.fulfill({
        json: {
          id: 'ana',
          ...account,
          whatsappPhone: null,
          whatsappEnabled: false,
          pushEnabled: false,
        },
      });
    if (path.endsWith('/participant-account/sessions'))
      return route.fulfill({
        json: [{ id: session, name: 'Quarta', status: 'OPEN', participantName: 'Ana' }],
      });
    if (path.endsWith('/notifications/config'))
      return route.fulfill({
        json: { whatsappAvailable: false, pushAvailable: false, vapidPublicKey: '' },
      });
    if (path.endsWith('/account-restore-info'))
      return route.fulfill({
        json: {
          name: 'Ana',
          currentId: '22222222-2222-4222-8222-222222222222',
          currentName: 'Bruno',
        },
      });
    if (path.endsWith('/account-restore')) {
      restored = route.request().postDataJSON();
      return route.fulfill({ status: 409, json: { detail: 'A sessão foi encerrada.' } });
    }
    return route.fulfill({ status: 500 });
  });
  await page.goto('/minha-conta');
  await page.getByRole('button', { name: 'Retomar neste aparelho' }).click();
  await expect(page.getByRole('dialog')).toContainText('Este aparelho está acessando Bruno');
  expect(restored).toBe(null);
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('A sessão foi encerrada.');
  expect(restored).toEqual({ replaceParticipantId: '22222222-2222-4222-8222-222222222222' });
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('WhatsApp connection requires opt-in and opens only after an explicit action @release', async ({
  page,
}) => {
  let connects = 0;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: csrf });
    if (path.endsWith('/auth/me')) return route.fulfill({ json: account });
    if (path.endsWith('/participant-account/me'))
      return route.fulfill({
        json: {
          id: 'ana',
          ...account,
          whatsappPhone: null,
          whatsappEnabled: false,
          pushEnabled: false,
        },
      });
    if (path.endsWith('/participant-account/sessions')) return route.fulfill({ json: [] });
    if (path.endsWith('/notifications/config'))
      return route.fulfill({
        json: { whatsappAvailable: true, pushAvailable: false, vapidPublicKey: '' },
      });
    if (path.endsWith('/notifications/whatsapp')) {
      connects++;
      expect(route.request().postDataJSON()).toEqual({ accepted: true });
      return route.fulfill({
        json: { url: 'https://wa.me/5581999999999?text=SINGFLOW%20test-only' },
      });
    }
    return route.fulfill({ status: 500 });
  });
  await page.goto('/minha-conta');
  await page.getByRole('button', { name: 'Conectar meu WhatsApp' }).click();
  await expect(page.getByRole('alert')).toContainText('Marque que deseja');
  expect(connects).toBe(0);
  await page.getByRole('checkbox', { name: 'Receber pelo WhatsApp' }).check();
  await page.getByRole('button', { name: 'Conectar meu WhatsApp' }).click();
  await expect(page.getByRole('link', { name: 'Confirmar pelo WhatsApp' })).toHaveAttribute(
    'href',
    /^https:\/\/wa.me\//,
  );
  expect(connects).toBe(1);
});
