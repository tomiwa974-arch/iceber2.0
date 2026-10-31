import vine from '@vinejs/vine'

const itemId = () =>
  vine
    .string()
    .trim()
    .minLength(1)
    .maxLength(100)
    .regex(/^[a-zA-Z0-9_-]+$/)
const price = () => vine.number().min(0).max(9999999999.99).decimal([0, 2])
// Photos are uploaded separately; never accept executable/data URL content in a menu entry.
const image = () =>
  vine
    .string()
    .trim()
    .maxLength(2048)
    .regex(/^(?:https?:\/\/[^\s]+|\/uploads\/menu\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp))$/i)
    .nullable()
    .optional()

export const menuItemValidator = vine.create({
  id: itemId(),
  name: vine.string().trim().minLength(1).maxLength(100),
  description: vine.string().trim().minLength(1).maxLength(5000),
  price: price(),
  category: vine.string().trim().minLength(1).maxLength(100),
  kind: vine.enum(['food', 'drink', 'dessert']),
  image: image(),
  popular: vine.boolean(),
  available: vine.boolean(),
})

export const reservationValidator = vine.create({
  verificationToken: vine.string().maxLength(1024),
  tableId: vine.string().uuid(),
  acceptedTerms: vine.accepted(),
  name: vine
    .string()
    .trim()
    .minLength(2)
    .maxLength(100)
    .regex(/^[^<>\p{Cc}]+$/u),
  email: vine.string().trim().email().maxLength(254).toLowerCase(),
  phone: vine
    .string()
    .trim()
    .minLength(8)
    .maxLength(25)
    .regex(/^(?:0[789][01][0-9]{8}|\+[1-9][0-9]{7,14})$/),
  date: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: vine.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  guests: vine.number().withoutDecimals().min(1).max(8),
  specialRequests: vine.string().trim().maxLength(2000).nullable().optional(),
})

export const reservationStatusValidator = vine.create({
  status: vine.enum(['Pending', 'Confirmed', 'Cancelled']),
})

export const restaurantSettingsValidator = vine.create({
  heroTitle: vine.string().trim().minLength(1).maxLength(150),
  heroSubtitle: vine.string().trim().minLength(1).maxLength(150),
  heroDescription: vine.string().trim().minLength(1).maxLength(2000),
  address: vine.string().trim().minLength(1).maxLength(500),
  phone: vine.string().trim().minLength(7).maxLength(30),
  email: vine.string().trim().email().maxLength(254),
  weekdayHours: vine.string().trim().minLength(1).maxLength(200),
  weekendHours: vine.string().trim().minLength(1).maxLength(200),
  sundayHours: vine.string().trim().minLength(1).maxLength(200),
})

export const dailySpecialValidator = vine.create({
  id: itemId().optional(),
  title: vine.string().trim().minLength(1).maxLength(100),
  caption: vine.string().trim().maxLength(2000).nullable().optional(),
  image: image(),
  price: price(),
  durationDays: vine.number().withoutDecimals().min(1).max(36500),
})

export const moveSpecialValidator = vine.create({
  direction: vine.enum([-1, 1]),
})

export const newsletterValidator = vine.create({
  consent: vine.accepted(),
  email: vine.string().trim().email().maxLength(254).toLowerCase(),
})

export const menuPhotoValidator = vine.create({
  image: vine.file({ size: '10mb', extnames: ['jpg', 'jpeg', 'png', 'webp'] }),
})

export const reservationLookupValidator = vine.create({
  id: vine.string().trim().uuid(),
  email: vine.string().trim().email().maxLength(254).toLowerCase(),
})
export const reservationCancelValidator = vine.create({
  verificationToken: vine.string().maxLength(2000),
  expectedRefundAmount: vine.number().withoutDecimals().min(0).optional(),
  id: vine.string().trim().uuid(),
  email: vine.string().trim().email().maxLength(254).toLowerCase(),
  reason: vine.string().trim().minLength(3).maxLength(1000),
})
export const pushSubscriptionValidator = vine.create({
  endpoint: vine.string().trim().url().maxLength(2048),
  keys: vine.object({
    p256dh: vine.string().regex(/^[A-Za-z0-9_-]{87}$/),
    auth: vine.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }),
})

const bookingTime = () => vine.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
export const availabilityValidator = vine.create({
  date: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: bookingTime(),
  guests: vine.number().withoutDecimals().min(1).max(8),
})
export const tableCountValidator = vine.create({
  count: vine.number().withoutDecimals().min(0).max(200),
})
export const diningTableValidator = vine.create({
  name: vine.string().trim().maxLength(60).nullable().optional(),
  seats: vine.number().withoutDecimals().min(1).max(8),
  active: vine.boolean(),
})
export const bookingHoursValidator = vine.create({
  slotIntervalMinutes: vine.enum([15, 30, 60, 120]).optional(),
  hours: vine
    .array(
      vine.object({
        day: vine.number().withoutDecimals().min(1).max(7),
        open: bookingTime(),
        close: bookingTime(),
        closed: vine.boolean(),
      })
    )
    .fixedLength(7),
})
export const tableAssignmentValidator = vine.create({ tableId: vine.string().uuid() })
