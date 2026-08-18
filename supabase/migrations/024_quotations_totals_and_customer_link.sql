-- Add aggregate GST totals + an optional customer link to quotations, mirroring what
-- sales/purchases already store on their parent row. Needed to render a real tax
-- breakdown on the quotation detail page and to carry accurate totals into
-- "Convert to Sale" without recomputing from scratch.
-- Applied live via Supabase MCP on 2026-08-18 as "020_quotations_totals_and_customer_link".
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_payable numeric;

-- Existing quotes predate totals tracking; backfill net_payable AND subtotal from the
-- legacy total_amount column so nothing renders as null/zero on old rows (subtotal
-- backfill was applied as a follow-up UPDATE live; included here for a from-scratch run).
UPDATE quotations SET net_payable = total_amount WHERE net_payable IS NULL;
UPDATE quotations SET subtotal = total_amount WHERE subtotal = 0 AND total_amount > 0;
