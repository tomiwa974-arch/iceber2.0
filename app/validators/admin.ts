import vine from '@vinejs/vine'

export const adminLoginValidator = vine.create({
  email: vine.string().trim().email().maxLength(254).toLowerCase(),
  password: vine.string().minLength(1).maxLength(128),
})

export const adminSetupValidator = vine.create({
  fullName: vine.string().trim().minLength(2).maxLength(100),
  email: vine
    .string()
    .trim()
    .email()
    .maxLength(254)
    .toLowerCase()
    .unique({ table: 'users', column: 'email' }),
  password: vine
    .string()
    .minLength(12)
    .maxLength(128)
    .regex(/^(?=[\s\S]*[a-z])(?=[\s\S]*[A-Z])(?=[\s\S]*[0-9])(?=[\s\S]*[^A-Za-z0-9\s])[\s\S]+$/),
  passwordConfirmation: vine.string().minLength(12).maxLength(128).sameAs('password'),
})
