import { describe, it, expect } from 'vitest'
import { computeGST, isInterState } from '../tax/gst'
import type { CartItem } from '../types'

const makeItem = (
  price: number,
  qty: number,
  taxRate: 0 | 5 | 12 | 18 | 28,
  discountPct = 0,
): CartItem => ({
  product_id: 'prod-1',
  product_name: 'Test Product',
  tax_rate: taxRate,
  unit_price: price,
  qty,
  discount_pct: discountPct,
})

describe('isInterState', () => {
  it('returns false when same state', () => {
    expect(isInterState({ shopStateCode: 'TN', customerStateCode: 'TN' })).toBe(false)
  })
  it('returns true when different states', () => {
    expect(isInterState({ shopStateCode: 'TN', customerStateCode: 'KA' })).toBe(true)
  })
  it('returns false when no customer state', () => {
    expect(isInterState({ shopStateCode: 'TN' })).toBe(false)
  })
})

describe('computeGST — intra-state', () => {
  const ctx = { shopStateCode: 'TN' }

  it('18% rate: splits CGST 9% + SGST 9%', () => {
    const result = computeGST(ctx, [makeItem(1000, 1, 18)])
    expect(result.cgst_total).toBe(90)
    expect(result.sgst_total).toBe(90)
    expect(result.igst_total).toBe(0)
    expect(result.grand_total).toBe(1180)
    expect(result.is_interstate).toBe(false)
  })

  it('5% rate: splits CGST 2.5% + SGST 2.5%', () => {
    const result = computeGST(ctx, [makeItem(1000, 1, 5)])
    expect(result.cgst_total).toBe(25)
    expect(result.sgst_total).toBe(25)
    expect(result.grand_total).toBe(1050)
  })

  it('0% rate: no tax', () => {
    const result = computeGST(ctx, [makeItem(500, 2, 0)])
    expect(result.tax_total).toBe(0)
    expect(result.grand_total).toBe(1000)
  })
})

describe('computeGST — inter-state', () => {
  const ctx = { shopStateCode: 'TN', customerStateCode: 'KA' }

  it('18% rate: full IGST, no CGST/SGST', () => {
    const result = computeGST(ctx, [makeItem(1000, 1, 18)])
    expect(result.cgst_total).toBe(0)
    expect(result.sgst_total).toBe(0)
    expect(result.igst_total).toBe(180)
    expect(result.grand_total).toBe(1180)
    expect(result.is_interstate).toBe(true)
  })
})

describe('computeGST — discount', () => {
  const ctx = { shopStateCode: 'TN' }

  it('10% discount applied before tax', () => {
    const result = computeGST(ctx, [makeItem(1000, 1, 18, 10)])
    expect(result.subtotal).toBe(1000)
    expect(result.discount_total).toBe(100)
    expect(result.taxable_amount).toBe(900)
    expect(result.cgst_total).toBe(81)
    expect(result.sgst_total).toBe(81)
    expect(result.grand_total).toBe(1062)
  })
})

describe('computeGST — multiple items mixed rates', () => {
  const ctx = { shopStateCode: 'TN' }

  it('5% + 18% on same invoice', () => {
    const result = computeGST(ctx, [
      makeItem(500, 2, 5),   // 1000 taxable, 25+25 = 50 tax
      makeItem(200, 3, 18),  // 600 taxable, 54+54 = 108 tax
    ])
    expect(result.subtotal).toBe(1600)
    expect(result.taxable_amount).toBe(1600)
    expect(result.cgst_total).toBe(79)   // 25 + 54
    expect(result.sgst_total).toBe(79)
    expect(result.grand_total).toBe(1758)
    expect(result.tax_breakup).toHaveLength(2)
  })
})

describe('computeGST — rounding edge', () => {
  const ctx = { shopStateCode: 'TN' }

  it('handles fractional amounts correctly', () => {
    // 333.33 × 3 = 999.99, 18% = 179.9982 → should round correctly
    const result = computeGST(ctx, [makeItem(333.33, 3, 18)])
    expect(result.subtotal).toBe(999.99)
    // cgst = 999.99 * 9% = 89.9991 → 90
    expect(result.cgst_total).toBe(90)
    expect(result.sgst_total).toBe(90)
  })
})

describe('computeGST — qty multiplication', () => {
  const ctx = { shopStateCode: 'TN' }

  it('correctly calculates for qty > 1', () => {
    const result = computeGST(ctx, [makeItem(100, 5, 18)])
    expect(result.subtotal).toBe(500)
    expect(result.cgst_total).toBe(45)
    expect(result.sgst_total).toBe(45)
    expect(result.grand_total).toBe(590)
  })
})
