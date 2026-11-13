import { Locator, Page } from '@playwright/test';
export async function prepareManual(modal: Locator, title: string) {
  await modal.getByLabel('Buscar música ou artista', { exact: true }).fill(title);
  await modal
    .getByRole('button', { name: `Adicionar “${title}” manualmente`, exact: true })
    .click();
}
export async function refreshParticipant(page: Page) {
  await page.getByRole('button', { name: 'Opções da participação', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
}

export async function openParticipantCatalog(page: Page) {
  await page
    .getByRole('navigation', { name: 'Navegação do participante', exact: true })
    .getByRole('tab', { name: 'Catálogo', exact: true })
    .click();
  return page.getByRole('region', { name: 'Catálogo', exact: true });
}
