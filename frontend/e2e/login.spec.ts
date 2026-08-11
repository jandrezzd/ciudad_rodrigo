import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login form', async ({ page }) => {
    await expect(page.getByText('Ciudad Rodrigo')).toBeVisible();
    await expect(page.getByText('Constructora')).toBeVisible();
    await expect(page.getByPlaceholder('ejemplo@correo.com')).toBeVisible();
    await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeVisible();
  });

  test('should show validation for empty fields', async ({ page }) => {
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await expect(page.getByPlaceholder('ejemplo@correo.com')).toBeVisible();
  });
});
