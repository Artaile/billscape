-- Add 'deleted' to org_status enum type to support soft-deletion of shops/tenants
ALTER TYPE org_status ADD VALUE IF NOT EXISTS 'deleted';
