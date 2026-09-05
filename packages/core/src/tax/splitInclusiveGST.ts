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

// Same "Base: ₹X + GST: ₹Y" display breakdown as splitInclusiveGST, but aware of which way
// the typed amount actually goes — GST mode 'include' means the typed amount already has tax
// baked in (delegates to splitInclusiveGST's division), 'exclude' means the typed amount IS
// the base already, so the tax is simply added on top (amount * rate/100) rather than divided
// out. Purchase entry forms (PurchaseFormPage.tsx, VariantEditor.tsx) previously only showed
// this breakdown when gst_mode was 'include', silently omitting it in 'exclude' mode — this
// single helper covers both so the hint always renders once an amount + tax rate are present.
export function splitByGstMode(amount: number, taxRate: GSTRate, gstMode: 'include' | 'exclude'): { base: number; tax: number } {
  if (gstMode === 'include') return splitInclusiveGST(amount, taxRate)
  if (!amount || taxRate <= 0) return { base: toMoney(amount || 0), tax: 0 }
  const tax = toMoney(amount * (taxRate / 100))
  return { base: toMoney(amount), tax }
}
