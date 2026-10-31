import { BaseSchema } from '@adonisjs/lucid/schema'
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('security_limits', (t) => {
      t.string('key', 64).primary()
      t.integer('count').notNullable()
      t.bigInteger('expires').notNullable().index()
    })
    this.schema.createTable('table_sessions', (t) => {
      t.string('table_id', 36).primary()
      t.string('token_hash', 64).notNullable()
      t.text('token').notNullable()
      t.bigInteger('expires').notNullable()
    })
    this.schema.createTable('admin_security', (t) => {
      t.integer('user_id').primary()
      t.text('secret').nullable()
      t.text('pending_secret').nullable()
      t.bigInteger('pending_until').notNullable().defaultTo(0)
      t.text('recovery_hashes').nullable()
      t.bigInteger('last_step').notNullable().defaultTo(-1)
      t.integer('session_version').notNullable().defaultTo(0)
    })
    this.schema.alterTable('reservation_payments', (t) => {
      t.string('guest_email', 254).nullable().index()
      t.string('ip_hash', 64).nullable().index()
    })
    this.schema.alterTable('email_verifications', (t) => {
      t.string('purpose', 20).notNullable().defaultTo('booking')
      t.string('resource', 36).notNullable().defaultTo('')
      t.boolean('authorization_used').notNullable().defaultTo(false)
    })
  }
  async down() {
    this.schema.dropTable('security_limits')
    this.schema.dropTable('table_sessions')
    this.schema.dropTable('admin_security')
    this.schema.alterTable('reservation_payments', (t) => t.dropColumns('guest_email', 'ip_hash'))
    this.schema.alterTable('email_verifications', (t) =>
      t.dropColumns('purpose', 'resource', 'authorization_used')
    )
  }
}
