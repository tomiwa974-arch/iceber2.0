import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('booking_messages', (table) => {
      table.string('id', 80).primary()
      table.string('reservation_id', 36).notNullable().index()
      table.string('channel', 10).notNullable()
      table.text('recipient').notNullable()
      table.text('body').notNullable()
      table.string('status', 30).notNullable().defaultTo('Queued')
      table.string('provider_id', 100).nullable()
      table.dateTime('created_at').notNullable()
      table.dateTime('updated_at').notNullable()
    })
  }
  async down() {
    this.schema.dropTable('booking_messages')
  }
}
