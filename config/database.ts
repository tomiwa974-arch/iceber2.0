import app from '@adonisjs/core/services/app'
import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

export default defineConfig({
  connection: env.get('DB_CONNECTION', 'mysql'),
  connections: {
    mysql: {
      client: 'mysql2',
      connection: {
        host: env.get('DB_HOST', '127.0.0.1'),
        port: env.get('DB_PORT', 3306),
        user: env.get('DB_USER', 'root'),
        password: env.get('DB_PASSWORD', ''),
        database: env.get('DB_DATABASE', 'iceberg'),
        charset: 'utf8mb4',
      },
      migrations: { naturalSort: true, paths: ['database/migrations'] },
      schemaGeneration: { enabled: true, rulesPaths: ['./database/schema_rules.js'] },
    },
    sqlite: {
      client: 'better-sqlite3',
      connection: { filename: app.makePath(env.get('DB_SQLITE_PATH', 'tmp/test.sqlite3')) },
      useNullAsDefault: true,
      migrations: { naturalSort: true, paths: ['database/migrations'] },
      schemaGeneration: { enabled: false },
    },
  },
})
