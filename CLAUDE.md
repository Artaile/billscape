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
| Route | Component | Status |
|---|---|---|
| /dashboard | DashboardPage | Built |
| /billing | BillingPage | Built |
| /products | ProductsPage | Built |
| /products/new | ProductFormPage | Built |
| /products/:id/edit | ProductFormPage | Built |
| /inventory | InventoryPage | Built |
| /purchases | PurchasesPage | Built |
| /suppliers | SuppliersPage | Built |
| /customers | CustomersPage | Built |
| /expenses | ExpensesPage | Built |
| /promotions | PromotionsPage | Built |
| /reports | ReportsPage | Built |
| /settings | SettingsPage | Built |

## Auth flows
- Email/password login only (Phone OTP tab removed)
- Signup → "Check your email" screen (mailer_autoconfirm = false in Supabase)
- Email verified → onAuthStateChange SIGNED_IN → RequireOrg → /onboarding
- Onboarding → creates org + membership → /dashboard
- Forgot password → resetPasswordForEmail with redirectTo /reset-password
- Supabase site_url = https://billscape-seven.vercel.app

## Database schema (key tables)
- organizations, memberships (org_id + user_id + role)
- products, categories, inventory, stock_movements
- sales, sale_items
- purchases, purchase_items (product_id nullable — free-text items allowed)
- suppliers, customers
- expenses (columns: id, organization_id, description, amount, category, expense_date, notes, created_at)
- promotions (columns: id, organization_id, name, code, type, value, min_order_amount, max_discount_amount, valid_from, valid_until, is_active, usage_count, created_at)

## Critical DB fixes applied
- purchases.invoice_ref renamed to invoice_no
- purchase_items.product_id made nullable (free-text items don't need a product record)
- inventory trigger skip_null_product_inventory: ignores inserts with product_id = null
- increment_stock_on_purchase trigger: early RETURN NEW when product_id IS NULL
  (prevents stock_movements insert from failing on free-text purchase items)

## Known column name mappings (DB vs app)
- expenses.expense_date (was "date" — renamed)
- purchases.invoice_no (was "invoice_ref" — renamed)

## RLS pattern
All tenant tables use: organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())

## Sidebar nav order
Dashboard → Billing (POS) → Products → Inventory → Purchases → Suppliers → Customers → Expenses → Promotions → Reports → Settings
