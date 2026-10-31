import { currencyCodes, selectCurrency, useCurrency } from '~/lib/currency'

export default function CurrencySelector() {
  const currency = useCurrency()
  return (
    <details className="relative text-sm text-gray-800">
      <summary
        className="cursor-pointer list-none rounded-full border border-gray-300 bg-white px-3 py-2"
        aria-label="Change display currency"
      >
        {currency.code} ▾
      </summary>
      <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-gray-200 bg-white p-4 shadow-xl z-50">
        <label className="block font-medium">
          Display currency
          <select
            aria-label="Display currency"
            value={currency.preference}
            onChange={(event) => selectCurrency(event.target.value)}
            className="mt-2 block w-full rounded-lg border border-gray-300 p-2"
          >
            <option value="auto">Auto · device region</option>
            {currencyCodes.map((code) => (
              <option key={code} value={code} disabled={!currency.rates[code]}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-3 text-xs text-gray-500">
          Converted prices are estimates. Payments are charged in NGN; your bank sets the final
          conversion.
        </p>
        {currency.loading ? (
          <p className="mt-2 text-xs" role="status">
            Loading exchange rates...
          </p>
        ) : currency.updatedAt ? (
          <p className="mt-2 text-xs">
            Rates updated {new Date(currency.updatedAt).toLocaleDateString()}
            {currency.stale ? ' · cached rates' : ''}.
          </p>
        ) : (
          <p className="mt-2 text-xs">
            Conversion is currently unavailable. Prices are shown in NGN.
          </p>
        )}
        <a
          href="https://www.exchangerate-api.com"
          target="_blank"
          rel="noreferrer"
          className="mt-2 block text-xs underline"
        >
          Rates by ExchangeRate-API
        </a>
      </div>
    </details>
  )
}
