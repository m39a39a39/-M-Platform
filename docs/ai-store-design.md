# AI homepage design

Open Storefront → Store design → Home → Design store with AI. Describe a new design or an improvement to the current homepage. Preview desktop/mobile, then use the proposal to edit text, media, colors, spacing and product selection in the existing inspector. Undo, draft saving and reviewed publication use the existing studio workflow.

Generation requires settings permission, checks the settings version, and uses the existing server-only OPENAI_API_KEY and OPENAI_ADMIN_MODEL / OPENAI_CHAT_MODEL configuration. It is limited to 12 generations per administrator per 10 minutes through the existing rate-limit RPC. No database migration is needed.

Only homepage sections are replaced. Header/footer, other pages, products, prices, categories and global settings remain intact. Generated output cannot introduce arbitrary code or links. References are restricted to supplied public product/category IDs and images already in the current storefront draft; product cards retain their own photography. Generation does not save or publish settings. Only usage/rate-limit records are written. Concurrent changes prevent applying a stale proposal.

Validation: 154 root tests, 26 frontend tests, syntax checks and Vite production build passed. After the catalog-image refinement all six design tests passed, including the new product-photo regression. Browser checks used disposable local SQL data and a deterministic generation response: open designer, request design, mobile preview, apply, edit title, save draft and reviewed publish. Public state retained the old homepage until publication and excluded the saved draft. These checks do not validate a live model response.
