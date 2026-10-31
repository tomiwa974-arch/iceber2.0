import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('booking_configuration', (table) => {
      table.integer('slot_interval_minutes').notNullable().defaultTo(60)
    })
    this.schema.createTable('reservation_refunds', (table) => {
      table.string('payment_reference', 36).primary()
      table.string('reservation_id', 36).notNullable().unique()
      table.integer('amount').notNullable()
      table.integer('fee_amount').notNullable()
      table.string('status', 30).notNullable().defaultTo('Queued')
      table.string('provider_id', 100).nullable().unique()
      table.text('note').nullable()
      table.dateTime('created_at').notNullable()
      table.dateTime('updated_at').notNullable()
    })
  }
  async down() {
    this.schema.dropTable('reservation_refunds')
    this.schema.alterTable('booking_configuration', (table) => {
      table.dropColumn('slot_interval_minutes')
    })
  }
}
