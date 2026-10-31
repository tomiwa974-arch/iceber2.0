/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  TRUSTED_PROXY: Env.schema.string.optional(),
  TRUSTED_PROXY_HOPS: Env.schema.number.optional(),
  RESTAURANT_LIVE: Env.schema.boolean.optional(),
  CSP_ENFORCE: Env.schema.boolean.optional(),
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Database (XAMPP MySQL locally; isolated SQLite for tests)
  DB_CONNECTION: Env.schema.enum.optional(['mysql', 'sqlite'] as const),
  DB_HOST: Env.schema.string.optional(),
  DB_PORT: Env.schema.number.optional(),
  DB_USER: Env.schema.string.optional(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string.optional(),
  DB_SQLITE_PATH: Env.schema.string.optional(),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),
  VAPID_PUBLIC_KEY: Env.schema.string.optional(),
  VAPID_PRIVATE_KEY: Env.schema.string.optional(),
  VAPID_SUBJECT: Env.schema.string.optional(),
  RESEND_API_KEY: Env.schema.string.optional(),
  BOOKING_EMAIL_FROM: Env.schema.string.optional(),
  TERMII_API_KEY: Env.schema.string.optional(),
  TERMII_BASE_URL: Env.schema.string.optional(),
  TERMII_SENDER_ID: Env.schema.string.optional(),
  STRIPE_SECRET_KEY: Env.schema.string.optional(),
  STRIPE_WEBHOOK_SECRET: Env.schema.string.optional(),
  PAYSTACK_SECRET_KEY: Env.schema.string.optional(),
})
