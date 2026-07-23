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

## Pages & Routes (all under AppShell, require auth + org)
| Route | Component | Notes |
|---|---|---|
| /dashboard | DashboardPage | KPI cards, GST Overview, 7-day chart, low stock, top products, activity |
| /billing | BillingPage | POS — barcode scan, named hold bills (multi-hold), WhatsApp receipt |
| /products | ProductsPage | Import CSV / Export CSV, barcode label print |
| /products/new | ProductFormPage | Brand field, variants, batch tracking |
| /products/:id/edit | ProductFormPage | |
| /inventory | InventoryPage | 4 tabs: Stock List, Ledger & History, Adjustments, Opening Stock |
| /purchases | PurchasesPage | owner + manager only |
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
- Email verified → onAuthStateChange SIGNED_IN → RequireOrg → /onboarding
- Onboarding → creates org + membership → /dashboard
- Forgot password → resetPasswordForEmail with redirectTo /reset-password
- Supabase site_url = https://billscape-seven.vercel.app

## Database schema (key tables)
- organizations (id, name, gstin, state_code, country, business_type, plan enum[free/pro/enterprise], status enum[active/suspended], address)
- memberships (org_id + user_id + role enum[super_admin/owner/manager/cashier])
- profiles (id, full_name, avatar_url, phone)
- products (id, org_id, category_id, name, sku, hsn_code, tax_rate, price, cost_price, barcode_value, image_url, track_stock, is_active, has_batches, has_variants, **brand**)
- categories, inventory, stock_movements (reason enum: sale/purchase/adjustment/return/damage/opening)
- product_variants (product_id, size, color, price_delta, stock_qty, barcode_value)
- inventory_batches (product_id, batch_no, expiry_date, qty, cost_price)
- sales, sale_items (cgst_amount, sgst_amount, igst_amount per line)
- purchases, purchase_items (product_id nullable — free-text items allowed)
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
- purchase_items.product_id made nullable (free-text items don't need a product record)
- inventory trigger skip_null_product_inventory: ignores inserts with product_id = null
- increment_stock_on_purchase trigger: early RETURN NEW when product_id IS NULL
- returns.return_type added (sale/purchase); purchase_ref added
- promotions.scope, target_id, max_uses added
- products.brand added
- employees table created with RLS
- roles table created with RLS; default system roles (Owner/Manager/Cashier) auto-inserted per org on migration

## Known column name mappings (DB vs app)
- expenses.expense_date (was "date" — renamed)
- purchases.invoice_no (was "invoice_ref" — renamed)

## RLS pattern
All tenant tables use: organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())

## POS Hold Bills
- Stored in sessionStorage as array under key `billscape_held_bills`
- Each held bill: { id, name, cart, customer, savedAt }
- UI: "Hold" button → named dialog → "Held Bills N" badge to resume
- Multiple named holds supported; competitor had none

## Sidebar nav order (as of 2026-07-24)
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
