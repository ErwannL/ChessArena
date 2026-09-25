import { expect, test, type Page } from '@playwright/test';

const square = (page: Page, sq: string) => {
  const idx = (Number(sq[1]) - 1) * 8 + 'abcdefgh'.indexOf(sq[0]);
  return page.locator(`[data-sq="${idx}"]`);
};

async function move(page: Page, from: string, to: string) {
  await square(page, from).click();
  await square(page, to).click();
}

test('home page shows modes and the seeded bots', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Bienvenue/ })).toBeVisible();
  await expect(page.getByText('Joueur vs Bot')).toBeVisible();
  await expect(page.getByText('Grand Maître').first()).toBeVisible();
  await expect(page.locator('#mode-badge')).toHaveText(/En ligne/);
});

test('rated PvP game updates the leaderboard', async ({ page }, info) => {
  const suffix = info.project.name.slice(0, 3);
  await page.goto('/#/new/pvp');
  const selects = page.locator('select');
  for (const [i, name] of [
    [0, `Blanc-${suffix}`],
    [1, `Noir-${suffix}`],
  ] as const) {
    await selects.nth(i).selectOption('__new');
    await page.getByPlaceholder('Nom du nouveau joueur').nth(i).fill(name);
    await page.getByRole('button', { name: 'Créer' }).nth(i).click();
    await expect(page.getByText(`Joueur « ${name} » créé`)).toBeVisible();
  }
  await expect(page.getByText('Partie classée')).toBeVisible();
  await page.getByRole('button', { name: /Lancer la partie/ }).click();
  await move(page, 'f2', 'f3');
  await move(page, 'e7', 'e5');
  await move(page, 'g2', 'g4');
  await move(page, 'd8', 'h4');
  await expect(page.getByRole('heading', { name: `Noir-${suffix} gagne` })).toBeVisible();
  await expect(page.getByText('+20')).toBeVisible();

  await page.goto('/#/leaderboard');
  await page.getByRole('button', { name: /Humains/ }).click();
  await expect(page.locator('tbody tr').filter({ hasText: `Noir-${suffix}` })).toContainText(
    '1220',
  );
});

test('player vs bot: the bot answers', async ({ page }) => {
  await page.goto('/#/new/pve');
  await page.getByRole('button', { name: /Lancer la partie/ }).click();
  await move(page, 'e2', 'e4');
  await expect(page.getByText('Coup joué')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.moves .mv')).toHaveCount(2);
});

test('bot workshop creates a bot', async ({ page }, info) => {
  const name = `Robot-${info.project.name.slice(0, 3)}`;
  await page.goto('/#/bots/new');
  await page.getByPlaceholder('Ex. : Le Renard').fill(name);
  await page.getByLabel('Sécurité des pièces').check();
  await page.getByRole('button', { name: /Enregistrer/ }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
});
