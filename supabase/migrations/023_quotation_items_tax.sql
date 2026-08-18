-- Add GST breakdown fields to quotation_items, matching sale_items' shape, so quotations
-- can render a full tax breakdown and convert cleanly into a sale via computeGST().
-- Applied live via Supabase MCP on 2026-08-18 as "019_quotation_items_tax" — file added
-- here afterward for repo history; local numbering continues from 022 since the live
-- migration name predates this file's creation.
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hsn_code text,
  ADD COLUMN IF NOT EXISTS tax_rate smallint NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount numeric NOT NULL DEFAULT 0;

-- Existing rows predate tax tracking on quotes; default to 18% with zero computed tax
-- amounts rather than guessing a historical breakdown that was never recorded.
UPDATE quotation_items SET tax_rate = 18 WHERE tax_rate IS NULL;
