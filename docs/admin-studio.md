# Connected store administration

`/studio.html` is part of the existing web/Capacitor build. It uses the same session module, verified profiles, server API and Supabase database as the original application. The independent Sites prototype is not the live administration entry point.

## Operations

- Store design, collections, pages, banners, navigation and catalog edits are drafts until explicitly published. A draft can be saved on the server. A publish commits changed products and settings together, checking every row version. The existing database RPC limits a publish to 19 product edits plus one settings row.
- Settings permission is required to save/publish the studio. Product edits additionally require offers.edit; publication requires translate and publish and an explicit redaction review. Deletion uses the existing soft-delete field and trash permission. Existing linked products are archived through the UI.
- Products belong to the store; supplier ownership and private costs are tracked separately in supply sources. Published content needs Arabic and English text. Product images use existing authenticated uploads/media. No demo products or users are seeded in production.
- New cart orders require delivery details and start at availability verification. Preliminary cart totals are recalculated on the server, including wholesale tiers. No proforma invoice or payment request is created at checkout.
- Administrators confirm each line's availability and final quantity/price, then choose a bank account in the order currency. Payment can be confirmed from the existing receipt review or recorded manually with amount, currency and transaction reference. Payment confirmation advances the order to preparation.
- Nine customer-visible stages run through delivery; shipment requires carrier and tracking number. Internal notes and audit changes are excluded from client projections. Order and supplier lines update in a single transaction with version checks.
- Existing orders retain their original workflow and are linked to the original administration interface. No existing order is migrated automatically.

## Validation and deployment

Run `npm test`, `npm run check`, and `npm --prefix mobile-app test`; build with `npm run build`. The database provides service-only RPCs; the local supply-source update additionally requires the migration documented below. Browser tests use isolated local fixtures; production business records must not be altered for smoke testing.

Web changes deploy through the existing GitHub/Vercel integration. Installed mobile applications receive UI changes in their next native build; the native generation workflow remains in place.

## Unified storefront and operations

`/studio.html` is now the admin entry point; `/admin.html` rewrites to it and admin login redirects there. The Operations area embeds the existing account, supplier quote, invoice, product moderation, taxonomy, currency, and banking tools using the same session and API permissions. Version 2 order links route to the nine-stage editor.

Homepage content now uses `shared/storefront-model.mjs` and `settings.storefront.sections` (schema version 2). The old separate home-content editor has been removed. Section content, visibility, and layout are edited together. Changes stay in the draft until reviewed and published; switches govern presentation, while checkout always displays payable totals. Guest/client storefronts and admin previews share the renderer. Preview carts are local simulations and cannot submit orders.

Legacy operation saves refresh a clean editor. Unsaved design drafts remain intact and retain their original settings version, so concurrent settings changes cause a conflict instead of silently overwriting data. Reload before republishing a conflicted draft.

Validation: 27 backend tests, 15 mobile/session tests, Vite production build, and local browser checks for guest quick-add/cart totals, embedded account details, homepage text/visibility publication, and the preview cart. No production test orders were created.

## Administrator creation and page layout

Administrators with `accounts.manage` can create client/supplier accounts. The backend uses server-only Auth Admin, creates the existing profile through the signup trigger, records the creator, and never returns a password/session or sends an automatic email. The account owner sets a password through the existing recovery flow. Existing email addresses cannot be silently taken over.

Creating a customer order requires `requests.edit` and `accounts.read`. The same stock, MOQ, tier-price and currency checks apply as customer checkout. The order and all lines belong to the selected active client; the commit and order audit identify the administrator. All nine fulfillment stages, payment confirmation, invoices, notes and shipping edits remain available.

Page layout uses validated section settings shared by the backend and storefront. Desktop/mobile visibility and column counts, colors, alignment, spacing, image display, heading sizes and grid/list/horizontal display are editable. Main welcome/catalog/request/footer sections are reorderable and hideable; new sections include benefits, steps, FAQ, CTA, image/caption, dividers and spacers. New sections are inserted before the footer. Published guest/client stores and the preview share the renderer.

Validation includes 30 backend tests; local browser checks created an account and an administrative order, completed all nine stages and generated invoices, then published a FAQ section and verified it in the storefront. Production verification is read-only; no customer records are created for testing.


## Local fulfillment update (not deployed)
- Sourcing orders can be created by administrators for active customers, using existing image/content validation and review before publication.
- `POST /api/v1/orders/assign` assigns active requests or standalone interests to an active supplier. Cart children and selected quote fulfillment access update atomically with version checks; customer prices and original ownership remain unchanged. Completed/cancelled records cannot be reassigned.
- Source-order and store-order lists are separated; pre-v2 product orders retain a dedicated compatibility view.
- Shipping from v2 stage 3 collects and validates carrier/tracking in the same transaction as the stage change.
- Obsolete legacy product-edit entry point, local-only publishing implementation, and unreachable reset code were removed. Existing record compatibility is retained intentionally.
- Verified using 35 backend tests, 15 mobile tests and isolated browser assignment/shipping checks. No production records, repository branches, or deployments were changed for this update.


## Store-owned catalog and private supply sources (local, not deployed)

Products in `public_offers` are store-owned (`owner_id = null`, `storeOwned = true`). Supplier proposals and fulfillment terms are stored in the server-only `supply_sources` table. Suppliers can browse the published catalog and submit a source offer; they cannot mutate or delete catalog products. New product proposals remain private until an administrator reviews their images, bilingual content, taxonomy, and independent sale price. Administrators may link a proposal to an existing product instead of creating another one.

Suppliers can edit their own linked source terms and resubmit them for review. Resubmission returns the source to pending; existing assigned orders retain their frozen terms and store sale prices do not change.

Each supplier/product pair is unique at the SQL level. Approval and product creation use one transaction with version checks. Only the source owner and authorized administrators receive source pricing. Customer responses exclude source identities, costs and assignment audit. Products remain visible if their original supplier account is blocked.

New cart orders go to administration without an assigned supplier. Administrators select an approved source for each line; assignment checks MOQ, stock and active supplier status, and freezes the source terms separately from the customer price. Supplier execution responses contain their agreed source price and sanitized product details, without customer contact information. Existing RFQ reassignment requires the target supplier's own approved quote; it no longer shares the previous supplier's price.

### Database change — do not apply until publication is explicitly authorized

`supabase/migrations/20260923085832_store_supply_sources.sql` was generated with the Supabase CLI and prepared after the existing database migrations 001–016. It has been executed only against an isolated PGlite PostgreSQL database for verification. It preserves published product IDs, moves their original supplier terms into approved sources, routes pending legacy products through source review, and preserves in-progress assignments before detaching catalog ownership. It enables RLS, revokes direct anonymous/authenticated access, and extends the service-role-only atomic commit function. No migration or data changes have been applied to the hosted database.

Do not deploy the application changes without this schema change: the new APIs require `supply_sources`. Review historical stock values before using migrated sources; missing stock is conservatively migrated as zero.

### Repeatable local preview

Run `npm install`, install the mobile app dependencies, then `npm run preview:suppliers`. This serves an isolated, disposable SQL-backed preview at `http://127.0.0.1:4194`. Local accounts: `admin@example.test`, `supplier@example.test`, `other@example.test`, and `client@example.test`; any test password is accepted only by this fixture. Restarting resets the data. The fixture never connects to production.

`npm test` includes actual SQL tests for migration, source approval, two suppliers behind one product, privacy, assignment, unique constraints, and direct access denial. Mobile tests and a browser flow were also checked: second supplier offer → admin approval → per-line assignment → supplier confirmation, retaining separate sale and supply totals.


## Unified homepage replacement (local, not deployed)

The root Vite document previously contained a complete legacy guest homepage. `guest.js` exposed that view while fetching state, then `mountGuestStore` hid its header/hero/footer and inserted a second renderer. That sequential replacement caused the flash of old content. There is no SSR or hydration framework in this application; `/` serves the Vite entry document. There is no service-worker registration in the source. Authentication routes share that entry; admin redirects remain separate from guest storefront rendering.

The legacy HTML, guest-home event handlers, alternate preview renderers, old home editor and their retired CSS selectors have been removed. The entry contains only the storefront mount and an explicit session/data loading state. Render-blocking built CSS loads before the module renders the new storefront. Failures show a retry state, not an older design. HTML and mutable studio script responses are configured to revalidate; API responses already use `private, no-store`. Hosted cache behavior is not changed until deployment is authorized.

`schemaVersion: 2` stores all homepage sections in a single ordered array. Removing every section intentionally produces an empty homepage below the header, with no automatic re-creation of deleted sections. General commerce/header options are separate from section content. A server-only data conversion adapter reads pre-version-2 settings and translates them into sections; it has no UI or rendering path and is not included in the browser bundle. The next authorized save/publication persists the new shape. It preserves existing content without operating two page systems.

The editor supports bilingual section copy and buttons, safe custom links, image uploads, category images, visibility per device/channel, pointer/touch dragging and keyboard-accessible move buttons. Product sections support manual lists, category filtering, newest products, selected featured products and saved collections. Preview uses the same renderer, with desktop/tablet/mobile widths and Arabic/English direction. Draft saves do not modify the published homepage.

Product/category/ordinary section frames are 1:1; hero/banner frames are 2:1. Images retain their aspect ratio using object-fit. Product names reserve two lines with ellipsis, meta and price/action areas align, and every card in a section has the same height.

Verification: 42 backend/model tests and 15 mobile/session tests passed; Vite build and syntax checks passed. Browser tests used only the disposable local SQL fixture. At 1440, 820 and 390 CSS pixels, both Arabic and English layouts had no horizontal document overflow; product image frames were square and card heights matched (approximately 584/591/364 pixels respectively, depending on grid width). Browser tests exercised bilingual section creation, manual product selection, draft save, English preview, no draft leakage into the published guest view, drag reordering, deletion and undo. No production database, branch or deployment was changed.

### Contextual sections and clickable banners (local)

Only controls applicable to the selected section type are shown. Product-source controls reveal either category, collection or manual selection as needed; custom URL fields appear only for link destinations. Hero/image sections can make the full surface clickable without nesting interactive elements. Campaign banners with a destination URL also make their full surface clickable.

Explore opens all published products associated with that section, independent of the homepage card limit. View all products opens the complete published catalog. Both routes use the shared listing renderer in the store and preview. Returning to the guest homepage restores its original DOM nodes, preserving search/pagination listeners. Verified locally: a banner selecting one product opens one result, View all opens four fixture products, and guest search still works after returning home. Draft changes remain unpublished.

### Image-only banner and 10 MiB image selection (local)
The section library includes «بنر صورة فقط»: a 2:1 cover image whose entire area opens a custom link or the configured product selection. Text and visible buttons are omitted; section settings omit text fields. Studio image inputs now accept source files up to 10 MiB and use the shared compressor before upload (900 KiB target). Large images are encoded as WebP to preserve transparency and proportional dimensions. The server's existing compressed-image cap remains unchanged. No deployment performed.

### Focused section editor (local)
Section rows show their title, position, type and visibility. The inspector groups content, media, product selection, actions, layout, appearance and visibility in collapsible groups; only relevant fields are rendered. The section library groups visual, product, informational and spacing sections with descriptions. Existing catalog/footer choices and duplicate actions are disabled and guarded in the event handler. Removed the replaced section-library implementation and late singleton render wrapper, along with obsolete inspector/library CSS. Validated with 47 root tests, 16 mobile tests, a successful Vite build and local browser inspection. Not deployed.
