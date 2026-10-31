# Loading, interactions and copy review

Reviewed 31 October 2026 for the restaurant website template.

| Checklist                   | Result                                                                                                                                                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15. Asynchronous loading    | API requests expose activity until success, failure or abort. A delayed status indicator avoids flashing for quick requests. Clipboard, QR generation, notification setup, currency loading and provider-return verification have their own states. Existing content remains visible during background refreshes. |
| 16. Button progress         | Shared `AsyncButton` adds an indeterminate spinner, `aria-busy` and disables repeated activation. Applied to saving, deleting, signing in, verification, payments, bookings, newsletter, orders and other async controls. Progress does not invent percentages.                                                   |
| 17. Functional interactions | Browser checked category filters, food/drinks tabs, mobile menu including Escape, native dialogs, basket, order status updates, payment provider checkboxes, retry controls, table QR and clipboard. No carousel exists in the current customer interface.                                                        |
| 18. Skeletons               | Added menu, drinks, daily special, full menu, dashboard, orders, payment/revenue, security, table sessions and table-availability skeletons. Initial failures show errors/retry rather than indefinite loading or a misleading empty state.                                                                       |
| 19–20. Concrete copy        | Replaced vague menu/admin descriptions with specific actions, removed the sample person name from the booking placeholder, and used simple punctuation in new text. No em dashes were found in customer/admin component and page copy during the final search.                                                    |
| 21–22. Authentic content    | No testimonials, critic affiliations or person-avatar content was added. Previously removed fabricated reviews remain absent. Stock food-photo copyright evidence remains an outstanding item from the earlier review.                                                                                            |

## Verification

- `npm.cmd run typecheck`: passed server and frontend checks.
- `node ace build`: passed production build.
- `node tests/ui_feedback.mjs`: passed headless Microsoft Edge checks with reduced motion and delayed/failing fixture APIs. Includes error recovery, button re-enabling and no browser runtime errors. The script uses a temporary local server on port 3347, intercepts customer/admin APIs, renders a fixture admin shell without authenticating, and stops its own server/browser when finished. It does not modify the restaurant database or send real email/payments. Build first; use `UI_BROWSER_PATH` to choose another installed Chromium browser.

These browser checks cover the listed interactions, not every browser/device, live payment service or notification permission path. The previous policy/image/licensing handoff requirements still apply.
