-- Migration 037: Add variant_id column to branch_inventory table
ALTER TABLE branch_inventory ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);
