import { Page } from '@playwright/test';
export async function installPresentationSelection(page: Page) {
  await page.route('**/api/sessions/presentation-options', (route) =>
    route.fulfill({
      json: [
        { id: '11111111-1111-4111-8111-111111111111', kind: 'VENUE', name: 'Café Tão' },
        { id: '22222222-2222-4222-8222-222222222222', kind: 'PROJECT', name: 'Som Na Caixa' },
      ],
    }),
  );
  await page.route('**/api/sessions/*/tv', (route) =>
    route.fulfill({ json: { enabled: false, venueId: null, projectId: null, version: 0 } }),
  );
}
export async function openSessionWithPresentation(page: Page) {
  await page.getByRole('button', { name: 'Abrir sessão', exact: true }).click();
  await page.getByRole('combobox', { name: 'Local', exact: true }).click();
  await page.getByRole('option', { name: 'Café Tão', exact: true }).click();
  await page.getByRole('combobox', { name: 'Projeto de karaokê', exact: true }).click();
  await page.getByRole('option', { name: 'Som Na Caixa', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Abrir sessão', exact: true }).click();
}
