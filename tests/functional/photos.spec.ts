import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
  'base64'
)

test.group('Persistent uploaded photos', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())

  test('admin uploads persist in the database and are publicly served without a disk file', async ({
    client,
    assert,
  }) => {
    const admin = await User.create({
      fullName: 'Photo Admin',
      email: 'photos@example.test',
      password: 'Photo-admin-2026!',
      isAdmin: true,
    })
    const uploaded = await client
      .post('/api/admin/photos')
      .loginAs(admin)
      .withCsrfToken()
      .file('image', png, { filename: 'dish.png', contentType: 'image/png' })
    uploaded.assertStatus(201)
    const url = uploaded.body().url
    const row = await db.from('uploaded_photos').where('name', url.split('/').at(-1)).first()
    assert.deepEqual(Buffer.from(row.data), png)
    const photo = await client.get(url)
    photo.assertStatus(200)
    photo.assertHeader('content-type', 'image/png')
    photo.assertHeader('x-content-type-options', 'nosniff')
    const cached = await client.get(url).header('If-None-Match', photo.header('etag')!)
    cached.assertStatus(304)
  })

  test('invalid image bytes are rejected and missing photos return 404', async ({
    client,
    assert,
  }) => {
    const admin = await User.create({
      fullName: 'Photo Admin',
      email: 'invalid-photos@example.test',
      password: 'Photo-admin-2026!',
      isAdmin: true,
    })
    const rejected = await client
      .post('/api/admin/photos')
      .header('Accept', 'application/json')
      .redirects(0)
      .loginAs(admin)
      .withCsrfToken()
      .file('image', Buffer.from('not a photo'), {
        filename: 'dish.png',
        contentType: 'image/png',
      })
    rejected.assertStatus(422)
    const rows = await db.from('uploaded_photos')
    assert.lengthOf(rows, 0)
    const missing = await client.get('/uploads/menu/00000000-0000-0000-0000-000000000000.png').header('Accept', 'application/json').redirects(0)
    missing.assertStatus(404)
  })
})
