import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('uploaded_photos', (table) => {
      table.string('name', 80).primary()
      table.string('content_type', 32).notNullable()
      // MEDIUMBLOB holds the existing 10 MB upload limit; SQLite uses BLOB.
      table
        .specificType('data', this.db.dialect.name === 'mysql' ? 'MEDIUMBLOB' : 'BLOB')
        .notNullable()
    })
  }

  async down() {
    this.schema.dropTable('uploaded_photos')
  }
}
