# CLAUDE.md — BillScape Project Rules

## Product
Multi-tenant billing POS SaaS named **BillScape**. Any shop type signs up, configures branding +
enabled features, and bills on Web, Android, iOS against the same live data.
Roles: Super Admin (platform) → Shop Owner/Manager (tenant) → Employee/Cashier.

Live URL: https://billscape-seven.vercel.app
GitHub: https://github.com/Artaile/billscape
Supabase project ID: bzvbkscspzdschskbqtd

## Non-negotiable rules
1. Multi-tenancy: EVERY tenant table has organization_id. Enforce isolation with
   Supabase Row-Level Security. No cross-tenant reads, ever.
2. Business logic (tax/GST, totals, rounding, validation) lives ONLY in packages/core.
   Never duplicate it in web or mobile. Every app imports from @billscape/core.
3. QR/barcode is a P0 correctness path. Every scan failure must be handled explicitly.
4. USB hardware scanners are keyboard-wedge devices. Use inter-keystroke timing (75ms threshold).
5. Cashiers must NEVER see cost price, profit, or owner-only reports.
6. Cloud (Supabase) is the source of truth.
7. India GST first: intra-state = CGST+SGST, inter-state = IGST.

## Tech stack (do not change without asking)
- Monorepo: pnpm workspaces + Turborepo
- Web: React + Vite + TypeScript + Tailwind + shadcn/ui (PWA)
- Mobile: Expo (React Native)
- Backend: Supabase (Postgres, Auth, RLS, Realtime, Storage, Edge Functions)
- Shared: packages/core (types, tax, totals, validation), packages/api (supabase client)

## UI Design
- Dark + modern: zinc-950 background, zinc-800 sidebar, indigo-500 accent
- English language UI
- shadcn/ui components throughout
- Brand color applied via injected <style> tag with !important to override Tailwind CSS specificity
  (see apps/web/src/lib/brandColor.ts — hexToHsl + style tag injection)
- Brand color injects --ring with !important — dialog containers must use outline:none !important
  and box-shadow override in index.css [role="dialog"]:focus to prevent blue ring flash

## Pages & Routes (all under AppShell, require auth + org)
| Route | Component | Notes |
|---|---|---|
| /dashboard | DashboardPage | KPI cards, GST Overview, 7-day chart, low stock, top products, activity |
| /billing | BillingPage | Tabs: POS + History (see Billing tab sections below) |
| /products | ProductsPage | Import CSV / Export CSV, barcode label print |
| /products/new | ProductFormPage | Brand field, variants, batch tracking; two-column layout with sticky live preview panel (see Product form section) |
| /products/:id/edit | ProductFormPage | |
| /inventory | InventoryPage | 4 tabs: Stock List, Ledger & History, Adjustments, Opening Stock |
| /purchases | PurchasesPage | owner + manager only — New Purchase, Edit, Import CSV, purchase_no |
| /suppliers | SuppliersPage | owner + manager only |
| /customers | CustomersPage | |
| /expenses | ExpensesPage | owner + manager only |
| /promotions | PromotionsPage | Scope (order/product/category/store), max_uses cap, coupon codes |
| /returns | ReturnsPage | Sale returns + Purchase returns; stock auto-adjustment on save |
| /quotations | QuotationsPage | Draft/sent/accepted/rejected/expired; convert to invoice |
| /loyalty | LoyaltyPage | Points earn/redeem, per-customer transaction history dialog (manual admin view — POS is now the primary earn/redeem flow, see Loyalty Program section) |
| /employees | EmployeesPage | CRUD, card UI, role badge, activate/deactivate; owner + manager only |
| /roles | RolesPage | Roles list, Permission Matrix tab, Clone, Create custom role; owner only |
| /activity | ActivityPage | Audit log; owner + manager only |
| /shifts | ShiftsPage | Shift open/close/summary; owner + manager only |
| /ledger | LedgerPage | Double-entry accounting (accounts + vouchers); owner + manager only |
| /reports | ReportsPage | owner + manager only |
| /settings | SettingsPage | 8 tabs: Shop Info, Branding, Appearance, Team, Billing, Invoice, Regional, Backup |

## Auth flows
- Email/password login only (Phone OTP tab removed)
- Signup → "Check your email" screen (mailer_autoconfirm = false in Supabase)
- Signup password rules: min 8 chars, uppercase, lowercase, special character (zod schema + strength meter UI)
- Password field has show/hide Eye icon toggle on both signin and signup
- Email verified → onAuthStateChange SIGNED_IN → RequireOrg → /onboarding
- Onboarding → creates org + membership → /dashboard
- Forgot password → resetPasswordForEmail with redirectTo /reset-password
- Supabase site_url = https://billscape-seven.vercel.app

## Database schema (key tables)
- organizations (id, name, gstin, state_code, country, business_type, plan enum[free/pro/enterprise], status enum[active/suspended], address)
- memberships (org_id + user_id + role enum[super_admin/owner/manager/cashier])
- profiles (id, full_name, avatar_url, phone)
- products (id, org_id, category_id, name, sku, hsn_code, tax_rate, price, cost_price, **mrp**,
  **special_price**, barcode_value, image_url, track_stock, is_active, has_batches, has_variants, **brand**)
- categories, inventory, stock_movements (reason enum: sale/purchase/adjustment/return/damage/opening)
- product_variants (product_id, size, color, price_delta, stock_qty, barcode_value)
- inventory_batches (product_id, batch_no, expiry_date, qty, cost_price)
- sales (cgst_amount... via sale_items; **voided_at, voided_by, void_reason, purge_after** — recycle bin;
  **order_discount_type, order_discount_value, order_discount_amount, net_payable** — post-tax bill discount;
  **loyalty_customer_id, loyalty_points_redeemed, loyalty_redeem_amount, loyalty_points_earned** — POS
  loyalty integration, see Loyalty Program section)
- sale_items (cgst_amount, sgst_amount, igst_amount per line; **discount_type, discount_amount** — flat/percent line discount, alongside existing discount_pct; **variant_id** FK → product_variants,
  **variant_label** — set when the line was rung up via a specific variant's own barcode/picker,
  see Variant-aware POS section)
- purchases (id, org_id, supplier_id, invoice_no, purchase_no, **purchase_date**, **purchase_type**
  enum[credit/cash], **bill_discount_type**, **bill_discount_value**, **round_off**, total_amount, notes)
- purchase_items (product_id nullable — free-text items allowed; **tax_rate**, **taxable_amount**,
  **cgst_amount**, **sgst_amount**, **igst_amount** added for per-line GST — see Purchases page section)
- suppliers, customers
- expenses (id, org_id, description, amount, category, expense_date, notes)
- **returns** (id, org_id, **return_type** enum[sale/purchase], original_invoice_no, **purchase_ref**, reason, refund_mode, refund_amount, notes)
- return_items (return_id, product_name, qty, unit_price, line_total)
- quotations (id, org_id, quote_no, customer_name, customer_phone, valid_until, status, total_amount)
- quotation_items
- **promotions** (id, org_id, name, code, type, value, **scope** enum[order/product/category/store], **target_id**, **max_uses**, min_order_amount, max_discount_amount, valid_from, valid_until, is_active, usage_count)
- loyalty_customers (org_id, **customer_id** FK → customers, nullable — links to POS `customers` row;
  legacy rows may still be standalone via customer_name/customer_phone text fields; unique per
  (org_id, customer_id) when set; **points_balance has a CHECK >= 0**), loyalty_transactions
  (type: add/redeem, **sale_id** now actually gets set by POS sales), loyalty_settings
  (points_per_rupee, rupees_per_point, min_redeem_points)
- **employees** (id, org_id, full_name, phone, email, role, is_active, joined_date, notes)
- **roles** (id, org_id, name, description, is_system, permissions jsonb)
- shifts (opened_by, closed_by, opening_cash, closing_cash, total_sales, bill_count, status)
- accounts, vouchers, voucher_entries (double-entry ledger)
- activity_log (actor_id, actor_name, action, entity, entity_id, metadata)
- org_settings (org_id, branding jsonb, feature_flags jsonb, tax_profile jsonb, invoice_template jsonb)

## OrgBranding fields (org_settings.branding jsonb)
primary_color, logo_url, shop_name, invoice_header, invoice_footer,
bank_name, bank_account, bank_ifsc, invoice_terms, invoice_prefix,
currency, date_format, timezone

## Critical DB fixes applied
- purchases.invoice_ref renamed to invoice_no
- purchases.purchase_no added (text, nullable, unique per org) — auto-generated as PUR-YYYYMMDD-XXXX on save
- purchase_items.product_id made nullable (free-text items don't need a product record)
- inventory trigger skip_null_product_inventory: ignores inserts with product_id = null
- increment_stock_on_purchase trigger: early RETURN NEW when product_id IS NULL
- returns.return_type added (sale/purchase); purchase_ref added
- promotions.scope, target_id, max_uses added
- products.brand added
- employees table created with RLS
- roles table created with RLS; default system roles (Owner/Manager/Cashier) auto-inserted per org on migration
- migration 012_billing_history.sql (2026-07-28): sales/sale_items void + discount columns (see schema above);
  increment_inventory(p_org_id, p_product_id, p_qty) RPC created — was referenced by ReturnsPage but never
  actually existed in any prior migration; UPDATE/DELETE RLS policies added on sales + sale_items (previously
  only SELECT/INSERT existed, which silently blocked any edit/delete/void feature)
- migration 013_purchase_enhancements.sql (2026-07-29): purchases/purchase_items/products columns for the
  unified purchase+product-creation flow (see Purchases page section); fixed a live stock double-counting
  bug where `PurchasesPage.tsx`'s `savePurchaseItems` manually upserted `inventory` on top of what the
  `increment_stock_on_purchase` trigger already applied on every `purchase_items` insert
- migration 014_loyalty_integration.sql (2026-08-05): loyalty_customers.customer_id FK added (was
  previously a fully standalone table matched only by free-text name/phone — see Loyalty Program
  section); sales.loyalty_customer_id/loyalty_points_redeemed/loyalty_redeem_amount/loyalty_points_earned
  added; one-time backfill matches existing standalone loyalty_customers rows to customers by phone
  within the same org
- migration 015_loyalty_points_balance_check.sql (2026-08-05): CHECK (points_balance >= 0) on
  loyalty_customers — defense-in-depth against the read-then-write update in createSale's loyalty
  bookkeeping landing on a negative balance under a concurrent-sale race
- migration 016_supplier_bank_details.sql (2026-08-06): suppliers.bank_name/bank_account/bank_ifsc
  added — see Suppliers form section
- migration 017_supplier_upi_id.sql (2026-08-06): suppliers.upi_id added (optional) — see
  Suppliers form section
- migration 019_variant_sales.sql (2026-08-09): sale_items.variant_id (FK → product_variants) +
  variant_label added; decrement_stock_on_sale() trigger updated to also decrement
  product_variants.stock_qty when variant_id is set (GREATEST(0, ...) floor, mirrors the
  aggregate inventory decrement); increment_inventory_variant(p_org_id, p_product_id,
  p_variant_id, p_qty) RPC added — variant-aware sibling of increment_inventory, used by
  updateSale/voidSale/restoreSale for stock reversal/reapplication on a variant-linked line —
  see Variant-aware POS section

## Known column name mappings (DB vs app)
- expenses.expense_date (was "date" — renamed)
- purchases.invoice_no (was "invoice_ref" — renamed)
- purchases.purchase_no (new column, added 2026-07-24)

## RLS pattern
All tenant tables use: organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())

## Phone number input pattern (all phone fields app-wide)
- inputMode="numeric", type="text", maxLength={11}
- formatted as "XXXXX XXXXX" (5 digits + space + 5 digits) via formatPhone()
- only digits allowed — alphabet blocked via onChange replace(/\D/g, '')
- validation: 10 digits required for India mobile; warn if fewer, block save if invalid
- applies to: SuppliersPage, CustomersPage, PurchasesPage quick-add supplier

## Product form (as of 2026-08-06)
- `ProductFormPage.tsx` (`/products/new`, `/products/:id/edit`) redesigned to match
  `PurchaseFormPage.tsx`'s visual pattern: `max-w-6xl mx-auto` shell,
  `grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5` — left column is the same 8 sections as
  before (Basic Info, Pricing & Tax, Inventory, Variants, Batches, Barcode, Image), each card
  header now has a `text-indigo-400` icon (previously only 2 of 8 cards had any icon, and it was
  muted zinc, not indigo) — no functional change to any field or the save mutation.
- **Right column**: sticky (`lg:sticky lg:top-4`) live "Preview" card — image, product name
  (falls back to italic "Untitled product" placeholder), retail price with MRP shown
  strikethrough next to it when set and different, a live **margin %** stat
  (`(price - cost_price) / price * 100`, green/red by sign), a GST rate pill, category/variant
  count/batch count badges, and the Save/Cancel buttons live here (moved out of the bottom of
  the left column, mirroring Purchase's summary-card-owns-the-primary-action pattern). All values
  are `watch()`ed from the same RHF form — no extra state.
- Category `<select>` styling normalized to Purchase's `border-zinc-700 bg-zinc-900
  focus:ring-indigo-500` (was `border-input bg-background focus:ring-ring`, an older/different
  token set — purely visual, same behavior).
- **Bug fixed in passing**: `mrp`/`special_price` used `register(field, { valueAsNumber: true })`,
  which turns an empty input into `NaN` — `ProductSchema`'s `z.number().min(0).optional()`
  (`packages/core/src/validation/index.ts`) does not treat `NaN` as "absent", so leaving either
  field blank silently blocked save with "Expected number, received nan" and no visible error
  near the field (RHF focused the empty input but the message wasn't obviously tied to it). Fixed
  by switching both to `setValueAs: (v) => (v === '' ? undefined : Number(v))`, which was already
  necessary for the new preview panel's MRP-vs-price comparison to work correctly on an empty MRP.

## Suppliers form (as of 2026-08-06)
- **Single shared dialog** for add/edit: `apps/web/src/components/suppliers/SupplierFormDialog.tsx`
  (`SupplierFormDialog`, exports `SupplierOption` type). Used both by `SuppliersPage.tsx` (full
  page, add + edit) and `PurchaseFormPage.tsx`'s "Add new supplier" button (add-only — no
  `editTarget` passed) — previously PurchaseFormPage had its own lightweight inline quick-add
  panel (name + phone only) that silently diverged from the full SuppliersPage dialog; now both
  entry points create/edit the exact same fields, so a supplier added mid-purchase isn't missing
  data compared to one added from `/suppliers`.
- Fields: Name*, Phone, **Address*** (both required — Address was originally optional but
  merchants kept skipping it, so it's now enforced in the form same as Name; the DB column
  itself stays nullable so old rows and in-flight edits aren't blocked), Email, GSTIN, and a
  **Bank Details** subsection (Bank Name, Account Number, IFSC Code, **UPI ID** — optional, since
  not every supplier takes bank transfer — `suppliers.bank_name`/`bank_account`/`bank_ifsc`
  from migration `016_supplier_bank_details.sql`, `upi_id` from migration `017_supplier_upi_id.sql`)
  — bank field naming matches `org_settings.branding`'s own bank_name/bank_account/bank_ifsc
  (see OrgBranding fields above).
- `onSaved(supplier)` callback fires after insert/update — PurchaseFormPage uses it to
  auto-select the newly created supplier in the purchase's supplier dropdown, same behavior the
  old inline panel had.
- **Layout**: 2-column grid (Name+Phone, Email+GSTIN, Bank Name+Account, IFSC+UPI) in a
  `max-w-lg` dialog — the original one-field-per-row layout in a `max-w-sm` dialog made the
  form tall enough that the Save/Cancel footer scrolled out of the viewport on a standard screen.

## Suppliers form email validation (as of 2026-08-09)
- `SupplierFormDialog.tsx` validates email format on blur (`EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/`)
  — red border + inline "Enter a valid email address" message, and blocks Save while invalid.
  No shared `SupplierSchema` exists in `packages/core/src/validation` (unlike Product), so this is
  local component state/regex, not zod-driven — do not assume every form's validation is schema-based.
  Editing the field after a blur-triggered error clears the error immediately (no need to blur again).

## Purchases page features (as of 2026-07-29)
- **New Purchase / Edit Purchase are FULL PAGES** (`/purchases/new`, `/purchases/:id/edit`), not
  dialogs — `PurchasesPage.tsx` keeps only the list table + View/Delete/Import CSV dialogs.
  `PurchaseFormBody` (the old dialog-based item-entry component) was deleted entirely.
- Table columns: Purchase No | Date | Supplier | Invoice No | Items | Total Amount | Actions
- Actions per row: View | Edit (→ full page) | Delete
- Purchase No auto-generated on save: PUR-YYYYMMDD-XXXX (sequential per org per day)
- `PurchaseFormPage.tsx` (`apps/web/src/pages/purchases/`): a single-row "Purchase Details" card
  (Supplier `lg:w-[280px]` + "Add new supplier" → shared `SupplierFormDialog`, see Suppliers
  section; Invoice No `lg:w-[160px]`; Date `lg:w-[150px]`; Purchase Type Credit/Cash toggle
  `lg:w-[170px]`; Notes `flex-1`, stretches to fill remaining width — `flex flex-col
  lg:flex-row`, stacks on narrower screens) → an "Add Item" entry strip
  (Product search-or-create, Code, Barcode, GST%, Purchase Rate, Qty, MRP, Retail Price, SP)
  → items table → footer totals (CGST/SGST or IGST, Bill Discount, Round Off, Total).
- **"More details" collapsible (as of 2026-08-06)**: for `is_new_product` rows only (existing
  products already carry this on their own record — the toggle doesn't render at all when an
  existing product is selected, so purchase entry can never silently overwrite a real product's
  category/HSN/variants/batches) — a `▾ More details (Category, HSN, Variants, Batches)` link
  under Row 3 of the entry strip expands to: Category `<select>` (own `categories` query, same
  styling as the Supplier select) + HSN Code (`Input`, validated inline with the same 4/6/8-digit
  regex as `ProductSchema.hsn_code` in `packages/core/src/validation/index.ts` — this page has no
  RHF, so the check is a plain `hsnCodeError()` helper, not schema-driven), then two "Enable"
  sliding toggles (same visual pattern as `ProductFormPage.tsx`'s own Variants/Batches toggles)
  each revealing a compact repeatable-row editor identical in shape to the Add Product page's
  (Size/Color/Price±/Stock for variants; Batch No/Expiry/Qty for batches). Collapsed by default
  and per-row (`PurchaseRow.showMoreDetails`) — expanding it for one row doesn't affect others.
  Before this, a product created via purchase entry had `category_id`/`hsn_code` always null and
  `has_variants`/`has_batches` always false regardless of what the merchant actually had, forcing
  a second trip to `/products/:id/edit` to fill them in — the two entry points now produce
  identical, complete product records. `PurchaseLineInput` (`packages/api/src/purchases.ts`)
  carries these as optional fields; `createProductForLine` inserts the extra `products` columns
  and, on success, inserts into `product_variants`/`inventory_batches` (same empty-row filtering
  rules as `ProductFormPage.tsx`'s own save mutation — best-effort, a failure here does not fail
  the purchase since the product row was already committed).
- **Unified purchase entry + product creation** (fixes the old "double entry" problem): typing
  a product name that doesn't match an existing product auto-generates SKU (`generateSku()`)
  and barcode (`generateBarcode()`, both in `packages/core/src/codes.ts`), badges the row "New",
  and creates the product row on Save via `packages/api/src/purchases.ts`'s `createPurchase`
  (which calls `createProduct` internally) — no separate trip to `/products/new` needed.
  Selecting an existing product locks Code/Barcode read-only and prefills GST/rates, with an
  "Update this product's cost/price/GST" checkbox (default ON) to sync changed rates back.
- Debounced live uniqueness check on Code/Barcode fields (queries `products` directly) — blocks
  duplicates before Save is even attempted, not just on DB constraint violation.
- GST is computed per-line via `packages/core`'s `computeGST`/`computeLineTax` (previously
  purchases had NO tax computation at all — this is new). Interstate vs intrastate is derived
  from `org.state_code` (2-letter alpha, e.g. "TN") vs the supplier's GSTIN — **GSTIN's first 2
  digits are numeric** (e.g. "33"), so a `stateCodeFromGSTIN()` lookup table in
  `packages/core/src/gstinStates.ts` maps GSTIN numeric prefixes to alpha state codes before
  comparing; comparing raw GSTIN digits against `org.state_code` directly (as first attempted)
  is WRONG and makes every supplier-with-GSTIN look interstate.
- **Stock double-count bug (fixed 2026-07-29)**: the app used to manually upsert `inventory`
  in `savePurchaseItems` AFTER inserting `purchase_items`, on top of the DB trigger
  `increment_stock_on_purchase` (which already does its own upsert + `stock_movements` insert
  on every `purchase_items` INSERT) — stock was being incremented 2x per purchase item. Fixed
  by removing the app-side upsert everywhere (New, Edit, Import CSV) — the trigger is now the
  sole source of stock adjustment on insert.
- **Edit** (`updatePurchase` in `packages/api/src/purchases.ts`): updates header fields, then
  reverses the ORIGINAL items' stock contribution first (via `increment_inventory` RPC with a
  negative qty + an `adjustment` `stock_movements` row, mirroring `updateSale`'s pattern in
  `sales.ts`), then delete+reinserts `purchase_items` — the trigger fires on the reinsert and
  adds the NEW quantities. Net effect: final stock reflects only the edited quantities, not
  old+new stacked. Do not call `createPurchase` for edits — it has no `purchase_no` and will
  hit the `purchases_purchase_no_org_idx` unique constraint.
- Items table: product search/free-text, Qty (text+inputMode=numeric), Unit Cost/rate fields
  (text+inputMode=decimal) — Qty and Unit Cost use type="text" (NOT type="number") so
  onFocus→select() works reliably; this pattern is used for ALL numeric fields in this flow.
- Import CSV: download template → upload → editable preview table → verify → save as purchase
  (unchanged qty×cost-only shape, no GST — still uses the app-level `savePurchaseItems` helper
  in `PurchasesPage.tsx`, now fixed to not double-count stock).
- `products.mrp` and `products.special_price` (nullable numeric) added — MRP is the printed
  label price, Special Price is an optional promo/discounted price; wiring SP into POS checkout
  logic is NOT done yet (v2).
- `purchases.purchase_date`, `purchases.purchase_type` (credit/cash), `purchases.bill_discount_type`,
  `purchases.bill_discount_value`, `purchases.round_off` added; `purchase_items.tax_rate`,
  `taxable_amount`, `cgst_amount`, `sgst_amount`, `igst_amount` added (migration
  `013_purchase_enhancements.sql`).

## Purchase form — inline category + variant QR/barcodes (as of 2026-08-09)
- **Inline "Create new category"**: a `+` button next to the Category `<select>` (inside "More
  details") swaps it for an inline `<Input>` + Check/X buttons (Enter submits, Escape cancels).
  `handleAddCategory()` calls `createCategory` (`@billscape/api`), refetches the categories query,
  and auto-selects the new category on the current row (`entry.category_id`) — no separate trip to
  a Categories page needed mid-purchase-entry.
- **Per-variant barcode**: `VariantRow` gained a `barcode_value` field, auto-filled with
  `generateBarcode()` (`packages/core/src/codes.ts`) whenever a new variant row is created (Track
  Variants toggle-on, or "Add Variant"). The variant table (inside "More details") has its own
  Barcode column with an `<Input>` + regenerate button per row, plus an explanatory note that each
  variant gets scanned/priced independently at POS. Saved via `createProductForLine` in
  `packages/api/src/purchases.ts` into `product_variants.barcode_value` (falls back to
  `generateBarcode()` if left blank).
- **Items table variant breakdown**: rows with `has_variants && variants.length > 0` get an expand
  chevron + "N variants" badge in the Product cell (`expandedRows: Set<number>` state,
  `toggleRowExpanded`). Expanding renders a sub-`<TableRow colSpan={11}>` with a
  `grid-cols-[1fr_1fr_100px_80px_1fr]` breakdown of Size/Color/Price±/Stock/Barcode per variant.
  Uses `Fragment` (named import from `'react'`, not `React.Fragment` — this file has no default
  `React` import) to wrap each row + its expandable sub-row.

## Variant-aware POS scanning (as of 2026-08-09)
- **Scope**: scanning or typing a specific variant's own barcode at POS resolves that exact
  size/color, prices it at `product.price + variant.price_delta`, and decrements that variant's
  own `product_variants.stock_qty` in addition to the aggregate `products`→`inventory.stock_qty`
  row — not just "save a barcode string and price generically." This was an explicit scope
  decision (via AskUserQuestion) over two lighter alternatives (price-correct-only /
  save-barcode-only) because the user's ask was for scan-to-shop correctness end-to-end, including
  stock.
- `CartItem` (`packages/core/src/types/index.ts`) gained optional `variant_id`/`variant_label`.
  Every cart-line operation in `POSTab.tsx` (`addToCart`, `updateQty`, `updateSellingUnit`,
  `updateDiscount`, `removeFromCart`) and `CartItem.tsx`'s row callbacks now take an optional
  `variantId` and match lines via a composite `product_id + variant_id` key (`lineMatches` /
  `matches` helpers) — two variants of the same product share `product_id`, so matching on
  `product_id` alone would collapse them into one cart line. Cart list `key` and `HistoryTab.tsx`'s
  `EditSaleDialog` item list `key` are both composite for the same reason.
- **Product grid tile**: a product with `has_variants && product_variants.length > 0` shows a
  "from ₹X" price prefix + "N options" badge and opens a Variant Picker `<Dialog>` on click
  instead of adding straight to cart. The picker lists each variant's label, its own price
  (`product.price + variant.price_delta`), and disables it with "Out of stock" when
  `track_stock && stock_qty <= 0`.
- `findByBarcode(code)` (`POSTab.tsx`) checks the base product's `barcode_value` first, then each
  variant's own `barcode_value`, and is used by both the USB-scanner keydown handler and manual
  barcode typing in the search box.
- **PostgREST `.or()` bug (found + fixed 2026-08-09)**: the product search query originally did
  `.or('name.ilike...,barcode_value.ilike...,product_variants.barcode_value.ilike...')` — PostgREST
  does **not** support filtering an embedded/joined table's column inside a top-level `.or()`
  alongside the parent table's own columns; it silently returns 0 rows for that whole `.or()`
  instead of erroring (visible as a `400` in the network tab, not a JS exception), which broke
  typing or scanning a variant-only barcode into the search box. Fixed by splitting into two
  queries: `.or('name.ilike...,barcode_value.ilike...')` on the base table, plus a separate query
  using `.filter('product_variants.barcode_value', 'ilike', ...)` with `.not('product_variants',
  'is', null)` (the correct PostgREST syntax for filtering by an embedded resource), merged
  client-side by product id. **If any other query needs to search by a joined table's column
  inside an `.or()`, it has the same bug — split it the same way, don't try to jam it into one
  `.or()` string.**
- **Sale pipeline**: `buildSaleItemRows()` writes `variant_id`/`variant_label` on insert. The
  `decrement_stock_on_sale` trigger (migration `019_variant_sales.sql`) decrements
  `product_variants.stock_qty` (floored at 0) in addition to its existing `inventory.stock_qty`
  decrement, when `NEW.variant_id IS NOT NULL`. `updateSale`/`voidSale`/`restoreSale`
  (`packages/api/src/sales.ts`) all now `select('product_id, qty, variant_id')` and call
  `increment_inventory_variant` (not the old `increment_inventory`) so stock reversal/reapplication
  during edit, void, and restore correctly targets the same variant the original sale line hit —
  QC-verified: edit qty 1→3 correctly nets -2 on the variant's stock and leaves the sibling variant
  untouched; void fully reverses; restore fully reapplies.
- `InvoicePrint.tsx` needed no changes — the variant label is already baked into
  `sale_items.product_name` (e.g. "T-Shirt (L / Red)") at cart-add time via `addToCart`'s
  `displayName`, so print/reprint show it automatically.

## Dialog / Radix UI focus rules (CRITICAL — do not revert)
- All dialogs use DialogContent from apps/web/src/components/ui/dialog.tsx
- onOpenAutoFocus: always e.preventDefault() — Radix must not focus the dialog container
- onFocusOutside: always e.preventDefault() — prevents Radix FocusScope from stealing focus
  back to the dialog container on every React re-render (each keystroke)
- onInteractOutside: preventDefault only when target is inside dialog
- Dialog container has outline:none + ring-0 + focus:ring-0 Tailwind classes
- index.css has [role="dialog"]:focus { outline:none !important; box-shadow: shadow-only !important }
  to defeat brand color --ring !important injection
- PurchaseFormBody is defined at FILE TOP LEVEL (outside PurchasesPage function) — if defined
  inside the parent component it gets a new identity on every render → unmount/remount → focus lost

## Billing tab structure (as of 2026-08-04)
- BillingPage.tsx is now a thin tab shell (Tabs from ui/tabs.tsx): POS | History
- apps/web/src/components/billing/POSTab.tsx — all POS logic (was previously inline in BillingPage.tsx)
- apps/web/src/components/billing/HistoryTab.tsx — bill list + view/edit/delete + recycle bin
- apps/web/src/components/billing/QuickAddCustomerDialog.tsx — inline customer creation from POS
- **POS layout (flipped 2026-08-04)**: Cart is now the WIDE side on the LEFT (lg:w-[60%] xl:w-[65%],
  `order-1`), product search/grid is narrower on the RIGHT (lg:w-[40%] xl:w-[35%], `order-2`) — uses
  flexbox `order-*` classes rather than reordering JSX so the `border-r` stays correctly on the cart
  panel's right edge. This reverses the original 2026-07-28 layout — do not flip back without
  re-confirming with the user, both directions were explicit feedback at different times.
- Product grid is a fixed 3-column grid (`grid-cols-3`, not responsive 2–5 col) — explicit user request.
- Product search matches `name` OR `barcode_value` via `.or('name.ilike...,barcode_value.ilike...')`
  (previously only matched name — silently broke manual barcode typing/search, not just USB scans).
  Search box has a clear "X" button, and `productSearch` auto-clears the instant a product is
  added to cart (click or scan) so the full grid reappears for the next lookup — no manual clearing
  needed between scans.
- **Unsaved-cart navigation guard**: `apps/web/src/contexts/NavigationGuardContext.tsx` (wraps the
  whole app in App.tsx) lets any component register a `shouldBlock()` predicate via
  `useRegisterNavigationGuard()`. POSTab registers `cart.length > 0`. AppShell's sidebar `Link`s and
  sign-out button call `requestNavigation()` instead of navigating directly — if blocked, shows a
  "Leave this bill?" confirm dialog (Stay / Leave & discard) instead of navigating. Also has a
  `beforeunload` listener in POSTab for tab-close/refresh (native browser confirm). Does NOT fire for
  an empty cart. Switching the POS↔History Radix tab does NOT trigger this (cart state persists,
  since POSTab stays mounted under TabsContent) — only leaving `/billing` entirely does.

## POS Hold Bills
- Stored in sessionStorage as array under key `billscape_held_bills`
- Each held bill: { id, name, cart, customer, savedAt }
- UI: "Hold" button → named dialog → "Held Bills N" badge to resume
- Multiple named holds supported; competitor had none

## Purchase drafts + leave-page confirmation (as of 2026-08-06)
- `PurchaseFormPage.tsx` previously had ZERO unsaved-work protection — the back arrow and
  "Cancel" button both called `navigate('/purchases')` directly. Now both route through
  `requestNavigation(() => navigate('/purchases'))` (`@/contexts/NavigationGuardContext`), and a
  `beforeunload` listener covers tab-close/refresh — same two-layer pattern POSTab already used.
- **`NavigationGuardContext.tsx` was generalized** (still the single shared context/dialog used by
  both POS and Purchases — not forked) to support a `GuardConfig` object
  (`{ shouldBlock, title?, message?, onSaveDraft? }`) in addition to the original bare-predicate
  form. `useRegisterNavigationGuard` accepts either shape; POSTab's existing call site
  (`useRegisterNavigationGuard(() => cartRef.current.length > 0)`) is unchanged and still renders
  the original "Leave this bill?" / Stay / Leave & discard 2-button dialog (title/message default
  to the POS copy, and the third "Save Draft" button only renders when `onSaveDraft` is provided).
  Purchases registers `{ shouldBlock, title: 'Leave this purchase?', message: '...', onSaveDraft }`
  → the dialog gains a middle "Save Draft" button (Stay / Save Draft / Discard).
- **Draft storage** (`apps/web/src/lib/purchaseDrafts.ts`) mirrors POS's hold-bill pattern exactly:
  `sessionStorage` key `billscape_purchase_drafts`, `PurchaseDraft { id, name, supplierId,
  supplierName, invoiceNo, purchaseDate, purchaseType, notes, rows, billDiscountType,
  billDiscountValue, roundOffEnabled, savedAt }`. **No DB row, no product-creation/stock side
  effects** — this was a deliberate choice over a `purchases.status = 'draft'` DB column, since
  `createPurchase` creates real products and fires the stock-increment trigger on insert, which is
  unsafe for a half-filled/abandoned row.
- `PurchaseFormPage.tsx`'s `PurchaseRow` interface is now exported (`export interface
  PurchaseRow`) so `purchaseDrafts.ts` can type `rows` without duplicating its ~17 fields.
- The in-progress "Add Item" entry row (`entry` state — a product typed but not yet clicked
  "Add to List") is intentionally **not** captured in a draft, matching POS's own hold-bill
  (which only persists the committed `cart`, not a not-yet-added line) — if a merchant is mid-way
  through typing a new item when they save a draft, that partial row is lost, same tradeoff POS
  already accepted.
- Resuming works the same way CSV-import hand-off already did: `navigate('/purchases/new', {
  state: { draftId } })` → a `useEffect` parallel to the existing CSV-import effect loads the
  draft by id, populates every setter, **removes it from storage** (resume = pop, same as
  `resumeHeldBill`), and clears router state. Unlike POS's hold-bill resume, there's no "current
  cart must be empty first" block — landing on `/purchases/new` with a `draftId` is always a fresh
  mount, so there's nothing to collide with.
- `PurchasesPage.tsx` shows a "Drafts N" ghost button (amber, only rendered when
  `drafts.length > 0` — same conditional-render convention as POS's "Held Bills N") next to
  Import CSV/New Purchase, opening a list dialog with the same row shape as POS's Held Bills List
  Dialog (name, item count, saved time, Resume + delete-icon buttons, no delete confirmation).

## POS discounts (line-level and bill-level)
- Line-level (per cart item): toggle between % and ₹ flat via discount_type, applied BEFORE tax
  (reduces taxable_amount). CartItem.tsx renders the ₹/% segmented toggle next to the qty controls.
- Bill-level (order discount): toggle between % and ₹ flat, applied AFTER tax on grand_total —
  does NOT change the GST taxable value or breakup, only what the customer pays. This was an explicit
  user decision (not the more "correct" GST-compliant approach of discounting before tax) — do not
  move it before tax without re-confirming with the user.
- packages/core/src/tax/gst.ts: computeLineTax accepts optional discountType/discountAmount params
  (flat mode resolves via Math.min(amount, baseAmount) to prevent negative taxable value).
  applyOrderDiscount(totals, type, value) is a separate pure function — clamps to [0, grand_total],
  returns order_discount_amount + net_payable. InvoiceTotals now has these two extra fields.
- InvoicePrint.tsx must render order_discount_amount / net_payable as "Bill Discount" / "Payable"
  when order_discount_amount > 0 (easy to regress — this was missing on first pass and silently
  under-reported what the customer actually paid on the printed invoice).

## POS cart UI density (as of 2026-08-04)
- `CartItem.tsx`'s `CartItemRow` is a single compact line (~40px, was ~90px two-row layout):
  name+price+GST on the left, qty stepper, discount %/₹ toggle, line total, remove icon, all inline.
- Totals block in POSTab.tsx is minimal: Subtotal → collapsible "GST" summary line (tap to expand
  CGST/SGST or IGST breakup, `showTaxDetails` state) → Grand Total → Bill Discount → Payable.
  Net effect: 4+ cart items fit with room to spare before scrolling, instead of ~2 before scroll.
- Customer search dropdown previously visually overlapped the cart item rows below it. Root cause
  was NOT z-index/stacking — it was that `bg-popover` / `text-popover-foreground` were used in
  POSTab.tsx but **`popover` was never registered as a color token in `tailwind.config.ts`**, so the
  class emitted no CSS and the dropdown box was fully transparent (`background-color: rgba(0,0,0,0)`),
  letting cart rows show through underneath a technically-correctly-stacked (z-50) but invisible
  background. Fixed by adding `popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' }`
  to the `colors` block in tailwind.config.ts — `--popover` CSS vars already existed in index.css.
  If any other `bg-popover`/`text-popover` usage appears transparent, check this token exists first.
  **Requires a dev server restart, not just HMR** — Tailwind reads `tailwind.config.ts` at PostCSS
  build time, changes to it don't hot-reload.

## POS split payment (as of 2026-08-04)
- Single-payment mode: Cash/Card/Upi icon+label tabs sit in the SAME row as the amount input
  (`flex items-stretch gap-1.5` — tabs `shrink-0`, input `flex-1`), not stacked on separate rows.
  Below it: "Balance" (was "Change" — renamed per user feedback) shown in green when amount paid
  exceeds payable, or "Short by ₹X" in red when under.
- "Split payment across methods" toggle is a full-width bordered CTA button (not a plain text
  link) — flips to a filled indigo "Use a single payment method" active state when split mode is on.
- Split mode: Cash/Card/Upi render as ONE compact row (3 side-by-side compact fields, each with a
  small colored icon badge — emerald cash / indigo card / sky upi — that lights up once filled),
  not 3 stacked rows. Each field has an inline "fill remaining" down-arrow button that
  auto-calculates and fills exactly what's left for that field. A single-line
  "Remaining to collect ₹X" (amber) / "Paid ✓" (emerald, whole card turns green) status sits below
  the row. Toggling split ON prefills Cash with the full payable (common case) rather than 3 blanks.
- **Float-precision bug (fixed)**: `splitTotal`/`splitRemaining`/fill-button amounts MUST be rounded
  to paise via `Math.round(x * 100) / 100` before comparing — e.g. `500 + 972.64 === 1472.6399999999999`
  in JS, not `1472.64`, so raw comparison silently left "Fully collected" unreachable even when the
  displayed (rounded) amounts matched exactly. Any new split-payment arithmetic must round the same way.
- `createSale`'s `payment_mode: 'split'` + `cash_amount`/`card_amount`/`upi_amount` were already
  schema-ready (migration existed) but had ZERO working consumers before this — fixed two blind spots
  that assumed one exclusive `payment_mode` per sale:
  - ShiftsPage.tsx cash-drawer reconciliation (`cashSalesTotal` query) now also sums the `cash_amount`
    portion of `payment_mode = 'split'` rows, not just pure `'cash'` rows (was undercounting cash
    drawer expectations for every split sale).
  - ReportsPage.tsx "Payment Mode Split" now decomposes split sales into their actual cash/card/upi
    components and merges into those buckets, instead of dumping the whole `grand_total` into an
    opaque `split` bucket.
- InvoicePrint.tsx has an optional `paymentDetail` prop — shows e.g. "Split (Cash ₹500.00, UPI
  ₹402.78)" next to Payment Mode. POSTab computes this from the actual inserted `sales` row
  (`saleRow.cash_amount` etc.), not from component state, since state resets before the invoice renders.

## Bill edit / recycle bin (History tab)
- Full item quantity edit allowed (not just metadata) — packages/api/src/sales.ts updateSale():
  reverses old line stock via increment_inventory RPC + logs a stock_movements row
  (reason: 'adjustment'), deletes old sale_items, inserts new sale_items (the existing
  decrement_stock_on_sale INSERT trigger re-decrements automatically — do NOT also manually
  decrement for the new lines, that would double-count).
- Delete is a SOFT delete ("Recycle Bin"), not a hard delete: voidSale() reverses all line stock,
  sets voided_at/voided_by/void_reason/purge_after (= now + 30 days). Sale stays in the DB.
- Restore (restoreSale): re-decrements stock (mirrors original sale decrement — sale_items are NOT
  re-inserted here so the INSERT trigger does not fire, must be done manually via RPC + stock_movements).
- Permanent delete (purgeSale): hard-deletes sale_items then sales row. Only reachable from the Bin.
- purgeExpiredVoidedSales(orgId) sweeps bin entries past purge_after — called lazily on History tab
  mount (no cron/Edge Function; acceptable since the bin isn't viewed daily by every tenant).
- getSales() defaults to voided_at IS NULL; pass { voidedOnly: true } for the Bin view.
- Edit/Delete actions in HistoryTab are gated to owner/manager via useAuth().role — cashiers can
  still View/Reprint.

## Loyalty Program — POS integration (as of 2026-08-05)
- Previously `/loyalty` was a fully isolated page: `loyalty_customers` had NO link to `customers`
  (its own free-text `customer_name`/`customer_phone`), and POS billing had zero loyalty awareness —
  cashiers had to finish a bill then separately go add/redeem points by hand. Now POS is the primary
  earn/redeem flow; `/loyalty` remains as an admin/overview page (settings, manual adjustment,
  transaction history) but is no longer required for normal day-to-day billing.
- `loyalty_customers.customer_id` (FK → customers, nullable, unique per org when set) is the link.
  **Auto-enrollment is lazy**: POSTab does NOT create a loyalty row just because a customer is
  selected — `ensureLoyaltyCustomer` (packages/api/src/loyalty.ts) is only called right before
  `createSale`, and only if `pointsToEarn > 0` for that sale. This avoids creating loyalty rows for
  customers who never actually earn. On a unique-violation race (two first-ever sales for the same
  new customer nearly simultaneously), `ensureLoyaltyCustomer` re-fetches the winner's row instead of
  failing — the loser's sale still completes, just without a `loyalty_customer_id` (best-effort).
- POSTab shows a `⭐ N pts` badge next to the selected customer's name (only if a loyalty row exists —
  no "0 pts" noise for non-members), an "Earns N pts on this sale" line near Payable
  (`Math.floor(net_payable * points_per_rupee)`), and — once `points_balance >= min_redeem_points` —
  a "Redeem points" checkbox/amount row in the totals card that applies a checkout discount.
- **Redemption is a separate field from order discount, not a reuse of it** — a merchant may want
  both a manual bill discount AND loyalty redemption on the same sale. `packages/core/src/tax/gst.ts`'s
  `applyLoyaltyRedemption(totals, redeemAmount)` mirrors `applyOrderDiscount` but is applied AFTER it
  and stacks: `net_payable = grand_total - order_discount_amount - loyalty_redeem_amount`, clamped to
  never go negative. `InvoiceTotals.loyalty_redeem_amount` is a required field — any code constructing
  an `InvoiceTotals` object literal (there are a few: HistoryTab's bill-detail totals rebuild,
  PurchaseFormPage's `emptyTotals()`) must include it or TypeScript will fail the build.
- `createSale` (packages/api/src/sales.ts) does the earn/redeem bookkeeping AFTER `sales`/`sale_items`
  insert succeeds, wrapped in try/catch (best-effort — a loyalty failure must never roll back or fail
  the sale itself, matching the existing non-blocking pattern used elsewhere in this file). It updates
  `points_balance`/`total_points_earned`/`total_points_redeemed` on `loyalty_customers` and inserts
  `loyalty_transactions` rows with `sale_id` set — previously `sale_id` was defined on the table but
  never actually populated by any code path, since `/loyalty`'s manual add/redeem UI never sets it.
  **Redeem points are clamped to the customer's actual current `points_balance` read at write time**
  (not the possibly-stale client-computed amount) before the balance update, and
  `loyalty_customers.points_balance` has a DB-level `CHECK (points_balance >= 0)` (migration 015) as a
  second line of defense — the balance update is a plain read-then-write, not an atomic RPC, so a
  true concurrent-sale race for the same customer is still theoretically possible; if this ever
  becomes a real-world issue, replace it with an `increment_loyalty_points` RPC mirroring the
  `increment_inventory` pattern already used for stock.
- **Any change of the selected customer must reset redemption state.** POSTab has a
  `useEffect` keyed on `selectedCustomer?.id` that resets `redeemLoyalty`/`loyaltyRedeemValue`
  whenever the customer changes — this covers ALL paths (search-select, quick-add, X-clear, held-bill
  resume) in one place rather than needing every individual `setSelectedCustomer(...)` call site to
  remember to also clear redemption. This was a real bug caught in QC: without it, checking "redeem"
  for Customer A then picking Customer B directly (without clicking X first) silently carried A's
  redeem amount into B's bill.
- InvoicePrint.tsx renders a "Loyalty Redeemed" row (green) alongside "Bill Discount" when
  `loyalty_redeem_amount > 0`; the bold "Payable" row's trigger condition is
  `order_discount_amount > 0 || loyalty_redeem_amount > 0` (both must be checked, not just one).
- Loyalty settings query key is `loyalty_settings` (underscore, matches `/loyalty`'s existing
  LoyaltyPage key) — POSTab must use the same key or a rate change saved on `/loyalty` won't
  invalidate POSTab's cached settings in another open tab.

## Sidebar nav order (as of 2026-07-25)
Dashboard → Billing (POS) → Products → Inventory → Purchases → Suppliers → Customers →
Returns → Quotations → Loyalty → **Employees** → **Roles** → Expenses → Promotions →
Activity → Shifts → Ledger → Reports → Settings

## Role-based nav visibility
- All roles: Dashboard, Billing, Customers, Returns, Quotations, Loyalty
- owner + manager: Products, Inventory, Purchases, Suppliers, Employees, Expenses, Promotions, Activity, Shifts, Ledger, Reports
- owner only: Roles, Settings

## Super Admin portal (NOT YET BUILT — next sprint)
- Planned route: /platform/login (separate dark-themed login)
- memberships.role enum already has 'super_admin' — use this as guard
- Planned pages: /platform (dashboard), /platform/tenants, /platform/plans, /platform/subscriptions, /platform/usage, /platform/settings
- DB needed: plans table, org_plans table
- organizations.status (active/suspended) already exists — suspend works today via SQL
- See COMPETITOR_GAP_PLAN.md for full Super Admin spec
