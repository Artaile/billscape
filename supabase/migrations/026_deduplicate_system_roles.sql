-- Migration 026: Deduplicate system roles and enforce unique (organization_id, LOWER(name))

-- Delete duplicate system roles keeping the one created earliest per organization
DELETE FROM roles r1
USING roles r2
WHERE r1.organization_id = r2.organization_id
  AND LOWER(TRIM(r1.name)) = LOWER(TRIM(r2.name))
  AND r1.is_system = true
  AND r2.is_system = true
  AND r1.created_at > r2.created_at;

-- Add unique index to prevent future duplicate roles per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_org_lower_name ON roles(organization_id, LOWER(TRIM(name)));
