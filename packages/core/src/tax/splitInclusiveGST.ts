import type { GSTRate } from '../types'
import { toMoney } from '../money'

// Splits a GST-inclusive amount into its base (taxable) value and the tax portion —
// used purely for UI display (e.g. "Base: ₹212 + GST: ₹38" under a price input),
// not for invoice/line-item tax computation (see computeLineTax for that).
export function splitInclusiveGST(amount: number, taxRate: GSTRate): { base: number; tax: number } {
  if (!amount || taxRate <= 0) return { base: toMoney(amount || 0), tax: 0 }
  const base = toMoney(amount / (1 + taxRate / 100))
  const tax = toMoney(amount - base)
  return { base, tax }
}
