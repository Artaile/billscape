# BillScape — Competitor Gap Plan
_Competitor analyzed: billing-app-coral.vercel.app (login: fazil@gmail.com)_
_BillScape analyzed via: CLAUDE.md + live codebase (router + page files)_
_Analysis date: 2026-07-23 | QC reviewed & corrected same day_

---

## Competitor Feature Inventory (Full List Observed)

| Module | Features Seen |
|--------|--------------|
| Dashboard | Today's Sales, Monthly Sales, Total Revenue, Net Profit, Total Customers, Total Products, Inventory Value, Active Offers, Quick Actions, Sales Overview chart (7d/4w/6m), Financial Summary, **TAX Overview (GST Collected/Paid/Net Tax Payable)**, Recent Activity tabs, Low Stock Alerts |
| Products | SKU, Category, **Brand**, Price, Stock columns; Search; Add New; **Import / Export** |
| Categories | Category management |
| POS (Billing) | Product search by Name/SKU/Barcode, **Barcode scanner icon**, Add to Cart, Walk-in Customer, Payment Method (Cash/Card/UPI), Notes, **Coupon Code apply**, Subtotal/Tax/Grand Total, Generate Invoice |
| Invoices | Invoice #, Date, Customer, Amount, Payment, Status (COMPLETED), Edit, Add New |
| Purchases | Purchase #, Date, Supplier, Amount, Payment, Status, Add New |
| Returns | Sales & Purchase returns, Return #, **Type** column, Date, Amount, Status |
| Inventory | Overview (Total SKUs, Items in Stock, Inventory Value), **Stock List tab**, **Ledger & History tab** (stock movement per SKU), **Adjustments tab**, **Opening Stock tab**, Low Stock Alerts (Min Level config) |
| Customers | Customer management |
| Suppliers | Supplier management |
| Employees | Employee management (linked to plan limit: 0/5) |
| Roles & Permissions | Roles List (Cashier, Manager, Owner, custom), System Role flag, **Edit Permissions**, **Clone role**, **Permission Matrix tab** |
| Offers | Scope: PRODUCT / CATEGORY / STORE; Value (% or flat); Valid Until / No expiry; Active/Inactive |
| Coupons | Code, Value (%), Uses counter (0/∞ — with max_uses cap), Active/Inactive |
| Loyalty | Customer loyalty points, search by name, points + transaction history per customer |
| Reports | Today's Sales, Monthly Profit, Inventory Value, Low Stock Items, Total Customers, Total Suppliers, Tax Collected; **Sales Trend chart**, **Revenue vs Expenses chart** |
| Settings | **Company Profile** (Name, Legal Name, Email, Phone, Website, GST Number), **Branches**, **Invoice** settings, **Tax** config, **Printer** settings, **Email** settings, **Regional** settings, **User Preferences**, **Backup** |
| Subscription | Plan name, Days remaining, Start/Expiry, Current Usage meters, **Enabled Features** list, **Plan Limits table**, Billing Info, Upgrade/Download Invoice/Billing History/Contact Admin buttons. ⚠️ Bug: "Monthly Invoices: NaN" — their invoice metering has a null/parse bug. |
| Registration | "Register your company" self-serve signup |

---

## BillScape Current State (verified against router + page files)

> ⚠️ CLAUDE.md routes table is outdated — several pages are built but not listed there.
> Source of truth: `apps/web/src/router/index.tsx` + page files.

| Module | Status | Notes |
|--------|--------|-------|
| Dashboard | ✅ Built | |
| POS Billing | ✅ Built | |
| Products + Product Form | ✅ Built | |
| Inventory | ✅ Built | Adjust Stock dialog (opening/adjustment reasons) built |
| Purchases + Suppliers | ✅ Built | |
| Customers | ✅ Built | |
| Expenses | ✅ Built | Competitor has no expense tracking — differentiator |
| Promotions (basic coupons) | ✅ Built | Has code, type, value, usage_count, valid_from/until, is_active |
| Reports | ✅ Built | |
| Settings | ✅ Built (partial) | Has: Shop Info, Branding (logo/color/invoice header-footer), Appearance, Team, Billing placeholder |
| Auth (login/signup/forgot/reset) | ✅ Built | |
| Onboarding wizard | ✅ Built | Competitor has none — differentiator |
| **Returns** | ✅ Built (partial) | Sales returns only; Purchase returns missing; no stock auto-adjustment on return |
| **Loyalty** | ✅ Built | Points, earn/redeem, loyalty_settings, manual adjustment |
| **Quotations** | ✅ Built | quote_no, customer, valid_until, status, convert-to-invoice |
| **Activity Log** | ✅ Built | `/activity` route + activity_log table |
| **Shifts** | ✅ Built | `/shifts` route, shift open/close/summary — competitor has none (differentiator) |
| **Ledger (Accounting)** | ✅ Built | Full double-entry accounting ledger — competitor has nothing like this (differentiator) |
| **Barcode Label Printing** | ✅ Built | `BarcodeLabelDialog.tsx`, JsBarcode, 58mm layout, multi-copy |
| **Product Variants** | ✅ Built (partial) | `hasVariants`, variants array (size/color/price_delta/barcode) in ProductFormPage |
| **Expiry/Batch Tracking** | ✅ Built (partial) | `hasBatches`, `inventory_batches` table, expiry alerts in InventoryPage |
| Employees module | ❌ Missing | No `/employees` route or page |
| Roles & RBAC UI | ❌ Missing | `RequireRole` guard exists (hardcoded roles) but no admin-configurable Roles CRUD or Permission Matrix |
| Offers (scoped discounts) | ❌ Missing | No scope/target_id in promotions table; Promotions are order-level only |
| Coupon max_uses cap | ❌ Missing | usage_count tracked but no max_uses enforcement |
| Purchase Returns | ❌ Missing | Returns module only handles sales returns |
| Stock auto-adjustment on Return | ❌ Missing | Return creation does not insert into stock_movements |
| Branches / Multi-location | ❌ Missing | |
| Subscription / Plan management | ❌ Missing | Billing tab in Settings is a placeholder |
| Product Import / Export | ❌ Missing | |
| Product Brand field | ❌ Missing | |
| Inventory Stock List tab (separate) | ❌ Missing | Adjustments/Opening Stock exist as dialog, not as dedicated tabs |
| Inventory Ledger (stock movements) | ❌ Missing | Financial Ledger is built; stock movement ledger per SKU is not a UI tab |
| Inventory Adjustments tab | ❌ Missing | Adjust Stock dialog exists but no dedicated tab view |
| Inventory Opening Stock tab | ❌ Missing | `opening` reason exists in adjust dialog but no dedicated tab |
| Dashboard TAX Overview card | ❌ Missing | GST Collected/Paid/Net Payable KPI row not on dashboard |
| Settings → Invoice (bank details, terms, number format) | ⚠️ Partial | Header/footer/logo built; bank details, terms, invoice number format missing |
| Settings → Printer config | ❌ Missing | |
| Settings → Email (SMTP/Mailgun) | ❌ Missing | |
| Settings → Regional (timezone/date/currency) | ❌ Missing | |
| Settings → User Preferences | ❌ Missing | |
| Settings → Backup / Data Export | ❌ Missing | |
| Permission Matrix UI | ❌ Missing | |
| Loyalty per-customer transaction log | ❌ Missing | Competitor shows inline transaction history; BillScape shows only balance |
| Super Admin portal | ❌ Missing | |

---

## 🔴 HIGH PRIORITY — Build Now

| # | Feature | Why Critical | Scope |
|---|---------|-------------|-------|
| 1 | **Purchase Returns** | Extend existing Returns module: add `return_type` (sale/purchase), auto credit/debit stock via `stock_movements` on return | Extend `/returns` + schema |
| 2 | **Employees Module** | Multi-staff shops need employee management; prerequisite for RBAC | New `/employees` CRUD |
| 3 | **Roles & RBAC UI** | Competitor has Roles List + Edit Permissions + Clone + Permission Matrix; cashiers must never see cost price | New `/roles` page; extend existing `RequireRole` guard |
| 4 | **Offers (scoped discounts)** | Competitor: PRODUCT / CATEGORY / STORE scope; BillScape Promotions are order-level only | Schema: add `scope` enum + `target_id` FK to promotions table; new Offers UI |
| 5 | **Coupon max_uses cap** | Competitor shows usage limit (0/∞); BillScape tracks count but has no cap column | Add `max_uses` column to promotions; enforce in POS billing flow |
| 6 | **Dashboard TAX Overview card** | GST Collected / GST Paid / Net Tax Payable is critical for India compliance visibility | Add KPI row to dashboard |
| 7 | **Inventory dedicated tabs** | Competitor has Stock List, Ledger & History (stock movements per SKU), Adjustments, Opening Stock as separate tabs | Refactor InventoryPage: expose existing data in tab UI |
| 8 | **Product Import / Export** | Bulk catalog management; competitor has Import + Export on Products page | CSV import/export, map to existing products schema |
| 9 | **Subscription / Plan Management page** | SaaS monetization; show tenant plan, usage meters, feature flags, upgrade CTA | New `/subscription` route (reads from plans + org_plans tables built in Super Admin sprint) |
| 10 | **Super Admin portal** | Platform-level control: create tenants, assign plans, suspend orgs | See dedicated Super Admin section below |

---

## 🟡 MEDIUM PRIORITY — Build Next

| # | Feature | Notes |
|---|---------|-------|
| 1 | **Branches / Multi-location** | Settings → Branches + per-branch stock; upsell on paid plans |
| 2 | **Product Brand field** | Add `brand` column to products; filter/group in reports |
| 3 | **Loyalty per-customer transaction log** | Competitor shows inline history; add transaction list to LoyaltyPage |
| 4 | **Settings → Invoice** (bank details, terms, number format) | Header/footer/logo already built; add remaining fields |
| 5 | **Settings → Printer config** | Thermal printer (58mm/80mm), paper size, auto-print toggle |
| 6 | **Settings → Email (SMTP/Mailgun)** | Send invoices by email from POS |
| 7 | **Settings → Regional** | Currency symbol, date format, timezone, language |
| 8 | **Settings → User Preferences** | Theme, notification preferences |
| 9 | **Settings → Backup / Data Export** | Full org data export as CSV/JSON |
| 10 | **Permission Matrix UI** | Visual grid of role vs permission; tab in `/roles` |
| 11 | **Digital Receipts (Email/WhatsApp)** | Send receipt to customer after sale |
| 12 | **Draft / Hold Bills in POS** | Multiple named bill holds; BillScape-original feature (competitor lacks this) |
| 13 | **Quotations → Polish & expose** | Route exists; ensure convert-to-invoice flow is production-ready |
| 14 | **Product Variants → Polish & expose** | `hasVariants` UI is in ProductForm; ensure inventory/POS correctly handles variants |
| 15 | **Expiry/Batch → Polish & expose** | `hasBatches` + `inventory_batches` exist; wire up expiry alerts to notifications |
| 16 | **Purchase Reports (supplier/item-wise)** | Detailed purchase analytics tab in Reports |
| 17 | **Wastage Tracking** | Track expired/damaged stock write-offs; add `wastage` reason to stock_movements |
| 18 | **Serial Number Tracking** | Electronics shops; serial-level stock |

---

## 🟢 LOW PRIORITY — Future Phase

| Feature | Notes |
|---------|-------|
| Payroll / HR Module | Beyond current scope |
| Warehouse Management | Multi-location advanced |
| Financial Statements (Balance Sheet, P&L) | Accounting-grade (Ledger is built — this is the next step) |
| Fiscal Year Management | Year-end close |
| E-Commerce Integration | Online store sync |
| RFID Scanning | Hardware-specific |
| Multi-Currency | International expansion |
| Multi-Language UI (Tamil, Hindi) | India regional |
| Service / Repair Module | Service shops |
| Warranty Management | Electronics retail |
| Delivery Management | Last-mile |

---

## BillScape Differentiators — Keep & Market These

| Differentiator | Why it Matters |
|---------------|---------------|
| **India GST-first** (GSTIN, HSN, CGST/SGST/IGST) | Competitor not India-optimized; we auto-split intra/inter-state tax |
| **Onboarding Wizard** | Competitor dumps user on blank login with no guidance |
| **PWA (no app store)** | Shops install on Android from browser instantly |
| **Expenses Module** | Competitor has no expense tracking at all |
| **Shifts Management** | `/shifts` with shift open/close/summary; competitor has none |
| **Double-entry Accounting Ledger** | Full accounts + vouchers + debit/credit; competitor has nothing close |
| **Quotations / Estimates** | Convert quote to invoice; competitor lacks this |
| **Activity Log / Audit Trail** | Full audit trail at `/activity`; competitor has none visible |
| **Dark modern UI** (zinc-950 + indigo-500) | Competitor is plain white; our UI feels premium |
| **Brand color theming** | Shop owner sets brand color; competitor has none |
| **Barcode Label Printing** | 58mm thermal labels from inventory; competitor lacks this |

---

## Competitor Weaknesses Observed

### Tenant App Bugs
| Weakness | What it Means for BillScape |
|---------|----------------------------|
| **"Monthly Invoices: NaN"** on Subscription page | Invoice-count metering has a null/parse bug. Always coerce usage stats with `?? 0`, test with 0-invoice orgs |
| No onboarding wizard | First-time users land on blank app with no guidance — we win here |
| No shift management | Multi-cashier shops have no accountability |
| No expense tracking | Can't see true profit |
| No accounting ledger | We go far deeper on financials |
| No quotations | Can't do pre-sale estimates |

### Super Admin Portal Bugs (verified by browser inspection)
| Weakness | What it Means for BillScape |
|---------|----------------------------|
| **Create Plan button is non-functional** | No modal/form renders on click — confirmed via DOM inspection. Plan creation is completely broken |
| **Plan prices show "$null"** | Pricing display not implemented |
| **No "Create Tenant" manually** | Admin cannot onboard customers without self-serve signup |
| **No assign-plan workflow** | Subscriptions page exists but is empty — cannot assign plans to tenants |
| **Usage meters: 0/0 = 100% full** | Customers, Storage, Branches show 100% used because limit = 0 (config bug) |
| **No per-tenant drill-down** | Cannot click a tenant to see their details |
| **No impersonation / support login** | Cannot debug customer issues |
| **No audit log** | No visibility into tenant activity |
| **MRR always $0.00** | Revenue tracking not connected to actual plans |

---

## Super Admin Portal — Full Analysis

### Competitor Super Admin (Verified via browser — /platform/login)

**Login:** Separate dark-themed portal at `/platform/login` — "SaaS Master Admin" branding, separate from tenant login.

**Navigation (6 pages):**
- Dashboard → Tenants → Plans → Subscriptions → Usage Tracking → Settings

#### Page-by-page breakdown

**1. Platform Dashboard (`/platform`)**
KPI cards: Total Tenants (3), Active Tenants (3), Trial Tenants (0), Suspended Tenants (0), MRR ($0.00), Active Subscriptions (0), Active Plans (1), Total Products (cross-platform), Total Invoices (cross-platform)
Two tables: Recent Tenants (Name, Plan, Status) + Recent Subscriptions (Tenant, Plan, Status)

**2. Tenants (`/platform/tenants`)**
Table columns: Tenant Name, Subdomain, Status (ACTIVE badge), Created date
Actions per row: **Suspend** (orange) + **Delete** (red)
Search bar: "Search tenants..."
No "Create Tenant" button — tenants created only via self-serve registration

**3. Plans (`/platform/plans`)**
Table columns: Name, Monthly Price, Yearly Price, Status (ACTIVE), Actions (Disable)
**Create Plan button** — ⚠️ BUG: button click does nothing (no modal/form renders — confirmed via DOM inspection, no hidden elements found). Create Plan is non-functional in competitor.
Plan prices show "$null" — price fields not populated (another competitor bug)

**4. Subscriptions (`/platform/subscriptions`)**
Table columns: Tenant, Plan, Billing Cycle, Status, Next Billing
Empty table — no subscriptions assigned to any tenant (no assign-plan workflow implemented)

**5. Usage Tracking (`/platform/usage`)**
Platform-wide aggregate meters (NOT per-tenant):
- Products: 1/300 (0%, 299 remaining)
- Customers: 0/0 — 100% full, 0 remaining ⚠️ bug (limit=0)
- Employees: 0/15 (0%, 15 remaining)
- Invoices: 2/150 (1%, 148 remaining)
- Storage (MB): 0/0 — 100% full ⚠️ bug (limit=0)
- Branches: 0/0 — 100% full ⚠️ bug (limit=0)

**6. Platform Settings (`/platform/settings`)**
Three sections:
- **General Settings:** Platform Name ("Billing SaaS"), Support Email, Support Phone
- **Regional & Registration:** Currency (USD), Timezone (UTC), Default Trial Days (14), "Allow New Tenant Registrations" checkbox (checked), "Enable Maintenance Mode" checkbox (unchecked)
- **Legal URLs:** Privacy Policy URL, Terms & Conditions URL
- Save Settings button

### Competitor Super Admin — Bugs Observed

| Bug | Details |
|-----|---------|
| **Create Plan — non-functional** | Button click fires but no modal/form renders. DOM has no hidden dialog. Plan creation is completely broken |
| **Plan prices show "$null"** | Monthly/Yearly price fields not populated — pricing display bug |
| **No "Create Tenant" button** | Admin cannot manually create a tenant — only self-serve signup creates tenants |
| **No assign-plan workflow** | Subscriptions page is empty; no way to assign a plan to a tenant from the admin |
| **Usage meters show 0/0 = 100%** | Customers, Storage, Branches show limit=0 causing 100% full display — limits not configured |
| **No per-tenant view** | Cannot drill into an individual tenant's data, users, or settings |
| **No impersonation** | Cannot log in as a tenant for support |
| **No activity/audit log** | No way to see what tenants have done |
| **No revenue/MRR breakdown** | MRR shows $0.00 with no chart or historical data |

### BillScape Super Admin — Required Features

| # | Feature | Priority | Competitor Has? | Notes |
|---|---------|----------|----------------|-------|
| 1 | **Separate `/platform/login`** | 🔴 High | ✅ Yes | Dark-themed, branded separately from tenant login |
| 2 | **Platform Dashboard KPIs** | 🔴 High | ✅ Yes | Total/Active/Trial/Suspended Tenants, MRR, Active Plans |
| 3 | **Tenant List** (Name, Plan, Status, Created, Subdomain) | 🔴 High | ✅ Yes | With Search + Suspend + Delete actions |
| 4 | **Plan Management** (Create/Edit/Disable plans) | 🔴 High | ⚠️ Partial bug | Competitor list works, Create is broken — we must build it fully |
| 5 | **Assign Plan to Tenant** | 🔴 High | ❌ Missing | Competitor has Subscriptions page but no assign workflow |
| 6 | **Suspend / Reactivate Tenant** | 🔴 High | ✅ Yes (Suspend only) | Competitor has no Reactivate — we add both |
| 7 | **Platform Settings** (Name, Support email/phone, Trial days, Maintenance mode, Legal URLs) | 🔴 High | ✅ Yes | Allow New Registrations toggle is very useful |
| 8 | **Usage Tracking** (per-resource meters with progress bars) | 🟡 Medium | ✅ Yes (buggy) | Competitor shows platform-wide; we should show **per-tenant** |
| 9 | **Create Tenant manually** | 🟡 Medium | ❌ Missing | Competitor lacks this; we can create orgs on behalf of customers |
| 10 | **Per-Tenant Detail view** | 🟡 Medium | ❌ Missing | Click on tenant → see their users, plan, usage, settings |
| 11 | **Revenue Dashboard** (MRR chart, churn, growth) | 🟡 Medium | ❌ Missing | Competitor shows $0 with no chart |
| 12 | **Activity / Audit Log per tenant** | 🟡 Medium | ❌ Missing | What actions each org performed |
| 13 | **Email tenant** (renewal reminder, announcements) | 🟡 Medium | ❌ Missing | |
| 14 | **Impersonate tenant** ⚠️ Security risk | 🟡 Medium | ❌ Missing | Edge Function + service_role JWT + mandatory audit log |
| 15 | **Support ticket view** | 🟢 Low | ❌ Missing | |

### Implementation Architecture

```
Route:    /platform  (matches competitor's URL pattern — separate layout, no org context)
Login:    /platform/login  (separate dark-themed login page)
Guard:    profiles.is_super_admin = true  (add boolean column to profiles table)
          DO NOT add to auth.users — Supabase manages that table

DB (new tables needed):
  plans (id, name, price, billing_period, limits jsonb, features jsonb, is_active)
  org_plans (id, org_id, plan_id, start_date, expiry_date, status, auto_renew)

DB (existing — already usable):
  organizations.plan  enum: free | pro | enterprise  ← can drive simple plan gating NOW
  organizations.status  enum: active | suspended  ← suspend/reactivate already modellable
  memberships.role  enum includes 'super_admin'  ← can use this as super admin flag without new column
  profiles  ← add is_super_admin boolean OR use memberships role='super_admin' with org_id=NULL

Security: RLS bypass ONLY via service_role key in Edge Functions
          NEVER expose service_role key to frontend JS
          All super admin mutations go through Edge Functions with auth check

Impersonation: Edge Function generates short-lived JWT via service_role
               Every impersonation session writes to audit log
               Auto-expires after 30 minutes
```

### BillScape Super Admin — Suggested Page Structure (based on competitor + improvements)

```
/platform/login          → Separate dark-themed login (SaaS Master Admin branding)
/platform                → Platform Dashboard (KPI cards + Recent Tenants + Recent Subscriptions)
/platform/tenants        → Tenant List (search, suspend, delete, + CREATE which competitor lacks)
/platform/tenants/:id    → Per-Tenant Detail (plan, users, usage, settings — competitor lacks this)
/platform/plans          → Plan List + Create Plan modal (FULLY WORKING, unlike competitor)
/platform/subscriptions  → Subscription List + Assign Plan to Tenant (competitor has empty page)
/platform/usage          → Per-Tenant Usage meters (competitor shows only platform-wide aggregate)
/platform/settings       → Platform Settings (name, support, trial days, maintenance, legal URLs)
```

### Super Admin — Easy Create Steps (using existing DB)

Since `memberships.role` already has `super_admin` in the enum, creating a super admin is:

**Step 1 — Promote a user to Super Admin (one SQL command in Supabase dashboard):**
```sql
-- Find the user's ID
SELECT id FROM auth.users WHERE email = 'your-admin@email.com';

-- Insert a membership with role = super_admin (org_id can be NULL or a sentinel org)
INSERT INTO public.memberships (user_id, organization_id, role)
VALUES (
  '<user-uuid-from-above>',
  (SELECT id FROM public.organizations LIMIT 1),  -- any org, or create a sentinel org
  'super_admin'
);
```

**Step 2 — Guard super admin routes in React:**
```typescript
// In RequireRole or a new RequireSuperAdmin component:
const isSuperAdmin = membership?.role === 'super_admin';
if (!isSuperAdmin) return <Navigate to="/app/dashboard" />;
```

**Step 3 — Create the /superadmin route in router:**
```typescript
<Route path="superadmin" element={<RequireSuperAdmin />}>
  <Route index element={<SuperAdminDashboard />} />
  <Route path="tenants" element={<TenantListPage />} />
  <Route path="plans" element={<PlanManagementPage />} />
</Route>
```

**Quickest path to first working Super Admin portal:**
1. Run the SQL above for your own account (5 minutes)
2. Add `RequireSuperAdmin` guard component (30 minutes)
3. Create `SuperAdminDashboard` showing all orgs from `organizations` table (2 hours)
4. Add suspend/reactivate by toggling `organizations.status` (1 hour)
5. Add plan change by updating `organizations.plan` enum value (1 hour)

Total time to a functional (basic) Super Admin portal: **~1 day**
```

---

## Implementation Sprint Order

> **Note:** Sprint 5 (Subscription page) is blocked on Sprint 4's DB schema.
> Create `plans` + `org_plans` tables in Sprint 4 Week 1 so Sprint 5 can start in parallel.

```
Sprint 1 (Week 1-2):   Purchase Returns extension + Inventory tab refactor (Stock List / Ledger / Adjustments / Opening Stock tabs)
Sprint 2 (Week 3-4):   Employees module + Roles/RBAC + Permission Matrix UI
Sprint 3 (Week 5-6):   Offers (scoped) + Coupon max_uses cap + Dashboard TAX Overview card
Sprint 4 (Week 7-8):   Super Admin portal (Tenant list, Plan management, Suspend/Reactivate)
Sprint 5 (Week 9-10):  Subscription page (tenant-facing) + Product Import/Export
Sprint 6 (Week 11-12): Settings expansion (Invoice details / Printer / Email / Regional / Backup)
Sprint 7 (Week 13+):   Polish built features (Variants, Batches, Quotations, Loyalty transaction log) + Medium priority items
```

---

## CLAUDE.md Update Required

The following routes are built but NOT documented in CLAUDE.md routes table — add them:

| Route | Component | Status |
|-------|-----------|--------|
| /returns | ReturnsPage | Built (Sales returns; Purchase returns missing) |
| /quotations | QuotationsPage | Built |
| /loyalty | LoyaltyPage | Built |
| /activity | ActivityPage | Built |
| /shifts | ShiftsPage | Built |
| /ledger | LedgerPage | Built (Accounting ledger, not stock ledger) |
