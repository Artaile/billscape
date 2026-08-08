import { z } from 'zod'

export const GSTRateSchema = z.union([
  z.literal(0),
  z.literal(5),
  z.literal(12),
  z.literal(18),
  z.literal(28),
])

export const ProductSchema = z
  .object({
    name: z.string().min(1, 'Product name is required').max(200),
    sku: z.string().max(50).optional(),
    hsn_code: z
      .string()
      .refine(
        (v) => v === '' || /^\d{4}(\d{2}(\d{2})?)?$/.test(v),
        'HSN code must be 4, 6, or 8 digits',
      )
      .optional(),
    tax_rate: GSTRateSchema,
    price: z.number().positive('Selling price must be greater than 0'),
    cost_price: z.number().min(0, 'Cost price cannot be negative'),
    mrp: z.number().min(0).optional(),
    special_price: z.number().min(0).optional(),
    barcode_value: z.string().max(100).optional(),
    track_stock: z.boolean().default(true),
    unit_id: z.string().uuid('Unit is required'),
    secondary_unit_id: z.string().uuid().optional(),
    conversion_factor: z.number().positive().optional(),
  })
  .refine(
    (p) => (p.secondary_unit_id == null) === (p.conversion_factor == null),
    { message: 'Secondary unit and conversion factor must both be set together', path: ['conversion_factor'] },
  )
  .refine(
    (p) => p.secondary_unit_id == null || p.secondary_unit_id !== p.unit_id,
    { message: 'Secondary unit must differ from the base unit', path: ['secondary_unit_id'] },
  )

export const CartItemSchema = z.object({
  product_id: z.string().uuid(),
  product_name: z.string().min(1),
  tax_rate: GSTRateSchema,
  unit_price: z.number().positive(),
  qty: z.number().positive(),
  discount_pct: z.number().min(0).max(100).default(0),
  selling_unit_id: z.string().uuid().optional(),
})

export const SaleSchema = z.object({
  customer_id: z.string().uuid().optional(),
  items: z.array(CartItemSchema).min(1, 'At least one item is required'),
  payment_mode: z.enum(['cash', 'card', 'upi', 'split']),
  cash_amount: z.number().min(0).optional(),
  card_amount: z.number().min(0).optional(),
  upi_amount: z.number().min(0).optional(),
  notes: z.string().max(500).optional(),
})

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

export const OrgSettingsSchema = z.object({
  shop_name: z.string().min(1).max(100),
  gstin: z
    .string()
    .regex(GSTIN_REGEX, 'Invalid GSTIN format')
    .optional()
    .or(z.literal('')),
  state_code: z.string().length(2, 'State code must be 2 characters'),
  primary_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color')
    .default('#6366f1'),
  invoice_header: z.string().max(200).optional(),
  invoice_footer: z.string().max(200).optional(),
})

export const PurchaseItemSchema = z
  .object({
    product_id: z.string().uuid().nullable(),
    is_new_product: z.boolean().default(false),
    product_name: z.string().min(1, 'Product name is required'),
    sku: z.string().max(50).optional(),
    barcode_value: z.string().max(100).optional(),
    tax_rate: GSTRateSchema,
    qty: z.number().positive('Qty must be greater than 0'),
    unit_cost: z.number().min(0, 'Purchase rate cannot be negative'),
    mrp: z.number().min(0).optional(),
    price: z.number().min(0, 'Retail price cannot be negative'),
    special_price: z.number().min(0).optional(),
  })
  .refine(
    (item) => item.product_id !== null || (item.sku && item.barcode_value),
    { message: 'New products must have a product code and barcode', path: ['sku'] },
  )

export const PurchaseSchema = z.object({
  supplier_id: z.string().uuid().nullable(),
  invoice_no: z.string().max(50).optional(),
  purchase_date: z.string().optional(),
  purchase_type: z.enum(['credit', 'cash']).default('credit'),
  notes: z.string().max(500).optional(),
  items: z.array(PurchaseItemSchema).min(1, 'Add at least one item'),
  bill_discount_type: z.enum(['flat', 'percent']).optional(),
  bill_discount_value: z.number().min(0).optional(),
})

export type ProductInput = z.infer<typeof ProductSchema>
export type CartItemInput = z.infer<typeof CartItemSchema>
export type SaleInput = z.infer<typeof SaleSchema>
export type OrgSettingsInput = z.infer<typeof OrgSettingsSchema>
export type PurchaseItemInput = z.infer<typeof PurchaseItemSchema>
export type PurchaseInput = z.infer<typeof PurchaseSchema>
