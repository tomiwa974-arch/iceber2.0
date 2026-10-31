// Run after `node ace build`. Uses intercepted fixture APIs, not the restaurant database.
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'

const origin = 'http://127.0.0.1:3347'
const databaseName = 'ui-feedback-' + randomUUID() + '.sqlite3'
const databasePath = resolve('build/tmp', databaseName)
mkdirSync(resolve('build/tmp'), { recursive: true })
const fixtureDatabase = new Database(databasePath)
fixtureDatabase.exec(
  'CREATE TABLE security_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)'
)
fixtureDatabase.close()
const server = spawn(process.execPath, ['build/bin/server.js'], {
  cwd: process.cwd(),
  windowsHide: true,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: '3347',
    APP_URL: origin,
    APP_KEY: Buffer.alloc(32, 7).toString('base64'),
    LOG_LEVEL: 'error',
    SESSION_DRIVER: 'cookie',
    DB_CONNECTION: 'sqlite',
    DB_SQLITE_PATH: 'tmp/' + databaseName,
    RESTAURANT_LIVE: 'false',
    CSP_ENFORCE: 'false',
  },
  stdio: ['ignore', 'ignore', 'pipe'],
})
let output = ''
server.stderr.on('data', (chunk) => {
  output += chunk.toString()
})
let browser
try {
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(origin)).ok) break
    } catch {}
    if (attempt > 60) throw new Error(`Preview failed to start: ${output}`)
    await delay(200)
  }
  browser = await chromium.launch(
    process.env.UI_BROWSER_PATH
      ? { executablePath: process.env.UI_BROWSER_PATH }
      : { channel: 'msedge' }
  )
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const visible = async (locator) => {
    await locator.waitFor({ state: 'visible' })
    assert.ok(await locator.isVisible())
  }
  const table = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Table 1',
    seats: 4,
    active: true,
  }
  const menu = [
    {
      id: 'fixture-main',
      name: 'Test rice',
      description: 'A browser test dish.',
      price: 3000,
      category: 'Mains',
      kind: 'food',
      available: true,
      image: '',
      popular: false,
    },
    {
      id: 'fixture-starter',
      name: 'Test soup',
      description: 'A browser test starter.',
      price: 2000,
      category: 'Starters',
      kind: 'food',
      available: true,
      image: '',
      popular: false,
    },
    {
      id: 'fixture-drink',
      name: 'Test water',
      description: 'A browser test drink.',
      price: 1000,
      category: 'Soft drinks',
      kind: 'drink',
      available: true,
      image: '',
      popular: false,
    },
  ]
  const state = {
    live: true,
    menu,
    specials: [],
    reservations: [],
    notifications: [],
    subscribers: [],
    refunds: [],
    paymentReviews: [],
    serverTime: Date.now(),
    settings: {
      heroTitle: 'Restaurant',
      heroSubtitle: 'Menu and bookings',
      heroDescription: 'Browse the menu.',
      address: '',
      phone: '',
      email: '',
      weekdayHours: '',
      weekendHours: '',
      sundayHours: '',
    },
    booking: {
      tables: [table],
      hours: Array.from({ length: 7 }, (_, i) => ({
        day: i + 1,
        open: '09:00',
        close: '23:00',
        closed: false,
      })),
      durationMinutes: 120,
      cleanupMinutes: 10,
      slotIntervalMinutes: 60,
    },
  }
  let newsletterCalls = 0,
    orderLoadFails = true,
    orderStatus = 'Pending'
  let securityFails = true
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const send = (json, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) })
    await delay(path.includes('restaurant') ? 1200 : 650)
    if (path === '/api/restaurant' || path === '/api/admin/restaurant') return send(state)
    if (path === '/api/currency')
      return send({
        rates: { NGN: 1, USD: 0.001 },
        updatedAt: new Date().toISOString(),
        stale: false,
      })
    if (path === '/api/newsletter') {
      newsletterCalls++
      return send({ message: 'Test subscription failure. Try again.' }, 503)
    }
    if (path === '/api/admin/orders') {
      if (orderLoadFails) {
        orderLoadFails = false
        return send({ message: 'Test orders failure.' }, 503)
      }
      return send({
        orders: [
          {
            id: 'fixture-order',
            name: 'UI fixture',
            tableName: 'Table 1',
            notes: '',
            total: 300000,
            status: orderStatus,
            createdAt: new Date().toISOString(),
            items: [],
          },
        ],
      })
    }
    if (path === '/api/admin/orders/fixture-order') {
      orderStatus = JSON.parse(route.request().postData()).status
      return send({})
    }
    if (path === '/api/admin/security') {
      if (securityFails) {
        securityFails = false
        return send({ message: 'Test security failure.' }, 503)
      }
      return send({ enabled: false, recoveryRemaining: 0 })
    }
    if (path === '/api/admin/table-sessions')
      return send({ tables: [{ ...table, code: 'TESTCODE1234', expires: Date.now() + 7200000 }] })
    if (path.endsWith('/qr'))
      return send({
        image:
          'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/%3E',
        url: origin + '/?table=test',
      })
    if (path === '/api/admin/payments')
      return send({
        providers: [
          { id: 'paystack', name: 'Paystack', configured: true, enabled: true },
          { id: 'stripe', name: 'Stripe', configured: true, enabled: false },
        ],
        revenue: {
          gross: 0,
          refunded: 0,
          pendingRefunds: 0,
          reviewAmount: 0,
          cashNet: 0,
          retained: 0,
          paidBookings: 0,
          daily: [],
        },
      })
    if (path === '/api/admin/payments/providers')
      return send({
        providers: JSON.parse(route.request().postData()).providers.map((id) => ({
          id,
          name: id,
          configured: true,
          enabled: true,
        })),
      })
    return send({})
  })

  await page.goto(origin, { waitUntil: 'domcontentloaded' })
  await visible(page.getByRole('status', { name: 'Loading menu...', exact: true }))
  assert.equal(await page.getByText('Our menu is being refreshed.').count(), 0)
  await visible(page.getByRole('heading', { name: 'Test rice', exact: true }))
  await page.locator('#menu').getByRole('button', { name: 'Starters', exact: true }).click()
  assert.equal(
    await page.locator('#menu').getByRole('heading', { name: 'Test rice', exact: true }).count(),
    0
  )
  await visible(page.locator('#menu').getByRole('heading', { name: 'Test soup', exact: true }))
  await page.getByRole('textbox', { name: 'Newsletter email address' }).fill('ui@example.test')
  await page.getByRole('checkbox', { name: /I want newsletter emails/ }).check()
  const subscribe = page.getByRole('button', { name: 'Subscribe', exact: true })
  await subscribe.click()
  await page.locator('footer button[aria-busy="true"]').waitFor()
  assert.ok(await page.locator('footer button[aria-busy="true"]').isDisabled())
  await visible(page.getByRole('alert').filter({ hasText: 'Test subscription failure.' }))
  assert.equal(newsletterCalls, 1)
  assert.ok(await subscribe.isEnabled())
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Open navigation menu' }).click()
  await visible(page.locator('#mobile-navigation'))
  await page.keyboard.press('Escape')
  await page.locator('#mobile-navigation').waitFor({ state: 'hidden' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(origin + '/full-menu')
  await visible(page.getByRole('status', { name: 'Loading full menu...' }))
  await page.getByRole('button', { name: 'View Test rice', exact: true }).click()
  await visible(page.getByRole('dialog'))
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').first().waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Drinks Menu', exact: true }).click()
  await visible(page.getByRole('button', { name: 'View Test water', exact: true }))
  await page.getByRole('button', { name: 'Add Test water to order', exact: true }).click()
  await page.getByRole('button', { name: 'Open order cart' }).click()
  await visible(page.getByRole('dialog', { name: 'Your dine-in order' }))
  await page.getByRole('button', { name: 'Close order cart' }).click()

  // Render the built admin component with a fixture shell; never authenticate or query real data.
  await page.route(origin + '/admin', async (route) => {
    const shell = await route.fetch({ url: origin + '/' })
    const shellHtml = await shell.text()
    assert.match(shellHtml, /<script data-page="app" type="application\/json">/)
    const html = shellHtml.replace(
      /(<script data-page="app" type="application\/json">)[\s\S]*?(<\/script>)/,
      (_, open, close) =>
        open +
        JSON.stringify({
          component: 'admin',
          props: { preferences: { theme: 'light' } },
          url: '/admin',
          version: '1',
        }) +
        close
    )
    await route.fulfill({ response: shell, body: html })
  })
  await page.goto(origin + '/admin')
  await visible(page.getByRole('status', { name: 'Loading restaurant dashboard...' }))
  await page
    .getByRole('status', { name: 'Loading restaurant dashboard...' })
    .waitFor({ state: 'hidden' })
  await page
    .getByRole('navigation', { name: 'Admin navigation' })
    .getByRole('button', { name: 'Orders', exact: true })
    .click()
  await visible(page.getByRole('status', { name: 'Loading orders...' }))
  await page.getByRole('button', { name: 'Retry loading orders' }).click()
  await visible(page.getByText('UI fixture', { exact: false }))
  await page.getByRole('button', { name: 'Mark accepted', exact: true }).click()
  await page.locator('button.ad-primary[aria-busy="true"]').waitFor()
  await page.getByRole('button', { name: 'Mark preparing', exact: true }).waitFor()
  await page
    .getByRole('navigation', { name: 'Admin navigation' })
    .getByRole('button', { name: 'Security', exact: true })
    .click()
  await visible(page.getByRole('status', { name: 'Loading administrator security...' }))
  await page.getByRole('button', { name: 'Retry security settings' }).click()
  await visible(page.getByRole('heading', { name: 'Administrator security' }))
  await page
    .getByRole('navigation', { name: 'Admin navigation' })
    .getByRole('button', { name: 'Payments & revenue', exact: true })
    .click()
  await visible(page.getByRole('status', { name: 'Loading payment options and revenue...' }))
  await page.getByRole('checkbox', { name: /Stripe/ }).check()
  await page.getByRole('button', { name: 'Save payment options', exact: true }).click()
  await page.locator('button.ad-primary[aria-busy="true"]').waitFor()
  await visible(page.getByText('Payment options saved. New checkouts use your selection.'))
  await page
    .getByRole('navigation', { name: 'Admin navigation' })
    .getByRole('button', { name: 'Orders', exact: true })
    .click()
  await page.getByText('Table ordering codes', { exact: true }).click()
  await visible(page.getByRole('status', { name: 'Loading table ordering sessions...' }))
  await page.getByRole('button', { name: 'Show QR', exact: true }).click()
  assert.equal(
    await page.getByRole('button', { name: /Show QR/ }).getAttribute('aria-busy'),
    'true'
  )
  await visible(page.getByAltText('Scan to order at this table'))
  await page.getByRole('button', { name: 'Copy ordering link', exact: true }).click()
  await visible(page.getByText('Copied', { exact: true }))
  assert.deepEqual(errors, [])
  console.log(
    'PASS: skeletons, loading/error/retry, button progress, newsletter recovery, filters, mobile navigation, dialogs, cart, order updates, payment toggles, security retry, QR and clipboard; no browser runtime errors.'
  )
} finally {
  await browser?.close()
  server.kill()
  await new Promise((resolve) =>
    server.exitCode !== null ? resolve() : server.once('exit', resolve)
  )
  rmSync(databasePath, { force: true })
}
