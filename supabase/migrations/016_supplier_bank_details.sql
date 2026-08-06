-- Bank details on suppliers, so the same info can be captured whether a supplier is
-- created from the Suppliers page or quick-added from within New Purchase.
ALTER TABLE suppliers ADD COLUMN bank_name text;
ALTER TABLE suppliers ADD COLUMN bank_account text;
ALTER TABLE suppliers ADD COLUMN bank_ifsc text;
