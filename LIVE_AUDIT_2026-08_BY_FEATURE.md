# BillScape — Live Audit, Grouped by Feature (2026-08-17)

_Same findings as `LIVE_AUDIT_2026-08.md`, regrouped by module/feature area so each section can be
split off as an independent work item. Severity tags (🔴 Critical / 🟠 High / 🟡 Medium / 🔵 Low)
are kept per-item so priority isn't lost in the regrouping._

_Method: hands-on live testing, logged in as real users on both apps._
_BillScape: billscape-seven.vercel.app, mdsuhail.designer@gmail.com (org: MD Electronics)_
_IppoBill: ippobill.com, ironaile1999@gmail.com (Basic plan, trial)_

---

## 1. Reports & GST Compliance

The single biggest gap area — everything here blocks a GST-registered merchant from fully
replacing a manual process or IppoBill.

| Priority | Item | Evidence |
|---|------|----------|
| 🔴 Critical | **No GSTR-1/2/3B/9-shaped report** | IppoBill's `/reports/gst` has 5 tabs (GSTR-1, GSTR-2, GSTR-3B, GSTR-9, HSN-wise Summary), B2B vs B2C split, live reconciliation banner ("Tolerance: ₹1.00 • Difference: ₹0.00"). BillScape's Reports has only 4 tabs (Sales Summary, Item-wise, Stock Report, GST Summary); GST Summary is a flat tax-rate breakup, not a return-shaped export. |
| 🟠 High | **No P&L / Balance Sheet / Trial Balance / Cash Flow report** | IppoBill's Reports has all four as top-level tabs, generated live from the same double-entry data BillScape's Ledger already captures. BillScape's `/ledger` has Chart of Accounts + Vouchers, but nothing in `/reports` surfaces P&L-shaped output. Mostly a presentation layer on data already captured — comparatively cheap to close once prioritized. |
| 🟡 Medium | **No Direct/Indirect classification on expense categories** | `/expenses` category pills are fixed (Rent, Salary, Electricity, Water, Internet, Transport, Packaging, Maintenance, Marketing, Miscellaneous) — no Direct/Indirect flag. Needed to feed a correct P&L operating-expense split once P&L exists (depends on the item above). |
| 🟡 Medium | **No party-wise P&L / profitability report** | Depends on P&L existing first. |
| 🟡 Medium | **Composition Scheme flag on tax_profile** | Worth checking merchant demand before building. |

**Suggested split:** GSTR-1 report is its own large ticket (schema for B2B/B2C split + HSN summary
+ reconciliation logic). P&L/Balance Sheet/Trial Balance/Cash Flow is a second ticket (mostly
presentation on existing Ledger data). Expense Direct/Indirect + party-wise P&L are small
follow-ons that should wait until the P&L ticket lands.

---

## 2. Settings → Billing (Subscription/Plan)

| Priority | Item | Evidence |
|---|------|----------|
| 🔴 Critical | **"Upgrade to Pro" button is a dead click** | Settings → Billing shows Free/Pro plan cards with a real "Upgrade to Pro ₹499/mo" CTA. Clicked live — no modal, no navigation, no toast, no console error. Same class of bug the old competitor doc flagged as a *competitor* weakness ("Create Plan button non-functional") — BillScape now has its own version, on a customer-facing upgrade path. |
| 🔵 Low/Watch | **Pricing page vs in-app gate consistency** | Not urgent until BillScape ships paid tiers for real — but the Free/Pro cards already existing means this is now closer than it looked in the last audit. Decide the tiering plan intentionally rather than drifting into it half-wired. |

**Suggested split:** Either wire the Upgrade CTA to a real flow (payment provider / contact-sales
form / waitlist) or hide the button until that flow exists — a visible, dead button is worse than
no button.

---

## 3. Roles & Permissions

| Priority | Item | Evidence |
|---|------|----------|
| 🔴 Critical | **Duplicate System roles** | `/roles` shows 7 rows where there should be ~4: two "Owner" (19/19 vs 16/19 permissions), two "Manager" (14/19 vs 13/19), two "Cashier" (3/19 vs 5/19), one "Admin". All marked "System" (non-deletable, Clone-only). Looks like a duplicate seed from a re-run migration. A merchant cloning "Owner" could pick either version and get a different permission set than expected. |

**Suggested split:** Standalone data-cleanup ticket — identify the duplicate-seeding migration,
write a one-time cleanup migration (merge or delete the duplicate rows), add a uniqueness
constraint on `(org_id, name)` for system roles if one doesn't already exist to prevent recurrence.

---

## 4. Activity Log

| Priority | Item | Evidence |
|---|------|----------|
| 🟠 High | **Summary KPI counters don't match visible rows** | `/activity` shows Created 0 / Updated 0 / Deleted 0 / Sales 0, while 5 real rows are listed below (Sale_restored, Sale_voided, Sale_edited). The counters appear to bucket only literal `created`/`updated`/`deleted` action strings and miss `voided`/`restored`/`edited`, undercounting real activity at a glance. |
| 🟠 High | **"Actor" column is blank on every row** | Despite `activity_log.actor_name` being a documented field, no row shows who performed the action. |

**Suggested split:** One ticket — likely the same root cause (action-name mapping / actor_name not
being populated on write). Worth a quick check of whichever code path inserts `activity_log` rows
for sale void/restore/edit.

---

## 5. Returns

| Priority | Item | Evidence |
|---|------|----------|
| 🟠 High | **No "Without Stock" mode** | Opened BillScape's "New Return" dialog live — Sale Return / Purchase Return toggle exists (resolved), Refund Mode dropdown exists, but there is no toggle for whether the return restocks the item. IppoBill shows a live banner swapping between "Only the value will be credited. No stock movement" and "Goods will be returned to inventory" as the Return Type toggle flips. |

**Suggested split:** Small — add a toggle to the existing Process Return dialog, branch the
existing stock-adjustment logic on it.

---

## 6. Payments (Purchases & Sales)

| Priority | Item | Evidence |
|---|------|----------|
| 🟠 High | **No standalone Payment-In / Payment-Out** | BillScape's Purchases list has no "Balance Due" or payment-status column at all (IppoBill's Purchase Bill list has Paid/Balance Due KPI cards + Pending/Partially Returned status badges per row). No path to record a partial payment against an existing purchase/sale independent of editing it. |
| 🟡 Medium | **No outstanding-balance breakdown when recording a payment** | Depends on the item above existing first — IppoBill shows Total → minus Returns → minus Prior Payments → Outstanding as a visible mini-ledger. |

**Suggested split:** One larger ticket — standalone Payment-In/Out screens, deep-linkable from a
specific sale/purchase, feeding the balance-due column and the breakdown view together.

---

## 7. Parties (Suppliers/Customers)

| Priority | Item | Evidence |
|---|------|----------|
| 🟠 High | **No opening balance on Supplier/Customer creation** | Suppliers form fields per current docs (Name, Phone, Address, Email, GSTIN, Bank Details) still don't include an opening balance / balance-type field. Merchants migrating from another system need to declare existing dues on day one. |

**Suggested split:** Small — add `opening_balance` + `balance_type` (To Receive/To Pay) fields to
the supplier/customer form and schema; ties into the Payments ticket above for full effect.

---

## 8. Invoicing

| Priority | Item | Evidence |
|---|------|----------|
| 🟠 High | **Single invoice_prefix, not per-document-type** | `org_settings.branding.invoice_prefix` is one field. IppoBill's Settings → Invoice & Documents has 9 separate prefix fields (Sale Invoice, Purchase Bill, Estimate, Sale Order, Proforma, Credit Note, Challan, Receipt, Expense). |

**Suggested split:** Schema change (prefix per document type) + Settings UI update — self-contained.

---

## 9. Global Search

| Priority | Item | Evidence |
|---|------|----------|
| 🟠 High | **No global ⌘K / Cmd-K search** | BillScape has no header search. IppoBill's header search bar (`Search products, parties, invoices... ⌘K`) is present on every page. |

**Suggested split:** Standalone feature ticket — command palette searching products/parties/invoices.

---

## 10. Shifts

| Priority | Item | Evidence |
|---|------|----------|
| 🟡 Medium | **Stale/orphaned shift with no auto-close or staleness warning** | `/shifts` shows a shift "Open since 01:22 pm, 23 Jul 2026" — 586h 52m and counting, clearly abandoned test data, never flagged. No "shift open > 24h" warning or forced-close mechanism. |

**Suggested split:** Small — add a warning banner (owner-visible) for shifts open beyond a
threshold; optionally an admin-triggered force-close action.

---

## 11. Form Validation (cross-cutting)

| Priority | Item | Evidence |
|---|------|----------|
| 🔴 Critical | **Audit every required-field asterisk against actual save behavior** | Not re-tested live this pass, but flagged twice independently on IppoBill (Purchase Bill batch entry, Product/Service Purchase Price) as a red asterisk that saves fine with the field empty. Cheap static check: grep BillScape's form schemas for every UI-marked required field, confirm each has a matching Zod/RHF rule that actually blocks submit. |

**Suggested split:** Not a feature ticket — a checklist/audit task across all forms. Do this before
go-live regardless of what else ships.

---

## 12. Super Admin Portal

| Priority | Item | Evidence |
|---|------|----------|
| — (verification, not a gap) | **Portal exists and is correctly gated, but internals untested** | `/platform/login` is live — separate dark theme, "Master Admin Portal" branding, correctly rejects non-super-admin logins with a clean error ("Access denied. This portal is for Super Admins only.") rather than crashing or silently redirecting. The 7 inner pages (Dashboard, Tenants, TenantDetail, Plans, Subscriptions, Usage, Settings) exist in the router but were **not reachable** with the test account — none of them have been live-verified. |

**Suggested split:** Get a real `super_admin` membership row provisioned, then re-run this audit
section specifically against the 7 inner `/platform/*` pages.

---

## Stale documentation — fix regardless of feature work

These aren't bugs in the app, they're incorrect docs that will mislead the next person who reads
them:

1. **CLAUDE.md's "Super Admin portal (NOT YET BUILT — next sprint)"** — wrong, portal exists (see
   §12). Update the routes table and remove the "not yet built" framing.
2. **CLAUDE.md's Settings section says "8 tabs"** — it's now a 14-item categorized sidebar (Shop
   Info, Regional, Tax & GST, Invoice & UPI, Print & Layout, Units, Inventory, Barcode, Custom
   Fields, Routine Works, Notifications, Dashboard Users, Billing, Backup & Export).
3. **COMPETITOR_GAP_PLAN.md's "❌ Missing" table** — largely outdated. Employees, Roles & RBAC UI,
   Offers (scope+target_id), Coupon max_uses, Inventory dedicated tabs, Product Import/Export,
   Loyalty per-customer transaction log are all now built and should be struck from that list.
4. **IPPOBILL_GAP_CHECKLIST.md's CRITICAL #2 (units/conversion system)** — resolved. Migration
   `018_units_and_conversions.sql` exists and Settings has a dedicated Units tab. Downgrade or
   remove that line item.

---

## Already ahead — don't undo chasing parity

| Item | Confirmed live this pass |
|------|----------------------------|
| Role-based access control on every tier, not paywalled | BillScape's Roles page fully functional on a Free-tier-looking account; IppoBill gates POS Mode and Online Store behind PRO in its own sidebar |
| Dark, distinctive visual identity | Confirmed side-by-side — BillScape zinc-950/indigo-500 vs IppoBill's light generic-SaaS-blue |
| No feature-gating complexity to maintain (mostly) | Still mostly true, though the Settings → Billing Free/Pro cards (see §2) show this is starting to change — decide intentionally |
| Purchase entry's progressive disclosure ("More details") | Not re-tested this pass, no reason to believe it regressed |

---

## Priority scoreboard (unchanged totals, now grouped above by module)

| Tier | Count |
|------|-------|
| 🔴 Critical | 4 |
| 🟠 High | 7 |
| 🟡 Medium | 4 |
| 🔵 Low/Watch | 1 |
| Verification only | 1 (Super Admin internals) |
| Stale-doc corrections | 4 |
