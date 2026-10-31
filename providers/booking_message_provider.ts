import type { ApplicationService } from '@adonisjs/core/types'

export default class BookingMessageProvider {
  private timer?: ReturnType<typeof setInterval>
  private running = false
  constructor(protected app: ApplicationService) {}
  async ready() {
    this.timer = setInterval(() => void this.process(), 15000)
    this.timer.unref()
  }
  private async process() {
    if (this.running) return
    this.running = true
    try {
      const { default: BookingMessages } = await import('#services/booking_messages')
      await new BookingMessages().process()
    } catch {
      const { default: logger } = await import('@adonisjs/core/services/logger')
      logger.warn('Booking message queue unavailable; records retained.')
    } finally {
      this.running = false
    }
  }
  async shutdown() {
    if (this.timer) clearInterval(this.timer)
  }
}
