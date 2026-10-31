import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('dining_tables', (table) => {
      table.string('id', 36).primary()
      table.string('name', 60).notNullable().unique()
      table.integer('seats').notNullable().defaultTo(8)
      table.boolean('active').notNullable().defaultTo(true)
      table.check('seats >= 1 AND seats <= 8')
    })
    this.schema.createTable('booking_configuration', (table) => {
      table.integer('id').primary()
      table.text('hours').notNullable()
    })
    this.schema.alterTable('reservations', (table) => {
      table.string('table_id', 36).nullable().references('id').inTable('dining_tables')
      table.string('table_name', 60).nullable()
      table.index(['table_id', 'date', 'time'])
    })
    this.defer(async (db) => {
      await db.table('booking_configuration').insert({
        id: 1,
        hours: JSON.stringify(
          Array.from({ length: 7 }, (_, index) => ({
            day: index + 1,
            open: index === 6 ? '12:00' : '11:00',
            close: index >= 4 && index < 6 ? '23:00' : index === 6 ? '21:00' : '22:00',
            closed: false,
          }))
        ),
      })
    })
  }
  async down() {
    this.schema.alterTable('reservations', (table) => {
      table.dropForeign(['table_id'])
      table.dropIndex(['table_id', 'date', 'time'])
      table.dropColumns('table_id', 'table_name')
    })
    this.schema.dropTable('booking_configuration')
    this.schema.dropTable('dining_tables')
  }
}
