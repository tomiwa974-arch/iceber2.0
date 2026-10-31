import { test } from '@japa/runner'
import { rejects } from 'node:assert/strict'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { BookingMessageGateway, type BookingMessage } from '#services/booking_messages'
import EmailVerification, { emailProof, validEmailProof } from '#services/email_verification'
import { EmailDomain } from '#services/email_domain'
import { adminSetupValidator, adminLoginValidator } from '#validators/admin'
import { reservationValidator } from '#validators/restaurant'
import { seedTestTable, testTableId } from '../helpers/booking_fixture.js'

class MailGateway extends BookingMessageGateway {
  sent: BookingMessage[] = []
  configured() {
    return true
  }
  async send(message: BookingMessage) {
    this.sent.push(message)
    return 'mock-id'
  }
}
test.group('Input security and email ownership', (group) => {
  group.each.setup(() => testUtils.db().wrapInGlobalTransaction())
  group.each.setup(seedTestTable)

  test('verification expires, binds to the email, rejects tampering and consumes a code once', async ({
    assert,
  }) => {
    const gateway = new MailGateway()
    const service = new EmailVerification(gateway)
    const email = 'verified@example.test'
    const { id } = await service.request(email, '127.0.0.50')
    const code = gateway.sent[0].body.match(/code is (\d{6})/)![1]
    assert.equal(gateway.sent.length, 1)
    const record = await db.from('email_verifications').where('id', id).first()
    assert.notEqual(record.code_hash, code)
    await rejects(() => service.verify(id, 'other@example.test', code))
    const { token } = await service.verify(id, email, code)
    assert.isTrue(validEmailProof(token, email))
    assert.isFalse(validEmailProof(token, 'other@example.test'))
    assert.isFalse(validEmailProof(`${token}x`, email))
    await rejects(() => service.verify(id, email, code))
    await rejects(() => service.request(email, '127.0.0.50'), /wait/)
    const expired = await service.request('expired@example.test', '127.0.0.51')
    await db
      .from('email_verifications')
      .where('id', expired.id)
      .update({ expires: Date.now() - 1 })
    await rejects(() => service.verify(expired.id, 'expired@example.test', '123456'))
  })

  test('only five code guesses are allowed', async () => {
    const gateway = new MailGateway()
    const service = new EmailVerification(gateway)
    const email = 'attempts@example.test'
    const { id } = await service.request(email, '127.0.0.52')
    for (let count = 0; count < 5; count++)
      await rejects(() => service.verify(id, email, '000000'), /Incorrect/)
    const code = gateway.sent[0].body.match(/code is (\d{6})/)![1]
    await rejects(() => service.verify(id, email, code), /too many/)
  })

  test('mail-domain checks reject missing mail records and do not mislabel DNS outages', async ({
    assert,
  }) => {
    assert.isTrue(
      await new EmailDomain(async () => [
        { exchange: 'mail.example.com', priority: 10 },
      ]).acceptsMail('a@example.com')
    )
    assert.isFalse(
      await new EmailDomain(async () => [{ exchange: '.', priority: 0 }]).acceptsMail(
        'a@example.com'
      )
    )
    assert.isFalse(await new EmailDomain(async () => []).acceptsMail('a@example.com'))
    await rejects(
      () =>
        new EmailDomain(async () => {
          throw new Error('DNS timeout')
        }).acceptsMail('a@example.com'),
      /try again/
    )
  })

  test('strong passwords apply to setup and login keeps existing passwords compatible', async ({
    assert,
  }) => {
    for (const password of [
      'short',
      'alllowercase123!',
      'ALLUPPERCASE123!',
      'NoNumbersHere!',
      'NoSymbolsHere123',
    ]) {
      await rejects(() =>
        adminSetupValidator.validate({
          fullName: 'Owner',
          email: 'setup@example.test',
          password,
          passwordConfirmation: password,
        })
      )
    }
    const valid = await adminSetupValidator.validate({
      fullName: 'Owner',
      email: 'setup@example.test',
      password: 'Strong-password-123!',
      passwordConfirmation: 'Strong-password-123!',
    })
    assert.equal(valid.password, 'Strong-password-123!')
    const legacy = await adminLoginValidator.validate({
      email: 'owner@example.test',
      password: 'legacy',
    })
    assert.equal(legacy.password, 'legacy')
    await rejects(() =>
      adminLoginValidator.validate({ email: 'x'.repeat(255) + '@example.com', password: 'x' })
    )
    await rejects(() =>
      adminLoginValidator.validate({ email: 'owner@example.test', password: 'x'.repeat(129) })
    )
  })

  test('reservation validation bounds input and a forged proof cannot create checkout', async ({
    client,
  }) => {
    const guest = {
      tableId: testTableId,
      name: "O'Connor",
      email: 'guest@example.test',
      phone: '08012345678',
      date: '2090-01-02',
      time: '12:00',
      guests: 2,
      acceptedTerms: true,
      verificationToken: emailProof('guest@example.test'),
    }
    for (const patch of [
      { name: 'x'.repeat(101) },
      { name: '<script>bad</script>' },
      { phone: '++++++++' },
      { phone: '12345678' },
      { specialRequests: 'x'.repeat(2001) },
      { guests: 2.5 },
    ]) {
      await rejects(() => reservationValidator.validate({ ...guest, ...patch }))
    }
    await reservationValidator.validate({ ...guest, phone: '+2348012345678' })
    const response = await client
      .post('/api/reservations')
      .withCsrfToken()
      .header('Accept', 'application/json')
      .json({ ...guest, verificationToken: 'forged' })
    response.assertStatus(422)
  })
})
