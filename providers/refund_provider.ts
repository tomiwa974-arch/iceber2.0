import type { ApplicationService } from '@adonisjs/core/types'

export default class RefundProvider {
  private timer?: ReturnType<typeof setInterval>
  private running = false
  constructor(protected app: ApplicationService) {}
  async ready() {
    this.timer = setInterval(() => {
      void this.process()
    }, 60_000)
    this.timer.unref()
  }
  private async process() {
    if (this.running) return
    this.running = true
    try {
      const { default: db } = await import('@adonisjs/lucid/services/db')
      const { default: ReservationRefunds } = await import('#services/reservation_refunds')
      const refunds = await db
        .from('reservation_refunds')
        .whereNot('status', 'Processed')
        .where('updated_at', '<', new Date(Date.now() - 60_000))
        .orderBy('updated_at')
        .limit(20)
      for (const row of refunds) {
        try {
          await db
            .from('reservation_refunds')
            .where('payment_reference', row.payment_reference)
            .update({ updated_at: new Date() })
          await new ReservationRefunds().reconcile(row.payment_reference)
        } catch {
          /* Preserve the durable record for webhook reconciliation or staff review. */
        }
      }
    } catch {
      const { default: logger } = await import('@adonisjs/core/services/logger')
      logger.warn('Refund processing is unavailable; queued records are retained.')
    } finally {
      this.running = false
    }
  }
  async shutdown() {
    if (this.timer) clearInterval(this.timer)
  }
}
