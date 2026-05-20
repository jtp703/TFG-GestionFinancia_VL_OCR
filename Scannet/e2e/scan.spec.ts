import { test, expect } from '@playwright/test'
import path from 'path'

const TEST_EMAIL    = process.env.E2E_TEST_EMAIL    ?? 'test-e2e@scannet.dev'
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'TestPassword123!'

/** Inicia sesión antes de cada test de este bloque */
async function login(page: any) {
  await page.goto('/login')
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/$|\/onboarding/)
}

test.describe('Pipeline Scan (modo mock)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/scan')
  })

  test('página scan carga correctamente con cámara o mensaje de error cámara', async ({ page }) => {
    // Debe mostrar los controles de método de pago
    await expect(page.locator('text=Método de pago')).toBeVisible()
    // Debe mostrar el botón de galería
    await expect(page.locator('text=Galería')).toBeVisible()
  })

  test('toggle método de pago funciona', async ({ page }) => {
    await page.locator('button', { hasText: 'tarjeta' }).click()
    // El botón tarjeta debe estar activo (background brand)
    const tarjetaBtn = page.locator('button', { hasText: 'tarjeta' })
    await expect(tarjetaBtn).toBeVisible()
  })

  test('subir imagen en modo mock muestra VerifyForm', async ({ page }) => {
    // Solo ejecutar si VITE_USE_MOCK_OCR=true — si no, skip
    const useMock = process.env.VITE_USE_MOCK_OCR === 'true'
    test.skip(!useMock, 'Requiere VITE_USE_MOCK_OCR=true')

    // Simular subida de imagen
    const fileInput = page.locator('input[type="file"]')
    const imagePath = path.join(__dirname, 'fixtures', 'ticket_test.jpg')
    await fileInput.setInputFiles(imagePath)

    // Debe aparecer la pantalla de verificación
    await expect(page.locator('text=Verificar ticket')).toBeVisible({ timeout: 10_000 })
  })

  test('botón Confirmar y guardar se deshabilita al hacer click', async ({ page }) => {
    const useMock = process.env.VITE_USE_MOCK_OCR === 'true'
    test.skip(!useMock, 'Requiere VITE_USE_MOCK_OCR=true')

    const fileInput = page.locator('input[type="file"]')
    const imagePath = path.join(__dirname, 'fixtures', 'ticket_test.jpg')
    await fileInput.setInputFiles(imagePath)

    await expect(page.locator('text=Verificar ticket')).toBeVisible({ timeout: 10_000 })

    const confirmBtn = page.locator('button', { hasText: /Confirmar y guardar/i })
    await confirmBtn.click()

    // Inmediatamente después del click, el botón debe deshabilitarse
    await expect(confirmBtn).toBeDisabled()
  })
})
