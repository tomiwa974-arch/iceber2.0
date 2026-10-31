import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import { createFirstAdmin } from '#services/admin_bootstrap'
import ace from '@adonisjs/core/services/ace'
import AdminSetup from '../../commands/admin_setup.js'

const details = {
  fullName: 'Production Owner',
  email: 'bootstrap-owner@example.test',
  password: 'Owner-bootstrap-2026!',
  passwordConfirmation: 'Owner-bootstrap-2026!',
}

test.group('Private administrator bootstrap', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('environment setup creates once and safely skips on restart without changing credentials', async ({
    assert,
  }) => {
    const previous = {
      name: process.env.ADMIN_SETUP_NAME,
      email: process.env.ADMIN_SETUP_EMAIL,
      password: process.env.ADMIN_SETUP_PASSWORD,
    }
    try {
      await db.from('admin_bootstrap').where('id', 1).update({ completed: false })
      process.env.ADMIN_SETUP_NAME = details.fullName
      process.env.ADMIN_SETUP_EMAIL = details.email
      delete process.env.ADMIN_SETUP_PASSWORD
      const missing = await ace.create(AdminSetup, ['--from-env'])
      await missing.run()
      assert.equal(missing.exitCode, 1)
      assert.isNull(await User.findBy('email', details.email))

      process.env.ADMIN_SETUP_PASSWORD = details.password
      const first = await ace.create(AdminSetup, ['--from-env'])
      await first.run()
      assert.notEqual(first.exitCode, 1)
      const admin = await User.verifyCredentials(details.email, details.password)
      assert.isTrue(admin.isAdmin)

      process.env.ADMIN_SETUP_PASSWORD = 'Changed-password-2026!'
      const repeated = await ace.create(AdminSetup, ['--from-env'])
      await repeated.run()
      assert.notEqual(repeated.exitCode, 1)
      const original = await User.verifyCredentials(details.email, details.password)
      assert.equal(original.id, admin.id)
    } finally {
      for (const [key, value] of Object.entries({
        ADMIN_SETUP_NAME: previous.name,
        ADMIN_SETUP_EMAIL: previous.email,
        ADMIN_SETUP_PASSWORD: previous.password,
      })) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })

  test('creates an administrator with a hashed password and closes setup permanently', async ({
    assert,
  }) => {
    await db.from('admin_bootstrap').where('id', 1).update({ completed: false })
    const admin = await createFirstAdmin(details)
    assert.exists(admin)
    assert.isTrue(admin!.isAdmin)
    assert.notEqual(admin!.password, details.password)
    const signedIn = await User.verifyCredentials(details.email, details.password)
    assert.equal(signedIn.id, admin!.id)
    const bootstrap = await db.from('admin_bootstrap').where('id', 1).first()
    assert.isTrue(Boolean(bootstrap.completed))
    await admin!.delete()
    assert.isNull(await createFirstAdmin(details))
  })

  test('refuses another administrator even if the bootstrap flag is open', async ({ assert }) => {
    await db.from('admin_bootstrap').where('id', 1).update({ completed: false })
    await User.create({
      fullName: details.fullName,
      email: 'existing-admin@example.test',
      password: details.password,
      isAdmin: true,
    })
    assert.isNull(await createFirstAdmin(details))
    assert.isNull(await User.findBy('email', details.email))
  })

  test('rejects weak or mismatched passwords without completing setup', async ({ assert }) => {
    await db.from('admin_bootstrap').where('id', 1).update({ completed: false })
    for (const input of [
      { ...details, password: 'weak', passwordConfirmation: 'weak' },
      { ...details, passwordConfirmation: 'Different-password-2026!' },
    ]) {
      await assert.rejects(() => createFirstAdmin(input))
    }
    assert.isNull(await User.findBy('email', details.email))
    const bootstrap = await db.from('admin_bootstrap').where('id', 1).first()
    assert.isFalse(Boolean(bootstrap.completed))
  })
})
