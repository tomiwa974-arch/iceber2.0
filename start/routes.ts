const AdminSecurityController = () => import('#controllers/admin_security_controller')
const TableSessionsController = () => import('#controllers/table_sessions_controller')
const CommerceController = () => import('#controllers/commerce_controller')
const EmailVerificationsController = () => import('#controllers/email_verifications_controller')
import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

const AdminSessionController = () => import('#controllers/admin_session_controller')
const RestaurantController = () => import('#controllers/restaurant_controller')
const NotificationsController = () => import('#controllers/notifications_controller')
const TableBookingsController = () => import('#controllers/table_bookings_controller')
const PaymentsController = () => import('#controllers/payments_controller')

router.on('/').renderInertia('home', {}).as('home')
router.get('/uploads/menu/:name', [RestaurantController, 'photo'])
for (const policy of ['privacy', 'terms', 'refunds', 'cookies'] as const) {
  router.on(`/${policy}`).renderInertia('policy', { policy })
}

router.on('/full-menu').renderInertia('full_menu', {}).as('full_menu')
router.get('/payments/:reference', [PaymentsController, 'page'])
router.get('/api/payments/:reference', [PaymentsController, 'show'])
router
  .post('/api/payments/:reference/initialize', [PaymentsController, 'initialize'])
  .use(middleware.liveRestaurant())
router
  .post('/api/payments/:reference/verify', [PaymentsController, 'verify'])
  .use(middleware.liveRestaurant())
router.post('/api/payments/paystack/webhook', [PaymentsController, 'webhook'])
router.post('/api/payments/stripe/webhook', [PaymentsController, 'stripeWebhook'])

router.get('/admin/login', [AdminSessionController, 'create']).as('admin.login')
router.post('/admin/login', [AdminSessionController, 'store']).as('admin.login.store')
router.get('/admin/two-factor', [AdminSessionController, 'challenge'])
router.post('/admin/two-factor', [AdminSessionController, 'challengeStore'])
router.get('/admin/setup', [AdminSessionController, 'setup']).as('admin.setup')
router.post('/admin/setup', [AdminSessionController, 'setupStore']).as('admin.setup.store')

router
  .group(() => {
    router.on('/admin').renderInertia('admin', {}).as('admin')
    router.post('/admin/logout', [AdminSessionController, 'destroy']).as('admin.logout')
    router.get('/api/admin/security', [AdminSecurityController, 'show'])
    router.post('/api/admin/security', [AdminSecurityController, 'update'])
    router.get('/api/admin/payments', [CommerceController, 'payments'])
    router.put('/api/admin/payments/providers', [CommerceController, 'providers'])
    router.get('/api/admin/table-sessions', [TableSessionsController, 'index'])
    router.post('/api/admin/table-sessions/:id', [TableSessionsController, 'start'])
    router.delete('/api/admin/table-sessions/:id', [TableSessionsController, 'close'])
    router.get('/api/admin/table-sessions/:id/qr', [TableSessionsController, 'qr'])
    router.get('/api/admin/orders', [CommerceController, 'orders'])
    router.patch('/api/admin/orders/:id', [CommerceController, 'updateOrder'])
    router.get('/api/admin/restaurant', [RestaurantController, 'adminShow'])
    router.post('/api/admin/refunds/:reference/reconcile', [PaymentsController, 'reconcileRefund'])
    router.post('/api/admin/menu', [RestaurantController, 'createMenu'])
    router.put('/api/admin/menu/:id', [RestaurantController, 'updateMenu'])
    router.delete('/api/admin/menu/:id', [RestaurantController, 'deleteMenu'])
    router.patch('/api/admin/reservations/:id', [RestaurantController, 'updateReservation'])
    router.patch('/api/admin/reservations/:id/table', [TableBookingsController, 'assign'])
    router.put('/api/admin/tables/count', [TableBookingsController, 'count'])
    router.put('/api/admin/tables/:id', [TableBookingsController, 'update'])
    router.put('/api/admin/booking-hours', [TableBookingsController, 'hours'])
    router.get('/api/admin/notifications/push', [NotificationsController, 'config'])
    router.post('/api/admin/notifications/push', [NotificationsController, 'subscribe'])
    router.delete('/api/admin/notifications/push', [NotificationsController, 'unsubscribe'])
    router.post('/api/admin/notifications/read', [NotificationsController, 'read'])
    router.put('/api/admin/settings', [RestaurantController, 'updateSettings'])
    router.post('/api/admin/specials', [RestaurantController, 'createSpecial'])
    router.post('/api/admin/specials/:id/move', [RestaurantController, 'moveSpecial'])
    router.delete('/api/admin/specials/:id', [RestaurantController, 'deleteSpecial'])
    router.post('/api/admin/photos', [RestaurantController, 'uploadPhoto'])
  })
  .use(middleware.admin())

router.get('/api/restaurant', [RestaurantController, 'show'])
router.get('/api/currency', async ({ response }) => {
  response.header('Cache-Control', 'public, max-age=600')
  const { exchangeRates } = await import('#services/exchange_rates')
  return exchangeRates()
})
router
  .post('/api/email-verification/request', [EmailVerificationsController, 'request'])
  .use(middleware.liveRestaurant())
router
  .post('/api/email-verification/verify', [EmailVerificationsController, 'verify'])
  .use(middleware.liveRestaurant())
router
  .post('/api/reservations', [RestaurantController, 'createReservation'])
  .use(middleware.liveRestaurant())
router.get('/api/reservations/availability', [TableBookingsController, 'availability'])
router
  .post('/api/reservations/lookup', [RestaurantController, 'lookupReservation'])
  .use(middleware.liveRestaurant())
router
  .post('/api/reservations/cancel', [RestaurantController, 'cancelReservation'])
  .use(middleware.liveRestaurant())
router
  .post('/api/reservations/refund-status', [PaymentsController, 'refundStatus'])
  .use(middleware.liveRestaurant())
router.post('/api/newsletter', [RestaurantController, 'subscribe']).use(middleware.liveRestaurant())

// Keep old starter links working through the same protected admin authentication flow.
router.get('/login', [AdminSessionController, 'create']).as('session.create')
router.post('/login', [AdminSessionController, 'store']).as('session.store')
router.get('/signup', ({ response }) => response.redirect('/admin/login')).as('new_account.create')
router
  .post('/signup', ({ response }) =>
    response.forbidden({ message: 'Use the one-time local admin setup.' })
  )
  .as('new_account.store')
router
  .get('/dashboard', ({ response }) => response.redirect('/admin'))
  .as('dashboard')
  .use(middleware.admin())
router
  .post('/logout', [AdminSessionController, 'destroy'])
  .as('session.destroy')
  .use(middleware.admin())

router.post('/api/orders', [CommerceController, 'createOrder']).use(middleware.liveRestaurant())
