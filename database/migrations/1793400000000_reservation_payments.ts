import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('reservation_payments', (table) => {
      table.string('reference', 36).primary()
      table.string('reservation_id', 36).nullable().unique()
      table.string('table_id', 36).notNullable()
      table.string('date', 10).notNullable()
      table.string('time', 5).notNullable()
      table.integer('guests').notNullable()
      table.text('payload').notNullable()
      table.integer('amount').notNullable()
      table.string('currency', 3).notNullable().defaultTo('NGN')
      table.string('status', 30).notNullable().defaultTo('Pending')
      table.bigInteger('hold_until').notNullable()
      table.string('authorization_url', 2048).nullable()
      table.string('provider_id', 100).nullable().unique()
      table.text('review_reason').nullable()
      table.dateTime('created_at').notNullable()
      table.dateTime('paid_at').nullable()
      table.index(['status', 'hold_until'])
      table.index(['table_id', 'date'])
    })
    this.schema.alterTable('reservations', (table) => {
      table.string('payment_reference', 36).nullable().unique()
      table.integer('paid_amount').nullable()
    })
  }
  async down() {
    this.schema.alterTable('reservations', (table) => {
      table.dropUnique(['payment_reference'])
      table.dropColumns('payment_reference', 'paid_amount')
    })
    this.schema.dropTable('reservation_payments')
  }
}
