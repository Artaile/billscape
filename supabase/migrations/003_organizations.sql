-- Organizations (one per shop/tenant)
CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  gstin         TEXT,
  state_code    CHAR(2) NOT NULL DEFAULT 'TN',
  country       TEXT NOT NULL DEFAULT 'IN',
  business_type business_type NOT NULL DEFAULT 'general',
  plan          org_plan NOT NULL DEFAULT 'free',
  status        org_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-shop settings: branding, feature flags, tax profile
CREATE TABLE org_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branding         JSONB NOT NULL DEFAULT '{
    "primary_color": "#6366f1",
    "shop_name": "My Shop"
  }',
  feature_flags    JSONB NOT NULL DEFAULT '{
    "batch_tracking": false,
    "variants": false,
    "expiry_dates": false,
    "service_jobs": false,
    "loyalty_points": false
  }',
  tax_profile      JSONB NOT NULL DEFAULT '{
    "type": "GST",
    "state_code": "TN"
  }',
  invoice_template JSONB,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER org_settings_updated_at
  BEFORE UPDATE ON org_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
