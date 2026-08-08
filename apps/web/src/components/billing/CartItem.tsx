import React, { useRef } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import type { CartItem as CartItemType, DiscountType } from '@billscape/core'
import { formatINR, qtyStepForUnit, hasSecondaryUnit, toBaseQty, fromBaseQty, toSecondaryUnitPrice } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CartItemProps {
  item: CartItemType
  lineTotal: number
  onQtyChange: (productId: string, qty: number) => void
  onDiscountChange: (productId: string, discountType: DiscountType, value: number) => void
  onRemove: (productId: string) => void
  onSellingUnitChange: (productId: string, unitId: string) => void
}

export function CartItemRow({
  item,
  lineTotal,
  onQtyChange,
  onDiscountChange,
  onRemove,
  onSellingUnitChange,
}: CartItemProps) {
  const qtyInputRef = useRef<HTMLInputElement>(null)
  const discountType: DiscountType = item.discount_type ?? 'percent'
  const discountValue = discountType === 'flat' ? (item.discount_amount ?? 0) : item.discount_pct

  // item.qty is ALWAYS stored/persisted in the product's BASE unit. When the merchant is
  // ringing this line up in the secondary unit (e.g. Box), the input/stepper displays and
  // edits the secondary-unit-equivalent qty, converting back to base on every change —
  // sale_items.qty (and everything downstream) never sees anything but base-unit qty.
  const conv = { unitId: item.unit?.id ?? '', secondaryUnitId: item.secondary_unit?.id, conversionFactor: item.conversion_factor }
  const sellingSecondary = hasSecondaryUnit(conv) && item.selling_unit_id === item.secondary_unit?.id
  const allowDecimal = sellingSecondary ? (item.secondary_unit?.allow_decimal ?? false) : (item.unit?.allow_decimal ?? false)
  const step = qtyStepForUnit(allowDecimal)
  const displayQty = sellingSecondary ? fromBaseQty(item.qty, conv) : item.qty
  const displayUnitSymbol = sellingSecondary ? item.secondary_unit?.symbol : item.unit?.symbol

  const setDisplayQty = (nextDisplayQty: number) => {
    const nextBaseQty = sellingSecondary ? toBaseQty(nextDisplayQty, conv) : nextDisplayQty
    onQtyChange(item.product_id, nextBaseQty)
  }

  const handleQtyInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    if (!isNaN(val) && val > 0) {
      setDisplayQty(allowDecimal ? val : Math.round(val))
    }
  }

  const handleDiscountInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    if (!isNaN(val) && val >= 0) {
      onDiscountChange(item.product_id, discountType, val)
    } else if (e.target.value === '') {
      onDiscountChange(item.product_id, discountType, 0)
    }
  }

  const toggleDiscountType = (nextType: DiscountType) => {
    if (nextType === discountType) return
    onDiscountChange(item.product_id, nextType, 0)
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-800/40 px-2.5 py-1.5',
        'animate-in slide-in-from-top-2 duration-200',
      )}
    >
      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-100 leading-tight truncate">
          {item.product_name}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-500">
            {formatINR(sellingSecondary ? toSecondaryUnitPrice(item.unit_price, conv) : item.unit_price)}
            {displayUnitSymbol ? ` / ${displayUnitSymbol}` : ''}
          </span>
          <span className="text-[10px] text-zinc-600">· GST {item.tax_rate}%</span>
        </div>
      </div>

      {/* Unit toggle (only when the product has a secondary selling unit configured) */}
      {hasSecondaryUnit(conv) && (
        <div className="hidden sm:flex rounded border border-zinc-700 overflow-hidden shrink-0">
          {[
            { id: item.unit!.id, label: item.unit!.symbol },
            { id: item.secondary_unit!.id, label: item.secondary_unit!.symbol },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSellingUnitChange(item.product_id, opt.id)}
              className={cn(
                'px-1.5 h-6 text-[10px] font-medium transition-colors',
                (item.selling_unit_id ?? item.unit?.id) === opt.id ? 'bg-indigo-600 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Qty controls */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => setDisplayQty(displayQty - step)}
          disabled={displayQty <= step}
          className="flex h-6 w-6 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-white disabled:opacity-30 transition-colors"
        >
          <Minus className="h-3 w-3" />
        </button>
        <input
          ref={qtyInputRef}
          type="number"
          min={step}
          step={step}
          value={displayQty}
          onChange={handleQtyInput}
          className="h-6 w-9 rounded border border-zinc-700 bg-zinc-900 text-center text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          onClick={() => setDisplayQty(displayQty + step)}
          className="flex h-6 w-6 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Discount */}
      <div className="hidden sm:flex items-center gap-1 shrink-0">
        <div className="flex rounded border border-zinc-700 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleDiscountType('percent')}
            className={cn(
              'h-6 w-5 text-[10px] font-medium transition-colors',
              discountType === 'percent' ? 'bg-indigo-600 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300',
            )}
          >
            %
          </button>
          <button
            type="button"
            onClick={() => toggleDiscountType('flat')}
            className={cn(
              'h-6 w-5 text-[10px] font-medium transition-colors border-l border-zinc-700',
              discountType === 'flat' ? 'bg-indigo-600 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300',
            )}
          >
            ₹
          </button>
        </div>
        <input
          type="number"
          min="0"
          max={discountType === 'percent' ? 100 : undefined}
          step={discountType === 'percent' ? 0.5 : 1}
          value={discountValue}
          onChange={handleDiscountInput}
          className="h-6 w-12 rounded border border-zinc-700 bg-zinc-900 px-1 text-center text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Line total */}
      <span className="text-xs font-semibold text-white tabular-nums min-w-[56px] text-right shrink-0">
        {formatINR(lineTotal)}
      </span>

      {/* Remove */}
      <button
        onClick={() => onRemove(item.product_id)}
        className="shrink-0 p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
