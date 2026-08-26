import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StockFilter = 'in_stock' | 'low_stock' | 'out_of_stock'
export type ExpiryFilter = 'expired' | 'expiring_30' | 'no_expiry'

export interface ProductFilters {
  stock: StockFilter[]
  minPrice: string
  maxPrice: string
  expiry: ExpiryFilter[]
}

export const emptyProductFilters: ProductFilters = { stock: [], minPrice: '', maxPrice: '', expiry: [] }

export function isFiltersActive(f: ProductFilters): boolean {
  return f.stock.length > 0 || !!f.minPrice || !!f.maxPrice || f.expiry.length > 0
}

const STOCK_OPTIONS: { value: StockFilter; label: string }[] = [
  { value: 'in_stock', label: 'In Stock' },
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' },
]

const EXPIRY_OPTIONS: { value: ExpiryFilter; label: string }[] = [
  { value: 'expired', label: 'Expired' },
  { value: 'expiring_30', label: 'Expiring within 30 days' },
  { value: 'no_expiry', label: 'No expiry set' },
]

// Same self-built trigger-button + absolutely-positioned panel + outside-click-close structure
// as date-range-filter.tsx — kept consistent since no Radix Popover primitive exists in this
// codebase yet (see apps/web/src/components/ui/date-range-filter.tsx for the original pattern).
export function ProductFiltersPopover({
  value,
  onChange,
}: {
  value: ProductFilters
  onChange: (next: ProductFilters) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ProductFilters>(value)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Re-sync the draft to the applied value only when the panel is freshly opened — must not
  // depend on `value` continuously, since Apply below re-fires onChange, which would otherwise
  // immediately overwrite the draft the user is still editing.
  useEffect(() => {
    if (open) setDraft(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function toggleStock(v: StockFilter) {
    setDraft((p) => ({
      ...p,
      stock: p.stock.includes(v) ? p.stock.filter((s) => s !== v) : [...p.stock, v],
    }))
  }

  function toggleExpiry(v: ExpiryFilter) {
    setDraft((p) => ({
      ...p,
      expiry: p.expiry.includes(v) ? p.expiry.filter((s) => s !== v) : [...p.expiry, v],
    }))
  }

  function apply() {
    onChange(draft)
    setOpen(false)
  }

  function clearAll() {
    onChange(emptyProductFilters)
    setOpen(false)
  }

  const active = isFiltersActive(value)
  const activeCount = value.stock.length + (value.minPrice ? 1 : 0) + (value.maxPrice ? 1 : 0) + value.expiry.length

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-9 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm transition-colors hover:border-zinc-600',
          active ? 'text-zinc-100 border-indigo-700' : 'text-zinc-400',
        )}
      >
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-zinc-500" />
        Filters
        {active && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1.5 w-72 rounded-lg border border-zinc-700 bg-popover p-4 shadow-xl space-y-4">
          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-2">Stock Status</p>
            <div className="space-y-1.5">
              {STOCK_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.stock.includes(opt.value)}
                    onChange={() => toggleStock(opt.value)}
                    className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 text-indigo-600 focus:ring-indigo-500"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-2">Price Range</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Min"
                value={draft.minPrice}
                onChange={(e) => setDraft((p) => ({ ...p, minPrice: e.target.value.replace(/[^0-9.]/g, '') }))}
                className="h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-zinc-600 text-xs">–</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Max"
                value={draft.maxPrice}
                onChange={(e) => setDraft((p) => ({ ...p, maxPrice: e.target.value.replace(/[^0-9.]/g, '') }))}
                className="h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-zinc-400 mb-2">Expiry</p>
            <div className="space-y-1.5">
              {EXPIRY_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.expiry.includes(opt.value)}
                    onChange={() => toggleExpiry(opt.value)}
                    className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 text-indigo-600 focus:ring-indigo-500"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
            <button
              type="button"
              onClick={clearAll}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-200 transition-colors pt-3"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={apply}
              className="mt-3 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
