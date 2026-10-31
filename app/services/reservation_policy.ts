import { DateTime } from 'luxon'

export const GRACE_MINUTES = 30
export function cancellationQuote(
  row: { status: string; date: string; time: string; paid_amount?: number | null },
  now = Date.now()
) {
  const start = DateTime.fromISO(`${row.date}T${row.time}`, { zone: 'Africa/Lagos' }).toMillis()
  const canCancel = row.status === 'Pending' && now < reservationDeadline(row.date, row.time)
  const paidAmount = Number(row.paid_amount ?? 0)
  const feePercent = canCancel ? (now <= start - 2 * 3600000 ? 0 : 25) : 100
  const feeAmount = Math.round((paidAmount * feePercent) / 100)
  return {
    canCancel,
    paidAmount,
    feePercent,
    feeAmount,
    refundAmount: canCancel ? paidAmount - feeAmount : 0,
  }
}
export const EXPIRED_VISIBILITY_MS = 24 * 60 * 60 * 1000
export function reservationVisible(
  row: { status: string; date: string; time: string },
  now = Date.now()
) {
  return (
    effectiveStatus(row, now) !== 'Expired' ||
    now < reservationDeadline(row.date, row.time) + EXPIRED_VISIBILITY_MS
  )
}
export function reservationDeadline(date: string, time: string) {
  return DateTime.fromISO(`${date}T${time}`, { zone: 'Africa/Lagos' })
    .plus({ minutes: GRACE_MINUTES })
    .toMillis()
}
export function effectiveStatus(
  row: { status: string; date: string; time: string },
  now = Date.now()
) {
  return row.status === 'Pending' && reservationDeadline(row.date, row.time) <= now
    ? 'Expired'
    : row.status
}
