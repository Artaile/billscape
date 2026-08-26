// ─── Roles ────────────────────────────────────────────────────────────────────
export type UserRole = 'super_admin' | 'owner' | 'manager' | 'cashier'

// ─── Tax ──────────────────────────────────────────────────────────────────────
export type TaxStrategy = 'GST' | 'VAT'
export type GSTRate = 0 | 5 | 12 | 18 | 28
export type PaymentMode = 'cash' | 'card' | 'upi' | 'split'

// ─── Organization ─────────────────────────────────────────────────────────────
export type BusinessType =
  | 'grocery'
  | 'textile'
  | 'pharmacy'
  | 'electronics'
  | 'service'
  | 'general'

export interface OrgBranding {
  logo_url?: string
  primary_color: string
  invoice_header?: string
  invoice_footer?: string
  shop_name: string
  bank_name?: string
  bank_account?: string
  bank_ifsc?: string
  invoice_terms?: string
  invoice_prefix?: string
  invoice_start_number?: number
  currency?: string
  date_format?: string
  timezone?: string
  financial_year_start?: string
  // Tax & GST
  tax_inclusive?: boolean
  default_gst_rate?: number
  composition_scheme?: boolean
  inter_state_tax?: boolean
  show_hsn_on_invoice?: boolean
  rcm_enabled?: boolean
  // Barcode
  barcode_type?: string
  barcode_label_size?: string
  auto_print_barcode_on_purchase?: boolean
  // UPI / Payments
  upi_id?: string
  default_payment_mode?: string
  default_payment_terms?: number
  payment_reminder_days?: number
  // Signature
  signature_url?: string
  show_signature_on_invoice?: boolean
  // Notifications
  notify_low_stock?: boolean
  notify_expiry?: boolean
  notify_invoice_due?: boolean
  notify_payment_received?: boolean
  notify_daily_summary?: boolean
  // Print & PDF Layout
  print_paper_size?: 'a4' | 'a5' | 'thermal_3inch' | 'thermal_2inch'
  print_template_theme?: string
  
  // Colors & Typography
  print_text_color?: string
  print_font_family?: string
  print_font_size?: string

  // Business Information
  print_show_logo?: boolean
  print_show_shop_name?: boolean
  print_show_address?: boolean
  print_show_contact?: boolean
  print_show_gstin?: boolean
  print_show_pan?: boolean
  print_show_email_website?: boolean

  // Customer / Party Details
  print_show_customer_billing_address?: boolean
  print_show_customer_shipping_address?: boolean
  print_show_customer_pan?: boolean
  print_show_customer_phone?: boolean

  // Document Details
  print_show_document_number?: boolean
  print_show_document_date?: boolean
  print_show_due_date?: boolean
  print_show_place_of_supply?: boolean
  print_show_delivery_note?: boolean
  print_show_payment_mode?: boolean

  // Item Table Columns
  print_show_column_sno?: boolean
  print_show_column_hsn?: boolean
  print_show_column_mrp?: boolean
  print_show_column_item_name?: boolean
  print_show_column_qty?: boolean
  print_show_column_unit?: boolean
  print_show_column_rate?: boolean
  print_show_column_discount_type?: boolean
  print_show_column_discount?: boolean
  print_show_column_tax_rate?: boolean
  print_show_column_taxable_value?: boolean
  print_show_column_tax_amount?: boolean
  print_show_column_item_total?: boolean

  // Tax Display Settings
  print_show_cgst_sgst_igst?: boolean
  print_show_tax_summary?: boolean

  // Total Calculation Blocks
  print_show_block_subtotal?: boolean
  print_show_block_discount?: boolean
  print_show_block_tax_amount?: boolean
  print_show_block_rounding?: boolean
  print_show_block_round_off?: boolean
  print_show_block_grand_total?: boolean
  print_show_block_received_amount?: boolean
  print_show_block_balance_due?: boolean
  print_show_block_change_returned?: boolean

  // Additional Sections
  print_show_terms?: boolean
  print_show_notes?: boolean
  print_show_bank_details?: boolean
  print_show_signature_outline?: boolean
  print_show_signature?: boolean
  print_show_party_details?: boolean
  print_show_upi_qr?: boolean

  print_thank_you_note?: string
  // Custom Fields Definition
  custom_fields?: CustomFieldDefinition[]
}

export interface CustomFieldDefinition {
  id: string
  name: string
  type: 'text' | 'number' | 'date' | 'dropdown' | 'checkbox'
  target: 'product' | 'service'
  required: boolean
  show_on_invoice: boolean
  options?: string[]
}

export interface OrgFeatureFlags {
  batch_tracking: boolean
  variants: boolean
  expiry_dates: boolean
  service_jobs: boolean
  loyalty_points: boolean
  // Inventory settings
  allow_negative_stock?: boolean
  auto_deduct_stock?: boolean
  low_stock_threshold?: number
  show_out_of_stock_in_billing?: boolean
}

export interface OrgInvoiceTemplate {
  prefix_sale?: string
  prefix_purchase?: string
  prefix_estimate?: string
  prefix_sale_order?: string
  prefix_proforma?: string
  prefix_credit_note?: string
  prefix_challan?: string
  prefix_receipt?: string
  prefix_expense?: string
  auto_generate_numbers?: boolean
  number_format?: string
  number_suffix?: string
  show_logo?: boolean
  show_signature?: boolean
  signature_url?: string
  enable_round_off?: boolean
  round_off_type?: string
  enable_fy_number_reset?: boolean
  invoice_header?: string
  invoice_footer?: string
  default_terms?: string
}

export interface OrgTaxProfile {
  type: TaxStrategy
  state_code: string
  gstin?: string
  vat_trn?: string
}

export interface Organization {
  id: string
  name: string
  gstin?: string
  state_code: string
  country: string
  address?: string
  city?: string
  pincode?: string
  phone?: string
  email?: string
  pan?: string
  website?: string
  business_type?: string
  plan: 'free' | 'pro' | 'enterprise'
  status: 'active' | 'suspended'
  created_at: string
}

// ─── User / Membership ────────────────────────────────────────────────────────
export interface UserProfile {
  id: string
  email?: string
  phone?: string
  full_name: string
  avatar_url?: string
}

export interface Membership {
  id: string
  user_id: string
  organization_id: string
  role: UserRole
  created_at: string
}

// ─── Products ─────────────────────────────────────────────────────────────────
export interface Category {
  id: string
  organization_id: string
  name: string
  color?: string
}

// ─── Units of measure ─────────────────────────────────────────────────────────
// Per-organization, shop-owner-editable (Settings → Units) — NOT a fixed global list.
export interface Unit {
  id: string
  organization_id: string
  name: string
  symbol: string
  allow_decimal: boolean
  created_at: string
}

export interface Product {
  id: string
  organization_id: string
  category_id?: string
  name: string
  sku?: string
  hsn_code?: string
  tax_rate: GSTRate
  price: number
  cost_price: number
  mrp?: number
  special_price?: number
  barcode_value?: string
  image_url?: string
  track_stock: boolean
  is_active: boolean
  created_at: string
  expiry_date?: string
  gst_mode?: 'include' | 'exclude'
  // Base (stocking) unit — always set. Secondary unit + conversion_factor are the
  // optional "sell in Box" pair; when set, 1 secondary_unit = conversion_factor unit.
  unit_id: string
  secondary_unit_id?: string
  conversion_factor?: number
  unit?: Unit
  secondary_unit?: Unit
}

export interface ProductVariant {
  id: string
  product_id: string
  organization_id: string
  size?: string
  color?: string
  price_delta: number
  stock_qty: number
  barcode_value?: string
}

// ─── Inventory ────────────────────────────────────────────────────────────────
export interface InventoryItem {
  product_id: string
  organization_id: string
  stock_qty: number
  reorder_level: number
  updated_at: string
}

export type StockMovementReason =
  | 'sale'
  | 'purchase'
  | 'adjustment'
  | 'return'
  | 'damage'
  | 'opening'

export interface StockMovement {
  id: string
  organization_id: string
  product_id: string
  qty_change: number
  reason: StockMovementReason
  reference_id?: string
  note?: string
  created_by: string
  created_at: string
}

// ─── Customers / Suppliers ────────────────────────────────────────────────────
export interface Customer {
  id: string
  organization_id: string
  name: string
  phone?: string
  email?: string
  gstin?: string
  state_code?: string
  address?: string
  balance: number
  created_at: string
}

export interface Supplier {
  id: string
  organization_id: string
  name: string
  phone?: string
  email?: string
  gstin?: string
  address?: string
  created_at: string
}

// ─── Cart / Billing ───────────────────────────────────────────────────────────
export type DiscountType = 'flat' | 'percent'

export interface CartItem {
  product_id: string
  product_name: string
  hsn_code?: string
  tax_rate: GSTRate
  unit_price: number
  // May be fractional (e.g. 0.5 for a decimal-allowed unit like Kg). Always expressed
  // in the product's BASE unit — selling_unit_id records what the merchant saw/typed,
  // for receipt display only, and never changes what's persisted downstream.
  qty: number
  discount_pct: number
  discount_type?: DiscountType
  discount_amount?: number
  barcode_value?: string
  selling_unit_id?: string
  // Denormalized unit info stashed at add-to-cart time so CartItem rendering doesn't need a
  // live re-join. unit is the product's base unit; secondary_unit/conversion_factor mirror
  // the product's optional "sell in Box" pair (see Product.secondary_unit_id).
  unit?: Unit
  secondary_unit?: Unit
  conversion_factor?: number
  // Set only when this line is a specific product variant, not the base product — carries the
  // variant's own id (for variant-stock bookkeeping in createSale) and display name (for
  // receipts/cart rows). product_id above always stays the PARENT product's real id.
  variant_id?: string
  variant_name?: string
}

export interface TaxBreakupLine {
  tax_rate: GSTRate
  taxable_amount: number
  cgst: number
  sgst: number
  igst: number
}

export interface InvoiceTotals {
  subtotal: number
  discount_total: number
  taxable_amount: number
  tax_breakup: TaxBreakupLine[]
  cgst_total: number
  sgst_total: number
  igst_total: number
  tax_total: number
  grand_total: number
  is_interstate: boolean
  order_discount_amount: number
  loyalty_redeem_amount: number
  round_off_amount?: number
  net_payable: number
}

// ─── Sales ────────────────────────────────────────────────────────────────────
export interface Sale {
  id: string
  organization_id: string
  invoice_no: string
  customer_id?: string
  subtotal: number
  discount_total: number
  tax_total: number
  grand_total: number
  order_discount_type?: DiscountType
  order_discount_value?: number
  order_discount_amount?: number
  net_payable?: number
  payment_mode: PaymentMode
  cash_amount?: number
  card_amount?: number
  upi_amount?: number
  created_by: string
  created_at: string
  voided_at?: string
  voided_by?: string
  void_reason?: string
  purge_after?: string
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string
  product_name: string
  hsn_code?: string
  qty: number
  unit_price: number
  discount_pct: number
  discount_type?: DiscountType
  discount_amount?: number
  tax_rate: GSTRate
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  line_total: number
}

// ─── Purchases / Expenses ─────────────────────────────────────────────────────
export type PurchaseType = 'credit' | 'cash'

export interface Purchase {
  id: string
  organization_id: string
  supplier_id?: string
  invoice_no?: string
  purchase_no?: string
  purchase_date?: string
  purchase_type: PurchaseType
  bill_discount_type?: DiscountType
  bill_discount_value?: number
  round_off: number
  total_amount: number
  notes?: string
  created_by: string
  created_at: string
}

export interface PurchaseItem {
  id: string
  purchase_id: string
  product_id: string | null
  product_name: string
  tax_rate: GSTRate
  qty: number
  unit_cost: number
  taxable_amount: number
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  line_total: number
}

export interface Expense {
  id: string
  organization_id: string
  category: string
  amount: number
  description?: string
  date: string
  created_by: string
  created_at: string
}

// ─── Activity Log ─────────────────────────────────────────────────────────────
export interface ActivityLog {
  id: string
  organization_id: string
  actor_id: string
  actor_name: string
  action: string
  entity: string
  entity_id?: string
  metadata?: Record<string, unknown>
  created_at: string
}
