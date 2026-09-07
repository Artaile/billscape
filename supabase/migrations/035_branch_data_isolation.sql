-- Migration 035: Complete Branch Data Isolation (Independent Branch Stores)
-- Safety: 100% Backward Compatible (Existing data is assigned to Main Head Office branch)

-- 1. Add branch_id column to tables
ALTER TABLE products ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- 2. Data Preservation: Backfill existing data without branch_id to Main Head Office branch
UPDATE products p
SET branch_id = b.id
FROM branches b
WHERE p.branch_id IS NULL
  AND p.organization_id = b.organization_id
  AND (b.is_main = true OR b.type = 'head_office');

UPDATE categories c
SET branch_id = b.id
FROM branches b
WHERE c.branch_id IS NULL
  AND c.organization_id = b.organization_id
  AND (b.is_main = true OR b.type = 'head_office');

UPDATE suppliers s
SET branch_id = b.id
FROM branches b
WHERE s.branch_id IS NULL
  AND s.organization_id = b.organization_id
  AND (b.is_main = true OR b.type = 'head_office');

UPDATE customers c
SET branch_id = b.id
FROM branches b
WHERE c.branch_id IS NULL
  AND c.organization_id = b.organization_id
  AND (b.is_main = true OR b.type = 'head_office');

UPDATE expenses e
SET branch_id = b.id
FROM branches b
WHERE e.branch_id IS NULL
  AND e.organization_id = b.organization_id
  AND (b.is_main = true OR b.type = 'head_office');

UPDATE promotions pr
SET branch_id = b.id
FROM branches b
WHERE pr.branch_id IS NULL
  AND pr.organization_id = b.organization_id
  AND (b.is_main = true OR b.type = 'head_office');
