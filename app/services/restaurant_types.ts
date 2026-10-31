export type MenuItem = {
  id: string
  name: string
  description: string
  price: number
  category: string
  kind: 'food' | 'drink' | 'dessert'
  image: string
  popular: boolean
  available: boolean
}

export type Reservation = {
  paymentReference?: string | null
  paidAmount?: number | null
  tableId?: string | null
  tableName?: string | null
  endTime?: string
  id: string
  name: string
  email: string
  phone: string
  date: string
  time: string
  guests: string
  specialRequests: string
  status: 'Pending' | 'Confirmed' | 'Cancelled' | 'Expired'
  cancellationReason?: string
  arrivedAt?: string | null
  expiresAt?: number
  createdAt: string
}

export type RestaurantSettings = {
  heroTitle: string
  heroSubtitle: string
  heroDescription: string
  address: string
  phone: string
  email: string
  weekdayHours: string
  weekendHours: string
  sundayHours: string
}
