import { paymentGateway } from '#services/payment_gateway'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { PaymentGateway, PaymentRefund } from '#services/payment_types'
import { Exception } from '@adonisjs/core/exceptions'

const stateMap: Record<string, string> = {
  'pending': 'Pending',
  'processing': 'Processing',
  'processed': 'Processed',
  'failed': 'Failed',
  'needs-attention': 'NeedsAttention',
}
export function refundView(row: any) {
  return row
    ? {
        amount: row.amount,
        feeAmount: row.fee_amount,
        status: row.status,
        note: row.note ?? '',
        reference: row.payment_reference,
      }
    : null
}

export default class ReservationRefunds {
  constructor(private gateway?: PaymentGateway) {}
  private async forPayment(reference: string) {
    if (this.gateway) return this.gateway
    const payment = await db.from('reservation_payments').where('reference', reference).first()
    return paymentGateway(payment?.provider ?? 'paystack')
  }

  async queue(trx: TransactionClientContract, reservation: any, amount: number, feeAmount: number) {
    if (!reservation.payment_reference || amount <= 0) return
    const payment = await trx
      .from('reservation_payments')
      .where('reference', reservation.payment_reference)
      .where('reservation_id', reservation.id)
      .where('status', 'Paid')
      .forUpdate()
      .first()
    if (!payment || amount + feeAmount !== payment.amount)
      throw new Exception(
        'The original payment needs staff review before a refund can be requested.',
        { status: 409 }
      )
    await trx
      .table('reservation_refunds')
      .insert({
        payment_reference: reservation.payment_reference,
        reservation_id: reservation.id,
        amount,
        fee_amount: feeAmount,
        status: 'Queued',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict('payment_reference')
      .ignore()
  }

  async submit(reference: string) {
    const gateway = await this.forPayment(reference)
    if (!gateway.configured()) return
    // Persist the claim before calling the provider. Concurrent requests cannot issue
    // the refund twice. An uncertain network response must be reconciled, never retried blind.
    const claimed = await db
      .from('reservation_refunds')
      .where('payment_reference', reference)
      .where('status', 'Queued')
      .update({ status: 'Submitting', updated_at: new Date() })
    if (!claimed) return
    const row = await db.from('reservation_refunds').where('payment_reference', reference).first()
    try {
      const result = await gateway.refund(reference, row.amount, row.reservation_id)
      await this.apply(reference, result)
    } catch {
      await db
        .from('reservation_refunds')
        .where('payment_reference', reference)
        .where('status', 'Submitting')
        .update({
          status: 'ReviewRequired',
          note: 'The refund request could not be confirmed. Staff must reconcile it with the original payment provider before retrying.',
          updated_at: new Date(),
        })
    }
  }

  private async apply(reference: string, result: PaymentRefund) {
    await db.transaction(async (trx) => {
      const row = await trx
        .from('reservation_refunds')
        .where('payment_reference', reference)
        .forUpdate()
        .first()
      if (!row || row.status === 'Processed') return
      if (
        !result.id ||
        Number(result.amount) !== row.amount ||
        result.currency !== 'NGN' ||
        !stateMap[result.status] ||
        (row.provider_id && String(result.id) !== row.provider_id)
      ) {
        await trx.from('reservation_refunds').where('payment_reference', reference).update({
          status: 'ReviewRequired',
          note: 'The provider refund did not match the recorded amount. Staff review required.',
          updated_at: new Date(),
        })
        return
      }
      // Do not let an older pending response undo a newer processing webhook.
      if (row.status === 'Processing' && result.status === 'pending') return
      await trx
        .from('reservation_refunds')
        .where('payment_reference', reference)
        .update({
          provider_id: String(result.id),
          status: stateMap[result.status],
          ...(result.status === 'processed' ? { processed_at: new Date() } : {}),
          updated_at: new Date(),
          note:
            result.status === 'needs-attention'
              ? 'The payment provider needs additional information. Please contact the restaurant.'
              : result.status === 'failed'
                ? 'Refund processing failed. The restaurant must review it with the original payment provider.'
                : '',
        })
    })
  }

  async reconcile(reference: string) {
    const row = await db.from('reservation_refunds').where('payment_reference', reference).first()
    const gateway = await this.forPayment(reference)
    if (!row || row.status === 'Processed' || !gateway.configured()) return
    if (row.status === 'Queued') return this.submit(reference)
    if (row.provider_id) return this.apply(reference, await gateway.fetchRefund(row.provider_id))
    const payment = await db.from('reservation_payments').where('reference', reference).first()
    if (!payment?.provider_id) return
    const results = await gateway.refundsForTransaction(payment.provider_id)
    const matching = results.filter(
      (result) =>
        result.merchant_note === `iceberg-refund:${row.reservation_id}` &&
        Number(result.amount) === row.amount
    )
    if (matching.length === 1) await this.apply(reference, matching[0])
  }
}
