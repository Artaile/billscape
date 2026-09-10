-- Migration 035: Add Industry Template & Garment Trait Fields
-- 1. Add industry_template column to org_settings branding default JSONB or org_settings table if needed,
--    and add brand, fabric, gender to products & product_variants tables as nullable text.

ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS fabric TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT;

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS fabric TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT;
