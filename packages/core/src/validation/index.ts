import { z } from 'zod'

export const GSTRateSchema = z.union([
  z.literal(0),
  z.literal(5),
  z.literal(12),
  z.literal(18),
  z.literal(28),
])

export const ProductSchema = z.object({
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
  barcode_value: z.string().max(100).optional(),
  track_stock: z.boolean().default(true),
})

export const CartItemSchema = z.object({
  product_id: z.string().uuid(),
  product_name: z.string().min(1),
  tax_rate: GSTRateSchema,
  unit_price: z.number().positive(),
  qty: z.number().int().positive(),
  discount_pct: z.number().min(0).max(100).default(0),
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

export type ProductInput = z.infer<typeof ProductSchema>
export type CartItemInput = z.infer<typeof CartItemSchema>
export type SaleInput = z.infer<typeof SaleSchema>
export type OrgSettingsInput = z.infer<typeof OrgSettingsSchema>
