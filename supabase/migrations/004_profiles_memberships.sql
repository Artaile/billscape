-- User profiles (extends auth.users)
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL DEFAULT '',
  avatar_url  TEXT,
  phone       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Memberships: user belongs to org with role
CREATE TABLE memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            user_role NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

CREATE INDEX idx_memberships_user_id ON memberships(user_id);
CREATE INDEX idx_memberships_org_id ON memberships(organization_id);

-- Security definer function: get org IDs for current user (avoids N+1 in RLS)
CREATE OR REPLACE FUNCTION public.my_org_ids()
RETURNS TABLE(organization_id UUID)
SECURITY DEFINER SET search_path = public
LANGUAGE SQL STABLE AS $$
  SELECT organization_id FROM memberships WHERE user_id = auth.uid()
$$;

-- Get current user's role in a specific org
CREATE OR REPLACE FUNCTION public.my_role_in_org(org_id UUID)
RETURNS user_role
SECURITY DEFINER SET search_path = public
LANGUAGE SQL STABLE AS $$
  SELECT role FROM memberships
  WHERE user_id = auth.uid() AND organization_id = org_id
  LIMIT 1
$$;

-- Check if current user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
SECURITY DEFINER SET search_path = public
LANGUAGE SQL STABLE AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin',
    false
  )
$$;
