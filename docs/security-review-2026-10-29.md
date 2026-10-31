# Security review — 29 October 2026

**Update:** The findings below describe the original review. The subsequently authorized fixes and remaining setup are documented in [Security controls and setup](security-controls.md).

This is a source-code and dependency review, not a penetration test or certification. No security fixes, dependency updates, secret rotations or payment-account changes were made. The separate approved UI changes remove wishlist hearts, allow numbered table labels, and collapse the table editors.

## Recommended order of work

### 1. Protect reservation availability and expensive public endpoints — highest priority

**Observed:** `app/controllers/restaurant_controller.ts:55` validates a signed email proof, then `app/services/reservation_payments.ts:25` creates a ten-minute unpaid table hold. The proof can be reused during its ten-minute lifetime (`app/services/email_verification.ts:17`). There is no booking-creation limit per verified email/IP or maximum active holds per guest. Payment verification, reservation lookup/cancellation, refund-status checking and newsletter signup also have no dedicated route-level throttling in `start/routes.ts`.

**Risk:** Someone with their own valid email could repeatedly reserve available tables without paying, preventing genuine bookings. Repeated verification/refund checks can also generate unnecessary database and provider API work. Email verification blocks fake inboxes; it does not prevent misuse by someone who controls a real inbox. This is an availability/business-abuse finding, not evidence that an attacker can forge a successful payment.

**Proposed:** Persistent rate limits, a small maximum number of simultaneous unpaid holds per guest, and limits on public provider-checking routes. Apply tighter limits or a bot challenge when abuse is detected. Test these limits with shared restaurant Wi-Fi and legitimate retries. Do not block signed payment-provider webhooks with rules intended for guests.

Reference: [OWASP denial-of-service guidance](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html).

### 2. Decide how to authorize dine-in orders — high operational priority

**Observed:** `app/controllers/commerce_controller.ts` accepts a name, active table ID and menu items. `app/services/restaurant_orders.ts` checks current prices, quantities, table activity, idempotency and per-IP order limits. It does not establish that the guest is physically present. Active table IDs are available in the public booking configuration.

**Risk:** A remote visitor can submit a plausible order for a real table. Staff must currently confirm the request before preparation. Rate limiting helps with volume but cannot distinguish a genuine guest from a remote visitor.

**Proposed:** Keep staff acceptance mandatory and consider a staff-opened, expiring table session with a QR link or short code. A permanent public table ID, or a static QR code that can be photographed and reused forever, is not strong proof of presence. This change would preserve account-free ordering and would not require collecting phone numbers.

### 3. Strengthen administrator sign-in and recovery — medium priority, high impact if credentials are stolen

**Observed:** Admin routes enforce the admin role. Passwords are hashed, setup is local-only and closes after first use, login errors are generic, and login attempts are limited. However, `app/controllers/admin_session_controller.ts:8` keeps the attempt counter in process memory and keys it by IP. It resets when the application restarts and is not shared across multiple server processes. There is no two-factor sign-in flow, administrator password recovery/change flow, or device/session management UI in the reviewed routes.

**Risk:** A stolen admin password grants access to guest records, payment settings, cancellations and restaurant administration. Distributed password guessing is less constrained than guessing from a single IP. Missing MFA is a defense gap, not proof of an authentication bypass.

**Proposed:** Persist account/IP-aware login limits, add authenticator-based two-factor authentication with recovery codes, and design secure password recovery plus session revocation. Consider asking for the password again before particularly sensitive actions. Avoid an account-lockout design that lets attackers lock legitimate staff out indefinitely.

Reference: [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

### 4. Consider stronger authorization for guest cancellation — conditional risk

**Observed:** `app/controllers/restaurant_controller.ts:98` and `app/services/restaurant_service.ts:321` authorize cancellation using the random booking ID and matching booking email. There is no fresh inbox-verification step for cancellation. The ID is a high-entropy UUID, so it is not reasonably guessable.

**Risk:** Someone who obtains both details, for example from a shared confirmation, can cancel an eligible booking without proving current access to the inbox. Refunds still go through the original payment; this is a booking-disruption/privacy concern rather than a route for redirecting a refund to an attacker's card.

**Proposed:** Optionally require a fresh cancellation email code or a separate scoped, expiring cancellation authorization. Keep this separate from ordinary reference lookup so the guest experience remains manageable.

### 5. Add a production Content Security Policy — defense in depth

**Observed:** `config/shield.ts:12` disables CSP. This review did not identify an application use of `dangerouslySetInnerHTML`, `eval`, shell execution of guest input, or string-built SQL containing guest input. React text rendering and bound database queries are useful existing defenses.

**Risk:** If a future change or dependency introduces script injection, the browser has no CSP restriction to reduce its impact. CSP being disabled does not establish that the site currently has an exploitable XSS bug.

**Proposed:** Introduce a production-specific policy in report-only mode, test all real resources, then enforce it. Use nonces/hashes as appropriate and retain separate development settings for Vite. Test hosted checkout redirects, images, web push and fonts rather than enabling a restrictive policy blindly.

Reference: [OWASP CSP guidance](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html).

### 6. Review the published dependency advisory — low reported severity

`npm audit --omit=dev --json` reported **two low-severity entries, zero moderate, high or critical entries**. These are associated with the same dependency chain: installed `@adonisjs/lucid@22.4.2` uses `deepmerge@4.3.1`. The advisory is [GHSA-gcqx-w48m-w2h4 / CVE-2026-93753](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), concerning prototype poisoning of returned merged objects.

This is not a finding that the application is remotely exploitable through that dependency. The reachable input path and a compatible remediation still need assessment. Review the upstream fix and run compatibility tests before updating; do not run a forced dependency fix without review. The audit covered production dependencies, not the full development toolchain.

## Additional hardening before selling or deploying

- **Administrative audit history:** record who changed payment providers, cancelled reservations, updated order statuses or altered table settings. Timestamps alone do not identify the actor. Do not put secrets, email codes or full payment payloads in logs.
- **Customer-data retention:** set retention/access rules for reservation contacts, confirmation message bodies and order notes. Protect database backups and test restoring them.
- **Production settings:** use HTTPS, production mode, restricted CORS and a dedicated password-protected database account. `config/database.ts` contains local-development fallbacks for MySQL root/empty password, and development mode permits verbose errors and broad CORS. These are deployment requirements, not evidence of an exposed production database.
- **Source-code sales:** supply `.env.example`, never the working `.env`, real database exports, backups, test admin sessions or customer screenshots. `.gitignore` helps with Git but does not prevent accidental inclusion in a ZIP archive. Each buyer must supply their own APP_KEY, provider credentials and other secrets.

## Controls already present

The reviewed code includes admin role checks, CSRF protection except for the two signed webhook routes, password hashing, production secure/HttpOnly/SameSite cookies, server-side validation and request-size limits, email-code expiry/guess limits, server-priced orders, table-conflict locks, authoritative payment verification, exact-body webhook signatures, Stripe timestamp checks, and idempotency/uncertain-refund handling. Payment secret keys are used on the server rather than sent to checkout pages.

These controls reduce risk but do not replace live deployment checks, access reviews, monitoring or independent testing before accepting real customer traffic.
