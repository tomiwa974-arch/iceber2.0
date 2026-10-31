import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('users', (table) => {
      table.boolean('is_admin').notNullable().defaultTo(false).index()
    })

    // A permanent singleton serializes first-admin setup and keeps it closed.
    this.schema.createTable('admin_bootstrap', (table) => {
      table.integer('id').primary()
      table.boolean('completed').notNullable().defaultTo(false)
    })

    this.defer(async (db) => {
      await db.table('admin_bootstrap').insert({ id: 1, completed: false })
    })
  }

  async down() {
    this.schema.dropTable('admin_bootstrap')
    this.schema.alterTable('users', (table) => {
      table.dropColumn('is_admin')
    })
  }
}
