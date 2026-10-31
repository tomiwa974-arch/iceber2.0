import { createHmac, timingSafeEqual } from 'node:crypto'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import type { PaymentGateway, PaymentTransaction, PaymentRefund } from '#services/payment_types'

type StripeSession = {
  id: string
  url: string
  client_reference_id: string
  amount_total: number
  currency: string
  payment_status: string
  payment_intent: string | null
  customer_details: { email: string } | null
  customer_email: string
  livemode: boolean
}
type StripeRefund = {
  id: string
  amount: number
  currency: string
  status: string
  metadata?: { reservation_id?: string }
}

export default class Stripe implements PaymentGateway {
  configured() {
    return /^sk_(test|live)_/.test(env.get('STRIPE_SECRET_KEY', ''))
  }

  async stripeRequest<T>(
    path: string,
    body?: Record<string, string>,
    idempotencyKey?: string
  ): Promise<T> {
    if (!this.configured())
      throw new Exception('Stripe payments are not configured.', { status: 503 })
    try {
      const response = await fetch(`https://api.stripe.com/v1${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          'Authorization': `Bearer ${env.get('STRIPE_SECRET_KEY')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        ...(body ? { body: new URLSearchParams(body).toString() } : {}),
        signal: AbortSignal.timeout(12000),
      })
      const result = (await response.json()) as {
        error?: { type?: string; code?: string; param?: string }
      }
      if (!response.ok) {
        const errorType = String(result.error?.type ?? '')
        const code = String(result.error?.code ?? '')
        const parameter = String(result.error?.param ?? '')
        // Never log the raw provider response: it may contain credentials or customer data.
        logger.warn(
          {
            provider: 'stripe',
            status: response.status,
            code: /^[a-z_]{1,80}$/.test(code) ? code : undefined,
            parameter: /^[a-z_\[\]0-9]{1,100}$/.test(parameter) ? parameter : undefined,
          },
          'Stripe rejected an API request'
        )
        const message =
          errorType === 'idempotency_error'
            ? 'This checkout cannot be reopened after a configuration change. Check any previous payment, then start a new reservation or contact the restaurant.'
            : response.status === 401 || response.status === 403
              ? 'Stripe account access needs attention. Please contact the restaurant.'
              : parameter.includes('currency')
                ? 'Stripe cannot accept this checkout currency with the current account settings. Please contact the restaurant.'
                : 'Stripe rejected the checkout settings. Please contact the restaurant; do not pay again if you already attempted payment.'
        throw new Exception(message, { status: 502 })
      }
      return result as T
    } catch (error) {
      if (error instanceof Exception) throw error
      throw new Exception(
        'Stripe could not confirm this request. Check payment status before trying again.',
        { status: 502 }
      )
    }
  }

  async initialize(reference: string, email: string, amount: number) {
    const receipt = `${env.get('APP_URL').replace(/\/$/, '')}/payments/${reference}`
    const session = await this.stripeRequest<StripeSession>(
      '/checkout/sessions',
      {
        'mode': 'payment',
        'client_reference_id': reference,
        'customer_email': email,
        'success_url': `${receipt}?returned=1`,
        'cancel_url': receipt,
        'line_items[0][price_data][currency]': 'ngn',
        'line_items[0][price_data][unit_amount]': String(amount),
        'line_items[0][price_data][product_data][name]': 'Table reservation fee',
        'line_items[0][quantity]': '1',
        'metadata[reservation_payment]': reference,
        'payment_intent_data[metadata][reservation_payment]': reference,
      },
      `iceberg-checkout-${reference}`
    )
    if (session.client_reference_id !== reference || !session.id.startsWith('cs_'))
      throw new Exception('Stripe checkout did not match this reservation.', { status: 502 })
    return { reference, authorization_url: session.url, session_id: session.id }
  }

  async verify(reference: string): Promise<PaymentTransaction> {
    const payment = await db
      .from('reservation_payments')
      .where('reference', reference)
      .where('provider', 'stripe')
      .first()
    if (!payment?.checkout_session_id)
      return {
        status: 'pending',
        reference,
        amount: 0,
        currency: 'NGN',
        id: '',
        customer: { email: '' },
      }
    const session = await this.stripeRequest<StripeSession>(
      `/checkout/sessions/${encodeURIComponent(payment.checkout_session_id)}`
    )
    if (
      session.id !== payment.checkout_session_id ||
      session.livemode !== env.get('STRIPE_SECRET_KEY', '').startsWith('sk_live_')
    )
      throw new Exception('Stripe verification did not match this checkout.', { status: 409 })
    return {
      reference: session.client_reference_id,
      status: session.payment_status === 'paid' ? 'success' : 'pending',
      amount: session.amount_total,
      currency: session.currency.toUpperCase(),
      id: session.payment_intent ?? '',
      customer: { email: session.customer_email || session.customer_details?.email || '' },
    }
  }

  private refundResult(result: StripeRefund): PaymentRefund {
    return {
      id: result.id,
      amount: result.amount,
      currency: result.currency.toUpperCase(),
      status:
        (
          {
            succeeded: 'processed',
            pending: 'pending',
            requires_action: 'needs-attention',
            failed: 'failed',
            canceled: 'failed',
          } as Record<string, string>
        )[result.status] ?? 'unknown',
      merchant_note: `iceberg-refund:${result.metadata?.reservation_id ?? ''}`,
    }
  }
  async refund(reference: string, amount: number, reservationId: string) {
    const payment = await db
      .from('reservation_payments')
      .where('reference', reference)
      .where('provider', 'stripe')
      .first()
    if (!payment?.provider_id?.startsWith('pi_')) throw new Error('Original Stripe payment missing')
    return this.refundResult(
      await this.stripeRequest<StripeRefund>(
        '/refunds',
        {
          'payment_intent': payment.provider_id,
          'amount': String(amount),
          'metadata[reservation_id]': reservationId,
        },
        `iceberg-refund-${reference}`
      )
    )
  }
  async fetchRefund(id: string) {
    return this.refundResult(
      await this.stripeRequest<StripeRefund>(`/refunds/${encodeURIComponent(id)}`)
    )
  }
  async refundsForTransaction(id: string) {
    const result = await this.stripeRequest<{ data: StripeRefund[] }>(
      `/refunds?payment_intent=${encodeURIComponent(id)}&limit=100`
    )
    return result.data.map((refund) => this.refundResult(refund))
  }

  validSignature(raw: string, signature: string, now = Date.now()) {
    const secret = env.get('STRIPE_WEBHOOK_SECRET', '')
    const parts = signature.split(',').map((part) => part.trim().split('='))
    const timestamp = parts.find(([key]) => key === 't')?.[1] ?? ''
    if (!secret || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300)
      return false
    const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest()
    return parts.some(
      ([key, value]) =>
        key === 'v1' &&
        /^[a-f0-9]{64}$/i.test(value ?? '') &&
        timingSafeEqual(expected, Buffer.from(value, 'hex'))
    )
  }
}
