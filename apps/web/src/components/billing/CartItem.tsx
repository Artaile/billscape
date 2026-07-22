import React, { useRef } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import type { CartItem as CartItemType } from '@billscape/core'
import { formatINR } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface CartItemProps {
  item: CartItemType
  lineTotal: number
  onQtyChange: (productId: string, qty: number) => void
  onDiscountChange: (productId: string, discount: number) => void
  onRemove: (productId: string) => void
}

export function CartItemRow({
  item,
  lineTotal,
  onQtyChange,
  onDiscountChange,
  onRemove,
}: CartItemProps) {
  const qtyInputRef = useRef<HTMLInputElement>(null)

  const handleQtyInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    if (!isNaN(val) && val > 0) {
      onQtyChange(item.product_id, val)
    }
  }

  const handleDiscountInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    if (!isNaN(val) && val >= 0 && val <= 100) {
      onDiscountChange(item.product_id, val)
    }
  }

  return (
    <div
      className={cn(
        'group flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-800/40 p-3',
        'animate-in slide-in-from-top-2 duration-200',
      )}
    >
      {/* Top row: name + remove */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-100 leading-tight truncate">
            {item.product_name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {item.hsn_code && (
              <span className="text-[10px] text-zinc-500">HSN: {item.hsn_code}</span>
            )}
            <span className="text-[10px] text-zinc-600">GST {item.tax_rate}%</span>
          </div>
        </div>
        <button
          onClick={() => onRemove(item.product_id)}
          className="shrink-0 p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Bottom row: qty + discount + total */}
      <div className="flex items-center gap-2">
        {/* Qty controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onQtyChange(item.product_id, item.qty - 1)}
            disabled={item.qty <= 1}
            className="flex h-6 w-6 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-white disabled:opacity-30 transition-colors"
          >
            <Minus className="h-3 w-3" />
          </button>
          <input
            ref={qtyInputRef}
            type="number"
            min="1"
            value={item.qty}
            onChange={handleQtyInput}
            className="h-6 w-10 rounded border border-zinc-700 bg-zinc-900 text-center text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            onClick={() => onQtyChange(item.product_id, item.qty + 1)}
            className="flex h-6 w-6 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        <span className="text-xs text-zinc-500">×</span>
        <span className="text-xs text-zinc-400">{formatINR(item.unit_price)}</span>

        {/* Discount */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[10px] text-zinc-500">Disc</span>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={item.discount_pct}
              onChange={handleDiscountInput}
              className="h-6 w-12 rounded border border-zinc-700 bg-zinc-900 pr-3 pl-1 text-center text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">%</span>
          </div>
        </div>

        {/* Line total */}
        <span className="text-sm font-semibold text-white tabular-nums min-w-[64px] text-right">
          {formatINR(lineTotal)}
        </span>
      </div>
    </div>
  )
}
