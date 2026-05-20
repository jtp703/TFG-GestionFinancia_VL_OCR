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

// El panel lateral tiene el título exacto "🔒 Gastos fijos" en un <span>
const PANEL_HEADER = '🔒 Gastos fijos'

test.describe('Pipeline Gastos Fijos', () => {
  test.use({ viewport: { width: 390, height: 844 } }) // iPhone 14

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('abrir panel de gastos fijos desde Home', async ({ page }) => {
    await page.locator('button', { hasText: /Fijos/i }).click()
    // Buscar el título exacto del panel (el <span> del header)
    await expect(page.getByText(PANEL_HEADER, { exact: true })).toBeVisible()
  })

  test('crear gasto fijo muestra toast de confirmación', async ({ page }) => {
    await page.locator('button', { hasText: /Fijos/i }).click()
    await expect(page.getByText(PANEL_HEADER, { exact: true })).toBeVisible()

    // Abrir formulario de nuevo gasto
    await page.locator('button', { hasText: /Añadir/i }).click()

    // Rellenar formulario
    await page.fill('input[placeholder="Ej: Alquiler"]', 'Test E2E Alquiler')
    await page.locator('input[type="number"]').last().fill('500')

    // Guardar
    await page.locator('button', { hasText: /^Guardar$/ }).click()

    // Debe aparecer toast de sonner
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 5_000 })
  })

  test('eliminar gasto fijo pide confirmación (dialog)', async ({ page }) => {
    await page.locator('button', { hasText: /Fijos/i }).click()
    await expect(page.getByText(PANEL_HEADER, { exact: true })).toBeVisible()

    // Scope al panel — buscar el div fijo que contiene el título del panel
    const panel = page.locator('div.fixed').filter({ hasText: PANEL_HEADER })
    // Dar tiempo a Supabase para cargar los gastos
    await page.waitForTimeout(1500)
    const filas  = panel.locator('ul li')
    const count  = await filas.count()

    if (count === 0) {
      test.skip() // sin datos no hay nada que eliminar
      return
    }

    // Escuchar el dialog de confirm y cancelarlo antes de que bloquee
    let dialogMsg = ''
    page.once('dialog', async dialog => {
      dialogMsg = dialog.message()
      await dialog.dismiss()
    })

    // force:true porque el overflow-y-auto del panel intercepta pointer events en Playwright headless
    await filas.first().locator('button').last().click({ force: true })

    expect(dialogMsg).toMatch(/Eliminar/i)
  })
})
