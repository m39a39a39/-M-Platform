# Customer sales advisor

The customer endpoint uses two bounded structured model calls: understand the conversation and plan retrieval, then select relevant products and write an evidence-grounded answer. It no longer routes ordinary replies through keyword-based policy/product shortcuts or a shared response cache. Search variants and taxonomy selections come from the model; retrieval searches the current catalog and the final model ranks the evidence. This is semantic query expansion, not a persisted vector index.

Every turn reads published products, current active pages, public storefront copy and active knowledge-base entries. Publishing or changing these sources affects the next request without a training job. Unknown specifications and compatibility are not inferred as catalog facts. The existing administration knowledge-base and policy editors remain the authoring surface; the admin AI page explains the live-read behavior.

## Authorization boundary

- Authentication and database profiles determine role; body fields never do. Invalid bearer sessions do not fall back to guest chat.
- Only guests and clients can use customer chat. Admin AI and staff inbox permissions remain separate. This does not introduce a supplier assistant.
- A supplied conversation ID must exist and belong to the authenticated customer, or to the exact guest bearer key for an unowned guest conversation. Mismatches return 404 without writes. Guest keys are browser-session capabilities, not customer account credentials.
- History is read from the verified conversation on the server. Browser-supplied history is ignored.
- Public evidence is explicitly projected; no raw settings, drafts, supplier identity, internal notes or account directory is sent to the customer model.
- Personal-order retrieval runs only for authenticated clients, using the server identity. The underlying snapshot filters owners, and the model projection checks ownership and quote parent relationships again. No model-provided customer ID, SQL, table name or URL is executed.
- Reply/product selection is limited to retrieved public products. UI conversation storage is scoped by account ID; late responses after a controller/account switch are discarded.
- Published content is untrusted reference material, not model instructions. Prompt isolation complements server authorization; it does not replace it.

## Verification

`node --test tests/sales-advisor.test.mjs tests/chat-security.test.mjs` checks cross-account and guest isolation, role rejection, forged history, public projection, fresh source updates, price tiers and ownership of personal orders. Pure semantic-routing fixtures validate the retrieval contract; actual language understanding still requires provider-backed evaluation. Run the complete root and mobile-app test suites and frontend build before release.
