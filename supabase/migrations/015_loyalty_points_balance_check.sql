-- Defense-in-depth against the points_balance read-then-write update in createSale's loyalty
-- bookkeeping ever landing on a negative balance under a concurrent-sale race.
ALTER TABLE loyalty_customers ADD CONSTRAINT loyalty_customers_points_balance_nonneg CHECK (points_balance >= 0);
