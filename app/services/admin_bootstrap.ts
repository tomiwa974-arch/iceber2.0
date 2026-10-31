import User from '#models/user'
import { adminSetupValidator } from '#validators/admin'
import db from '@adonisjs/lucid/services/db'

export async function createFirstAdmin(input: unknown) {
  const { fullName, email, password } = await adminSetupValidator.validate(input)

  return db.transaction(async (trx) => {
    const bootstrap = await trx.from('admin_bootstrap').where('id', 1).forUpdate().first()
    if (!bootstrap || bootstrap.completed) return null
    if (await User.query({ client: trx }).where('is_admin', true).first()) return null

    const admin = await User.create({ fullName, email, password, isAdmin: true }, { client: trx })
    await trx.from('admin_bootstrap').where('id', 1).update({ completed: true })
    return admin
  })
}
