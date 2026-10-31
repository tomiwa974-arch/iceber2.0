import { BaseSchema } from '@adonisjs/lucid/schema'
import { initialMenu } from '../data/restaurant_menu.js'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('menu_items', (table) => {
      table.string('id', 100).primary()
      table.string('name', 100).notNullable()
      table.text('description').notNullable()
      table.decimal('price', 12, 2).notNullable()
      table.string('category', 100).notNullable()
      table.enum('kind', ['food', 'drink', 'dessert']).notNullable()
      table.string('image', 2048).notNullable().defaultTo('')
      table.boolean('popular').notNullable().defaultTo(false)
      table.boolean('available').notNullable().defaultTo(true)
      table.bigInteger('sort_order').notNullable()
      table.dateTime('created_at').notNullable()
      table.dateTime('updated_at').notNullable()
      table.index(['available', 'sort_order'])
      table.check('price >= 0')
    })

    this.schema.createTable('restaurant_settings', (table) => {
      table.integer('id').primary()
      table.text('payload', 'longtext').notNullable()
      table.dateTime('updated_at').notNullable()
      table.check('id = 1')
    })

    this.schema.createTable('reservations', (table) => {
      table.string('id', 36).primary()
      table.string('name', 100).notNullable()
      table.string('email', 254).notNullable()
      table.string('phone', 30).notNullable()
      table.string('date', 10).notNullable()
      table.string('time', 5).notNullable()
      table.integer('guests').unsigned().notNullable()
      table.text('special_requests').notNullable()
      table.enum('status', ['Pending', 'Confirmed', 'Cancelled']).notNullable().defaultTo('Pending')
      table.dateTime('created_at').notNullable()
      table.index(['status', 'date'])
      table.check('guests >= 1 AND guests <= 8')
    })

    this.schema.createTable('daily_specials', (table) => {
      table.string('id', 100).primary()
      table.string('title', 100).notNullable()
      table.text('caption').notNullable()
      table.string('image', 2048).notNullable().defaultTo('')
      table.decimal('price', 12, 2).notNullable()
      table.bigInteger('starts_at').notNullable()
      table.bigInteger('ends_at').notNullable()
      table.integer('duration_days').notNullable()
      table.index(['starts_at', 'ends_at'])
      table.check('price >= 0')
      table.check('duration_days >= 1 AND duration_days <= 36500')
      table.check('ends_at > starts_at')
    })

    this.schema.createTable('newsletter_subscribers', (table) => {
      table.string('id', 36).primary()
      table.string('email', 254).notNullable().unique()
      table.dateTime('created_at').notNullable()
    })

    this.defer(async (db) => {
      const now = new Date()
      await db.table('menu_items').multiInsert(
        initialMenu.map((item, index) => ({
          ...item,
          sort_order: index,
          created_at: now,
          updated_at: now,
        }))
      )
      await db.table('restaurant_settings').insert({
        id: 1,
        payload: JSON.stringify({
          heroTitle: 'Fine Dining',
          heroSubtitle: 'Reimagined',
          heroDescription:
            'Explore our menu, discover current specials and reserve a table for your next visit.',
          address: '',
          phone: '',
          email: '',
          weekdayHours: 'Monday - Thursday: 11AM - 10PM',
          weekendHours: 'Friday - Saturday: 11AM - 11PM',
          sundayHours: 'Sunday: 12PM - 9PM',
        }),
        updated_at: now,
      })
    })
  }

  async down() {
    this.schema.dropTable('newsletter_subscribers')
    this.schema.dropTable('daily_specials')
    this.schema.dropTable('reservations')
    this.schema.dropTable('restaurant_settings')
    this.schema.dropTable('menu_items')
  }
}
