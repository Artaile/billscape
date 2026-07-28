import { toMoney } from '../money'
import type { CartItem, DiscountType, GSTRate, InvoiceTotals, TaxBreakupLine } from '../types'

export interface GSTContext {
  shopStateCode: string
  customerStateCode?: string
}

export function isInterState(ctx: GSTContext): boolean {
  if (!ctx.customerStateCode) return false
  return ctx.shopStateCode.toUpperCase() !== ctx.customerStateCode.toUpperCase()
}

function resolveLineDiscount(
  baseAmount: number,
  discountPct: number,
  discountType?: DiscountType,
  discountAmount?: number,
): number {
  if (discountType === 'flat') {
    return toMoney(Math.min(Math.max(discountAmount ?? 0, 0), baseAmount))
  }
  return toMoney(baseAmount * (discountPct / 100))
}

export function computeLineTax(
  price: number,
  qty: number,
  discountPct: number,
  taxRate: GSTRate,
  interstate: boolean,
  discountType?: DiscountType,
  discountAmount?: number,
): {
  taxableAmount: number
  cgst: number
  sgst: number
  igst: number
  lineTotal: number
} {
  const baseAmount = toMoney(price * qty)
  const discountAmt = resolveLineDiscount(baseAmount, discountPct, discountType, discountAmount)
  const taxableAmount = toMoney(baseAmount - discountAmt)

  let cgst = 0
  let sgst = 0
  let igst = 0

  if (interstate) {
    igst = toMoney(taxableAmount * (taxRate / 100))
  } else {
    cgst = toMoney(taxableAmount * (taxRate / 200))
    sgst = toMoney(taxableAmount * (taxRate / 200))
  }

  const lineTotal = toMoney(taxableAmount + cgst + sgst + igst)
  return { taxableAmount, cgst, sgst, igst, lineTotal }
}

export function computeGST(ctx: GSTContext, items: CartItem[]): InvoiceTotals {
  const interstate = isInterState(ctx)

  let subtotal = 0
  let discountTotal = 0
  let taxableAmount = 0
  let cgstTotal = 0
  let sgstTotal = 0
  let igstTotal = 0

  const breakupMap = new Map<GSTRate, TaxBreakupLine>()

  for (const item of items) {
    const baseAmount = toMoney(item.unit_price * item.qty)
    const discountAmt = resolveLineDiscount(baseAmount, item.discount_pct, item.discount_type, item.discount_amount)
    const line = computeLineTax(
      item.unit_price,
      item.qty,
      item.discount_pct,
      item.tax_rate,
      interstate,
      item.discount_type,
      item.discount_amount,
    )

    subtotal = toMoney(subtotal + baseAmount)
    discountTotal = toMoney(discountTotal + discountAmt)
    taxableAmount = toMoney(taxableAmount + line.taxableAmount)
    cgstTotal = toMoney(cgstTotal + line.cgst)
    sgstTotal = toMoney(sgstTotal + line.sgst)
    igstTotal = toMoney(igstTotal + line.igst)

    const existing = breakupMap.get(item.tax_rate)
    if (existing) {
      existing.taxable_amount = toMoney(existing.taxable_amount + line.taxableAmount)
      existing.cgst = toMoney(existing.cgst + line.cgst)
      existing.sgst = toMoney(existing.sgst + line.sgst)
      existing.igst = toMoney(existing.igst + line.igst)
    } else {
      breakupMap.set(item.tax_rate, {
        tax_rate: item.tax_rate,
        taxable_amount: line.taxableAmount,
        cgst: line.cgst,
        sgst: line.sgst,
        igst: line.igst,
      })
    }
  }

  const taxTotal = toMoney(cgstTotal + sgstTotal + igstTotal)
  const grandTotal = toMoney(taxableAmount + taxTotal)

  return {
    subtotal,
    discount_total: discountTotal,
    taxable_amount: taxableAmount,
    tax_breakup: Array.from(breakupMap.values()).sort((a, b) => a.tax_rate - b.tax_rate),
    cgst_total: cgstTotal,
    sgst_total: sgstTotal,
    igst_total: igstTotal,
    tax_total: taxTotal,
    grand_total: grandTotal,
    is_interstate: interstate,
    order_discount_amount: 0,
    net_payable: grandTotal,
  }
}

// Order-level discount, applied AFTER tax on the grand total (payment-time adjustment,
// does not affect the GST taxable value or breakup).
export function applyOrderDiscount(
  totals: InvoiceTotals,
  discountType: DiscountType,
  discountValue: number,
): InvoiceTotals {
  const value = Math.max(discountValue, 0)
  const rawAmount = discountType === 'flat' ? value : toMoney(totals.grand_total * (value / 100))
  const orderDiscountAmount = toMoney(Math.min(rawAmount, totals.grand_total))
  const netPayable = toMoney(totals.grand_total - orderDiscountAmount)

  return {
    ...totals,
    order_discount_amount: orderDiscountAmount,
    net_payable: netPayable,
  }
}
