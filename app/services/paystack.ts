import { Exception } from '@adonisjs/core/exceptions'
import env from '#start/env'

export type PaystackTransaction = {
  status: string
  reference: string
  amount: number
  currency: string
  id: number | string
  customer: { email: string }
  domain?: string
}
export type PaystackRefund = {
  id: number | string
  amount: number
  currency: string
  status: string
  merchant_note?: string
}
export default class Paystack {
  configured() {
    return /^sk_(test|live)_/.test(env.get('PAYSTACK_SECRET_KEY', ''))
  }
  async request<T>(path: string, body?: unknown): Promise<T> {
    if (!this.configured())
      throw new Exception(
        'Online payments are not configured yet. Please contact the restaurant.',
        { status: 503 }
      )
    try {
      const response = await fetch(`https://api.paystack.co${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          'Authorization': `Bearer ${env.get('PAYSTACK_SECRET_KEY')}`,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(12000),
      })
      const result = (await response.json()) as { status: boolean; data: T }
      if (!response.ok || !result.status) throw new Error('Provider unavailable')
      return result.data
    } catch {
      throw new Exception(
        'Paystack could not be reached. Your booking is not yet paid; please retry or contact the restaurant.',
        { status: 502 }
      )
    }
  }
  initialize(reference: string, email: string, amount: number) {
    return this.request<{ authorization_url: string; reference: string }>(
      '/transaction/initialize',
      {
        reference,
        email,
        amount,
        currency: 'NGN',
        callback_url: `${env.get('APP_URL').replace(/\/$/, '')}/payments/${reference}?returned=1`,
        metadata: { reservation_payment: reference },
      }
    )
  }
  verify(reference: string) {
    return this.request<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`)
  }
  refund(reference: string, amount: number, reservationId: string) {
    return this.request<PaystackRefund>('/refund', {
      transaction: reference,
      amount,
      currency: 'NGN',
      merchant_note: `iceberg-refund:${reservationId}`,
      customer_note: 'Reservation cancellation refund after the disclosed cancellation fee.',
    })
  }
  fetchRefund(id: string) {
    return this.request<PaystackRefund>(`/refund/${encodeURIComponent(id)}`)
  }
  refundsForTransaction(id: string) {
    return this.request<PaystackRefund[]>(
      `/refund?transaction=${encodeURIComponent(id)}&perPage=100`
    )
  }
}
