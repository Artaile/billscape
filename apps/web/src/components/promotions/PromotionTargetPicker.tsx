import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ScanLine, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'

interface ProductOption {
  id: string
  name: string
  price: number
  barcode_value: string | null
  sku: string | null
}

interface CategoryOption {
  id: string
  name: string
}

interface PromotionTargetPickerProps {
  scope: 'product' | 'category'
  targetId: string
  onSelect: (id: string, label: string) => void
}

export function PromotionTargetPicker({ scope, targetId, onSelect }: PromotionTargetPickerProps) {
  const { org } = useAuth()
  const orgId = org?.id
  const [search, setSearch] = useState('')

  const { data: products = [] } = useQuery({
    queryKey: ['promo-target-products', orgId, search],
    enabled: !!orgId && scope === 'product',
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('id, name, price, barcode_value, sku')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
        .order('name')
        .limit(20)
      if (search.trim()) {
        query = query.or(`name.ilike.%${search}%,barcode_value.ilike.%${search}%,sku.ilike.%${search}%`)
      }
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as ProductOption[]
    },
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['promo-target-categories', orgId, search],
    enabled: !!orgId && scope === 'category',
    queryFn: async () => {
      let query = supabase
        .from('categories')
        .select('id, name')
        .eq('organization_id', orgId!)
        .order('name')
        .limit(20)
      if (search.trim()) query = query.ilike('name', `%${search}%`)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as CategoryOption[]
    },
  })

  const handleScan = (code: string) => {
    const found = products.find((p) => p.barcode_value === code)
    if (found) {
      onSelect(found.id, found.name)
      setSearch('')
    } else {
      toast.error(`Product not found`, `No product matches barcode ${code}`)
    }
  }
  const { inputRef: scanInputRef, handleKeyDown: handleScanKeydown } = useBarcodeScanner(handleScan)

  const selectedProduct = products.find((p) => p.id === targetId)
  const selectedCategory = categories.find((c) => c.id === targetId)
  const selectedLabel = scope === 'product' ? selectedProduct?.name : selectedCategory?.name

  if (targetId && selectedLabel) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2">
        <div>
          <p className="text-xs text-indigo-300">{scope === 'product' ? 'Selected product' : 'Selected category'}</p>
          <p className="text-sm font-medium text-foreground">{selectedLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => onSelect('', '')}
          className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={scope === 'product' ? 'Search or scan barcode...' : 'Search category...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-9"
        />
        {scope === 'product' && (
          <ScanLine className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        )}
      </div>
      {scope === 'product' && (
        <input
          ref={scanInputRef}
          className="absolute opacity-0 w-0 h-0 pointer-events-none"
          onKeyDown={handleScanKeydown}
          readOnly
          tabIndex={-1}
        />
      )}
      <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-700 divide-y divide-zinc-800">
        {scope === 'product' ? (
          products.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground text-center">No products found</p>
          ) : (
            products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p.id, p.name)}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-zinc-800 transition-colors"
              >
                <span className="text-sm text-foreground">{p.name}</span>
                <span className="text-xs text-muted-foreground">{formatINR(p.price)}</span>
              </button>
            ))
          )
        ) : categories.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground text-center">No categories found</p>
        ) : (
          categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id, c.name)}
              className="flex w-full items-center px-3 py-2 text-left hover:bg-zinc-800 transition-colors"
            >
              <span className="text-sm text-foreground">{c.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
