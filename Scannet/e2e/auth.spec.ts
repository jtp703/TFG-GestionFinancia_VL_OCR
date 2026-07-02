import { test, expect } from '@playwright/test'

const TEST_EMAIL    = process.env.E2E_TEST_EMAIL    ?? 'test-e2e@scannet.dev'
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'TestPassword123!'

test.describe('Pipeline Auth', () => {
  test('login con credenciales incorrectas muestra error', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]',    'wrong@email.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')

    // Debe aparecer mensaje de error
    await expect(page.locator('p').filter({ hasText: /incorrectos|Error/i })).toBeVisible()
    // NO debe navegar a home
    await expect(page).toHaveURL(/\/login/)
  })

  test('doble click en botón de login no envía dos veces', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]',    'test@test.com')
    await page.fill('input[type="password"]', 'password')

    const btn = page.locator('button[type="submit"]')
    // Click doble rápido
    await btn.dblclick()

    // El botón debe estar deshabilitado después del primer click
    await expect(btn).toBeDisabled()
  })

  test('ruta protegida redirige a /login si no autenticado', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('ruta protegida redirige a /scan si no autenticado', async ({ page }) => {
    await page.goto('/scan')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login correcto navega a home', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]',    TEST_EMAIL)
    await page.fill('input[type="password"]', TEST_PASSWORD)
    await page.click('button[type="submit"]')

    // Puede redirigir a / o a /onboarding si el perfil está incompleto
    await expect(page).toHaveURL(/\/$|\/onboarding/)
  })
})
