import { BaseSchema } from '@adonisjs/lucid/schema'
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('email_verifications', (table) => {
      table.string('id', 36).primary()
      table.string('email', 254).notNullable().index()
      table.string('ip_hash', 64).notNullable().index()
      table.string('code_hash', 64).notNullable()
      table.integer('attempts').notNullable().defaultTo(0)
      table.boolean('used').notNullable().defaultTo(false)
      table.bigInteger('expires').notNullable()
      table.bigInteger('created').notNullable().index()
    })
  }
  async down() {
    this.schema.dropTable('email_verifications')
  }
}
