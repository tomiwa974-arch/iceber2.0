export type PaymentTransaction = {
  status: string
  reference: string
  amount: number
  currency: string
  id: number | string
  customer: { email: string }
  domain?: string
}
export type PaymentRefund = {
  id: number | string
  amount: number
  currency: string
  status: string
  merchant_note?: string
}
export interface PaymentGateway {
  configured(): boolean
  initialize(
    reference: string,
    email: string,
    amount: number
  ): Promise<{ authorization_url: string; reference: string; session_id?: string }>
  verify(reference: string): Promise<PaymentTransaction>
  refund(reference: string, amount: number, reservationId: string): Promise<PaymentRefund>
  fetchRefund(id: string): Promise<PaymentRefund>
  refundsForTransaction(id: string): Promise<PaymentRefund[]>
}
