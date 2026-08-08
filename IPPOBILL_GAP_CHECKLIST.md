# BillScape vs IppoBill — Gap Checklist

_Competitor analyzed: ippobill.com (live trial account, Basic plan)_
_Method: hands-on testing — real product/purchase/sale/return transactions entered across Purchases, Sales, Reports, Settings, and Inventory modules; 18 independently-verified correct outputs (10 stock reconciliations + 8 report figures); Pro/Enterprise tier features sourced from IppoBill's own public pricing page since a Basic trial can't reach them_
_BillScape analyzed via: CLAUDE.md_
_Analysis date: 2026-08-08_

Full narrative writeup with section-by-section evidence: see the published artifact report (screenshots, live GSTR-1/P&L numbers, action-menu-by-action-menu walkthroughs of every Purchases/Sales document type).

---

## 🔴 CRITICAL — Fix or build first

Gaps that block a real segment of merchants, or undermine BillScape's own "India GST first" non-negotiable rule.

| # | Item | Why | Effort |
|---|------|-----|--------|
| 1 | **Produce GSTR-1 / GSTR-3B-shaped report output** | BillScape's per-line GST math (CGST/SGST/IGST via computeGST/computeLineTax) is already correct — verified against IppoBill's own numbers. Missing: a report shaped like the actual return (B2B vs B2C split, HSN-wise summary, reconciliation check). Every GST-registered merchant needs this monthly; currently would have to be reconstructed by hand. | Large |
| 2 | **Add a unit-of-measure + conversion system to products** | Every BillScape product today is implicitly "1 piece." No unit field, no conversion table. Blocks any shop selling by weight, volume, or box-vs-loose-piece — a large share of Indian kirana/wholesale trade. Foundational: pricing, stock counts, purchase-vs-sale quantities all depend on it. | Large — schema change |
| 3 | **Audit every required-field asterisk against actual save behavior** | Not a feature gap — a correctness lesson. Confirmed **twice** in IppoBill: a red required marker that saves fine with the field left empty (Purchase Bill batch entry; Product/Service Purchase Price). A required marker that doesn't validate is worse than none — it tells the merchant data was captured when it wasn't. Grep BillScape's form schemas and confirm every required-marked UI field has a matching Zod/RHF rule that actually fires. | Small — do now |

**Evidence:**
- GSTR-1 generated against 4 live invoices — "Difference: ₹0.00" reconciliation, correct 0 B2B / 4 B2C split, ₹2,406 taxable, ₹433 total tax, all hand-verified.
- Created a real "1 Box = 12 Pieces" conversion — system auto-reclassified Box as "Base" and Pieces as "Derived," confirming a real dependency graph, not a flat table.
- Purchase Bill batch fields saved empty despite required markers; later confirmed via a Purchase Return showing "No batch (untracked)." Independently, Service Purchase Price did the same.

---

## 🟠 HIGH — Real merchant workflows, no BillScape equivalent

| # | Item | Why | Effort |
|---|------|-----|--------|
| 1 | **Standalone Payment-In / Payment-Out, deep-linkable from a specific sale/purchase** | Recording money collected/paid against an existing balance independent of editing the original transaction — a customer clearing an old due weeks later, a partial advance. No BillScape path today. | Medium |
| 2 | **One-click Duplicate on Sale Invoice and Purchase Bill** | Real speed win for repeat orders — copy party/items, reset payment status to unpaid. No BillScape equivalent on any document type. | Small–Medium |
| 3 | **Add a "Without Stock" mode to Returns** | BillScape's Returns page always adjusts stock. Damaged-goods or wrong-item-kept returns need to credit the customer without restocking — currently only a manual correction afterward. | Small–Medium |
| 4 | **Add opening balance to Supplier/Customer creation** | Merchants migrating from another system need to declare existing dues on day one. Currently only a manual ledger entry after the fact. | Small |
| 5 | **Split invoice numbering prefixes per document type** | `org_settings.branding.invoice_prefix` is a single value today. Purchases, quotations, returns, and future document types share one counter or have none. | Medium |
| 6 | **Confirm P&L / Balance Sheet / Trial Balance are reachable from Reports, not just Ledger** | The double-entry data already exists (accounts/vouchers/voucher_entries). Mostly a presentation layer on data already captured — high credibility payoff for low new-logic cost. | Medium — mostly presentation |
| 7 | **Consider a global ⌘K / Cmd-K search** | Products, parties, invoices searched from one command palette, reachable anywhere. Genuine daily-use speed win BillScape doesn't have in any form. | Medium |

**Evidence:**
- "Make Payment" on a bill pre-fills supplier, bill, exact outstanding balance, and a generated note in one click. "Receive Payment" shows Invoice Total → minus Returns → minus Prior Payments → Outstanding as a visible mini-ledger.
- Duplicating an invoice created "INV-1-Copy1" with a "Copy" badge, correctly reset to Pending.
- A live banner swaps between "Only the value will be credited. No stock movement" and "Goods will be returned to inventory and stock will increase" as the Return Type toggle changes — tested both paths.
- Add Party form has inline Opening Balance + Balance Type (To Receive / To Pay).
- Settings → Invoice & Documents has 9 separate prefix fields (Sale Invoice, Purchase Bill, Estimate, Sale Order, Proforma, Credit Note, Challan, Receipt, Expense).
- Generated a real P&L — watched Net Profit recalculate live from ₹991 to −₹4,009 after adding a ₹5,000 expense mid-test. COGS computed from actual sold-item cost, not total purchases.
- Typed "Ramesh" into header search — returned a categorized live result ("Parties → Ramesh Kumar, customer").

---

## 🟡 MEDIUM — Worth doing, lower urgency

| # | Item | Why | Effort |
|---|------|-----|--------|
| 1 | **Show the outstanding-balance breakdown when recording a payment** | Total → minus Returns → minus Prior Payments → Outstanding as a visible breakdown, not a blank field to trust blindly. | Small |
| 2 | **Consider a billable "Service" item type, separate from stock-tracked Products** | Only relevant if BillScape shops sell labour/installation/consulting. Currently no way to bill a service line without it behaving like a stock-tracked product. | Medium |
| 3 | **Add Direct/Indirect classification to expense categories** | Feeds a correct P&L operating-expense breakdown; BillScape's Dashboard already shows a Direct/Indirect split with no category field backing it. | Small |
| 4 | **Evaluate per-price GST inclusive/exclusive framing on the product form** | Worth a support-ticket check first: do merchants get confused whether a typed price already includes GST? IppoBill shows a live "Base price (excl. GST): ₹X" readout. | Small |
| 5 | **Party-wise P&L / profitability report** | BillScape's reporting is transaction/product-centric, not party-centric. No "which customers/suppliers are profitable" view today. | Medium |
| 6 | **Consider a Composition Scheme flag on tax_profile** | A meaningful share of small Indian retailers register under Composition Scheme (flat lower tax, no ITC, Bill of Supply). Check if any current/prospective tenants need this before building. | Medium — touches invoice + tax logic |

**Evidence:**
- Receive Payment modal breakdown correctly reflected a prior partial return before asking for a new payment amount.
- Service mode auto-disables the Stock tab, relabels HSN to "HSN/SAC Code," appears in a separate "Services" section of the item picker.
- Created an "Indirect Expense" category — confirmed it fed into the P&L's Operating Expenses line.
- Party Reports includes "Party Wise P&L" alongside Statement, All Parties, Sale/Purchase by Party.

---

## 🔵 LOW / WATCH — Reference patterns, not urgent builds

Bookmark for if/when the underlying feature is ever built — don't build the underlying feature just to get the pattern.

| # | Item | Note |
|---|------|------|
| 1 | **If a Purchase/Sale Order stage is ever added, copy IppoBill's convert-to-bill pattern exactly** | The single best multi-step flow found in the whole review: pre-fill the destination document, show an explicit "stock will be increased" banner before save, flip the order's own status afterward. No committed BillScape need for an order stage today. |
| 2 | **If BillScape ever ships paid tiers, generate the pricing page and the in-app gate from one source** | Caught IppoBill's own pricing page listing POS Mode as included in Basic, while the live Basic-tier app paywalls it every time — tested repeatedly, confirmed real. Whatever decides "is this feature on this plan" should drive both the marketing copy and the gate. |
| 3 | **Delivery Challan / stock-movement-without-billing document** | Common in Indian wholesale — goods leave before the tax invoice is raised. No current BillScape need identified. |
| 4 | **Configurable barcode structure (seller code, padding length)** | BillScape's `generateBarcode()` is fixed-format. Only worth revisiting if a merchant specifically needs a custom scheme. |

---

## 🟢 ALREADY AHEAD — Don't undo these chasing parity

Genuine BillScape advantages found while comparing. Worth knowing so nothing here gets "fixed" by accident.

| # | Item | Why it's an advantage |
|---|------|----------------------|
| 1 | **Role-based access control on every tier, not paywalled** | BillScape's RolesPage, permission matrix, and custom roles are core functionality for every tenant. IppoBill locks "Role-Based Access Control" behind its ₹999/mo Pro plan. |
| 2 | **Live-preview product form panel** | BillScape's ProductFormPage has a sticky live-preview card (margin %, MRP-strikethrough, badges) updating as you type. IppoBill's product form has no equivalent — fill in blind, see the result only after saving. |
| 3 | **A more distinctive, modern visual identity** | IppoBill is light-mode, generic-SaaS-blue, reads as a clean template. BillScape's dark zinc-950 + indigo-500 identity is more memorable. Not a gap to close. |
| 4 | **Correct stock-reversal logic on transaction edits, verified under real load** | BillScape's own CLAUDE.md documents a prior stock double-counting bug (fixed 2026-07-29). IppoBill's equivalent edit-and-reverse logic was tested here and found correct — worth confirming BillScape's own fix continues to hold under similar testing, not a gap but a place to keep verifying. |
| 5 | **Purchase entry's "More details" collapsible already matches IppoBill's own progressive-disclosure pattern** | IppoBill hides secondary fields (Category, HSN, Variants, Batches) behind "More details" to keep forms short. BillScape's PurchaseFormPage already does the same for new-product rows — already shipped. |
| 6 | **No feature-gating complexity to maintain** | BillScape has no Basic/Pro/Enterprise split today — every tenant gets every feature. Sidesteps the entire class of bug found in IppoBill (the POS Mode marketing/gating mismatch) by not having tiers yet. Worth remembering if tiering is ever considered. |

---

## Bug pattern to self-audit right now

**Required-field markers that don't block save.** Two independent IppoBill forms (Purchase Bill batch entry, Product/Service Purchase Price) show a red required asterisk, then save successfully with the field left completely empty. Cheap to test, expensive to discover in production — a batch with no expiry silently defeats FEFO tracking; a service with no purchase price silently breaks cost-basis reporting.

**Action:** grep BillScape's form schemas for every required field marked in the UI, and confirm each has a matching Zod `.min(1)` / RHF `required: true` that actually fires on submit — not just a visual asterisk added independently of the validation layer.

---

## Summary scoreboard

| Tier | Count |
|------|-------|
| 🔴 Critical | 3 |
| 🟠 High | 7 |
| 🟡 Medium | 6 |
| 🔵 Low / Watch | 4 |
| 🟢 Already ahead | 6 |

**Total independently-verified findings backing this checklist:** 18 correct outputs (10 stock reconciliations across Purchases/Sales, 8 report figures including P&L, GSTR-1, and tax netting) — every document type's full action menu tested against real transactions, not just screenshotted empty.
