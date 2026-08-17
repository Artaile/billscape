# BillScape — Live Audit, Grouped by Feature (2026-08-17, re-verified 2026-08-17)

_Same findings as `LIVE_AUDIT_2026-08.md`, regrouped by module/feature area so each section can be
split off as an independent work item. Severity tags (🔴 Critical / 🟠 High / 🟡 Medium / 🔵 Low)
are kept per-item so priority isn't lost in the regrouping._

_Method: hands-on live testing, logged in as real users on both apps._
_BillScape: billscape-seven.vercel.app, mdsuhail.designer@gmail.com (org: MD Electronics)_
_IppoBill: ippobill.com, ironaile1999@gmail.com (Basic plan, trial)_

_**Update 2026-08-17 (same day, QC re-check pass):** all 🟠 High items were reported fixed by the_
_dev team and re-verified live via a fresh login + QC agent walkthrough. Status per item is now_
_marked ✅ FIXED / ⚠️ PARTIALLY FIXED / ❌ STILL BROKEN inline below. Net result: 5 of 7 High items_
_fully fixed, 2 partially fixed. The 2 Critical items spot-checked during this pass (dead Upgrade_
_button, duplicate System roles) remain unfixed — not yet worked on._

---

## 1. Reports & GST Compliance

The single biggest gap area — everything here blocks a GST-registered merchant from fully
replacing a manual process or IppoBill.

| Priority | Item | Evidence |
|---|------|----------|
| 🔴 Critical | **No GSTR-1/2/3B/9-shaped report** | IppoBill's `/reports/gst` has 5 tabs (GSTR-1, GSTR-2, GSTR-3B, GSTR-9, HSN-wise Summary), B2B vs B2C split, live reconciliation banner ("Tolerance: ₹1.00 • Difference: ₹0.00"). BillScape's Reports has only 4 tabs (Sales Summary, Item-wise, Stock Report, GST Summary); GST Summary is a flat tax-rate breakup, not a return-shaped export. **Not re-checked in this pass — still assumed open.** |
| 🟠 High | ✅ **FIXED** — P&L / Balance Sheet / Trial Balance / Cash Flow report | Re-verified 2026-08-17: `/reports` now has 8 tabs total — Sales Summary, **Profit & Loss**, **Balance Sheet**, **Trial Balance**, **Cash Flow**, Item-wise, Stock Report, GST Summary. All four new reports render live computed data: P&L shows Net Revenue/Gross Profit/Net Profit with a full particulars breakdown; Balance Sheet shows Assets vs Liabilities & Equity and reports "Accounting Equation Balanced"; Trial Balance lists all ledger heads with Debit/Credit columns; Cash Flow shows Operating Inflows/Outflows/Net Cash Flow. Each has Export CSV. |
| 🟡 Medium | **No Direct/Indirect classification on expense categories** | `/expenses` category pills are fixed (Rent, Salary, Electricity, Water, Internet, Transport, Packaging, Maintenance, Marketing, Miscellaneous) — no Direct/Indirect flag. Needed to feed a correct P&L operating-expense split once P&L exists (depends on the item above). |
| 🟡 Medium | **No party-wise P&L / profitability report** | Depends on P&L existing first. |
| 🟡 Medium | **Composition Scheme flag on tax_profile** | Worth checking merchant demand before building. |

**Suggested split:** GSTR-1 report is its own large ticket (schema for B2B/B2C split + HSN summary
+ reconciliation logic) — still open, highest remaining priority in this whole audit. P&L/Balance
Sheet/Trial Balance/Cash Flow is now done. Expense Direct/Indirect + party-wise P&L can now be
picked up since the P&L report they depend on has landed.

---

## 2. Settings → Billing (Subscription/Plan)

| Priority | Item | Evidence |
|---|------|----------|
| 🔴 Critical | ❌ **STILL BROKEN** — "Upgrade to Pro" button is a dead click | Re-checked 2026-08-17: Settings → Billing shows Free/Pro plan cards with an "Upgrade to Pro ₹499/mo" CTA. The button now renders visually muted/disabled-looking rather than a bright active CTA, but clicking it still produces no modal, no navigation, no toast, no console error — functionally unchanged. Same class of bug the old competitor doc flagged as a *competitor* weakness ("Create Plan button non-functional") — BillScape still has its own version, on a customer-facing upgrade path. |
| 🔵 Low/Watch | **Pricing page vs in-app gate consistency** | Not urgent until BillScape ships paid tiers for real — but the Free/Pro cards already existing means this is now closer than it looked in the last audit. Decide the tiering plan intentionally rather than drifting into it half-wired. |

**Suggested split:** Either wire the Upgrade CTA to a real flow (payment provider / contact-sales
form / waitlist) or hide the button until that flow exists — a visible, dead button is worse than
no button.

---

## 3. Roles & Permissions

| Priority | Item | Evidence |
|---|------|----------|
| 🔴 Critical | ❌ **STILL BROKEN** — Duplicate System roles | Re-checked 2026-08-17, unchanged: `/roles` still shows 7 rows where there should be ~4: two "Owner" (19/19 vs 16/19 permissions), two "Manager" (14/19 vs 13/19), two "Cashier" (3/19 vs 5/19), one "Admin" (17/19). All marked "System" (non-deletable, Clone-only). A merchant cloning "Owner" could pick either version and get a different permission set than expected. |

**Suggested split:** Standalone data-cleanup ticket — identify the duplicate-seeding migration,
write a one-time cleanup migration (merge or delete the duplicate rows), add a uniqueness
constraint on `(org_id, name)` for system roles if one doesn't already exist to prevent recurrence.

---

## 4. Activity Log

| Priority | Item | Evidence |
|---|------|----------|
| 🟠 High | ✅ **FIXED** — Summary KPI counters didn't match visible rows | Re-verified 2026-08-17: counters now correctly bucket actions beyond literal created/updated/deleted — Updated/Edited: 3, Deleted/Voided: 2, Sales & Billing: 5 — matches the 5 visible rows (2× Sale Restored, 2× Sale Voided, 1× Sale Edited). |
| 🟠 High | ⚠️ **PARTIALLY FIXED** — "Actor" column | No longer blank, but every row now shows a generic **"System / Admin"** placeholder instead of the real acting user (e.g. mdsuhail.designer). The original complaint ("can't tell who did this") is only half-resolved — the column renders something, but it's still not useful for a real audit trail. |

**Suggested split:** The counter bug is closed. Remaining work is narrower than originally scoped:
find wherever `activity_log` rows are inserted for sale void/restore/edit and pass the real
`actor_id`/`actor_name` instead of a hardcoded "System / Admin" placeholder.

---

## 5. Returns

| Priority | Item | Evidence |
|---|------|----------|
| 🟠 High | ✅ **FIXED** — No "Without Stock" mode | Re-verified 2026-08-17: "New Return" dialog now has an "Inventory Stock Movement" toggle under Reason for Return. Default ON: "Goods will be returned to inventory stock." Toggled OFF: "Value-only credit / Damaged item — No inventory movement" with an amber warning banner ("⚠ Only financial refund/credit is recorded. Stock quantity will NOT be modified."). Confirmed present and working identically on both the Sale Return and Purchase Return tabs. |

**Suggested split:** Closed — no further work needed on this item.

---

## 6. Payments (Purchases & Sales)

| Priority | Item | Evidence |
|---|------|----------|
| 🟠 High | ⚠️ **PARTIALLY FIXED** — No standalone Payment-In / Payment-Out | Re-verified 2026-08-17: `/purchases` now has 3 KPI cards (Total Purchases, Total Paid (Settled), Balance Due (Payable)) and a per-row "Payment Status" column with Paid/Pending badges — the visibility gap is closed. **But there is still no "Make Payment"/"Record Payment" action anywhere** — not in row actions (View/Edit/Delete only), not inside the View detail dialog, and no dedicated Payment-In/Payment-Out page in the sidebar. All 16 existing purchases are pre-marked "Paid" with ₹0.00 balance due, so there's no way to actually exercise or verify a partial-payment flow — it doesn't exist yet. |
| 🟡 Medium | **No outstanding-balance breakdown when recording a payment** | Still blocked on the item above — no payment-recording flow exists yet to show a breakdown inside. |

**Suggested split:** The data model/UI (balance-due tracking, status badges) is done. Remaining
scope is now narrower and clearer: build the actual "Record Payment" action — a dialog reachable
from the Purchases list (and ideally Sales/Billing too) that lets a user log a partial/full payment
against a specific bill, decrements Balance Due, and updates the status badge. This is the real
gap now, not the visibility layer.

---

## 7. Parties (Suppliers/Customers)

| Priority | Item | Evidence |
|---|------|----------|
| 🟠 High | ✅ **FIXED** — No opening balance on Supplier/Customer creation | Re-verified 2026-08-17: both "Add Supplier" and "Add Customer" dialogs now have "Opening Balance (₹)" + "Balance Type" fields — Supplier defaults to "To Pay / Outstanding (Cr)", Customer defaults to "To Collect / Receivable (Dr)", each with the appropriate two-option dropdown. Customers list also now shows a "Balance" column. |

**Suggested split:** Closed. Note it now feeds directly into the Payments gap (§6) — an opening
balance is captured on creation but still has no "Record Payment" flow to pay it down against.

---

## 8. Invoicing

| Priority | Item | Evidence |
|---|------|----------|
| 🟠 High | ✅ **FIXED** — Single invoice_prefix, not per-document-type | Re-verified 2026-08-17: Settings → Invoice & UPI → "Document Prefixes" now has 9 separate prefix fields — Sale Invoice (INV), Purchase/Bill (BILL), Estimate (EST), Sale Order (SO), Proforma Invoice (PI), Credit Note (CN), Delivery Challan (DC), Payment Receipt (RCP), Expense (EXP). Matches (and slightly exceeds) IppoBill's 9-field parity target. |

**Suggested split:** Closed — no further work needed on this item.

---

## 9. Global Search

| Priority | Item | Evidence |
|---|------|----------|
| 🟠 High | ✅ **FIXED** — No global ⌘K / Cmd-K search | Re-verified 2026-08-17: a "Search products, parties, bills... ⌘K" search bar is now present in the header on every page. Pressing Cmd+K opens a command palette with Quick Pages (POS Billing, Products Catalog, Stock & Inventory, Purchase Bills, Suppliers Directory, Customers Directory) and live search — typing "Boat" returned 3 real product matches (Boat Rockerz 250/99/110) with SKU, barcode, price, and stock count, confirmed working end-to-end. |

**Suggested split:** Closed — no further work needed on this item.

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

## Priority scoreboard

| Tier | Count | Fixed | Partially fixed | Still open |
|------|-------|-------|------------------|------------|
| 🔴 Critical | 4 | 0 | 0 | 4 (GSTR-1 not re-checked this pass, Upgrade CTA + duplicate roles confirmed still broken, form-validation audit not started) |
| 🟠 High | 7 | 5 | 2 | 0 |
| 🟡 Medium | 4 | 0 | 0 | 4 (unchanged, not part of this re-check pass) |
| 🔵 Low/Watch | 1 | — | — | unchanged |
| Verification only | 1 (Super Admin internals) | — | — | still needs a real `super_admin` account |
| Stale-doc corrections | 4 | — | — | unchanged |

**Remaining open work, in priority order:**
1. 🔴 GSTR-1/2/3B/9-shaped report (§1) — not touched, biggest remaining item
2. 🔴 "Upgrade to Pro" dead button (§2) — confirmed still broken today
3. 🔴 Duplicate System roles (§3) — confirmed still broken today
4. 🔴 Required-field validation audit (§11) — not started
5. ⚠️ Activity Log Actor column showing generic "System / Admin" instead of real user (§4)
6. ⚠️ Payment-In/Payment-Out — balance-due visibility is done, but no actual "Record Payment" action exists yet (§6)
7. 🟡 All four Medium items (§1 Expense Direct/Indirect + party-wise P&L — now unblocked since P&L shipped; §10 stale shift warning) — untouched this pass
8. Super Admin portal internals (§12) — still unverified, blocked on getting a real super_admin account
