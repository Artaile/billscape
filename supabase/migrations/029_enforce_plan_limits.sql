-- Migration 029: Enforce Subscription Plan Limits via PostgreSQL Triggers

-- Function 1: Check Product Plan Limit
CREATE OR REPLACE FUNCTION check_product_plan_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_limit INT;
  v_count INT;
  v_plan_name TEXT;
BEGIN
  v_org_id := NEW.organization_id;
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1. Get plan limit for products from org_plans -> plans OR organizations -> plans
  SELECT 
    COALESCE((p.limits->>'products')::INT, 100),
    p.name
  INTO v_limit, v_plan_name
  FROM org_plans op
  JOIN plans p ON p.id = op.plan_id
  WHERE op.organization_id = v_org_id AND op.status = 'active'
  LIMIT 1;

  -- Fallback to default active plan if not found in org_plans
  IF v_limit IS NULL THEN
    SELECT 
      COALESCE((p.limits->>'products')::INT, 100),
      p.name
    INTO v_limit, v_plan_name
    FROM organizations o
    JOIN plans p ON LOWER(p.name) LIKE '%' || LOWER(o.plan::text) || '%'
    WHERE o.id = v_org_id AND p.is_active = true
    LIMIT 1;
  END IF;

  -- If limit is -1, it means unlimited
  IF v_limit IS NULL OR v_limit = -1 THEN
    RETURN NEW;
  END IF;

  -- 2. Count existing active non-deleted products
  SELECT COUNT(*) INTO v_count
  FROM products
  WHERE organization_id = v_org_id;

  -- 3. Check limit
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED:PRODUCTS:%:%', v_limit, COALESCE(v_plan_name, 'Current Plan')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on products
DROP TRIGGER IF EXISTS trigger_check_product_plan_limit ON products;
CREATE TRIGGER trigger_check_product_plan_limit
  BEFORE INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION check_product_plan_limit();


-- Function 2: Check Employee / Membership Plan Limit
CREATE OR REPLACE FUNCTION check_employee_plan_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_limit INT;
  v_count INT;
  v_plan_name TEXT;
BEGIN
  v_org_id := NEW.organization_id;
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT 
    COALESCE((p.limits->>'employees')::INT, 5),
    p.name
  INTO v_limit, v_plan_name
  FROM org_plans op
  JOIN plans p ON p.id = op.plan_id
  WHERE op.organization_id = v_org_id AND op.status = 'active'
  LIMIT 1;

  IF v_limit IS NULL THEN
    SELECT 
      COALESCE((p.limits->>'employees')::INT, 5),
      p.name
    INTO v_limit, v_plan_name
    FROM organizations o
    JOIN plans p ON LOWER(p.name) LIKE '%' || LOWER(o.plan::text) || '%'
    WHERE o.id = v_org_id AND p.is_active = true
    LIMIT 1;
  END IF;

  IF v_limit IS NULL OR v_limit = -1 THEN
    RETURN NEW;
  END IF;

  SELECT GREATEST(
    (SELECT COUNT(*) FROM memberships WHERE organization_id = v_org_id),
    (SELECT COUNT(*) FROM employees WHERE organization_id = v_org_id)
  ) INTO v_count;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED:EMPLOYEES:%:%', v_limit, COALESCE(v_plan_name, 'Current Plan')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on memberships
DROP TRIGGER IF EXISTS trigger_check_employee_plan_limit ON memberships;
CREATE TRIGGER trigger_check_employee_plan_limit
  BEFORE INSERT ON memberships
  FOR EACH ROW
  EXECUTE FUNCTION check_employee_plan_limit();

-- Trigger on employees
DROP TRIGGER IF EXISTS trigger_check_employee_table_plan_limit ON employees;
CREATE TRIGGER trigger_check_employee_table_plan_limit
  BEFORE INSERT ON employees
  FOR EACH ROW
  EXECUTE FUNCTION check_employee_plan_limit();


-- Function 3: Check Monthly Invoice Plan Limit
CREATE OR REPLACE FUNCTION check_invoice_plan_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_limit INT;
  v_count INT;
  v_plan_name TEXT;
BEGIN
  v_org_id := NEW.organization_id;
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT 
    COALESCE((p.limits->>'monthly_invoices')::INT, 500),
    p.name
  INTO v_limit, v_plan_name
  FROM org_plans op
  JOIN plans p ON p.id = op.plan_id
  WHERE op.organization_id = v_org_id AND op.status = 'active'
  LIMIT 1;

  IF v_limit IS NULL THEN
    SELECT 
      COALESCE((p.limits->>'monthly_invoices')::INT, 500),
      p.name
    INTO v_limit, v_plan_name
    FROM organizations o
    JOIN plans p ON LOWER(p.name) LIKE '%' || LOWER(o.plan::text) || '%'
    WHERE o.id = v_org_id AND p.is_active = true
    LIMIT 1;
  END IF;

  IF v_limit IS NULL OR v_limit = -1 THEN
    RETURN NEW;
  END IF;

  -- Count sales created in current calendar month
  SELECT COUNT(*) INTO v_count
  FROM sales
  WHERE organization_id = v_org_id
    AND created_at >= date_trunc('month', CURRENT_TIMESTAMP);

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED:INVOICES:%:%', v_limit, COALESCE(v_plan_name, 'Current Plan')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on sales
DROP TRIGGER IF EXISTS trigger_check_invoice_plan_limit ON sales;
CREATE TRIGGER trigger_check_invoice_plan_limit
  BEFORE INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION check_invoice_plan_limit();


-- Function 4: Check Branch Plan Limit
CREATE OR REPLACE FUNCTION check_branch_plan_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_limit INT;
  v_count INT;
  v_plan_name TEXT;
BEGIN
  v_org_id := NEW.organization_id;
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT 
    COALESCE((p.limits->>'branches')::INT, 1),
    p.name
  INTO v_limit, v_plan_name
  FROM org_plans op
  JOIN plans p ON p.id = op.plan_id
  WHERE op.organization_id = v_org_id AND op.status = 'active'
  LIMIT 1;

  IF v_limit IS NULL THEN
    SELECT 
      COALESCE((p.limits->>'branches')::INT, 1),
      p.name
    INTO v_limit, v_plan_name
    FROM organizations o
    JOIN plans p ON LOWER(p.name) LIKE '%' || LOWER(o.plan::text) || '%'
    WHERE o.id = v_org_id AND p.is_active = true
    LIMIT 1;
  END IF;

  IF v_limit IS NULL OR v_limit = -1 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM branches
  WHERE organization_id = v_org_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED:BRANCHES:%:%', v_limit, COALESCE(v_plan_name, 'Current Plan')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on branches
DROP TRIGGER IF EXISTS trigger_check_branch_plan_limit ON branches;
CREATE TRIGGER trigger_check_branch_plan_limit
  BEFORE INSERT ON branches
  FOR EACH ROW
  EXECUTE FUNCTION check_branch_plan_limit();
