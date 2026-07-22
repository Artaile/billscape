import { describe, it, expect } from 'vitest'
import { toMoney, formatINR, amountInWords } from '../money'

describe('toMoney', () => {
  it('rounds to 2 decimal places', () => {
    expect(toMoney(1.005)).toBe(1.01)
    expect(toMoney(1.004)).toBe(1)
    expect(toMoney(10.255)).toBe(10.26)
  })
  it('handles whole numbers', () => {
    expect(toMoney(100)).toBe(100)
  })
  it('handles floating point precision', () => {
    expect(toMoney(0.1 + 0.2)).toBe(0.3)
  })
})

describe('formatINR', () => {
  it('formats with ₹ symbol', () => {
    expect(formatINR(1000)).toContain('1,000')
  })
  it('formats large numbers in Indian format', () => {
    expect(formatINR(123456)).toContain('1,23,456')
  })
})

describe('amountInWords', () => {
  it('converts simple amount', () => {
    expect(amountInWords(100)).toBe('One Hundred Rupees Only')
  })
  it('handles zero', () => {
    expect(amountInWords(0)).toBe('Zero Rupees Only')
  })
})
