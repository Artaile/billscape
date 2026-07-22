CREATE TYPE user_role AS ENUM ('super_admin', 'owner', 'manager', 'cashier');
CREATE TYPE business_type AS ENUM ('grocery', 'textile', 'pharmacy', 'electronics', 'service', 'general');
CREATE TYPE payment_mode AS ENUM ('cash', 'card', 'upi', 'split');
CREATE TYPE stock_movement_reason AS ENUM ('sale', 'purchase', 'adjustment', 'return', 'damage', 'opening');
CREATE TYPE org_plan AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE org_status AS ENUM ('active', 'suspended');
