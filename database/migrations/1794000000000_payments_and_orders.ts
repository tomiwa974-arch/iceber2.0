import { BaseSchema } from '@adonisjs/lucid/schema'
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('booking_configuration', (table) => {
      table.text('payment_providers').nullable()
    })
    this.schema.createTable('restaurant_orders', (table) => {
      table.string('id', 36).primary()
      table.string('request_hash', 64).notNullable()
      table.string('ip_hash', 64).notNullable().index()
      table.string('name', 100).notNullable()
      table.string('phone', 25).notNullable()
      table.string('table_id', 36).notNullable()
      table.string('table_name', 60).notNullable()
      table.text('notes').nullable()
      table.text('items').notNullable()
      table.bigInteger('total').notNullable()
      table.string('status', 20).notNullable().defaultTo('Pending')
      table.dateTime('created_at').notNullable().index()
      table.dateTime('updated_at').notNullable()
    })
    this.schema.alterTable('admin_notifications', (table) => {
      table.string('order_id', 36).nullable().index()
    })
  }
  async down() {
    this.schema.alterTable('admin_notifications', (table) => table.dropColumn('order_id'))
    this.schema.dropTable('restaurant_orders')
    this.schema.alterTable('booking_configuration', (table) =>
      table.dropColumn('payment_providers')
    )
  }
}
