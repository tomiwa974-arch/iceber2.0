# Rate limiting and Render

The website now enforces rate limits on the application server. It extends the existing database-backed counters instead of installing an Express package or introducing a second store. Settings are in `config/rate_limits.ts`.

## Limits

These are starting limits for a restaurant template. Adjust them against legitimate traffic, including automatic refreshes and guests sharing Wi-Fi.

| Scope                                             | Allowance                                                            | Identifier                   |
| ------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------- |
| Dynamic requests, including unknown routes        | 240/minute                                                           | Client IP                    |
| All API requests combined                         | 120/minute                                                           | Client IP                    |
| Other non-API writes                              | 30/minute                                                            | Client IP                    |
| Public menu and currency, combined                | 60/minute                                                            | Client IP                    |
| Availability                                      | 30/minute                                                            | Client IP                    |
| Login aliases, combined                           | 20/15 minutes                                                        | Client IP                    |
| Failed passwords                                  | 5/15 minutes                                                         | Normalized email + client IP |
| Two-factor verification                           | 20/5 minutes per IP; 5/5 minutes per pending sign-in and per account | IP, session nonce, account   |
| Send email code                                   | 20/hour per IP; 1/minute and 5/hour per email                        | IP and normalized email      |
| Verify email code                                 | 30/minute per IP; existing maximum of 5 guesses per issued code      | IP and code record           |
| Start checkout                                    | 5/10 minutes per IP; 3 new checkouts/10 minutes per verified email   | IP and verified email        |
| Booking lookup and refund status, combined        | 10/minute                                                            | Client IP                    |
| Cancellation                                      | 5/10 minutes                                                         | Client IP                    |
| Payment initialization and verification, combined | 10/minute                                                            | Payment reference            |
| Newsletter                                        | 5/hour                                                               | Client IP                    |
| Submit orders                                     | 30/minute per IP; 10 new orders/minute per verified table session    | IP and table session         |
| Authenticated admin writes                        | 60/minute                                                            | Administrator ID             |
| Photo uploads                                     | 10/minute, plus admin write limit and existing size checks           | Administrator ID             |
| Security settings                                 | Existing 10/15 minutes                                               | Administrator ID             |
| First-run admin setup                             | 5/15 minutes; still local-only and unavailable in production         | Client IP                    |
| Paystack/Stripe webhooks                          | Separate 300/minute per provider path/IP                             | Provider path and IP         |

All applicable limits apply together. The failed-password quota uses an email/IP pair rather than imposing a five-attempt global account lock that a stranger could trigger remotely. A password check reserves a slot before hashing, so concurrent attempts cannot bypass the quota. Correct administrator passwords release their reserved failed-password slot; they still count against the broader login/IP quota.

IPv6 clients share a /64 quota; IPv4-mapped IPv6 addresses normalize to IPv4. Counter identifiers are HMAC hashes, not raw email addresses or IPs. All processes must use the same database and stable `APP_KEY`.

Existing checkout protections remain: one active checkout per email with safe retries, at most 3 recent pending checkouts/hour per email, and 20 checkout records/15 minutes per IP. New verified-email checkout limits and table-session order limits exempt idempotent reuse of an existing operation. Invalid or unsuccessful transactions do not create new checkout/order quota records in those service-level scopes, but still consume HTTP quotas.

## Enforcement behavior

- General request quotas run before body parsing and include unknown dynamic routes. Requests served by static-file or Vite middleware, including development JavaScript modules, are outside these quotas. A missing file that falls through to application routing is counted.
- Specific HTTP quotas apply before controller validation; identity-specific business limits use validated emails, authenticated users or verified table sessions.
- Webhook requests have a separate generous budget rather than consuming customer quotas. Signature checks, authoritative payment verification and idempotency still apply. Other HTTP methods on webhook URLs do not get this exception.
- Limits use fixed windows anchored at the first request. Rejected requests neither extend the window nor grow the stored count beyond its cap. This permits ordinary fixed-window boundary bursts; these are not sliding-window limits.
- Responses return `429`, `Retry-After` in seconds, `Cache-Control: no-store`, and a JSON `message` and `retryAfter`. Login/setup/MFA Inertia forms receive the error through the normal form flash flow when the session middleware has run. General quotas that reject a request before session initialization return JSON.
- Counter insertion and consumption occur under database transactions/row locks. Counts persist across restarts when the database and app key persist. Expired records are cleaned in small sampled batches, with a one-day grace period. For higher traffic, move counters to a shared Redis-backed implementation rather than relying on an in-process map.
- If the general limiter cannot reach its store, it returns `503` rather than allowing unprotected requests through. Migrations must have created `security_limits` before serving traffic. No new database schema or package installation is needed for this change.

## What Render provides

[Render automatically supplies DDoS protection](https://render.com/docs/ddos-protection). This complements the app rules, which understand accounts, verification codes, bookings and table sessions. It does not replace them. Render has not been configured or deployed by this change.

You do not need to install a duplicate Express limiter or manage an Nginx server just to use these application limits. Any additional edge/firewall rules should address traffic before it reaches the app; do not reuse tight customer quotas for payment webhooks or static files.

## Required before a Render production launch

1. Use a **Render Web Service** for this server application. Use a persistent, reachable database supported by the app's configuration, with the required migrations. A laptop's local XAMPP database is not a database running inside Render. An ephemeral SQLite file cannot provide durable shared counters across instances or deploys.
2. Preserve `APP_KEY` and database settings across deploys and instances. Configure production email/payment credentials and the real `APP_URL` separately. Demo mode remains the default until the buyer/operator is ready.
3. **Verify the proxy chain before enabling live traffic.** The default trusts no forwarded-IP headers. Behind Render, that can group different visitors under a proxy IP. Set `TRUSTED_PROXY` to a verified proxy IP/CIDR, or set `TRUSTED_PROXY_HOPS` to a verified fixed hop count. Configure one, not both. No Render proxy IP or hop count is assumed by this code.
4. When using a hop count, verify that all ingress paths (including `onrender.com` and custom domains, and any added CDN) have the expected chain and cannot reach the origin through a shorter path. Do not enable blanket trust or blindly read the first `X-Forwarded-For` entry. [AdonisJS proxy guidance](https://docs.adonisjs.com/guides/basics/request)
5. In staging, verify resolved client IPs from two different networks and verify that forged forwarded headers do not change the selected visitor identity. Avoid logging cookies, authorization headers or personal form bodies. Add no public diagnostic endpoint exposing this information.
6. Review `429` responses after launch and adjust quotas for shared Wi-Fi, multiple admin tabs and polling. Test quota boundaries locally; do not perform denial-of-service testing against Render. [Render testing policy](https://render.com/docs/penetration-testing)

## Verification

Completed locally: all 97 functional tests passed, server/frontend TypeScript checks passed, production build passed, and the existing headless Edge interaction suite passed using a disposable limiter database and fixture APIs. No Render deployment or production database migration was performed.

Run `APP_URL=http://localhost:3335 node ace test functional` with the isolated SQLite test settings, then `npm run typecheck` and `node ace build`. The rate-limit tests cover shared quotas, boundaries/expiry, static-file treatment, unknown routes, spoofed forwarding headers, IPv6 grouping, login aliases and success accounting, MFA, independent admin/upload quotas, separate webhook budgets and verified customer identities.

An additional disposable local MySQL integration check now exercises two rounds of 16 simultaneous requests against a quota of 5, including after expiry: exactly 5 are admitted in each round with no deadlocks. Counter creation uses a no-op upsert to acquire an exclusive duplicate-key lock rather than upgrading shared `INSERT IGNORE` locks. The same check verifies booking, payment and refund concurrency. The actual Render proxy chain and multi-instance production load still require deployment-environment verification.
