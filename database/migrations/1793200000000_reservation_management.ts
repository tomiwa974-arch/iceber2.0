import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('reservations', (table) => {
      table.text('cancellation_reason').nullable()
      table.dateTime('arrived_at').nullable()
      table.dateTime('policy_accepted_at').nullable()
    })
    this.schema.createTable('admin_notifications', (table) => {
      table.string('id', 36).primary()
      table.string('reservation_id', 36).notNullable()
      table.string('message', 255).notNullable()
      table.dateTime('created_at').notNullable()
    })
    this.schema.createTable('admin_notification_reads', (table) => {
      table.integer('user_id').unsigned().notNullable()
      table.string('notification_id', 36).notNullable()
      table.primary(['user_id', 'notification_id'])
    })
    this.schema.createTable('admin_push_subscriptions', (table) => {
      table.string('id', 64).primary()
      table.integer('user_id').unsigned().notNullable()
      table.text('subscription').notNullable()
    })
  }

  async down() {
    this.schema.dropTable('admin_push_subscriptions')
    this.schema.dropTable('admin_notification_reads')
    this.schema.dropTable('admin_notifications')
    this.schema.alterTable('reservations', (table) => {
      table.dropColumns('cancellation_reason', 'arrived_at', 'policy_accepted_at')
    })
  }
}
