// Requests are fixed-window quotas shared across app processes through security_limits.
export const rateLimits = {
  dynamic: { limit: 240, windowMs: 60_000 },
  api: { limit: 120, windowMs: 60_000 },
  otherWrites: { limit: 30, windowMs: 60_000 },
  publicReads: { limit: 60, windowMs: 60_000 },
  availability: { limit: 30, windowMs: 60_000 },
  loginIp: { limit: 20, windowMs: 15 * 60_000 },
  loginFailures: { limit: 5, windowMs: 15 * 60_000 },
  mfaIp: { limit: 20, windowMs: 5 * 60_000 },
  mfaSession: { limit: 5, windowMs: 5 * 60_000 },
  emailSendIp: { limit: 20, windowMs: 60 * 60_000 },
  emailMinute: { limit: 1, windowMs: 60_000 },
  emailHour: { limit: 5, windowMs: 60 * 60_000 },
  emailVerifyIp: { limit: 30, windowMs: 60_000 },
  checkoutIp: { limit: 5, windowMs: 10 * 60_000 },
  checkoutEmail: { limit: 3, windowMs: 10 * 60_000 },
  bookingLookup: { limit: 10, windowMs: 60_000 },
  cancellation: { limit: 5, windowMs: 10 * 60_000 },
  paymentReference: { limit: 10, windowMs: 60_000 },
  newsletter: { limit: 5, windowMs: 60 * 60_000 },
  orderIp: { limit: 30, windowMs: 60_000 },
  orderSession: { limit: 10, windowMs: 60_000 },
  adminWrites: { limit: 60, windowMs: 60_000 },
  photoUploads: { limit: 10, windowMs: 60_000 },
  webhook: { limit: 300, windowMs: 60_000 },
} as const

export type RatePolicy = { limit: number; windowMs: number }
