import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('newsletter_subscribers', (table) => {
      // Existing subscriptions have no recorded consent; do not invent evidence.
      table.string('consent_version', 40).nullable()
    })
    this.defer(async (db) => {
      const row = await db.from('restaurant_settings').where('id', 1).first()
      if (!row) return
      const settings = JSON.parse(row.payload)
      if (
        settings.heroDescription ===
        'Experience culinary excellence in an atmosphere of refined elegance. Our Michelin-starred chefs create unforgettable dining experiences using the finest ingredients.'
      ) {
        settings.heroDescription =
          'Explore our menu, discover current specials and reserve a table for your next visit.'
      }
      for (const [key, sample] of Object.entries({
        address: '123 NTA road, Asaba, Delta State, Nigeria',
        phone: '07079621137',
        email: 'info@icebergrestaurant.com',
      })) {
        if (settings[key] === sample) settings[key] = ''
      }
      await db
        .from('restaurant_settings')
        .where('id', 1)
        .update({ payload: JSON.stringify(settings) })
    })
  }

  async down() {
    this.schema.alterTable('newsletter_subscribers', (table) => table.dropColumn('consent_version'))
    // Do not restore invented claims or sample contact details.
  }
}
