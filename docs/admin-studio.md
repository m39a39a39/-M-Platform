# Connected store administration

`/studio.html` is part of the existing web/Capacitor build. It uses the same session module, verified profiles, server API and Supabase database as the original application. The independent Sites prototype is not the live administration entry point.

## Operations

- Store design, collections, pages, banners, navigation and catalog edits are drafts until explicitly published. A draft can be saved on the server. A publish commits changed products and settings together, checking every row version. The existing database RPC limits a publish to 19 product edits plus one settings row.
- Settings permission is required to save/publish the studio. Product edits additionally require offers.edit; publication requires translate and publish and an explicit redaction review. Deletion uses the existing soft-delete field and trash permission. Existing linked products are archived through the UI.
- Products keep their supplier ownership and source currency. New products require a valid supplier; published content needs Arabic and English text. Product images use existing authenticated uploads/media. No demo products or users are seeded in production.
- New cart orders require delivery details and start at availability verification. Preliminary cart totals are recalculated on the server, including wholesale tiers. No proforma invoice or payment request is created at checkout.
- Administrators confirm each line's availability and final quantity/price, then choose a bank account in the order currency. Payment can be confirmed from the existing receipt review or recorded manually with amount, currency and transaction reference. Payment confirmation advances the order to preparation.
- Nine customer-visible stages run through delivery; shipment requires carrier and tracking number. Internal notes and audit changes are excluded from client projections. Order and supplier lines update in a single transaction with version checks.
- Existing orders retain their original workflow and are linked to the original administration interface. No existing order is migrated automatically.

## Validation and deployment

Run `npm test`, `npm run check`, and `npm --prefix mobile-app test`; build with `npm run build`. The database already provides the service-only `commit_changes` and `allocate_invoice_number` RPCs, so this change requires no schema migration or new public database grants. Browser tests use isolated in-memory fixtures; production business records must not be altered for smoke testing.

Web changes deploy through the existing GitHub/Vercel integration. Installed mobile applications receive UI changes in their next native build; the native generation workflow remains in place.
