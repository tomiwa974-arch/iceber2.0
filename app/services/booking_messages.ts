import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { RESERVATION_TERMS, TERMS_VERSION } from '../../shared/reservation_terms.js'

export type BookingMessage = { id: string; channel: string; recipient: string; body: string }

export class BookingMessageGateway {
  configured(channel: string) {
    return channel === 'email'
      ? Boolean(env.get('RESEND_API_KEY') && env.get('BOOKING_EMAIL_FROM'))
      : Boolean(
          env.get('TERMII_API_KEY') && env.get('TERMII_BASE_URL') && env.get('TERMII_SENDER_ID')
        )
  }

  async send(message: BookingMessage): Promise<string> {
    let response: Response
    if (message.channel === 'email') {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.get('RESEND_API_KEY')}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': message.id,
        },
        body: JSON.stringify({
          from: env.get('BOOKING_EMAIL_FROM'),
          to: [message.recipient],
          subject: 'IceBerg reservation confirmation',
          text: message.body,
        }),
        signal: AbortSignal.timeout(15000),
      })
    } else {
      const base = new URL(env.get('TERMII_BASE_URL')!)
      if (
        base.protocol !== 'https:' ||
        !(base.hostname === 'termii.com' || base.hostname.endsWith('.termii.com'))
      )
        throw new Error('Invalid SMS endpoint')
      let phone = message.recipient.replace(/[^\d+]/g, '')
      if (/^0\d{10}$/.test(phone)) phone = `234${phone.slice(1)}`
      phone = phone.replace(/^\+/, '')
      if (!/^[1-9]\d{7,14}$/.test(phone)) throw new Error('Invalid phone')
      response = await fetch(new URL('/api/sms/send', base), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: env.get('TERMII_API_KEY'),
          to: phone,
          from: env.get('TERMII_SENDER_ID'),
          sms: message.body,
          type: 'plain',
          channel: 'dnd',
        }),
        signal: AbortSignal.timeout(15000),
      })
    }
    const data = (await response.json()) as { id?: string; message_id?: string }
    const id = message.channel === 'email' ? data.id : data.message_id
    if (!response.ok || !id) throw new Error('Provider did not confirm acceptance')
    return id
  }
}

export default class BookingMessages {
  constructor(private gateway = new BookingMessageGateway()) {}

  static async enqueue(
    trx: TransactionClientContract,
    reservationId: string,
    payload: {
      email: string
      phone: string
      date: string
      time: string
      guests: number
      terms?: string[]
      termsVersion?: string
    },
    tableName: string
  ) {
    const body = `IceBerg booking confirmed\nBooking ID: ${reservationId}\nTable: ${tableName}\nDate: ${payload.date}\nStart: ${payload.time} WAT\nGuests: ${payload.guests}\nDining: 2 hours from scheduled start; staff cleanup: 10 minutes afterward\nPaid: NGN 30,000 (reservation fee only)\nManage: ${env.get('APP_URL')}/#reservations\nKeep your booking ID and use your booking email to find or cancel.\n\nReservation terms (${payload.termsVersion ?? TERMS_VERSION}):\n${(payload.terms ?? RESERVATION_TERMS).join('\n')}`
    await trx.table('booking_messages').insert(
      ['email', 'sms'].map((channel) => ({
        id: `${reservationId}-${channel}`,
        reservation_id: reservationId,
        channel,
        recipient: channel === 'email' ? payload.email : payload.phone,
        body,
        status: 'Queued',
        created_at: new Date(),
        updated_at: new Date(),
      }))
    )
  }

  async process() {
    // A crashed or timed-out submission may already have sent: never blindly resend SMS.
    await db
      .from('booking_messages')
      .where('status', 'Submitting')
      .where('updated_at', '<', new Date(Date.now() - 120000))
      .update({ status: 'NeedsReview', updated_at: new Date() })
    const rows = await db
      .from('booking_messages')
      .where('status', 'Queued')
      .orderBy('created_at')
      .limit(100)
    for (const row of rows) {
      if (!this.gateway.configured(row.channel)) continue
      const claimed = await db
        .from('booking_messages')
        .where('id', row.id)
        .where('status', 'Queued')
        .update({ status: 'Submitting', updated_at: new Date() })
      if (!claimed) continue
      try {
        const providerId = await this.gateway.send(row)
        await db
          .from('booking_messages')
          .where('id', row.id)
          .update({ status: 'Accepted', provider_id: providerId, updated_at: new Date() })
      } catch {
        await db
          .from('booking_messages')
          .where('id', row.id)
          .update({ status: 'NeedsReview', updated_at: new Date() })
      }
    }
  }
}
