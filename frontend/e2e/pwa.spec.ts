import { expect, test } from '@playwright/test';
test('PWA installation is deliberate and updates never reload a form without confirmation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const data = { prompts: 0, messages: [] as unknown[] };
    (window as any).pwaTest = data;
    const registration = {
      active: { scriptURL: location.origin + '/notifications-sw.js' },
      waiting: {
        scriptURL: location.origin + '/notifications-sw.js',
        postMessage: (value: unknown) => data.messages.push(value),
      },
      addEventListener() {},
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: async () => registration,
        register: async () => registration,
        ready: Promise.resolve(registration),
        addEventListener() {},
        removeEventListener() {},
      },
    });
  });
  await page.route('**/version.json', (route) => route.fulfill({ json: { version: '9.0.0' } }));
  await page.route('**/api/**', (route) => route.fulfill({ status: 401 }));
  await page.goto('/minha-conta');
  await expect(page.getByRole('heading', { name: 'Minha conta', exact: true })).toBeVisible();
  await page.getByLabel('E-mail', { exact: true }).fill('ana@example.test');
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt');
    Object.assign(event, {
      prompt: async () => {
        (window as any).pwaTest.prompts++;
      },
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    window.dispatchEvent(event);
  });
  await page.getByRole('button', { name: 'Instalar SingFlow', exact: true }).click();
  expect(await page.evaluate(() => (window as any).pwaTest.prompts)).toBe(1);
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Conclua ou salve');
  expect(await page.evaluate(() => (window as any).pwaTest.messages)).toEqual([]);
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveValue('ana@example.test');
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar agora', exact: true }).click();
  expect(await page.evaluate(() => (window as any).pwaTest.messages)).toEqual([
    { type: 'SKIP_WAITING' },
  ]);
});
