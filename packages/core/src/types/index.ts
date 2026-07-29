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
  currency?: string
  date_format?: string
  timezone?: string
}

export interface OrgFeatureFlags {
  batch_tracking: boolean
  variants: boolean
  expiry_dates: boolean
  service_jobs: boolean
  loyalty_points: boolean
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
  business_type: BusinessType
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
  qty: number
  discount_pct: number
  discount_type?: DiscountType
  discount_amount?: number
  barcode_value?: string
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
