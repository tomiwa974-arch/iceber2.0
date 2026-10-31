import DemoNotice from '~/components/demo_notice'
import { Head } from '@inertiajs/react'
import { useRestaurant } from '~/lib/restaurant_store'
import PolicyLinks from '~/components/policy_links'
import { RESERVATION_TERMS } from '../../shared/reservation_terms'

const titles = {
  privacy: 'Privacy policy',
  terms: 'Terms & Conditions',
  refunds: 'Refund policy',
  cookies: 'Cookies & browser storage',
}

export default function Policy({ policy }: { policy: keyof typeof titles }) {
  const { settings, loaded, live } = useRestaurant()
  return (
    <div className="restaurant min-h-screen bg-white text-gray-900">
      <Head title={titles[policy]} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-12">
        <DemoNotice />
        <a href="/" className="underline">
          Back to Iceberg
        </a>
        <h1 className="mt-8 text-4xl font-bold">{titles[policy]}</h1>
        <p className="my-4 text-gray-600">Updated 31 October 2026</p>
        <div className="space-y-5 leading-7">
          {policy === 'privacy' && (
            <>
              <h2 className="text-xl font-semibold">Information used by this website</h2>
              <p>
                Reservations use your name, email, phone number, party size, selected table and time
                to arrange your visit, verify your email, send booking messages and manage
                cancellations. Optional requests are shared with restaurant staff; include only
                details needed for your visit. Avoid medical history or information about other
                people.
              </p>
              <p>
                Orders use the name you enter, your table session, selected items and optional
                notes. Newsletter signup collects your email only and requires a separate choice;
                booking does not subscribe you.
              </p>
              <h2 className="text-xl font-semibold">Payments, providers and security</h2>
              <p>
                The selected payment provider (Paystack or Stripe) handles checkout on its own
                website. This app stores payment references, amounts, statuses and refund records;
                its checkout does not ask for your card number or PIN. Email and messaging providers
                receive contact details and messages needed for delivery. Hosting and infrastructure
                providers process requests and may keep security logs.
              </p>
              <p>
                External image hosts receive your network request when their images load. Currency
                rates are fetched by the server. No advertising pixels or analytics scripts were
                found in the source reviewed for this update.
              </p>
              <h2 className="text-xl font-semibold">Your choices and requests</h2>
              <p>
                Contact the restaurant below to request access, correction or deletion of your
                information, or to withdraw newsletter permission. Booking and payment information
                may still be needed for the service, disputes or legal recordkeeping. Newsletter
                withdrawal does not stop messages needed for an existing booking.
              </p>
              <p>
                The app does not currently apply automatic deletion schedules. Ask the restaurant
                about retention periods, its service providers and any international transfers
                before sharing information if these affect your decision.
              </p>
              <p>
                If you are in Nigeria, you can also raise a data protection concern with the{' '}
                <a className="underline" href="https://ndpc.gov.ng/">
                  Nigeria Data Protection Commission
                </a>
                .
              </p>
            </>
          )}
          {(policy === 'terms' || policy === 'refunds') && (
            <>
              <h2 className="text-xl font-semibold">Reservation fees, visits and cancellations</h2>
              <ul className="list-disc space-y-3 pl-6">
                {RESERVATION_TERMS.map((term) => (
                  <li key={term}>{term}</li>
                ))}
              </ul>
              <p>
                Use “Manage your reservation” on the homepage with your booking ID and email to view
                cancellation options. Check the quoted refund before confirming. Contact the
                restaurant if your payment or refund cannot be resolved through that flow.
              </p>
              <p>
                These rules describe the website’s standard booking flow. They do not remove
                mandatory consumer rights. Contact the restaurant for a failed service, incorrect
                charge, restaurant cancellation or any circumstances requiring an individual review.
              </p>
              {policy === 'terms' && (
                <>
                  <h2 className="text-xl font-semibold">Menu and orders</h2>
                  <p>
                    Prices are recorded in Nigerian naira (NGN). Other currency displays are
                    estimates. Prices and availability are checked when you submit an order. Ask
                    staff about any additional charges and allergy requirements before ordering.
                    Photos are illustrative and may differ from the served dish.
                  </p>
                  <p>
                    Use only a table session provided by staff. Save your order or booking reference
                    and contact the restaurant if you need help; avoid placing another order while a
                    previous submission is unresolved.
                  </p>
                </>
              )}
            </>
          )}
          {policy === 'cookies' && (
            <>
              <h2 className="text-xl font-semibold">Cookies and storage in use</h2>
              <p>
                The app uses session and request-security cookies, including adonis-session and
                XSRF-TOKEN. The configured session lifetime is two hours. An app_theme cookie can
                remember a theme for up to one year.
              </p>
              <p>
                Local storage remembers your basket (iceberg-order-cart), currency preference
                (iceberg-currency), and last reservation ID (iceberg-last-reservation). These stay
                until replaced or cleared. Session storage holds an order retry record
                (iceberg-order-attempt), which can include the name, table details and notes entered
                for that order. It is removed after a successful order or when the browser session
                ends.
              </p>
              <h2 className="text-xl font-semibold">Your choices</h2>
              <p>
                No optional analytics or advertising cookies were found in the reviewed source, so
                there is no optional tracking consent banner. The app must obtain any required
                permission before optional tracking or embeds are introduced. Payment providers have
                their own notices when you leave this site for checkout.
              </p>
              <p>
                You can delete cookies and site storage in your browser settings. Doing so can sign
                you out, clear your basket or remove your saved reference. Keep a separate copy of
                your booking ID. External images can make third-party network requests even without
                cookies.
              </p>
            </>
          )}
          <section className="border-t border-gray-200 pt-6" aria-label="Contact the restaurant">
            <h2 className="text-xl font-semibold">Contact the restaurant</h2>
            {loaded && live && settings.email ? (
              <>
                <p>{settings.address}</p>
                <p>
                  <a className="underline" href={`mailto:${settings.email}`}>
                    {settings.email}
                  </a>
                </p>
                <p>
                  <a className="underline" href={`tel:${settings.phone}`}>
                    {settings.phone}
                  </a>
                </p>
              </>
            ) : (
              <p>
                This demo has no operating restaurant contact. The buyer must provide a business
                identity, address and privacy contact before accepting customers.
              </p>
            )}
          </section>
        </div>
      </main>
      <PolicyLinks />
    </div>
  )
}
