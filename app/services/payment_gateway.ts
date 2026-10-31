import Paystack from '#services/paystack'
import Stripe from '#services/stripe'
import type { PaymentGateway } from '#services/payment_types'
export type PaymentProvider = 'paystack' | 'stripe'
export function paymentGateway(provider: string): PaymentGateway {
  if (provider === 'stripe') return new Stripe()
  if (provider === 'paystack') return new Paystack()
  throw new Error('Unknown payment provider')
}
