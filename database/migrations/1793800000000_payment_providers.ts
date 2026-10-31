import { BaseSchema } from '@adonisjs/lucid/schema'
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('reservation_payments', (table) => {
      table.string('provider', 20).notNullable().defaultTo('paystack')
      table.string('checkout_session_id', 255).nullable().unique()
    })
  }
  async down() {
    this.schema.alterTable('reservation_payments', (table) => {
      table.dropColumn('checkout_session_id')
      table.dropColumn('provider')
    })
  }
}
