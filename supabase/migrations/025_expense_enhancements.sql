-- Expense redesign: expense_no (auto-generated, mirrors generatePurchaseNo), paid/unpaid
-- status, payment mode, direct/indirect type, optional supplier link ("Paid To"), and a
-- proper org-scoped expense_categories table (previously CATEGORIES was a hardcoded
-- frontend array with no type/DB backing).

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS expense_no text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'unpaid')),
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'Cash',
  ADD COLUMN IF NOT EXISTS expense_type text NOT NULL DEFAULT 'indirect' CHECK (expense_type IN ('direct', 'indirect')),
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_expense_no_org_idx ON expenses(organization_id, expense_no) WHERE expense_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS expense_categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  type            text NOT NULL DEFAULT 'indirect' CHECK (type IN ('direct', 'indirect')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage expense categories"
  ON expense_categories FOR ALL
  USING (organization_id IN (SELECT organization_id FROM my_org_ids()));

-- Backfill expense_no for any pre-existing rows so the unique index/UI never sees a blank.
DO $$
DECLARE
  org_rec RECORD;
  exp_rec RECORD;
  seq INTEGER;
BEGIN
  FOR org_rec IN SELECT DISTINCT organization_id FROM expenses WHERE expense_no IS NULL LOOP
    seq := 1;
    FOR exp_rec IN
      SELECT id FROM expenses
      WHERE organization_id = org_rec.organization_id AND expense_no IS NULL
      ORDER BY created_at
    LOOP
      UPDATE expenses SET expense_no = 'EXP-' || seq WHERE id = exp_rec.id;
      seq := seq + 1;
    END LOOP;
  END LOOP;
END $$;

-- Seed each existing org's expense_categories from the categories already in use on
-- their expenses rows, plus the full legacy hardcoded list so nothing disappears from
-- the category picker on first load.
INSERT INTO expense_categories (organization_id, name, type)
SELECT DISTINCT e.organization_id, e.category, 'indirect'
FROM expenses e
WHERE e.category IS NOT NULL
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO expense_categories (organization_id, name, type)
SELECT o.id, c.name, 'indirect'
FROM organizations o
CROSS JOIN (VALUES
  ('Rent'), ('Salary'), ('Electricity'), ('Water'), ('Internet'),
  ('Transport'), ('Packaging'), ('Maintenance'), ('Marketing'), ('Miscellaneous')
) AS c(name)
ON CONFLICT (organization_id, name) DO NOTHING;
