# Iceberg local setup

The app runs on AdonisJS, React/Inertia, and the XAMPP MySQL/MariaDB database `iceberg`.

## Start the app

1. Start **MySQL** in the XAMPP control panel. Apache is optional for this app; Node serves the website.
2. From this project folder, run `npm.cmd install` after pulling dependency changes.
3. Run `node ace migration:run` when new migrations are added. The initial migration seeds the existing menu and website settings. Do not use reset/refresh on a database with records you want to keep.
4. Run `npm.cmd run dev` and open the local address printed in the terminal (normally `http://localhost:3333`).
5. On first use, visit `/admin` or `/admin/setup` **from this computer**. Choose your administrator name, email, and a password of at least 12 characters. Setup closes after the first account is created.
6. After setup, sign in at `/admin/login`. Use **Sign out** when finished. Customers can view the menu, send reservation requests, and subscribe without accounts.

## Render production build

Use Node.js 24 or newer and configure the application environment variables in Render.

- Build command: `npm ci --include=dev && npm run build && cd build && npm ci --omit=dev`
- Start command (from the repository root): `cd build && node bin/server.js`

`npm run build` runs `node ace codegen` before `node ace build`. Codegen generates the
file indexes and route-derived Tuyau registry from source before Vite imports
`@generated/registry`. The production bundler alone refreshes file indexes but does
not scan routes. Keep `.adonisjs` ignored; a clean checkout regenerates it during
the build. Run the build with development dependencies installed and the required
application environment variables available. Codegen warms up the app without
starting the HTTP server or the providers' background workers.

## Database settings

The ignored `.env` file contains the local connection settings. This installation uses `127.0.0.1:3306`, database `iceberg`, and XAMPP's local `root` account. If you set a MySQL password, put it in `DB_PASSWORD`. `.env.example` lists the expected variables; never commit actual credentials or `APP_KEY`.

The tables store menu items, daily specials, restaurant settings, reservation requests, newsletter subscribers, users, and the one-time administrator bootstrap state. Admin writes require a logged-in account with `is_admin = 1`; public signup does not create accounts.

## Features

- Add/edit/hide/delete food, drinks, and desserts. Prices and descriptions validate on the server.
- Upload JPEG, PNG, or WebP photos from the editor. Photos are stored under `public/uploads/menu`, with their URLs saved to MySQL. Back up this directory together with the database.
- Daily specials are queued using server timestamps and transaction locks. A day is 24 hours; expiry and queued transitions do not require the admin page to remain open. Dates are displayed in West Africa Time.
- Guest reservations enter as **Pending**. Staff choose **Confirm arrival** when the guest arrives, which saves a check-in timestamp. Pending bookings automatically display as **Expired** at the scheduled time plus 30 minutes in Africa/Lagos; this is calculated on the server on every read and status change, so no browser or scheduled job needs to stay running. Confirmed arrivals and cancellations retain their status. Terminal bookings cannot be reopened.
- Guests must accept the 30-minute arrival policy. They can find and cancel an active booking using its reference and email, with a required reason. No guest account is created. References should be saved from the booking receipt; email confirmation delivery requires Resend configuration; SMS is optional.
- Expired no-shows disappear from the admin list, guest lookup, and notification inbox 24 hours after their arrival deadline. This is automatic on every read; database history is retained. Confirmed and cancelled bookings are unaffected. Notifications for manually deleted reservations are also hidden.
- The admin bell shows the latest 100 new-booking and guest-cancellation alerts, with read status saved per administrator. The dashboard polls every 15 seconds while visible and shows a toast for new alerts.
- Homepage text, restaurant details, opening hours, and newsletter signups persist to MySQL. Public pages refresh shared changes automatically and after reopening.

Email/SMS delivery is not configured. Reservation requests are saved and given a reference, and newsletter addresses are collected; no confirmation email or newsletter is automatically sent.

Earlier frontend-demo data in browser storage is preserved but is not automatically imported into MySQL. The server starts from the seeded menu so one browser cannot overwrite shared records unintentionally.

## Laptop notifications

Run the migrations, then generate a VAPID key pair once using `npx web-push generate-vapid-keys`. Put `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and a `VAPID_SUBJECT` contact (for example `mailto:info@icebergrestaurant.com`) in `.env`. Preserve the keys on deployment and keep the private key secret. Restart the app after changing environment variables.

In the admin notification bell, choose **Enable laptop alerts** and allow the browser prompt on each device. HTTPS is required in production; localhost also works. A service worker receives alerts even when the website tab is closed, subject to browser background delivery and operating-system notification settings. Supported push providers are Chrome/Edge FCM, Firefox, Safari, and Windows notifications. Use **Disable laptop alerts** on shared devices. Delivery failures never roll back a reservation; the database inbox remains available. Expired subscriptions are removed automatically.

## Named tables and booking availability

In **Admin → Reservations → Tables & reservation hours**, set the actual number of tables before taking new bookings. The migration starts with zero tables rather than inventing restaurant capacity. Increasing the count creates names such as Aurora, Coral, Willow and Pearl. Edit each name and seat count to match the restaurant (new tables default to 8 seats; the guest form supports parties of 1–8). Reduce the count or retire individual tables when needed; tables with active upcoming bookings cannot be removed or reduced below their booked party size. Retired tables and booking history remain stored.

Configure all seven days of opening hours in WAT, including closed days. Initial defaults match the original advertised schedule: Mon–Thu 11:00–22:00, Fri–Sat 11:00–23:00, Sun 12:00–21:00. These structured hours drive the public opening-hours text and booking validation. Each booking occupies one table for **120 minutes of dining from its scheduled start**, followed by **10 minutes of staff cleanup** (130 minutes blocked in total). Both dining and cleanup must finish by closing. A late arrival does not extend that window. Opening and closing are on the same day; overnight service is not supported.

Guests select a date, a scheduled time slot, party size, and available named table. Slots start every hour from opening by default and every booking lasts two hours. Admins can select 15-, 30-, 60- or 120-minute start intervals under Reservations; the server rejects arbitrary times. Existing reservations and checkout holds keep their accepted start time when the interval changes. Availability refreshes every 15 seconds while the form is mounted. Pending reservations hold tables; cancellations and expired no-shows release them. Confirmed arrivals hold their scheduled two-hour window. Overlaps use half-open intervals, so a table booked 18:00–20:00 can be booked again at 20:00. Submission rechecks availability inside a database transaction, locking a shared configuration row before reading bookings with locking reads. This serializes simultaneous bookings and table/hour changes on MySQL. A stale selection receives a conflict instead of overwriting another booking.

Earlier reservations have no table assignment. They conservatively block all tables during their overlapping window until staff assign a table in the reservation list. Staff can also reassign active bookings; the server checks seats and overlapping bookings. Guest availability checks run automatically, without an admin checking or approving each reservation. Staff only need to record actual arrivals so the no-show deadline does not release a seated guest's table. The manual admin availability checker has been removed to keep this workflow clear.

`node tests/mysql_booking_concurrency.mjs` verifies simultaneous submissions against a disposable MySQL schema, then removes that schema. It requires local MySQL credentials with permission to create/drop the temporary `iceberg_booking_test_*` database; restaurant records are not used.

## Reservation payments and currencies

The public booking form now starts a **₦30,000 reservation-fee checkout per table**, separate from food and drinks. A temporary hold blocks the chosen table for up to ten minutes (or until the scheduled visit starts, whichever is sooner). No reservation is created until the server verifies a successful Paystack transaction with the exact reference, amount (3,000,000 kobo), NGN currency, and guest email. Browser price/status fields are ignored. Payment initialization and verification are repeatable without duplicate charges or bookings. Expired unpaid holds release automatically. Successful payments arriving after reallocation never double-book: they appear as **Payments needing refund review** under Admin → Reservations, with their Paystack reference. Review and issue any refund in the Paystack dashboard; these unfulfilled-checkout cases are separate from automatic guest-cancellation refunds.

To connect Paystack:

1. Add your Paystack **test secret key** as `PAYSTACK_SECRET_KEY=sk_test_...` in the server `.env` and restart. Never put it in `VITE_*`, source control, or browser code. The public key is not needed for hosted redirect checkout.
2. Set `APP_URL` to the site's correct public HTTPS origin. The callback returns to `/payments/<reference>?returned=1`; local browser return testing can use localhost, but provider webhooks need a public HTTPS URL.
3. In Paystack Dashboard → Settings → API Keys & Webhooks, register `https://your-domain/api/payments/paystack/webhook`. The exact raw body is verified with HMAC-SHA512 before processing. Only this webhook is exempt from CSRF; browser payment actions retain CSRF protection. Unrelated merchant transactions are acknowledged without creating reservations.
4. Enable the desired payment channels in the Paystack dashboard. Visa, Mastercard and Verve use the hosted card checkout. Apple Pay appears only for eligible customers/devices and enabled merchant accounts; follow Paystack's activation/domain requirements where applicable. The app does not collect card numbers, PINs or wallet credentials.
5. Test successful, failed and abandoned payments and callback/webhook delivery with Paystack's test payment details before switching to an activated `sk_live_...` key. No test or live key is included in the project. Without a configured key, the payment page honestly shows that checkout is unavailable and its Pay button is disabled.

Guest-count options now follow the capacity of active free tables at the chosen date/time; occupied tables and active payment holds are excluded. Server submission checks capacity again.

The compact currency control on the homepage, full menu and payment page supports automatic device-region/timezone selection and a persistent manual override. NGN is the charge currency. USD, GBP, EUR, CAD, AUD, GHS and ZAR are estimated display conversions, applied to menu prices and the fee. ExchangeRate-API open rates are fetched server-side, cached daily, and attributed in the selector. Stale cached rates are labelled; if no rates are available, the site safely stays in NGN. Device-region inference is approximate and does not request precise location. The customer's bank sets the final conversion. Admin prices remain in NGN.

## Cancellation refunds

Guests cancelling at least two hours before the scheduled start receive a full refund. Within two hours of the start and until the 30-minute arrival deadline, the restaurant retains 25% of the fee and requests a 75% refund. For NGN 30,000 this is NGN 7,500 retained and NGN 22,500 refunded. No refund is available after the arrival deadline or after check-in. Restaurant-initiated cancellations of active pending bookings request a full refund. The original two-hour table window is never extended by late arrival.

Guest lookup returns an explicit refund quote. Paid cancellations must confirm that exact amount; a stale quote is rejected before cancelling. Cancellation releases the table and durably records one refund request per original payment. Refunds are sent through Paystack's Refund API to the original transaction, with signed refund webhooks plus server reconciliation updating Pending, Processing, Processed, Failed and NeedsAttention states. Requested is not the same as processed; bank posting times vary. Paystack can require extra information for some refunds, which staff handle securely in its dashboard.

The web-server refund provider checks durable requests every minute while the server runs, so processing does not depend on a browser remaining open. It claims each queued request before calling Paystack. A timeout or crash after submission does not blindly retry a refund: the app matches Paystack records or flags staff review, preventing duplicate payouts. Admins can reconcile cancellation refunds under Reservations, and guests can check status using booking reference and email. Keep the public Paystack webhook configured. Test a full and partial refund using Paystack test mode before going live; automated tests use mocked provider responses and never refund real transactions.

## Checks and build

- `npm.cmd run typecheck`
- `npm.cmd test -- functional` — uses an isolated SQLite test database and port 3335, never `iceberg`.
- `node --test tests/specials.test.mjs`
- `npm.cmd run build`

Administrator setup is deliberately disabled in production. Create the first administrator locally before deploying, and preserve the database and uploaded photos when deploying a new build. Keep `.env` and the session `APP_KEY` private.

### Booking confirmations by email and SMS

Successful verified payments save exactly one confirmation per channel in `booking_messages` in the same database transaction as the reservation. The running web server processes the durable queue every 15 seconds. Unpaid checkouts and payments awaiting reservation review do not send booking confirmations. Existing bookings are not automatically messaged. Each message includes the booking ID, named table, date, start time (WAT), party size, fee and full terms accepted at checkout. Guests can copy their ID or complete booking details on the paid receipt.

Configure these server-only variables in `.env`, then restart the server:

- `RESEND_API_KEY`: Resend API key with sending access.
- `BOOKING_EMAIL_FROM`: a sender on your verified Resend domain, e.g. `IceBerg <bookings@your-domain.com>`.
- `TERMII_API_KEY`: your Termii API key.
- `TERMII_BASE_URL`: the HTTPS base URL shown in your Termii dashboard (must be a termii.com host).
- `TERMII_SENDER_ID`: an approved sender ID for transactional SMS/DND routing. Fund your SMS account and confirm the account supports your recipients and long multipart SMS.

Resend setup: https://resend.com/docs/dashboard/domains/introduction
Termii setup: https://developers.termii.com/

No provider credentials means messages stay Queued; the reservation remains valid. Queued confirmations are sent when configuration becomes available, including older queued messages, so inspect the queue before enabling providers. Accepted means the provider accepted a message, not confirmed inbox/handset delivery. A failed or uncertain submission becomes NeedsReview and is not automatically resent to avoid duplicate SMS. For support, inspect the exact record in `booking_messages` and reconcile its provider message ID with the provider dashboard before manually requeueing; never requeue an uncertain send blindly. Records stuck Submitting are moved to NeedsReview after two minutes. No external delivery can be verified until provider credentials are configured. Full terms may require multiple billed SMS segments. Treat stored recipients/message bodies as private customer data.

The terms snapshot is saved with the checkout and used for its confirmation even if future website wording changes. Admin cancellation remains available.

### Input validation and guest email verification

Guests must verify their booking email before checkout: request a six-digit email code, then enter it on the reservation form. Resend must be configured; without it the site does not bypass verification. Codes expire after 10 minutes, permit five guesses, and are single-use. A signed email-specific proof permits checkout for 10 minutes. Changing the email resets verification. Code requests allow one per minute and five per hour per email, plus twenty per hour per IP. Counters persist in the database; different guests on the same Wi-Fi do not share an email cooldown. Codes are stored as keyed hashes, never plaintext. Verification records older than one day are removed on subsequent requests. No guest account is required. Mail-domain DNS checks reject domains without usable MX records; an email code establishes inbox access, not the person's identity.

Reservation limits: name 2–100 characters; email up to 254; phone accepts Nigerian mobile format 08012345678 or international +countrycode format with 8–15 digits (up to 25 input characters); special requests up to 2,000 characters. Phone syntax does not prove phone ownership. Browser checks are repeated on the server. Guest count, tables, scheduled times and dates remain enforced by the booking service. JSON/form request bodies are capped at 64 KB; photo uploads keep their separate 20 MB request cap.

New admin passwords must be 12–128 characters with uppercase, lowercase, a digit and a non-whitespace symbol. Existing admin passwords remain valid at sign-in, with a 128-character cap; the new complexity policy does not silently change existing passwords. Login does not reveal which email addresses have admin accounts. Existing session, CSRF, admin authorization and login throttling remain enabled. These changes are validation hardening, not a complete security audit.

Booking timing: guests have two hours of dining plus ten minutes for staff cleanup. Guest-facing end times show the dining end, while conflict checks include cleanup for both paid reservations and active checkout holds. The same table cannot be booked during cleanup; it is free exactly at the 130-minute boundary, subject to the configured start grid. With hourly starts, an 11:00 booking blocks 13:00; cleanup finishes at 13:10 and the next offered start is 14:00. The arrival and late-cancellation deadline is now 30 minutes after the scheduled start.

### Paystack and Stripe checkout

Checkout offers Paystack and/or Stripe only when their server secret keys are configured. Existing records default to Paystack; the selected provider is stored with each checkout and used for verification, webhook handling and refunds. The selection is committed before contacting a provider. Once selected, a checkout cannot switch providers, even after a timeout; resume or verify it instead of paying through another provider. Neither secret key is returned to the browser. This uses hosted checkout; no Stripe publishable key is needed.

The reservation fee remains NGN 30,000 (3,000,000 minor units) for both providers. The currency selector only changes estimated display amounts. This change does not add foreign charging currencies, merchant onboarding or account eligibility. Confirm that the merchant's Stripe account can accept NGN before enabling it. Stripe currently lists Nigeria through Paystack's extended network; a Paystack account and key are not a direct Stripe account or Stripe key.

Stripe setup:

1. Check https://stripe.com/global for the actual business's eligibility. Create an account at https://dashboard.stripe.com/register with accurate business information. An eligible buyer uses their own Stripe account and bank details.
2. Create/select a Stripe sandbox and obtain its secret API key from the dashboard API keys page. Add `STRIPE_SECRET_KEY=sk_test_...` to the server `.env`. Keep `PAYSTACK_SECRET_KEY` to continue offering Paystack. Never use a VITE-prefixed variable or share the keys with buyers in the source package.
3. Configure the webhook destination `/api/payments/stripe/webhook`. For a deployed HTTPS site, use `https://your-domain.com/api/payments/stripe/webhook` in Stripe Workbench/Webhooks. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `refund.created`, `refund.updated` and `refund.failed`. Copy that endpoint's separate signing secret into `STRIPE_WEBHOOK_SECRET=whsec_...`.
4. For local testing, install/login to Stripe CLI and run `stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,refund.created,refund.updated,refund.failed --forward-to http://localhost:3333/api/payments/stripe/webhook`. Use the signing secret printed by that CLI listener for local development. Restart the web server after changing `.env`.
5. Make a reservation, select Stripe and pay using Stripe test card `4242 4242 4242 4242`, a future expiry and any three-digit CVC. Test success, decline, repeated webhook delivery, cancellation and full/partial refunds. Check Stripe's dashboard logs. Automated tests use mocked Stripe APIs, not a real Stripe account.
6. For live use, complete Stripe's business activation, configure the live HTTPS webhook destination and replace both sandbox secrets with the corresponding live secrets. Keep the original provider credentials accessible for refunds of older payments; do not mix test and live transactions in a production database.

Stripe cards are handled on checkout.stripe.com; eligible wallets depend on the merchant account, currency, browser and device. Paystack's merchant-enabled methods remain unchanged. Stripe Checkout uses dynamic payment methods configured in the Stripe dashboard; do not send the removed payment_method_types parameter. Enable methods appropriate for short table holds, and review delayed payments before confirming a booking. A Stripe Checkout Session can remain payable after the app's ten-minute table hold ends; the server rechecks availability when payment succeeds and marks a paid booking for refund review if the table can no longer be secured. Never assume a redirect confirms payment. Late payments requiring review remain a staff workflow, as with Paystack.

Webhook signatures use exact raw request bytes; Stripe signatures also enforce a five-minute timestamp tolerance. Only the two webhook URLs are exempt from CSRF. Checkout and refund submissions use Stripe idempotency keys; uncertain refunds are reconciled against Stripe instead of resubmitted blindly.

### Payments & revenue in admin

The Payments & revenue tab lets an administrator enable Paystack, Stripe or both without exposing their secret keys. Credentials are still configured on the server. A disabled provider is removed from new customer checkouts and rejected server-side if a guest attempts to submit it manually. Already selected checkouts can resume with their original provider, and paid bookings can still be verified or refunded through that provider. At least one configured provider must remain selected.

Revenue totals are in NGN and reflect this application's reservation payment ledger only: gross verified receipts (including payments awaiting booking review), completed refunds, pending/failed/unconfirmed refund obligations, payments needing refund review, net cash flow and retained fees after refund obligations. The 30-day chart groups receipts by paid_at and refunds by the first recorded processed_at, in Africa/Lagos time. Older completed refunds are backfilled from their saved update timestamp. Figures are before processing fees, taxes and other costs, are not profit, and do not reconcile refunds performed manually outside this app. Test payments are included in the test database; use a separate production database for live operation. Food orders never count as collected revenue because no online payment is taken for them.

### Dine-in ordering

Guests can add food, drinks and desserts to an order from the homepage or full menu, adjust quantities, then submit a name, active named table and optional allergy/instruction notes. No guest account, email verification or online food payment is required. Orders are requests for staff confirmation; table selection alone does not prove the guest is physically present. Staff should confirm a request before preparing it.

Prices, item availability, table activity and quantities are validated on the server. Submitted prices/totals are ignored. Orders snapshot item names, unit prices and table names so subsequent menu edits do not rewrite older orders. Limits: 30 distinct lines, 20 units per line, 100 units per order, 30 submission attempts per IP per minute and 10 new orders per verified table session per minute. Request UUIDs make retries idempotent; a different payload cannot reuse an order reference. The cart persists item IDs/quantities locally; an uncertain submission is held in session storage until confirmed, and retry sends the same body/reference. Contact details clear after confirmation. The menu may change before submission; guests should review their total and staff should confirm allergy requirements and any extra charges.

Admins manage Pending → Accepted → Preparing → Ready → Served, or cancel before Served. Terminal states cannot be reopened. The Orders tab shows the latest 500 orders, updates every 10 seconds, and filters active/served/cancelled orders. Customer information is never included in the public menu API or push payload. A new order creates a durable admin inbox notification and best-effort Web Push through the existing VAPID/admin-device subscriptions. Enable laptop alerts from the admin bell and allow them in the browser/OS; delivery depends on browser background support, network and system settings. Clicking an order push opens the Orders tab. Retries do not create extra notifications. Existing reservation alerts continue to work.

Dine-in ordering does not collect phone numbers. Guests provide their name and choose an existing active named table; notes remain optional. The legacy database phone column is left empty for new orders and is not returned in the order API or displayed in admin. Reservation phone collection is unchanged.

### Request limits and Render

See [Rate limiting and Render](docs/rate-limiting.md) for the combined API limit, endpoint quotas, retry responses, database-backed counters and required proxy configuration before deployment. Tune defaults in `config/rate_limits.ts`.

### Security controls

See [Security controls and setup](docs/security-controls.md) for administrator two-factor enrollment, recovery codes, session revocation, table ordering QR codes, cancellation verification, request limits, CSP rollout and the remaining upstream dependency advisory. Run migrations and restart after installing this update.
