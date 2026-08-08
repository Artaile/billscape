export interface UnitConversionInput {
  unitId: string
  secondaryUnitId?: string | null
  conversionFactor?: number | null
}

/** True if this product has a usable secondary (derived) selling unit. */
export function hasSecondaryUnit(p: UnitConversionInput): boolean {
  return !!p.secondaryUnitId && !!p.conversionFactor && p.conversionFactor > 0
}

/**
 * Converts a quantity entered in the secondary unit (e.g. Box) to the equivalent
 * base-unit quantity (e.g. Piece) that inventory/sale_items/purchase_items store.
 * Returns the input unchanged if there's no valid secondary unit configured.
 */
export function toBaseQty(qty: number, p: UnitConversionInput): number {
  if (!hasSecondaryUnit(p)) return qty
  return qty * (p.conversionFactor as number)
}

/** Inverse of toBaseQty — base-unit qty back to secondary-unit qty (for display). */
export function fromBaseQty(baseQty: number, p: UnitConversionInput): number {
  if (!hasSecondaryUnit(p)) return baseQty
  return baseQty / (p.conversionFactor as number)
}

/** Converts a base-unit price to the equivalent price-per-secondary-unit. */
export function toSecondaryUnitPrice(basePrice: number, p: UnitConversionInput): number {
  if (!hasSecondaryUnit(p)) return basePrice
  return basePrice * (p.conversionFactor as number)
}

/** Qty stepper increment for a unit — 1 for count-based units, 0.1 for decimal-allowed units. */
export function qtyStepForUnit(allowDecimal: boolean): number {
  return allowDecimal ? 0.1 : 1
}
