import { test, expect } from '@playwright/test'

const TEST_EMAIL    = process.env.E2E_TEST_EMAIL    ?? 'test-e2e@scannet.dev'
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'TestPassword123!'

async function login(page: any) {
  await page.goto('/login')
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/$/)
}

test.describe('Dashboard Home', () => {
  // Viewport móvil: el bottom nav tiene md:hidden, solo visible en mobile
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('home carga sin errores y muestra bottom nav', async ({ page }) => {
    // En móvil el <nav> con md:hidden sí es visible
    await expect(page.locator('nav')).toBeVisible()
  })

  test('navegar a scan desde bottom nav', async ({ page }) => {
    // En móvil hay solo un link /scan visible (el del bottom nav — el sidebar está oculto)
    await page.locator('nav a[href="/scan"]').click()
    await expect(page).toHaveURL(/\/scan/)
  })

  test('navegar a cuenta desde bottom nav', async ({ page }) => {
    await page.locator('nav a[href="/cuenta"]').click()
    await expect(page).toHaveURL(/\/cuenta/)
  })

  test('donut chart o empty state visible tras cargar', async ({ page }) => {
    await page.waitForTimeout(1500)

    // Usar or() de Playwright para combinar locators sin CSS inválido
    const donut      = page.locator('svg').first()
    const emptyState = page.getByText(/Sin gastos|Escanea/i).first()

    const visible = await donut.isVisible() || await emptyState.isVisible()
    expect(visible).toBe(true)
  })

  test('botón de gastos fijos visible en Home', async ({ page }) => {
    await expect(page.locator('button', { hasText: /Fijos/i })).toBeVisible()
  })
})
