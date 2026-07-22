-- BillScape Seed Data
-- Run after migrations: supabase db reset

-- ─── Demo Organizations ───────────────────────────────

INSERT INTO organizations (id, name, gstin, state_code, business_type, plan)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'Ravi Grocery Store',
    '33AADCB2230M1ZP',
    'TN',
    'grocery',
    'pro'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Sri Textiles',
    '33AAACS8577K1ZL',
    'TN',
    'textile',
    'free'
  );

-- ─── Org Settings ─────────────────────────────────────

INSERT INTO org_settings (organization_id, branding, feature_flags, tax_profile)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    '{"primary_color": "#10b981", "shop_name": "Ravi Grocery Store", "invoice_header": "RAVI GROCERY STORE", "invoice_footer": "Thank you for shopping with us!"}',
    '{"batch_tracking": true, "variants": false, "expiry_dates": true, "service_jobs": false, "loyalty_points": false}',
    '{"type": "GST", "state_code": "TN", "gstin": "33AADCB2230M1ZP"}'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '{"primary_color": "#8b5cf6", "shop_name": "Sri Textiles", "invoice_header": "SRI TEXTILES", "invoice_footer": "Quality fabric, excellent service!"}',
    '{"batch_tracking": false, "variants": true, "expiry_dates": false, "service_jobs": false, "loyalty_points": false}',
    '{"type": "GST", "state_code": "TN", "gstin": "33AAACS8577K1ZL"}'
  );

-- ─── Categories ───────────────────────────────────────

INSERT INTO categories (organization_id, name, color) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Grains & Rice', '#f59e0b'),
  ('11111111-1111-1111-1111-111111111111', 'Pulses & Dal', '#10b981'),
  ('11111111-1111-1111-1111-111111111111', 'Oils & Ghee', '#ef4444'),
  ('11111111-1111-1111-1111-111111111111', 'Snacks', '#8b5cf6'),
  ('11111111-1111-1111-1111-111111111111', 'Beverages', '#3b82f6'),
  ('22222222-2222-2222-2222-222222222222', 'Cotton', '#06b6d4'),
  ('22222222-2222-2222-2222-222222222222', 'Silk', '#ec4899'),
  ('22222222-2222-2222-2222-222222222222', 'Synthetic', '#f97316');

-- ─── Products for Ravi Grocery ────────────────────────

INSERT INTO products (organization_id, name, hsn_code, tax_rate, price, cost_price, barcode_value, track_stock)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Basmati Rice 5kg', '1006', 5, 320.00, 260.00, 'BS-RICE-5KG-001', true),
  ('11111111-1111-1111-1111-111111111111', 'Toor Dal 1kg', '0713', 5, 145.00, 115.00, 'BS-DAL-1KG-002', true),
  ('11111111-1111-1111-1111-111111111111', 'Sunflower Oil 1L', '1512', 5, 165.00, 140.00, 'BS-OIL-1L-003', true),
  ('11111111-1111-1111-1111-111111111111', 'Lays Chips 100g', '2106', 18, 20.00, 14.00, 'BS-CHIPS-004', true),
  ('11111111-1111-1111-1111-111111111111', 'Bisleri Water 1L', '2201', 18, 20.00, 12.00, 'BS-WATER-005', true),
  ('11111111-1111-1111-1111-111111111111', 'Amul Butter 500g', '0405', 12, 280.00, 245.00, 'BS-BUTTER-006', true),
  ('11111111-1111-1111-1111-111111111111', 'Sugar 1kg', '1701', 5, 45.00, 38.00, 'BS-SUGAR-007', true),
  ('11111111-1111-1111-1111-111111111111', 'Atta Wheat 5kg', '1101', 0, 210.00, 175.00, 'BS-ATTA-008', true),
  ('11111111-1111-1111-1111-111111111111', 'Parle-G Biscuits 800g', '1905', 18, 55.00, 40.00, 'BS-PARLEG-009', true),
  ('11111111-1111-1111-1111-111111111111', 'Tea Leaves 250g', '0902', 5, 95.00, 75.00, 'BS-TEA-010', true);

-- ─── Products for Sri Textiles ────────────────────────

INSERT INTO products (organization_id, name, hsn_code, tax_rate, price, cost_price, barcode_value, track_stock)
VALUES
  ('22222222-2222-2222-2222-222222222222', 'Cotton Saree 6m', '5208', 5, 1200.00, 850.00, 'ST-SAR-001', true),
  ('22222222-2222-2222-2222-222222222222', 'Silk Blouse Piece', '5007', 12, 850.00, 620.00, 'ST-BLZ-002', true),
  ('22222222-2222-2222-2222-222222222222', 'Men Dhoti Cotton', '5208', 5, 280.00, 200.00, 'ST-DHO-003', true),
  ('22222222-2222-2222-2222-222222222222', 'Synthetic Salwar Set', '6204', 12, 650.00, 450.00, 'ST-SAL-004', true),
  ('22222222-2222-2222-2222-222222222222', 'Embroidery Thread Set', '5601', 12, 120.00, 80.00, 'ST-THR-005', true);

-- ─── Initial Inventory ────────────────────────────────

INSERT INTO inventory (product_id, organization_id, stock_qty, reorder_level)
SELECT p.id, p.organization_id,
  CASE p.organization_id
    WHEN '11111111-1111-1111-1111-111111111111' THEN
      CASE p.barcode_value
        WHEN 'BS-RICE-5KG-001' THEN 45
        WHEN 'BS-DAL-1KG-002' THEN 30
        WHEN 'BS-OIL-1L-003' THEN 25
        WHEN 'BS-CHIPS-004' THEN 100
        WHEN 'BS-WATER-005' THEN 80
        WHEN 'BS-BUTTER-006' THEN 15
        WHEN 'BS-SUGAR-007' THEN 60
        WHEN 'BS-ATTA-008' THEN 20
        WHEN 'BS-PARLEG-009' THEN 50
        WHEN 'BS-TEA-010' THEN 35
        ELSE 20
      END
    ELSE 10
  END as stock_qty,
  5 as reorder_level
FROM products p;

-- ─── Demo Customers ───────────────────────────────────

INSERT INTO customers (organization_id, name, phone, state_code)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Kumar Raj', '9876543210', 'TN'),
  ('11111111-1111-1111-1111-111111111111', 'Priya Sharma', '9876543211', 'TN'),
  ('11111111-1111-1111-1111-111111111111', 'Walk-in Customer', NULL, 'TN'),
  ('22222222-2222-2222-2222-222222222222', 'Meena Devi', '9876543212', 'TN'),
  ('22222222-2222-2222-2222-222222222222', 'Anbu Retail', '9876543213', 'KA');
