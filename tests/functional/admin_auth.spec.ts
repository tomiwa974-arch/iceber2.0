import { test } from '@japa/runner'
import User from '#models/user'
import testUtils from '@adonisjs/core/services/test_utils'

const credentials = {
  fullName: 'Owner',
  email: 'owner-auth@example.test',
  password: 'Owner-auth-password-2026!',
  isAdmin: true,
}

test.group('Administrator authentication', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('both sign-in routes reject wrong passwords and regular accounts without creating sessions', async ({
    client,
    assert,
  }) => {
    await User.create(credentials)
    const regular = await User.create({
      ...credentials,
      email: 'regular-auth@example.test',
      isAdmin: false,
    })

    for (const path of ['/admin/login', '/login']) {
      for (const input of [
        { email: credentials.email, password: 'Incorrect-password-2026!' },
        { email: regular.email, password: credentials.password },
      ]) {
        const denied = await client
          .post(path)
          .withCsrfToken()
          .json({ ...input, isAdmin: true, is_admin: true })
          .redirects(0)
        denied.assertStatus(302)
        assert.include(denied.header('location'), '/admin/login')
        denied.assertSessionMissing('auth_web')
        assert.equal(
          denied.flashMessage('inputErrorsBag').email,
          'The email or password is incorrect.'
        )
        const privateData = await client
          .get('/api/admin/restaurant')
          .header('Accept', 'application/json')
          .withSession(denied.session())
        privateData.assertStatus(401)
      }
    }
    await regular.refresh()
    assert.isFalse(regular.isAdmin)
  })

  test('both sign-in routes establish admin sessions and logout removes access', async ({
    client,
    assert,
  }) => {
    const admin = await User.create(credentials)
    for (const path of ['/admin/login', '/login']) {
      const signedIn = await client
        .post(path)
        .withCsrfToken()
        .json({ email: admin.email, password: credentials.password })
        .redirects(0)
      signedIn.assertStatus(302)
      assert.include(signedIn.header('location'), '/admin')
      signedIn.assertSession('auth_web', admin.id)
      signedIn.assertSessionMissing('password')
      signedIn.assertSessionMissing('isAdmin')
      signedIn.assertSessionMissing('is_admin')

      const privateData = await client
        .get('/api/admin/restaurant')
        .header('Accept', 'application/json')
        .withSession(signedIn.session())
      privateData.assertStatus(200)
      assert.notInclude(JSON.stringify(privateData.body()), credentials.password)
      assert.notInclude(JSON.stringify(privateData.body()), admin.password)
      assert.notProperty(privateData.body(), 'users')

      const signedOut = await client
        .post('/admin/logout')
        .withSession(signedIn.session())
        .withCsrfToken()
        .redirects(0)
      signedOut.assertStatus(302)
      assert.include(signedOut.header('location'), '/admin/login')
      signedOut.assertSessionMissing('auth_web')
      ;(
        await client
          .get('/api/admin/restaurant')
          .header('Accept', 'application/json')
          .withSession(signedOut.session())
      ).assertStatus(401)
    }
  })

  test('both sign-in routes require a CSRF token', async ({ client }) => {
    const admin = await User.create(credentials)
    for (const path of ['/admin/login', '/login']) {
      const denied = await client
        .post(path)
        .header('Accept', 'application/json')
        .json({ email: admin.email, password: credentials.password })
        .redirects(0)
      denied.assertStatus(419)
      denied.assertSessionMissing('auth_web')
    }
  })

  test('public signup cannot create an administrator or another account', async ({
    client,
    assert,
  }) => {
    const denied = await client
      .post('/signup')
      .withCsrfToken()
      .json({
        ...credentials,
        passwordConfirmation: credentials.password,
        is_admin: true,
      })
      .redirects(0)
    denied.assertStatus(403)
    denied.assertSessionMissing('auth_web')
    assert.isNull(await User.findBy('email', credentials.email))
  })
})
