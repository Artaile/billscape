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
| /products/new | ProductFormPage | Brand field, variants, batch tracking |
| /products/:id/edit | ProductFormPage | |
| /inventory | InventoryPage | 4 tabs: Stock List, Ledger & History, Adjustments, Opening Stock |
| /purchases | PurchasesPage | owner + manager only — New Purchase, Edit, Import CSV, purchase_no |
| /suppliers | SuppliersPage | owner + manager only |
| /customers | CustomersPage | |
| /expenses | ExpensesPage | owner + manager only |
| /promotions | PromotionsPage | Scope (order/product/category/store), max_uses cap, coupon codes |
| /returns | ReturnsPage | Sale returns + Purchase returns; stock auto-adjustment on save |
| /quotations | QuotationsPage | Draft/sent/accepted/rejected/expired; convert to invoice |
| /loyalty | LoyaltyPage | Points earn/redeem, per-customer transaction history dialog |
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
  **order_discount_type, order_discount_value, order_discount_amount, net_payable** — post-tax bill discount)
- sale_items (cgst_amount, sgst_amount, igst_amount per line; **discount_type, discount_amount** — flat/percent line discount, alongside existing discount_pct)
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
- loyalty_customers, loyalty_transactions (type: add/redeem), loyalty_settings
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

## Purchases page features (as of 2026-07-29)
- **New Purchase / Edit Purchase are FULL PAGES** (`/purchases/new`, `/purchases/:id/edit`), not
  dialogs — `PurchasesPage.tsx` keeps only the list table + View/Delete/Import CSV dialogs.
  `PurchaseFormBody` (the old dialog-based item-entry component) was deleted entirely.
- Table columns: Purchase No | Date | Supplier | Invoice No | Items | Total Amount | Actions
- Actions per row: View | Edit (→ full page) | Delete
- Purchase No auto-generated on save: PUR-YYYYMMDD-XXXX (sequential per org per day)
- `PurchaseFormPage.tsx` (`apps/web/src/pages/purchases/`): header (supplier select + inline
  quick-add, invoice no, date, purchase type Credit/Cash, notes) → an "Add Item" entry strip
  (Product search-or-create, Code, Barcode, GST%, Purchase Rate, Qty, MRP, Retail Price, SP)
  → items table → footer totals (CGST/SGST or IGST, Bill Discount, Round Off, Total).
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
