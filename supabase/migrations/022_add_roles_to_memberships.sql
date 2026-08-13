-- Migration: Add dynamic roles support to memberships

-- 1. Add role_id column referencing the custom roles table
ALTER TABLE memberships
ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id) ON DELETE SET NULL;

-- 2. Populate the custom roles table with the default roles for ALL existing organizations
-- We need to ensure that every organization has the base roles: owner, admin, manager, cashier.
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    -- Create Owner Role (Locked, All Permissions)
    INSERT INTO roles (organization_id, name, description, is_system, permissions)
    VALUES (
      org.id, 
      'owner', 
      'Has complete control of the dashboard including user management and system settings.', 
      true, 
      '{"dashboard":true,"billing":true,"products":true,"inventory":true,"customers":true,"employees":true,"suppliers":true,"purchases":true,"expenses":true,"returns":true,"quotations":true,"promotions":true,"loyalty":true,"reports":true,"roles":true,"settings":true,"activity":true,"shifts":true,"ledger":true}'::jsonb
    )
    ON CONFLICT DO NOTHING;

    -- Create Admin Role (Editable)
    INSERT INTO roles (organization_id, name, description, is_system, permissions)
    VALUES (
      org.id, 
      'admin', 
      'Has access to all standard modules except advanced settings and roles.', 
      true, 
      '{"dashboard":true,"billing":true,"products":true,"inventory":true,"customers":true,"employees":true,"suppliers":true,"purchases":true,"expenses":true,"returns":true,"quotations":true,"promotions":true,"loyalty":true,"reports":true,"roles":false,"settings":false,"activity":true,"shifts":true,"ledger":true}'::jsonb
    )
    ON CONFLICT DO NOTHING;

    -- Create Manager Role (Editable)
    INSERT INTO roles (organization_id, name, description, is_system, permissions)
    VALUES (
      org.id, 
      'manager', 
      'Can manage products, inventory, customers, and standard daily operations.', 
      true, 
      '{"dashboard":true,"billing":true,"products":true,"inventory":true,"customers":true,"employees":true,"suppliers":true,"purchases":false,"expenses":true,"returns":true,"quotations":true,"promotions":true,"loyalty":true,"reports":true,"roles":false,"settings":false,"activity":false,"shifts":true,"ledger":false}'::jsonb
    )
    ON CONFLICT DO NOTHING;

    -- Create Cashier Role (Editable)
    INSERT INTO roles (organization_id, name, description, is_system, permissions)
    VALUES (
      org.id, 
      'cashier', 
      'Can only access the POS billing system and process sales.', 
      true, 
      '{"dashboard":false,"billing":true,"products":false,"inventory":false,"customers":true,"employees":false,"suppliers":false,"purchases":false,"expenses":false,"returns":false,"quotations":false,"promotions":false,"loyalty":false,"reports":false,"roles":false,"settings":false,"activity":false,"shifts":true,"ledger":false}'::jsonb
    )
    ON CONFLICT DO NOTHING;

    -- Update existing memberships to map to these new roles based on their ENUM
    UPDATE memberships SET role_id = (SELECT id FROM roles WHERE organization_id = org.id AND name = 'owner' LIMIT 1) 
    WHERE organization_id = org.id AND role = 'owner';
    
    UPDATE memberships SET role_id = (SELECT id FROM roles WHERE organization_id = org.id AND name = 'manager' LIMIT 1) 
    WHERE organization_id = org.id AND role = 'manager';
    
    UPDATE memberships SET role_id = (SELECT id FROM roles WHERE organization_id = org.id AND name = 'cashier' LIMIT 1) 
    WHERE organization_id = org.id AND role = 'cashier';

  END LOOP;
END;
$$;
