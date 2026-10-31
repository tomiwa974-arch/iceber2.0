const currencies = ['NGN', 'USD', 'GBP', 'EUR', 'CAD', 'AUD', 'GHS', 'ZAR']
let cached: { rates: Record<string, number>; updatedAt: string; fetchedAt: number } | null = null
let pending: Promise<ReturnType<typeof result>> | null = null
let retryAt = 0
function result() {
  return {
    rates: cached?.rates ?? { NGN: 1 },
    updatedAt: cached?.updatedAt ?? null,
    stale: !cached || Date.now() - cached.fetchedAt > 24 * 3600000,
  }
}
export async function exchangeRates() {
  if ((cached && Date.now() - cached.fetchedAt < 24 * 3600000) || Date.now() < retryAt)
    return result()
  if (pending) return pending
  pending = (async () => {
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/NGN', {
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) throw new Error('Rates unavailable')
      const data = (await response.json()) as {
        result: string
        rates: Record<string, number>
        time_last_update_utc: string
      }
      if (
        data.result !== 'success' ||
        data.rates.NGN !== 1 ||
        !Number.isFinite(Date.parse(data.time_last_update_utc))
      )
        throw new Error('Invalid rates')
      const rates: Record<string, number> = { NGN: 1 }
      for (const code of currencies)
        if (Number.isFinite(data.rates[code]) && data.rates[code] > 0)
          rates[code] = data.rates[code]
      cached = {
        rates,
        updatedAt: new Date(data.time_last_update_utc).toISOString(),
        fetchedAt: Date.now(),
      }
    } catch {
      retryAt = Date.now() + 10 * 60000
    }
    return result()
  })()
  try {
    return await pending
  } finally {
    pending = null
  }
}
