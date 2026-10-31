# Security controls and setup

Run `npm ci`, then `node ace migration:run`, and restart the application when installing this update. Never run migration reset/refresh on a live database.

## Administrator access

Open **Admin → Security**. Enter the current password, select **Set up two-factor authentication**, and scan the QR code with an authenticator app. Enter its six-digit code to enable protection. Save the ten recovery codes outside this website; each works once and the plaintext list is shown only when enrollment finishes. Beginning setup does not enable MFA or lock out an existing account.

Once enabled, sign-in requires the password followed by an authenticator or recovery code. A password alone never creates an authenticated admin session. Challenges expire after five minutes; five challenge attempts per pending sign-in and per account are allowed within five minutes. Used authenticator time steps cannot be replayed. Authenticator secrets are encrypted using APP_KEY, and recovery codes use keyed hashes. Protect and back up APP_KEY; changing it invalidates encrypted configuration and guest proofs.

Security settings require the current password and, when MFA is enabled, a fresh authenticator or unused recovery code. Password changes enforce 12–128 characters with uppercase, lowercase, number and symbol. Enabling/disabling MFA, changing the password, or selecting **Sign out my other sessions** invalidates older sessions while keeping the current authenticated session. This applies to this administrator's sessions, not other staff accounts. Password reset by email and an owner-assisted lost-MFA recovery process are not included; recovery codes must be saved.

Login limits persist in the database: twenty attempts per IP in fifteen minutes, plus five failed password checks per email/IP pair in fifteen minutes. Login aliases share these quotas; successful administrator password checks release their failed-password slot. Sensitive account changes allow ten attempts in fifteen minutes. Counters survive restarts and are shared by app processes using the same database. Limits depend on correctly configured trusted proxies and request IP handling at deployment.

## Dine-in ordering

Open **Admin → Orders → Table ordering codes** when guests sit down. Start the table's two-hour ordering session and show its QR code or share the displayed table code. Guests scan the code to preselect their table, or type the code in the order form. They still provide only their name, table and optional notes; there is no phone or online payment requirement.

Codes use 64 random bits, are tied to one table, expire automatically, and are replaced whenever a new session starts. Close the session when guests leave. Staff should confirm orders before preparing food. A guest who shares a live code can let someone else submit orders during that session: this is possession-based authorization, not proof of physical location. Existing idempotent order retries can retrieve their original receipt after expiry without creating another order.

Set APP_URL to the public HTTPS website address before generating real QR codes. A localhost QR only works on the server computer. URLs containing table codes are removed from the current browser history entry after the menu loads, and the website sends `Referrer-Policy: no-referrer`. Do not publish session links or retain them in analytics/access logs. The admin session API is private and uses `Cache-Control: no-store`.

## Reservation and cancellation protections

Public checkout creation allows one active unpaid hold per verified email. Retrying exactly the same booking returns its existing checkout without extending the hold; changing details while that hold is active is rejected. Up to three unpaid checkouts per email per hour and twenty checkout creations per IP per fifteen minutes are allowed. Holds still expire after ten minutes. Successful payment and table-conflict checks remain authoritative. These limits reduce abuse; determined attackers with multiple inboxes and addresses may still require a hosting-level bot challenge or firewall rule.

Guest cancellation requires a new email code scoped to the specific booking and cancellation action. A booking-verification proof cannot authorize cancellation. Codes expire after ten minutes, allow five guesses, and the resulting cancellation authorization is consumed in the cancellation/refund transaction. Existing admin cancellation remains available for guests who call the restaurant. Refund amounts and deadlines still come from the server.

All dynamic requests and API routes now have aggregate database-backed limits, with action-specific quotas for lookup, cancellation, email, newsletter, checkout, orders, payments and administrator writes. Payment webhooks have a separate generous quota and still require signatures. See [Rate limiting and Render](rate-limiting.md) for current values, retry responses and required proxy configuration.

## Browser policy

Production responses include a nonce-based Content Security Policy in **report-only mode** initially. Script tags receive the matching nonce. The policy restricts scripts and connections to this website, blocks plugins and embedding, and allows the site's HTTPS images/fonts and required inline styling. Vite development remains unaffected. Report-only violations appear in the browser console; there is no central report collection endpoint.

After testing the hosted production site, checkout redirects, images, fonts and push notifications, set `CSP_ENFORCE=true` and restart to enforce the policy. Review resource origins if a buyer adds analytics or external services. Report-only mode observes violations and does not block injection attempts.

## Remaining dependency advisory and hosting work

The production audit reports two low-severity entries for the same Lucid → deepmerge dependency chain. As of this update, the registry's current Lucid 22.4.2/deepmerge 4.3.1 and [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) provide no patched release. No forced framework downgrade or unreviewed replacement was installed. Track the upstream fix and rerun `npm audit --omit=dev` when upgrading. The installed Lucid package imports deepmerge in its schema generator; this review identified no direct public request path to that use. This assessment does not remove the advisory or establish that all possible paths are safe.

HTTPS, production mode, secret rotation when exposed, a dedicated database account, protected backups, hosting firewall/bot protection, access logs without secrets, and customer-data retention remain deployment responsibilities. Do not include `.env`, customer exports, session data or backups in a source-code sale.
