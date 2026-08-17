import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Search,
  Package,
  Users,
  Truck,
  FileText,
  ShoppingCart,
  Boxes,
  RotateCcw,
  BarChart3,
  Settings,
  Activity,
  Receipt,
  ArrowRight,
  Sparkles,
  Command,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface GlobalSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const QUICK_NAV = [
  { label: 'POS Billing', path: '/billing', icon: ShoppingCart, group: 'Navigation', badge: 'POS' },
  { label: 'Products Catalog', path: '/products', icon: Package, group: 'Navigation' },
  { label: 'Stock & Inventory', path: '/inventory', icon: Boxes, group: 'Navigation' },
  { label: 'Purchase Bills', path: '/purchases', icon: Receipt, group: 'Navigation' },
  { label: 'Suppliers Directory', path: '/suppliers', icon: Truck, group: 'Navigation' },
  { label: 'Customers Directory', path: '/customers', icon: Users, group: 'Navigation' },
  { label: 'Returns & Credit Notes', path: '/returns', icon: RotateCcw, group: 'Navigation' },
  { label: 'Quotations & Estimates', path: '/quotations', icon: FileText, group: 'Navigation' },
  { label: 'Financial Reports', path: '/reports', icon: BarChart3, group: 'Navigation' },
  { label: 'Audit Activity Log', path: '/activity', icon: Activity, group: 'Navigation' },
  { label: 'Shop Settings', path: '/settings', icon: Settings, group: 'Navigation' },
]

export function GlobalSearchDialog({ open, onOpenChange }: GlobalSearchDialogProps) {
  const navigate = useNavigate()
  const { org } = useAuth()
  const orgId = org?.id
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset query and selection when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  const cleanQuery = query.trim().toLowerCase()

  // Search Products
  const { data: products = [] } = useQuery({
    queryKey: ['global-search-products', orgId, cleanQuery],
    enabled: !!orgId && cleanQuery.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, barcode_value, price, inventory(stock_qty)')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
        .or(`name.ilike.%${cleanQuery}%,sku.ilike.%${cleanQuery}%,barcode_value.ilike.%${cleanQuery}%`)
        .limit(5)
      return data ?? []
    },
  })

  // Search Customers
  const { data: customers = [] } = useQuery({
    queryKey: ['global-search-customers', orgId, cleanQuery],
    enabled: !!orgId && cleanQuery.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone, email, balance')
        .eq('organization_id', orgId!)
        .or(`name.ilike.%${cleanQuery}%,phone.ilike.%${cleanQuery}%`)
        .limit(4)
      return data ?? []
    },
  })

  // Search Suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ['global-search-suppliers', orgId, cleanQuery],
    enabled: !!orgId && cleanQuery.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from('suppliers')
        .select('id, name, phone, gstin')
        .eq('organization_id', orgId!)
        .or(`name.ilike.%${cleanQuery}%,phone.ilike.%${cleanQuery}%,gstin.ilike.%${cleanQuery}%`)
        .limit(4)
      return data ?? []
    },
  })

  // Search Invoices / Sales
  const { data: sales = [] } = useQuery({
    queryKey: ['global-search-sales', orgId, cleanQuery],
    enabled: !!orgId && cleanQuery.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from('sales')
        .select('id, invoice_no, grand_total, payment_mode, created_at, customers(name)')
        .eq('organization_id', orgId!)
        .ilike('invoice_no', `%${cleanQuery}%`)
        .limit(4)
      return data ?? []
    },
  })

  // Filter Quick Nav
  const navResults = cleanQuery
    ? QUICK_NAV.filter((n) => n.label.toLowerCase().includes(cleanQuery))
    : QUICK_NAV.slice(0, 6)

  // Aggregate results for keyboard navigation
  const flatItems: Array<{
    type: 'nav' | 'product' | 'customer' | 'supplier' | 'sale'
    id: string
    title: string
    subtitle?: string
    badge?: string
    action: () => void
  }> = []

  // Add nav items
  navResults.forEach((n) => {
    flatItems.push({
      type: 'nav',
      id: `nav-${n.path}`,
      title: n.label,
      subtitle: 'Navigation Shortcut',
      badge: n.badge,
      action: () => {
        navigate(n.path)
        onOpenChange(false)
      },
    })
  })

  // Add product items
  products.forEach((p: any) => {
    const stock = p.inventory?.[0]?.stock_qty ?? 0
    flatItems.push({
      type: 'product',
      id: `prod-${p.id}`,
      title: p.name,
      subtitle: `SKU: ${p.sku || 'N/A'} • ${formatINR(p.price)}`,
      badge: `${stock} in stock`,
      action: () => {
        navigate(`/products`)
        onOpenChange(false)
      },
    })
  })

  // Add customer items
  customers.forEach((c: any) => {
    flatItems.push({
      type: 'customer',
      id: `cust-${c.id}`,
      title: c.name,
      subtitle: c.phone ? `Phone: ${c.phone}` : c.email || 'Customer',
      badge: c.balance ? `Due: ${formatINR(c.balance)}` : undefined,
      action: () => {
        navigate(`/customers`)
        onOpenChange(false)
      },
    })
  })

  // Add supplier items
  suppliers.forEach((s: any) => {
    flatItems.push({
      type: 'supplier',
      id: `sup-${s.id}`,
      title: s.name,
      subtitle: s.phone ? `Phone: ${s.phone}` : s.gstin ? `GST: ${s.gstin}` : 'Supplier',
      action: () => {
        navigate(`/suppliers`)
        onOpenChange(false)
      },
    })
  })

  // Add sales items
  sales.forEach((s: any) => {
    flatItems.push({
      type: 'sale',
      id: `sale-${s.id}`,
      title: s.invoice_no,
      subtitle: `${s.customers?.name ? s.customers.name + ' • ' : ''}${formatINR(s.grand_total)} (${s.payment_mode})`,
      action: () => {
        navigate(`/billing`)
        onOpenChange(false)
      },
    })
  })

  // Keyboard navigation inside list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(flatItems.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + flatItems.length) % Math.max(flatItems.length, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flatItems[selectedIndex]) {
        flatItems[selectedIndex].action()
      }
    }
  }

  const hasResults = flatItems.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden border-border bg-card shadow-2xl">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-secondary/20">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search products, customers, suppliers, invoices, or jump to page..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded bg-secondary"
            >
              Clear
            </button>
          )}
          <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results Container */}
        <div className="max-h-[60vh] overflow-y-auto p-2 divide-y divide-border/40">
          {/* Products Group */}
          {products.length > 0 && (
            <div className="py-2">
              <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <Package className="h-3.5 w-3.5 text-emerald-400" />
                <span>Products ({products.length})</span>
              </div>
              <div className="space-y-0.5 mt-1">
                {products.map((p: any) => {
                  const itemIdx = flatItems.findIndex((fi) => fi.id === `prod-${p.id}`)
                  const isSelected = selectedIndex === itemIdx
                  const stock = p.inventory?.[0]?.stock_qty ?? 0
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        navigate('/products')
                        onOpenChange(false)
                      }}
                      onMouseEnter={() => setSelectedIndex(itemIdx)}
                      className={cn(
                        'flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors text-sm',
                        isSelected ? 'bg-primary/10 text-primary border border-primary/20' : 'hover:bg-secondary/60 text-foreground',
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Package className="h-4 w-4 text-emerald-400 shrink-0" />
                        <div className="truncate">
                          <p className="font-medium truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            SKU: {p.sku || 'N/A'} {p.barcode_value ? `• Barcode: ${p.barcode_value}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-semibold text-xs">{formatINR(p.price)}</span>
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', stock > 0 ? 'text-emerald-400 border-emerald-500/30' : 'text-red-400 border-red-500/30')}>
                          {stock} in stock
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Customers Group */}
          {customers.length > 0 && (
            <div className="py-2">
              <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <Users className="h-3.5 w-3.5 text-blue-400" />
                <span>Customers ({customers.length})</span>
              </div>
              <div className="space-y-0.5 mt-1">
                {customers.map((c: any) => {
                  const itemIdx = flatItems.findIndex((fi) => fi.id === `cust-${c.id}`)
                  const isSelected = selectedIndex === itemIdx
                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        navigate('/customers')
                        onOpenChange(false)
                      }}
                      onMouseEnter={() => setSelectedIndex(itemIdx)}
                      className={cn(
                        'flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors text-sm',
                        isSelected ? 'bg-primary/10 text-primary border border-primary/20' : 'hover:bg-secondary/60 text-foreground',
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Users className="h-4 w-4 text-blue-400 shrink-0" />
                        <div className="truncate">
                          <p className="font-medium truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.phone || c.email || 'Customer'}</p>
                        </div>
                      </div>
                      {c.balance ? (
                        <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-[10px]">
                          Due: {formatINR(c.balance)}
                        </Badge>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Suppliers Group */}
          {suppliers.length > 0 && (
            <div className="py-2">
              <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <Truck className="h-3.5 w-3.5 text-indigo-400" />
                <span>Suppliers ({suppliers.length})</span>
              </div>
              <div className="space-y-0.5 mt-1">
                {suppliers.map((s: any) => {
                  const itemIdx = flatItems.findIndex((fi) => fi.id === `sup-${s.id}`)
                  const isSelected = selectedIndex === itemIdx
                  return (
                    <div
                      key={s.id}
                      onClick={() => {
                        navigate('/suppliers')
                        onOpenChange(false)
                      }}
                      onMouseEnter={() => setSelectedIndex(itemIdx)}
                      className={cn(
                        'flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors text-sm',
                        isSelected ? 'bg-primary/10 text-primary border border-primary/20' : 'hover:bg-secondary/60 text-foreground',
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Truck className="h-4 w-4 text-indigo-400 shrink-0" />
                        <div className="truncate">
                          <p className="font-medium truncate">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.phone ? `Phone: ${s.phone}` : s.gstin ? `GST: ${s.gstin}` : 'Supplier'}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Sales Invoices Group */}
          {sales.length > 0 && (
            <div className="py-2">
              <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <FileText className="h-3.5 w-3.5 text-purple-400" />
                <span>Invoices ({sales.length})</span>
              </div>
              <div className="space-y-0.5 mt-1">
                {sales.map((s: any) => {
                  const itemIdx = flatItems.findIndex((fi) => fi.id === `sale-${s.id}`)
                  const isSelected = selectedIndex === itemIdx
                  return (
                    <div
                      key={s.id}
                      onClick={() => {
                        navigate('/billing')
                        onOpenChange(false)
                      }}
                      onMouseEnter={() => setSelectedIndex(itemIdx)}
                      className={cn(
                        'flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors text-sm',
                        isSelected ? 'bg-primary/10 text-primary border border-primary/20' : 'hover:bg-secondary/60 text-foreground',
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="h-4 w-4 text-purple-400 shrink-0" />
                        <div className="truncate">
                          <p className="font-medium truncate">{s.invoice_no}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.customers?.name ? `${s.customers.name} • ` : ''}{s.payment_mode.toUpperCase()}
                          </p>
                        </div>
                      </div>
                      <span className="font-semibold text-xs text-foreground">{formatINR(s.grand_total)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Navigation Shortcuts Group */}
          {navResults.length > 0 && (
            <div className="py-2">
              <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>Quick Pages</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-1">
                {navResults.map((n) => {
                  const itemIdx = flatItems.findIndex((fi) => fi.id === `nav-${n.path}`)
                  const isSelected = selectedIndex === itemIdx
                  const Icon = n.icon
                  return (
                    <div
                      key={n.path}
                      onClick={() => {
                        navigate(n.path)
                        onOpenChange(false)
                      }}
                      onMouseEnter={() => setSelectedIndex(itemIdx)}
                      className={cn(
                        'flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors text-sm',
                        isSelected ? 'bg-primary/10 text-primary border border-primary/20' : 'hover:bg-secondary/60 text-foreground',
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-xs truncate">{n.label}</span>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* No results empty state */}
          {!hasResults && cleanQuery && (
            <div className="py-12 text-center text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">No results found for "{query}"</p>
              <p className="text-xs mt-1">Try searching for a product name, SKU, customer phone, or invoice number.</p>
            </div>
          )}
        </div>

        {/* Footer Shortcut Helper */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-secondary/30 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px]">↑</kbd> <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px]">↓</kbd> to navigate</span>
            <span><kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px]">↵</kbd> to select</span>
          </div>
          <div className="flex items-center gap-1 font-medium">
            <Command className="h-3 w-3" />
            <span>BillScape Fast Search</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
