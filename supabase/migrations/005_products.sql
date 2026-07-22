-- Product categories
CREATE TABLE categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  color           TEXT DEFAULT '#6366f1',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_categories_org ON categories(organization_id);

-- Products
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  sku             TEXT,
  hsn_code        TEXT,
  tax_rate        SMALLINT NOT NULL DEFAULT 18 CHECK (tax_rate IN (0, 5, 12, 18, 28)),
  price           NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  cost_price      NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  barcode_value   TEXT,
  image_url       TEXT,
  track_stock     BOOLEAN NOT NULL DEFAULT true,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, barcode_value),
  UNIQUE(organization_id, sku)
);

CREATE INDEX idx_products_org ON products(organization_id);
CREATE INDEX idx_products_barcode ON products(organization_id, barcode_value);
CREATE INDEX idx_products_name ON products USING gin(to_tsvector('english', name));

-- Product variants (for textile: size/color)
CREATE TABLE product_variants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  size            TEXT,
  color           TEXT,
  price_delta     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  stock_qty       INTEGER NOT NULL DEFAULT 0,
  barcode_value   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_variants_product ON product_variants(product_id);
