# BillScape — Live Re-Audit (2026-08-17)

_Method: hands-on live testing, logged in as real users on both apps — no code reading for BillScape's_
_own state (verified via browser only, cross-checked against router/migrations where noted)._
_BillScape: billscape-seven.vercel.app, mdsuhail.designer@gmail.com (org: MD Electronics)_
_IppoBill: ippobill.com, ironaile1999@gmail.com (Basic plan, trial)_
_Supersedes/updates: COMPETITOR_GAP_PLAN.md (2026-07-23, vs a different competitor) and_
_IPPOBILL_GAP_CHECKLIST.md (2026-08-08). Both older docs are kept for history — this file is the_
_current source of truth for "what's still pending before go-live."_

---

## Executive summary

BillScape has shipped a large amount of work since the last two audits. Several items both older
docs list as missing or "not yet built" are now live and working:

- **Super Admin portal exists and is properly gated** (`/platform/login`, separate dark theme,
  correctly rejects non-super-admin accounts with a clean error — not a crash or silent redirect).
  CLAUDE.md still says "NOT YET BUILT — next sprint." **CLAUDE.md is stale, update it.**
- **Employees, Roles + Permission Matrix, Offers/Promotions scope+max_uses, Inventory's 4 tabs,
  Units & conversions, Loyalty transaction history icon** — all previously-flagged HIGH priority
  gaps in COMPETITOR_GAP_PLAN.md — are built and functional.
- **Settings has grown from 8 tabs to a 14-item categorized sidebar** (Shop Info, Regional, Tax &
  GST, Invoice & UPI, Print & Layout, Units, Inventory, Barcode, Custom Fields, Routine Works,
  Notifications, Dashboard Users, Billing, Backup & Export) — far beyond CLAUDE.md's documented 8.

Three concrete **new bugs** were found live (not in either prior doc) — see Critical section.

The two big-ticket items from IPPOBILL_GAP_CHECKLIST.md's CRITICAL list are **confirmed still
open** via fresh side-by-side testing: no GSTR-1/2/3B/9-shaped report, and Reports has no
P&L/Balance Sheet/Trial Balance/Cash Flow (Ledger has the underlying accounts/vouchers data, but
nothing surfaces it as a report).

---

## 🔴 CRITICAL — fix before go-live

| # | Item | Evidence | Source |
|---|------|----------|--------|
| 1 | **No GSTR-1/2/3B/9-shaped report** | IppoBill's `/reports/gst` has 5 tabs (GSTR-1, GSTR-2, GSTR-3B, GSTR-9, HSN-wise Summary), B2B vs B2C split, a live reconciliation banner ("GSTR-1 reconciled — taxable value + tax matches invoice line totals. Tolerance: ₹1.00 • Difference: ₹0.00"). BillScape's Reports has only 4 tabs (Sales Summary, Item-wise, Stock Report, GST Summary) — GST Summary is a flat tax-rate breakup table, not a return-shaped export. **Still open, re-confirmed live today.** | IPPOBILL_GAP_CHECKLIST #1, unchanged |
| 2 | **"Upgrade to Pro" button is a dead click** | Settings → Billing tab shows Free/Pro plan cards with a real "Upgrade to Pro ₹499/mo" CTA. Clicked live — no modal, no navigation, no toast, no console error. Button has no handler wired. This is the exact same class of bug COMPETITOR_GAP_PLAN.md flagged as a **competitor weakness** ("Create Plan button is non-functional") — BillScape now has its own version of it, on a customer-facing upgrade path. | **New finding, this audit** |
| 3 | **Duplicate System roles in Roles & Permissions** | `/roles` shows 7 rows where there should be ~4: two "Owner" (19/19 vs 16/19 permissions), two "Manager" (14/19 vs 13/19), two "Cashier" (3/19 vs 5/19), one "Admin". All marked "System" (non-deletable, Clone-only). Looks like a duplicate seed from a re-run migration. A merchant creating a custom role by cloning could pick the wrong "Owner" and get a different permission set than expected. | **New finding, this audit** |
| 4 | **Audit every required-field asterisk against actual save behavior** | Not re-tested live this pass (no time to fill every form to reproduce IppoBill's exact bug), but this is a cheap, high-value static check: grep BillScape's form schemas for every UI-marked required field and confirm each has a matching Zod/RHF rule that actually blocks submit. | IPPOBILL_GAP_CHECKLIST #3, carried forward — do this before go-live regardless |

---

## 🟠 HIGH — real gaps, still open

| # | Item | Live evidence this pass | Source |
|---|------|--------------------------|--------|
| 1 | **No P&L / Balance Sheet / Trial Balance / Cash Flow in Reports** | IppoBill's Reports → Transaction Reports has all four as top-level tabs alongside Sales/Purchase Report, generating live from the same double-entry data BillScape's Ledger already captures. BillScape's `/ledger` has Chart of Accounts + Vouchers, but nothing in `/reports` surfaces P&L-shaped output — confirmed by walking both Reports tab bars side by side today. Mostly a presentation layer on data already captured (per CLAUDE.md's Ledger section) — comparatively cheap to close. | IPPOBILL_GAP_CHECKLIST HIGH #6, unchanged |
| 2 | **No standalone Payment-In / Payment-Out** | BillScape's Purchases list has no "Balance Due" or payment-status column at all (compare IppoBill's Purchase Bill list: Paid/Balance Due KPI cards + Pending/Partially Returned status badges per row). No path to record a partial payment against an existing purchase/sale independent of editing it. | IPPOBILL_GAP_CHECKLIST HIGH #1, unchanged |
| 3 | **Returns has no "Without Stock" mode** | Opened BillScape's "New Return" dialog live — Sale Return / Purchase Return toggle exists (this part is resolved), Refund Mode dropdown exists, but there is no toggle for whether the return restocks the item. IppoBill shows a live banner swapping between "Only the value will be credited. No stock movement" and "Goods will be returned to inventory" as you flip a Return Type toggle. | IPPOBILL_GAP_CHECKLIST HIGH #3, unchanged |
| 4 | **No opening balance on Supplier/Customer creation** | Not re-tested field-by-field this pass, but Suppliers form fields per CLAUDE.md (Name, Phone, Address, Email, GSTIN, Bank Details) still don't list an opening balance / balance-type field. | IPPOBILL_GAP_CHECKLIST HIGH #4, unchanged |
| 5 | **Single invoice_prefix, not per-document-type** | `org_settings.branding.invoice_prefix` is still one field per CLAUDE.md's OrgBranding list. IppoBill's Settings → Invoice & Documents has 9 separate prefix fields. | IPPOBILL_GAP_CHECKLIST HIGH #5, unchanged |
| 6 | **No global ⌘K / Cmd-K search** | BillScape has no header search at all. IppoBill's header search bar (`Search products, parties, invoices... ⌘K`) was visible and present on every page walked today. | IPPOBILL_GAP_CHECKLIST HIGH #7, unchanged |
| 7 | **Activity Log summary counters don't match the visible rows** | `/activity` KPI cards show Created 0 / Updated 0 / Deleted 0 / Sales 0, while 5 real rows are listed below (Sale_restored, Sale_voided, Sale_edited). The counters appear to bucket only literal `created`/`updated`/`deleted` action strings and miss `voided`/`restored`/`edited`, undercounting real activity at a glance. Also, the "Actor" column is blank on every row despite `activity_log.actor_name` being a documented field. | **New finding, this audit** |

---

## 🟡 MEDIUM — worth doing, lower urgency

| # | Item | Live evidence this pass | Source |
|---|------|--------------------------|--------|
| 1 | **No Direct/Indirect classification on expense categories** | `/expenses` category pills are still fixed: Rent, Salary, Electricity, Water, Internet, Transport, Packaging, Maintenance, Marketing, Miscellaneous — no Direct/Indirect flag visible. Dashboard's GST Overview already computes derived figures; this would feed a correct P&L operating-expense split once P&L exists. | IPPOBILL_GAP_CHECKLIST MEDIUM #3, unchanged |
| 2 | **Outstanding-balance breakdown on payment recording** | Depends on Payment-In/Out (HIGH #2) existing first. | IPPOBILL_GAP_CHECKLIST MEDIUM #1, unchanged |
| 3 | **No Service item type separate from stock-tracked Products** | Not re-tested this pass; carried forward. | IPPOBILL_GAP_CHECKLIST MEDIUM #2, unchanged |
| 4 | **No party-wise P&L / profitability report** | Depends on P&L existing first (HIGH #1). | IPPOBILL_GAP_CHECKLIST MEDIUM #5, unchanged |
| 5 | **Composition Scheme flag on tax_profile** | Worth checking demand before building — no change since last review. | IPPOBILL_GAP_CHECKLIST MEDIUM #6, unchanged |
| 6 | **Stale/orphaned shift with no auto-close** | `/shifts` shows a shift "Open since 01:22 pm, 23 Jul 2026" — **586h 52m** and counting, clearly abandoned test data, never auto-closed or flagged. No staleness warning or forced-close-after-N-hours mechanism exists. Low real-world urgency (real cashiers close shifts daily) but worth a "shift open > 24h" warning banner for owners. | **New finding, this audit** |

---

## 🔵 LOW / WATCH — unchanged, no new evidence this pass

Carried forward as-is from IPPOBILL_GAP_CHECKLIST.md — not re-tested:
- Purchase/Sale Order stage convert-to-bill pattern (reference only, no current need)
- Pricing page vs in-app gate consistency (only matters once BillScape ships paid tiers — and note
  Settings → Billing's Free/Pro cards suggest tiering work has *started*, making this suddenly more
  relevant than when it was originally filed — see Critical #2)
- Delivery Challan / stock-movement-without-billing document
- Configurable barcode structure

---

## 🟢 ALREADY AHEAD — confirmed still true, don't undo

| Item | Live confirmation this pass |
|------|------------------------------|
| Role-based access control on every tier, not paywalled | BillScape's Roles page fully functional for the Free-tier-looking account tested; IppoBill's own sidebar shows "POS" and "Online Store" tagged PRO and gated | 
| Dark, distinctive visual identity | Confirmed side-by-side — BillScape zinc-950/indigo-500 vs IppoBill's light generic-SaaS-blue |
| No feature-gating complexity to maintain (mostly) | Still true for the bulk of BillScape, though the new Settings → Billing Free/Pro cards (Critical #2) show this is starting to change — worth deciding intentionally rather than drifting into it half-wired |
| Purchase entry's progressive disclosure ("More details") | Not re-tested this pass, no reason to believe it regressed |

---

## Stale-doc corrections — apply after this report is reviewed

1. **CLAUDE.md's "Super Admin portal (NOT YET BUILT — next sprint)" section is wrong.** The portal
   exists at `/platform/*` with 7 pages (Login, Dashboard, Tenants, TenantDetail, Plans,
   Subscriptions, Usage, Settings), wired into the router, and the login gate correctly rejects
   non-super-admins. Needs: (a) CLAUDE.md route table updated, (b) actual internal-page testing
   with a real `super_admin` membership row, since this account isn't one and none of the 7 inner
   pages were reachable today.
2. **CLAUDE.md's Settings section says "8 tabs."** It's now a 14-item categorized sidebar. Update
   the Pages & Routes table entry for `/settings`.
3. **COMPETITOR_GAP_PLAN.md's "❌ Missing" table is largely outdated** — Employees, Roles & RBAC UI,
   Offers (scope+target_id), Coupon max_uses, Inventory dedicated tabs, Product Import/Export,
   Loyalty per-customer transaction log are all now built. That doc's HIGH-priority "Build Now"
   list (10 items) should be re-triaged; most are done, leaving mainly Super Admin (built, needs
   verification) and Subscription page (built as a Free/Pro card, but the CTA doesn't work — see
   Critical #2).
4. **IPPOBILL_GAP_CHECKLIST.md's CRITICAL #2 (units/conversion system) is resolved** — migration
   `018_units_and_conversions.sql` exists and Settings has a dedicated Units tab. Downgrade or
   remove that line item from the checklist.

---

## Priority scoreboard

| Tier | Count | Of which new this pass |
|------|-------|--------------------------|
| 🔴 Critical | 4 | 2 new (dead Upgrade button, duplicate roles) |
| 🟠 High | 7 | 1 new (Activity Log counter/actor bug) |
| 🟡 Medium | 6 | 1 new (stale shift) |
| 🔵 Low/Watch | 4 | 0 new |
| 🟢 Already ahead | 4 | 0 new |
| Stale-doc corrections to apply | 4 | — |

**Bottom line for go-live:** the two hardest, most India-market-critical gaps (GSTR-1-shaped
report, P&L/Balance Sheet in Reports) are unchanged and still block a GST-registered merchant from
fully replacing IppoBill or a manual process. Everything else flagged HIGH in the old competitor
doc is now done. The three new bugs found live today (dead Upgrade CTA, duplicate system roles,
Activity Log undercounting) are all small, concrete, and worth fixing before the next customer demo
regardless of the bigger roadmap items.
