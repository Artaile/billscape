-- Optional UPI ID on suppliers, alongside bank_name/bank_account/bank_ifsc — not every
-- supplier uses bank transfer, some only take UPI.
ALTER TABLE suppliers ADD COLUMN upi_id text;
