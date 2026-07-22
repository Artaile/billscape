import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Package,
  ShoppingCart,
  Pause,
  Play,
  CreditCard,
  Banknote,
  Smartphone,
  Loader2,
  AlertCircle,
  CheckCircle2,
  User,
  X,
  MessageCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { computeGST, computeLineTax, formatINR } from '@billscape/core'
import { createSale } from '@billscape/api'
import type { CartItem, GSTContext, InvoiceTotals } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CartItemRow } from '@/components/billing/CartItem'
import { InvoicePrint } from '@/components/billing/InvoicePrint'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface CustomerOption {
  id: string
  name: string
  phone?: string | null
  gstin?: string | null
}

const SCANNER_THRESHOLD_MS = 75
const HELD_BILL_KEY = 'billscape_held_bill'

type PaymentMode = 'cash' | 'card' | 'upi'

interface CompletedSale {
  invoiceNo: string
  totals: InvoiceTotals
  items: CartItem[]
}

export function BillingPage() {
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([])
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null)
  const [showInvoice, setShowInvoice] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [hasHeldBill, setHasHeldBill] = useState(false)

  // Customer state
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null)
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)

  // Keep a ref to current cart so onSuccess can capture it after cart is cleared
  const cartRef = useRef<CartItem[]>([])
  cartRef.current = cart

  // Scanner state
  const scanInputRef = useRef<HTMLInputElement>(null)
  const scanBuffer = useRef('')
  const lastKeystrokeTime = useRef(0)
  const lastScannedCode = useRef('')
  const scanDebounceTimer = useRef<ReturnType<typeof setTimeout>>()

  // GST context
  const gstContext: GSTContext = {
    shopStateCode: org?.state_code ?? 'TN',
    customerStateCode: undefined,
  }

  // Compute totals
  const totals = useMemo(() => {
    if (cart.length === 0) {
      return {
        subtotal: 0,
        discount_total: 0,
        taxable_amount: 0,
        tax_breakup: [],
        cgst_total: 0,
        sgst_total: 0,
        igst_total: 0,
        tax_total: 0,
        grand_total: 0,
        is_interstate: false,
      } as InvoiceTotals
    }
    return computeGST(gstContext, cart)
  }, [cart, gstContext])

  // Line totals per item
  const lineTotals = useMemo(() => {
    const interstate = totals.is_interstate
    return cart.map((item) => {
      const lt = computeLineTax(
        item.unit_price,
        item.qty,
        item.discount_pct,
        item.tax_rate,
        interstate,
      )
      return lt.lineTotal
    })
  }, [cart, totals.is_interstate])

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['billing-products', orgId, productSearch],
    enabled: !!orgId,
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('id, name, price, tax_rate, hsn_code, barcode_value, track_stock, inventory(stock_qty)')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
        .order('name')
        .limit(50)

      if (productSearch) {
        query = query.ilike('name', `%${productSearch}%`)
      }

      const { data } = await query
      return data ?? []
    },
  })

  // Fetch customers for picker
  const { data: customers } = useQuery({
    queryKey: ['billing-customers', orgId, customerSearch],
    enabled: !!orgId && customerSearch.length >= 1,
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone, gstin')
        .eq('organization_id', orgId!)
        .or(`name.ilike.%${customerSearch}%,phone.ilike.%${customerSearch}%`)
        .order('name')
        .limit(10)
      return (data ?? []) as CustomerOption[]
    },
  })

  // Check for held bill on mount
  useEffect(() => {
    const held = sessionStorage.getItem(HELD_BILL_KEY)
    if (held) setHasHeldBill(true)
  }, [])

  // Focus scan input on mount and after dialog closes
  const focusScanInput = useCallback(() => {
    setTimeout(() => scanInputRef.current?.focus(), 50)
  }, [])

  useEffect(() => {
    focusScanInput()
  }, [focusScanInput])

  // Add item to cart by product data
  // Supabase returns inventory as object (singular FK) or array depending on schema
  const getStock = (inv: unknown): number => {
    if (!inv) return 0
    if (Array.isArray(inv)) return (inv[0] as { stock_qty: number })?.stock_qty ?? 0
    return (inv as { stock_qty: number })?.stock_qty ?? 0
  }

  const addToCart = useCallback((product: {
    id: string
    name: string
    price: number
    tax_rate: number
    hsn_code?: string | null
    barcode_value?: string | null
    inventory?: unknown
    track_stock: boolean
  }) => {
    const stock = getStock(product.inventory)
    if (product.track_stock && stock <= 0) {
      toast.error(`Out of stock: ${product.name}`)
      return
    }

    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === product.id)
      if (existing) {
        if (product.track_stock && existing.qty >= stock) {
          toast.error(`Out of stock: ${product.name}`)
          return prev
        }
        return prev.map((c) =>
          c.product_id === product.id ? { ...c, qty: c.qty + 1 } : c,
        )
      }
      const newItem: CartItem = {
        product_id: product.id,
        product_name: product.name,
        hsn_code: product.hsn_code ?? undefined,
        tax_rate: product.tax_rate as CartItem['tax_rate'],
        unit_price: product.price,
        qty: 1,
        discount_pct: 0,
        barcode_value: product.barcode_value ?? undefined,
      }
      return [...prev, newItem]
    })
  }, [])

  // USB scanner keyboard wedge handler
  const handleScanKeydown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const now = Date.now()
      const delta = now - lastKeystrokeTime.current
      lastKeystrokeTime.current = now

      if (e.key === 'Enter') {
        const code = scanBuffer.current.trim()
        scanBuffer.current = ''

        if (!code) return

        // Debounce same barcode within 500ms
        if (code === lastScannedCode.current) return
        lastScannedCode.current = code
        clearTimeout(scanDebounceTimer.current)
        scanDebounceTimer.current = setTimeout(() => {
          lastScannedCode.current = ''
        }, 500)

        // Lookup product
        const found = products?.find((p) => p.barcode_value === code)
        if (found) {
          addToCart(found)
        } else {
          toast({ title: `Product not found: ${code}`, variant: 'warning' })
        }

        focusScanInput()
        return
      }

      if (delta < SCANNER_THRESHOLD_MS) {
        // Scanner input: buffer
        if (e.key.length === 1) {
          scanBuffer.current += e.key
        }
        e.preventDefault()
      } else {
        // Keyboard input: reset buffer
        scanBuffer.current = e.key.length === 1 ? e.key : ''
      }
    },
    [products, addToCart, focusScanInput],
  )

  const updateQty = useCallback((productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.product_id !== productId))
      return
    }
    setCart((prev) =>
      prev.map((c) => (c.product_id === productId ? { ...c, qty } : c)),
    )
  }, [])

  const updateDiscount = useCallback((productId: string, discount: number) => {
    setCart((prev) =>
      prev.map((c) =>
        c.product_id === productId ? { ...c, discount_pct: discount } : c,
      ),
    )
  }, [])

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((c) => c.product_id !== productId))
  }, [])

  const holdBill = () => {
    if (cart.length === 0) return
    const held = { cart, timestamp: Date.now() }
    sessionStorage.setItem(HELD_BILL_KEY, JSON.stringify(held))
    setHasHeldBill(true)
    setCart([])
    toast.success('Bill held', 'You can resume it anytime.')
  }

  const resumeBill = () => {
    const raw = sessionStorage.getItem(HELD_BILL_KEY)
    if (!raw) return
    const held = JSON.parse(raw) as { cart: CartItem[]; timestamp: number }
    setCart(held.cart)
    sessionStorage.removeItem(HELD_BILL_KEY)
    setHasHeldBill(false)
    toast.success('Bill resumed')
  }

  const sendWhatsApp = (sale: CompletedSale, phone: string) => {
    const itemLines = sale.items
      .map((item) => `• ${item.product_name} x${item.qty} = ${formatINR(item.unit_price * item.qty)}`)
      .join('\n')
    const message = [
      `*Invoice: ${sale.invoiceNo}*`,
      `Shop: ${org?.name ?? 'BillScape'}`,
      `Date: ${new Date().toLocaleDateString('en-IN')}`,
      '',
      itemLines,
      '',
      `Subtotal: ${formatINR(sale.totals.subtotal)}`,
      sale.totals.tax_total > 0 ? `GST: ${formatINR(sale.totals.tax_total)}` : '',
      `*Total: ${formatINR(sale.totals.grand_total)}*`,
      '',
      'Thank you for shopping with us!',
    ].filter(Boolean).join('\n')

    const cleaned = phone.replace(/\D/g, '')
    const withCountry = cleaned.startsWith('91') ? cleaned : `91${cleaned}`
    const url = `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')
  }

  const completeSaleMutation = useMutation({
    mutationFn: async () => {
      // Empty field = exact payment (grand total)
      const amountPaid = paymentAmount === '' ? totals.grand_total : (parseFloat(paymentAmount) || 0)
      if (amountPaid < totals.grand_total) {
        throw new Error(`Payment amount (${formatINR(amountPaid)}) is less than grand total (${formatINR(totals.grand_total)})`)
      }
      if (!orgId || !user) throw new Error('Not authenticated')

      const cashMap: Record<PaymentMode, { cash_amount?: number; card_amount?: number; upi_amount?: number }> = {
        cash: { cash_amount: amountPaid },
        card: { card_amount: amountPaid },
        upi: { upi_amount: amountPaid },
      }

      const result = await createSale(supabase as Parameters<typeof createSale>[0], {
        organization_id: orgId,
        items: cart,
        payment_mode: paymentMode,
        ...cashMap[paymentMode],
        gst_context: gstContext,
        created_by: user.id,
      })

      if (result.error || !result.data) {
        throw result.error ?? new Error('Sale creation failed')
      }

      return result.data
    },
    onSuccess: (data) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any
      const saleItems = cartRef.current
      setCompletedSale({
        invoiceNo: d.sale.invoice_no,
        totals: d.totals,
        items: saleItems,
      })
      setShowInvoice(true)
      setCart([])
      setPaymentAmount('')
      queryClient.invalidateQueries({ queryKey: ['billing-products', orgId] })
      queryClient.invalidateQueries({ queryKey: ['today-summary', orgId] })
      toast.success(`Sale complete! Invoice: ${d.sale.invoice_no}`)
      // Reset customer only after invoice is closed (keep for display in invoice)
    },
    onError: (err: Error) => {
      toast.error('Sale failed', err.message)
    },
  })

  const handleCompleteSale = () => {
    if (cart.length === 0) {
      toast({ title: 'Cart is empty', variant: 'warning' })
      return
    }
    completeSaleMutation.mutate()
  }

  const amountPaid = paymentAmount === '' ? totals.grand_total : (parseFloat(paymentAmount) || 0)
  const change = Math.max(0, amountPaid - totals.grand_total)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Hidden scanner input - always focused */}
      <input
        ref={scanInputRef}
        className="absolute opacity-0 w-0 h-0 pointer-events-none"
        onKeyDown={handleScanKeydown}
        readOnly
        aria-hidden
        tabIndex={-1}
      />

      {/* Left: Product panel */}
      <div className="flex flex-col w-full lg:w-[55%] xl:w-[60%] border-r border-border overflow-hidden">
        {/* Search bar */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              placeholder="Search products... (scan barcode or type)"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="pl-9"
              onFocus={() => {
                // When product search is focused, scanner won't work
              }}
            />
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
            {products?.map((product) => {
              const stock = getStock(product.inventory)
              const outOfStock = product.track_stock && stock <= 0
              const lowStock = product.track_stock && stock > 0 && stock <= 10

              return (
                <button
                  key={product.id}
                  onClick={() => !outOfStock && addToCart(product)}
                  disabled={outOfStock}
                  className={cn(
                    'relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all',
                    outOfStock
                      ? 'border-zinc-800 bg-zinc-900/30 opacity-50 cursor-not-allowed'
                      : 'border-zinc-800 bg-card hover:border-indigo-500 hover:bg-indigo-600/5 active:scale-95',
                  )}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-zinc-800 mb-1">
                    <Package className="h-4 w-4 text-zinc-500" />
                  </div>
                  <p className="text-xs font-medium text-zinc-200 leading-tight line-clamp-2">
                    {product.name}
                  </p>
                  <p className="text-sm font-bold text-indigo-300">{formatINR(product.price)}</p>
                  {product.track_stock && (
                    <div className="mt-auto">
                      {outOfStock ? (
                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Out of stock</Badge>
                      ) : lowStock ? (
                        <Badge variant="warning" className="text-[9px] px-1.5 py-0">{stock} left</Badge>
                      ) : null}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right: Cart panel */}
      <div className="flex flex-col w-full lg:w-[45%] xl:w-[40%] overflow-hidden">
        {/* Cart header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-zinc-400" />
            <span className="text-sm font-semibold text-zinc-200">
              Cart ({cart.length} items)
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasHeldBill && (
              <Button variant="ghost" size="sm" onClick={resumeBill} className="h-7 text-xs text-emerald-400">
                <Play className="h-3 w-3" />
                Resume
              </Button>
            )}
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={holdBill} className="h-7 text-xs">
                <Pause className="h-3 w-3" />
                Hold
              </Button>
            )}
          </div>
        </div>

        {/* Customer picker */}
        <div className="px-3 py-2 border-b border-border relative">
          {selectedCustomer ? (
            <div className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs font-medium text-foreground">{selectedCustomer.name}</p>
                  {selectedCustomer.phone && (
                    <p className="text-[10px] text-muted-foreground">{selectedCustomer.phone}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }}
                className="p-0.5 rounded hover:bg-border text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search customer (optional)..."
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value)
                  setShowCustomerDropdown(true)
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                className="w-full h-8 pl-8 pr-3 text-xs rounded-md bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {showCustomerDropdown && customers && customers.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
                  {customers.map((c) => (
                    <button
                      key={c.id}
                      onMouseDown={() => {
                        setSelectedCustomer(c)
                        setCustomerSearch('')
                        setShowCustomerDropdown(false)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary transition-colors"
                    >
                      <User className="h-3 w-3 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-foreground">{c.name}</p>
                        {c.phone && <p className="text-[10px] text-muted-foreground">{c.phone}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-10 text-center">
              <ShoppingCart className="h-10 w-10 text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-500">Cart is empty</p>
              <p className="text-xs text-zinc-600 mt-1">Scan a barcode or click a product</p>
            </div>
          ) : (
            cart.map((item, i) => (
              <CartItemRow
                key={item.product_id}
                item={item}
                lineTotal={lineTotals[i]}
                onQtyChange={updateQty}
                onDiscountChange={updateDiscount}
                onRemove={removeFromCart}
              />
            ))
          )}
        </div>

        {/* Totals */}
        {cart.length > 0 && (
          <div className="border-t border-border bg-card">
            <div className="px-4 py-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatINR(totals.subtotal)}</span>
              </div>
              {totals.discount_total > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount</span>
                  <span className="tabular-nums">-{formatINR(totals.discount_total)}</span>
                </div>
              )}
              <div className="flex justify-between text-zinc-400">
                <span>Taxable Amount</span>
                <span className="tabular-nums">{formatINR(totals.taxable_amount)}</span>
              </div>

              {/* Tax breakup */}
              {totals.tax_breakup.map((line) => (
                <div key={line.tax_rate} className="pl-2">
                  {totals.is_interstate ? (
                    <div className="flex justify-between text-zinc-500">
                      <span>IGST @{line.tax_rate}%</span>
                      <span className="tabular-nums">{formatINR(line.igst)}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between text-zinc-500">
                        <span>CGST @{line.tax_rate / 2}%</span>
                        <span className="tabular-nums">{formatINR(line.cgst)}</span>
                      </div>
                      <div className="flex justify-between text-zinc-500">
                        <span>SGST @{line.tax_rate / 2}%</span>
                        <span className="tabular-nums">{formatINR(line.sgst)}</span>
                      </div>
                    </>
                  )}
                </div>
              ))}

              <div className="flex justify-between items-center pt-2 border-t border-zinc-800">
                <span className="text-base font-bold text-white">Grand Total</span>
                <span className="text-xl font-bold text-indigo-300 tabular-nums">
                  {formatINR(totals.grand_total)}
                </span>
              </div>
            </div>

            {/* Payment section */}
            <div className="px-4 pb-4 space-y-3">
              {/* Payment mode tabs */}
              <div className="flex rounded-lg bg-zinc-800 p-1 gap-1">
                {(['cash', 'card', 'upi'] as PaymentMode[]).map((mode) => {
                  const icons = { cash: Banknote, card: CreditCard, upi: Smartphone }
                  const Icon = icons[mode]
                  return (
                    <button
                      key={mode}
                      onClick={() => setPaymentMode(mode)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all capitalize',
                        paymentMode === mode
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-zinc-400 hover:text-zinc-200',
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {mode}
                    </button>
                  )
                })}
              </div>

              {/* Amount input */}
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">Amount Received</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={formatINR(totals.grand_total)}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="text-lg font-bold text-white h-11"
                />
              </div>

              {change > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Change</span>
                  <span className="font-semibold text-emerald-400">{formatINR(change)}</span>
                </div>
              )}

              {amountPaid > 0 && amountPaid < totals.grand_total && (
                <div className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Short by {formatINR(totals.grand_total - amountPaid)}
                </div>
              )}

              {/* Complete sale button */}
              <Button
                className="w-full h-11 text-sm font-semibold"
                onClick={handleCompleteSale}
                disabled={
                  cart.length === 0 ||
                  completeSaleMutation.isPending ||
                  (amountPaid > 0 && amountPaid < totals.grand_total)
                }
              >
                {completeSaleMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Complete Sale
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Invoice dialog */}
      <Dialog
        open={showInvoice}
        onOpenChange={(open) => {
          setShowInvoice(open)
          if (!open) {
            setCompletedSale(null)
            setSelectedCustomer(null)
            setCustomerSearch('')
            focusScanInput()
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              Sale Complete — {completedSale?.invoiceNo}
            </DialogTitle>
          </DialogHeader>
          {completedSale && (
            <>
              {selectedCustomer?.phone && (
                <div className="flex justify-end mb-2 no-print">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-emerald-600 border-emerald-600 hover:bg-emerald-50"
                    onClick={() => sendWhatsApp(completedSale, selectedCustomer.phone!)}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Send on WhatsApp
                  </Button>
                </div>
              )}
              <InvoicePrint
                invoiceNo={completedSale.invoiceNo}
                date={new Date().toISOString()}
                shopName={org?.name ?? 'BillScape Shop'}
                shopAddress={org?.address}
                shopGstin={org?.gstin}
                shopLogoUrl={org?.branding?.logo_url}
                customerName={selectedCustomer?.name}
                customerPhone={selectedCustomer?.phone ?? undefined}
                customerGstin={selectedCustomer?.gstin ?? undefined}
                items={completedSale.items}
                totals={completedSale.totals}
                paymentMode={paymentMode}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
