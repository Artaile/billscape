-- Migration 036: Enforce Unique Customer Phone Number per Organization

-- 1. Deduplicate any existing duplicate customer phones within the same organization by keeping the newest or highest balance record and clearing phone on older duplicates
WITH ranked_customers AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, phone 
      ORDER BY balance DESC, created_at DESC
    ) as rn
  FROM customers
  WHERE phone IS NOT NULL AND TRIM(phone) <> ''
)
UPDATE customers
SET phone = NULL
WHERE id IN (
  SELECT id FROM ranked_customers WHERE rn > 1
);

-- 2. Drop existing non-unique index if present
DROP INDEX IF EXISTS idx_customers_phone;

-- 3. Create unique index for (organization_id, phone) where phone is not null/empty
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_org_phone_unique
  ON customers(organization_id, phone)
  WHERE phone IS NOT NULL AND TRIM(phone) <> '';

-- 4. Re-create non-unique index on org alone if not already present
CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id);
