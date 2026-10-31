# Restaurant template review — 31 October 2026

Iceberg is an unregistered sample brand for a website template intended for sale. It is not an operating restaurant. This review does not certify legal compliance or full WCAG conformance.

## Checklist

| Item | Result |
| --- | --- |
| 1. Contrast | Darkened light-surface home/menu/payment text, placeholders and control borders; added focus rings. Full browser review, zoom, overlays and admin surfaces remain to be checked. |
| 2. Image alternatives | Public menu images use item names; hero/about images now use the displayed dish name instead of “Dish”. Removed testimonial avatar images. Uploaded image content still needs editorial review. |
| 3. Refund policy | Added `/refunds`, using the same shared booking terms as checkout. Consumer-rights exceptions are stated. The fee schedule needs operator/legal review before live use. |
| 4. Privacy | Added `/privacy`, explaining collection, providers, withdrawal and the absence of automated retention. Buyer must supply identity, retention periods, exact processors, legal bases and transfer arrangements. |
| 5. Accessibility | Added language metadata, visible focus, a home skip link/main landmark, linked reservation labels, named mobile menu controls, cart dialog name and reduced-motion handling. Full keyboard/screen-reader testing is outstanding. |
| 6. Reviews | Removed all three hardcoded reviews and claimed critic/Google/Yelp affiliations. |
| 7. Terms | Added `/terms`, linked from public pages and booking form. Template text is not a jurisdiction-specific legal opinion. |
| 8. Embeds | No third-party iframe/embed widget found in the reviewed customer source. Paystack/Stripe use hosted redirects. Remote menu images still send requests to image hosts. |
| 9. Image copyright | UNVERIFIED. Seed menu files contain Unsplash URLs without photographer/licence evidence. A URL is not proof of a licence or permission for template redistribution. Buyer/seller must replace images with owned/licensed assets or retain the necessary records. Upload help now states the permission requirement. |
| 10. Cookies policy | Added `/cookies` with session/security/theme cookies and cart/currency/reference/retry storage. |
| 11. Tracking | No analytics or advertising scripts found in reviewed source. This does not verify a deployed server, host logs, third-party checkout, extensions or later additions. |
| 12. Form consent | Newsletter requires its own unchecked box and server-side acceptance. New rows record consent version and timestamp; legacy rows remain unverified. Booking has separate terms and a privacy notice; no automatic newsletter enrollment. |
| 13. Local law | Provisional Nigeria review because the existing app uses NGN, WAT and Nigerian payment conventions. Final requirements depend on the buyer’s location and operation. See sources below. |
| 14. Button labels | Named navigation toggle and home controls; removed dead social links. Existing cart quantity/close controls have accessible labels. Complete manual review remains. |
| 15. Cookie permission | No blanket “accept all” banner added when there is no optional tracker to accept. Local storage and cookies are documented; buyer must assess consent requirements for preference storage and every provider in their jurisdiction. Gate optional trackers before loading if introduced. |
| 16. Business details | Removed known sample address, phone and email from defaults and suppress them when reading old settings. Demo notice identifies this as a sample brand. Buyer supplies real details before launch. |
| 17. Minimise data | Demo customer submission endpoints are disabled by default. Newsletter only requests email. Booking requests contact and visit details; special requests remain optional with a warning to limit sensitive information. Phone necessity and sensitive allergy processing need operator assessment. |
| 18. Keyboard forms | Native inputs/selects/buttons and labels retained; demo reservation/newsletter fields disabled, focus styling added. Native cart dialog used. Manual keyboard, focus-return and assistive-technology QA still needed. |
| 19. Claims | Removed invented guest/award/years statistics, founding date, named chef, sourcing/award claims and Michelin-star seed claim. New migration cleans known stored sample values without replacing customised business content. |

## Selling the template

Keep `RESTAURANT_LIVE=false` (also the default when unset). Browsing works, but customer booking, email verification, newsletter, order and payment-init/verify requests return 503 before customer-side effects. Admin management still works. Do not publish real payment keys or a real customer/admin database with a demo or source package. Existing webhook routes remain provider callbacks; do not connect production provider webhooks to a demo.

The public demo banner and policy contact sections explain that there is no operating restaurant. This does not mean that the template seller cannot have obligations for their own sales, website, licensing or customer information.

For a buyer handoff:

1. Configure the buyer’s legal/trading identity, real contact details and accurate hours/menu. The current settings editor covers address, phone and email; extend identity fields if the buyer needs company/registration disclosures.
2. Resolve every image licence, including redistribution in a paid template. Keep an asset register with source URL, creator, licence, acquisition date and permission/attribution evidence. Review the Lucide icon package licence as part of distributing third-party assets.
3. Adapt the policy pages to the real operator. Set retention/deletion practices and a working privacy/withdrawal process; do not promise unimplemented automated deletion or one-click newsletter unsubscribe.
4. Review the cancellation fees and exceptions with the operator, including restaurant cancellation, deficient service and applicable mandatory consumer rights. The current automated refund engine covers standard customer cancellation; exceptional disputes require staff review.
5. Configure the buyer’s hosting, email/SMS/payment providers, secrets and HTTPS. Review data transfers and each provider’s notices. Test payments/refunds with test credentials before enabling live keys.
6. Run migrations (`node ace migration:run`), accessibility/browser checks and automated checks. The cleanup/consent migration is included but has not been applied to the development MySQL database by this review.
7. Set `RESTAURANT_LIVE=true` only for the prepared operating restaurant. This hides the demo banner and enables customer submissions. There is no automatic legal-compliance check behind that switch.

## Verification recorded

- TypeScript checks passed for server and frontend (`npm.cmd run typecheck`).
- All 80 functional tests passed using isolated SQLite, including separate newsletter consent, demo submission blocking and policy-page routes (`APP_URL=http://localhost:3335 node ace test functional`).
- Production build passed (`node ace build`); generated `build/` and `public/assets/` were refreshed.
- Calculated contrast: gray-600 on white 7.56:1, gray-50 7.23:1, gray-100 6.87:1; gray-500 borders on white 4.83:1; gray-400 footer text on gray-900 6.99:1. These verify those colour pairs only, not all rendered states or all pages.
- No browser/screen-reader session was run. Photo rights and deployment-specific tracking are not verified. Development MySQL migrations were not run.

## Reference sources

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): contrast, keyboard, labels and focus criteria. This work uses a 4.5:1 normal-text target, with manual testing still required.
- [Nigeria Data Protection Act 2023 — NDPC](https://ndpc.gov.ng/download/nigeria-data-protection-act-2023): reference for the operator’s privacy review; jurisdiction has not been confirmed for a future buyer.
- [FCCPA 2018 — FCCPC](https://fccpc.gov.ng/wp-content/uploads/2022/07/FCCPA-2018.pdf): section 120 addresses advance-booking cancellations and reasonable cancellation charges. Existing fixed cancellation rules must be assessed against actual circumstances; the policy page cannot by itself establish their legality.
