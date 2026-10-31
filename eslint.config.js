import { configApp } from '@adonisjs/eslint-config'
import { react } from '@adonisjs/eslint-config/react'

export default configApp(...react, {
  files: ['inertia/**/*.{ts,tsx}'],
  rules: {
    // This module contains only shared time-slot arithmetic and type imports.
    '@adonisjs/no-backend-import-in-frontend': [
      'error',
      { allowed: ['../../shared/booking_slots', '../../shared/reservation_terms'] },
    ],
  },
})
