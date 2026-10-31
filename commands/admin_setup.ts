import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class AdminSetup extends BaseCommand {
  static commandName = 'admin:setup'
  static description = 'Create the first administrator from the private server console'
  static options: CommandOptions = { startApp: true }

  @flags.boolean({
    description: 'Read ADMIN_SETUP_NAME, ADMIN_SETUP_EMAIL and ADMIN_SETUP_PASSWORD',
  })
  declare fromEnv: boolean

  async run() {
    // Load application services after providers have registered validator rules.
    const { createFirstAdmin } = await import('#services/admin_bootstrap')
    const { default: User } = await import('#models/user')
    const { default: db } = await import('@adonisjs/lucid/services/db')
    const bootstrap = await db.from('admin_bootstrap').where('id', 1).first()
    if (!bootstrap) {
      this.logger.error('Run node ace migration:run --force before administrator setup.')
      this.exitCode = 1
      return
    }
    if (bootstrap.completed || (await User.query().where('is_admin', true).first())) {
      if (this.fromEnv) {
        this.logger.info('Administrator setup is closed; existing accounts were left unchanged.')
        return
      }
      this.logger.error('Administrator setup is closed. Sign in with the existing administrator.')
      this.exitCode = 1
      return
    }

    if (
      this.fromEnv &&
      (!process.env.ADMIN_SETUP_NAME ||
        !process.env.ADMIN_SETUP_EMAIL ||
        !process.env.ADMIN_SETUP_PASSWORD)
    ) {
      this.logger.error(
        'Set ADMIN_SETUP_NAME, ADMIN_SETUP_EMAIL and ADMIN_SETUP_PASSWORD in the server environment.'
      )
      this.exitCode = 1
      return
    }
    const fullName = this.fromEnv
      ? process.env.ADMIN_SETUP_NAME!
      : await this.prompt.ask('Administrator name')
    const email = this.fromEnv
      ? process.env.ADMIN_SETUP_EMAIL!
      : await this.prompt.ask('Administrator email')
    if (!this.fromEnv) {
      this.logger.info('Use 12-128 characters with uppercase, lowercase, a number and a symbol.')
    }
    const password = this.fromEnv
      ? process.env.ADMIN_SETUP_PASSWORD!
      : await this.prompt.secure('Password')
    const passwordConfirmation = this.fromEnv
      ? password
      : await this.prompt.secure('Confirm password')

    try {
      const admin = await createFirstAdmin({ fullName, email, password, passwordConfirmation })
      if (!admin) {
        this.logger.error('Administrator setup is closed. No account was created.')
        this.exitCode = 1
        return
      }
      this.logger.success('Administrator created. Sign in at /admin/login.')
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'E_VALIDATION_ERROR'
      ) {
        this.logger.error(
          'Invalid details: check the name, unused email, password requirements and confirmation.'
        )
        this.exitCode = 1
        return
      }
      throw error
    }
  }
}
