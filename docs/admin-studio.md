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

## Unified storefront and operations

`/studio.html` is now the admin entry point; `/admin.html` rewrites to it and admin login redirects there. The Operations area embeds the existing account, supplier quote, invoice, product moderation, taxonomy, currency, and banking tools using the same session and API permissions. Version 2 order links route to the nine-stage editor.

Homepage content uses `shared/home-config.mjs`, persisted as `settings.storefront.home`. The editor exposes Arabic/English copy, contact details and fourteen visibility switches. Changes stay in the draft until reviewed and published; switches govern presentation, while checkout always displays payable totals. Guest/client storefronts and admin previews share the renderer. Preview carts are local simulations and cannot submit orders.

Legacy operation saves refresh a clean editor. Unsaved design drafts remain intact and retain their original settings version, so concurrent settings changes cause a conflict instead of silently overwriting data. Reload before republishing a conflicted draft.

Validation: 27 backend tests, 15 mobile/session tests, Vite production build, and local browser checks for guest quick-add/cart totals, embedded account details, homepage text/visibility publication, and the preview cart. No production test orders were created.

## Administrator creation and page layout

Administrators with `accounts.manage` can create client/supplier accounts. The backend uses server-only Auth Admin, creates the existing profile through the signup trigger, records the creator, and never returns a password/session or sends an automatic email. The account owner sets a password through the existing recovery flow. Existing email addresses cannot be silently taken over.

Creating a customer order requires `requests.edit` and `accounts.read`. The same stock, MOQ, tier-price, currency and supplier checks apply as customer checkout. The order and all lines belong to the selected active client; the commit and order audit identify the administrator. All nine fulfillment stages, payment confirmation, invoices, notes and shipping edits remain available.

Page layout uses validated section settings shared by the backend and storefront. Desktop/mobile visibility and column counts, colors, alignment, spacing, image display, heading sizes and grid/list/horizontal display are editable. Main welcome/catalog/request/footer sections are reorderable and hideable; new sections include benefits, steps, FAQ, CTA, image/caption, dividers and spacers. New sections are inserted before the footer. Published guest/client stores and the preview share the renderer.

Validation includes 30 backend tests; local browser checks created an account and an administrative order, completed all nine stages and generated invoices, then published a FAQ section and verified it in the storefront. Production verification is read-only; no customer records are created for testing.
