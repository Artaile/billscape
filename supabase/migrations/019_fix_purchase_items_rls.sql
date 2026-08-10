-- Fix purchase_items RLS: FOR ALL with only USING doesn't allow INSERT in Supabase.
-- Add explicit WITH CHECK for INSERT so members can insert purchase line items.

DROP POLICY IF EXISTS "Members can manage purchase items" ON purchase_items;

CREATE POLICY "Members can view purchase items"
  ON purchase_items FOR SELECT
  USING (
    purchase_id IN (
      SELECT id FROM purchases
      WHERE organization_id IN (SELECT organization_id FROM my_org_ids())
    )
  );

CREATE POLICY "Members can insert purchase items"
  ON purchase_items FOR INSERT
  WITH CHECK (
    purchase_id IN (
      SELECT id FROM purchases
      WHERE organization_id IN (SELECT organization_id FROM my_org_ids())
    )
  );

CREATE POLICY "Members can update purchase items"
  ON purchase_items FOR UPDATE
  USING (
    purchase_id IN (
      SELECT id FROM purchases
      WHERE organization_id IN (SELECT organization_id FROM my_org_ids())
    )
  );

CREATE POLICY "Members can delete purchase items"
  ON purchase_items FOR DELETE
  USING (
    purchase_id IN (
      SELECT id FROM purchases
      WHERE organization_id IN (SELECT organization_id FROM my_org_ids())
    )
  );
