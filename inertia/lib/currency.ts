import { useSyncExternalStore } from 'react'

export const currencyCodes = ['NGN', 'USD', 'GBP', 'EUR', 'CAD', 'AUD', 'GHS', 'ZAR']
const defaults = {
  loading: true,
  preference: 'auto',
  code: 'NGN',
  rates: { NGN: 1 } as Record<string, number>,
  updatedAt: null as string | null,
  stale: true,
}
let state = defaults
let started = false
const listeners = new Set<() => void>()
function publish(change: Partial<typeof state>) {
  state = { ...state, ...change }
  listeners.forEach((listener) => listener())
}
export function useCurrency() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => state,
    () => defaults
  )
}
export function inferCurrency(zone: string, region?: string) {
  if (zone === 'Africa/Lagos') return 'NGN'
  if (zone === 'Africa/Accra') return 'GHS'
  if (zone === 'Africa/Johannesburg') return 'ZAR'
  if (zone === 'Europe/London') return 'GBP'
  if (
    [
      'Europe/Paris',
      'Europe/Berlin',
      'Europe/Rome',
      'Europe/Madrid',
      'Europe/Amsterdam',
      'Europe/Dublin',
      'Europe/Lisbon',
      'Europe/Brussels',
      'Europe/Vienna',
      'Europe/Helsinki',
      'Europe/Athens',
    ].includes(zone)
  )
    return 'EUR'
  if (zone.startsWith('Australia/')) return 'AUD'
  if (
    [
      'America/Toronto',
      'America/Vancouver',
      'America/Edmonton',
      'America/Winnipeg',
      'America/Halifax',
    ].includes(zone)
  )
    return 'CAD'
  if (
    ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'].includes(zone)
  )
    return 'USD'
  if (region === 'CA') return 'CAD'
  if (region === 'US') return 'USD'
  const regional: Record<string, string> = { NG: 'NGN', GH: 'GHS', ZA: 'ZAR', GB: 'GBP', AU: 'AUD' }
  if (region && regional[region]) return regional[region]
  if (['FR', 'DE', 'ES', 'IT', 'NL', 'IE', 'PT', 'BE', 'AT', 'FI', 'GR'].includes(region ?? ''))
    return 'EUR'
  return 'NGN'
}
export function selectCurrency(preference: string) {
  if (preference !== 'auto' && !currencyCodes.includes(preference)) return
  let desired = preference
  if (preference === 'auto') {
    desired = inferCurrency(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      new Intl.Locale(navigator.language).region
    )
  }
  publish({ preference, code: state.rates[desired] ? desired : 'NGN' })
  try {
    localStorage.setItem('iceberg-currency', preference)
  } catch {
    /* Optional preference. */
  }
}
export async function startCurrency() {
  if (started) return
  started = true
  let preference = 'auto'
  try {
    preference = localStorage.getItem('iceberg-currency') ?? 'auto'
  } catch {
    /* Optional preference. */
  }
  try {
    const response = await fetch('/api/currency', { headers: { Accept: 'application/json' } })
    if (response.ok) publish(await response.json())
  } catch {
    /* Retain NGN prices if live conversion is unavailable. */
  }
  selectCurrency(preference)
  publish({ loading: false })
}
export function formatPrice(price: number) {
  const admin = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
  const code = admin ? 'NGN' : state.code
  return `${code === 'NGN' ? '' : '≈ '}${new Intl.NumberFormat('en-NG', { style: 'currency', currency: code, maximumFractionDigits: code === 'NGN' ? 0 : 2 }).format(price * (state.rates[code] ?? 1))}`
}
