import { beginRequest } from './request_activity'
import { useSyncExternalStore } from 'react'
import { useCurrency } from './currency'
export { formatPrice } from './currency'
import type { DailySpecial } from './specials'
import type { BookingConfiguration } from '../../app/services/booking_types'
export type {
  BookingConfiguration,
  BookingDay,
  DiningTable,
  TableAvailability,
} from '../../app/services/booking_types'

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
export type Subscriber = { id: string; email: string; createdAt: string }
export const initialSettings = {
  heroTitle: 'Fine Dining',
  heroSubtitle: 'Reimagined',
  heroDescription:
    'Explore our menu, discover current specials and reserve a table for your next visit.',
  address: '',
  phone: '',
  email: '',
  weekdayHours: 'Monday - Thursday: 11AM - 10PM',
  weekendHours: 'Friday - Saturday: 11AM - 11PM',
  sundayHours: 'Sunday: 12PM - 9PM',
}
export type RestaurantState = {
  live: boolean
  refunds: { amount: number; feeAmount: number; status: string; note: string; reference: string }[]
  paymentReviews: { reference: string; amount: number; reason: string; provider: string }[]
  booking: BookingConfiguration
  notifications: {
    id: string
    reservationId: string
    orderId?: string | null
    message: string
    createdAt: string
    read: boolean
  }[]
  specials: DailySpecial[]
  menu: MenuItem[]
  reservations: Reservation[]
  subscribers: Subscriber[]
  settings: typeof initialSettings
  loading: boolean
  loaded: boolean
  error: string
}
const defaults: RestaurantState = {
  live: false,
  refunds: [],
  paymentReviews: [],
  booking: {
    tables: [],
    hours: [],
    durationMinutes: 120,
    cleanupMinutes: 10,
    slotIntervalMinutes: 60,
  },
  notifications: [],
  menu: [],
  reservations: [],
  subscribers: [],
  settings: initialSettings,
  specials: [],
  loading: true,
  loaded: false,
  error: '',
}
let state = defaults
let adminScope = false
let revision = 0
let serverOffset = 0
let started = false
const listeners = new Set<() => void>()
function publish(change: Partial<RestaurantState>) {
  state = { ...state, ...change }
  listeners.forEach((listener) => listener())
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function useRestaurant() {
  useCurrency()
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => defaults
  )
}
export const restaurantNow = () => Date.now() + serverOffset

export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const endRequest = beginRequest(options.method)
  try {
    const headers = new Headers(options.headers)
    headers.set('Accept', 'application/json')
    if (options.body && !(options.body instanceof FormData))
      headers.set('Content-Type', 'application/json')
    if (options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase())) {
      const token = document.cookie
        .split('; ')
        .find((part) => part.startsWith('XSRF-TOKEN='))
        ?.slice(11)
      if (token) headers.set('X-XSRF-TOKEN', decodeURIComponent(token))
    }
    const response = await fetch(url, { ...options, headers, credentials: 'same-origin' })
    const payload = response.headers.get('content-type')?.includes('application/json')
      ? await response.json()
      : null
    if (!response.ok) {
      if (response.status === 401 && url.startsWith('/api/admin/')) {
        clearAdminData()
        window.location.assign('/admin/login')
      }
      const message =
        payload?.message ||
        payload?.errors?.[0]?.message ||
        (response.status === 419 || response.status === 403
          ? 'Your session has expired. Refresh the page and try again.'
          : 'The server could not save this change. Please try again.')
      throw Object.assign(new Error(message), { status: response.status })
    }
    return payload as T
  } finally {
    endRequest()
  }
}

type RestaurantResponse = Pick<
  RestaurantState,
  'menu' | 'settings' | 'specials' | 'booking' | 'live'
> & {
  refunds?: RestaurantState['refunds']
  paymentReviews?: RestaurantState['paymentReviews']
  notifications?: RestaurantState['notifications']
  reservations?: Reservation[]
  subscribers?: Subscriber[]
  serverTime?: number | string
}
export function clearAdminData() {
  revision++
  adminScope = false
  publish({ reservations: [], subscribers: [], notifications: [], paymentReviews: [], refunds: [] })
}
export async function refreshRestaurant() {
  const admin = /^\/admin\/?$/.test(window.location.pathname)
  if (admin !== adminScope) {
    adminScope = admin
    revision++
    publish({
      reservations: [],
      subscribers: [],
      notifications: [],
      paymentReviews: [],
      refunds: [],
      loading: true,
      loaded: false,
      error: '',
    })
  }
  publish({ loading: true, error: '' })
  const requestRevision = ++revision
  const requestTime = Date.now()
  try {
    const result = await apiRequest<RestaurantResponse>(
      admin ? '/api/admin/restaurant' : '/api/restaurant'
    )
    if (revision !== requestRevision || admin !== adminScope) return
    const serverTime =
      typeof result.serverTime === 'number'
        ? result.serverTime
        : Date.parse(result.serverTime ?? '')
    if (Number.isFinite(serverTime)) serverOffset = serverTime - (requestTime + Date.now()) / 2
    publish({
      live: result.live === true,
      menu: result.menu,
      booking: result.booking,
      settings: { ...initialSettings, ...result.settings },
      specials: result.specials,
      reservations: admin ? (result.reservations ?? []) : [],
      paymentReviews: admin ? (result.paymentReviews ?? []) : [],
      refunds: admin ? (result.refunds ?? []) : [],
      notifications: admin ? (result.notifications ?? []) : [],
      subscribers: admin ? (result.subscribers ?? []) : [],
      loading: false,
      loaded: true,
      error: '',
    })
  } catch (cause) {
    if (revision !== requestRevision || admin !== adminScope) return
    publish({
      loading: false,
      error:
        cause instanceof Error ? cause.message : 'Could not load the restaurant. Please retry.',
    })
  }
}
export function startRestaurantSync() {
  if (started) return
  started = true
  void refreshRestaurant()
  window.setInterval(() => {
    if (!document.hidden) void refreshRestaurant()
  }, 15_000)
  window.addEventListener('focus', () => {
    void refreshRestaurant()
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refreshRestaurant()
  })
}
async function mutate<T>(url: string, method: string, body?: unknown) {
  revision++
  const result = await apiRequest<T>(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  revision++
  return result
}
export async function uploadPhoto(image: string) {
  if (!image.startsWith('data:image/')) return image
  const photoResponse = await fetch(image)
  const blob = await photoResponse.blob()
  const form = new FormData()
  form.append(
    'image',
    blob,
    `menu-photo.${blob.type.split('/')[1] === 'jpeg' ? 'jpg' : blob.type.split('/')[1]}`
  )
  const result = await apiRequest<{ url: string }>('/api/admin/photos', {
    method: 'POST',
    body: form,
  })
  return result.url
}
export async function saveMenuItem(item: MenuItem) {
  if (!item.name.trim() || !item.category.trim() || !Number.isFinite(item.price) || item.price < 0)
    throw new Error('Enter a name, category and valid price.')
  const exists = state.menu.some((entry) => entry.id === item.id)
  const image = await uploadPhoto(item.image)
  const result = await mutate<{ item: MenuItem }>(
    exists ? `/api/admin/menu/${encodeURIComponent(item.id)}` : '/api/admin/menu',
    exists ? 'PUT' : 'POST',
    { ...item, image }
  )
  if (adminScope)
    publish({
      menu: exists
        ? state.menu.map((entry) => (entry.id === item.id ? result.item : entry))
        : [...state.menu, result.item],
    })
}
export async function deleteMenuItem(id: string) {
  await mutate(`/api/admin/menu/${encodeURIComponent(id)}`, 'DELETE')
  if (adminScope) publish({ menu: state.menu.filter((item) => item.id !== id) })
}
export async function saveSettings(settings: RestaurantState['settings']) {
  const result = await mutate<{ settings: RestaurantState['settings'] }>(
    '/api/admin/settings',
    'PUT',
    settings
  )
  if (adminScope) publish({ settings: result.settings })
}
export async function saveReservation(
  values: Omit<Reservation, 'id' | 'status' | 'createdAt'> & {
    acceptedTerms: boolean
    verificationToken: string
  }
) {
  const result = await apiRequest<{
    checkout: { reference: string; url: string }
  }>('/api/reservations', {
    method: 'POST',
    body: JSON.stringify(values),
  })
  return result.checkout
}
export async function subscribeNewsletter(email: string, consent: boolean) {
  await apiRequest('/api/newsletter', { method: 'POST', body: JSON.stringify({ email, consent }) })
}
export async function setReservationStatus(id: string, status: Reservation['status']) {
  const result = await mutate<{ reservation: Reservation }>(
    `/api/admin/reservations/${encodeURIComponent(id)}`,
    'PATCH',
    { status }
  )
  if (adminScope)
    publish({
      reservations: state.reservations.map((item) => (item.id === id ? result.reservation : item)),
    })
}
async function specialMutation(url: string, method: string, body?: unknown) {
  const result = await mutate<{ specials: DailySpecial[] }>(url, method, body)
  if (adminScope) publish({ specials: result.specials })
}
export async function createSpecial(
  draft: Pick<DailySpecial, 'title' | 'caption' | 'image' | 'price' | 'durationDays'>
) {
  await specialMutation('/api/admin/specials', 'POST', {
    ...draft,
    image: await uploadPhoto(draft.image),
  })
}
export async function deleteSpecial(id: string) {
  await specialMutation(`/api/admin/specials/${encodeURIComponent(id)}`, 'DELETE')
}
export async function moveSpecial(id: string, direction: -1 | 1) {
  await specialMutation(`/api/admin/specials/${encodeURIComponent(id)}/move`, 'POST', { direction })
}
export async function logoutAdmin() {
  await apiRequest('/admin/logout', { method: 'POST' })
  clearAdminData()
  window.location.assign('/admin/login')
}
