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
  UserPlus,
  X,
  MessageCircle,
  Receipt,
  ChevronDown,
  ChevronUp,
  Split,
  ArrowDownToLine,
  Star,
  Gift,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRegisterNavigationGuard } from '@/contexts/NavigationGuardContext'
import { computeGST, computeLineTax, applyOrderDiscount, applyLoyaltyRedemption, formatINR } from '@billscape/core'
import { createSale, getSales, getLoyaltyByCustomerId, getLoyaltySettings, ensureLoyaltyCustomer } from '@billscape/api'
import type { CartItem, DiscountType, GSTContext, InvoiceTotals } from '@billscape/core'
import type { LoyaltyCustomer, LoyaltySettings } from '@billscape/api'
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
import { QuickAddCustomerDialog } from '@/components/billing/QuickAddCustomerDialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface CustomerOption {
  id: string
  name: string
  phone?: string | null
  gstin?: string | null
}

const SCANNER_THRESHOLD_MS = 75
const HELD_BILLS_KEY = 'billscape_held_bills'

interface HeldBill {
  id: string
  name: string
  cart: CartItem[]
  customer: { id: string; name: string; phone?: string | null; gstin?: string | null } | null
  savedAt: number
}

type PaymentMode = 'cash' | 'card' | 'upi'

interface CompletedSale {
  invoiceNo: string
  totals: InvoiceTotals
  items: CartItem[]
  paymentMode: string
  paymentDetail?: string
}

export function POSTab() {
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([])
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [splitPayment, setSplitPayment] = useState(false)
  const [splitAmounts, setSplitAmounts] = useState<Record<PaymentMode, string>>({ cash: '', card: '', upi: '' })
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null)
  const [showInvoice, setShowInvoice] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [heldBills, setHeldBills] = useState<HeldBill[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(HELD_BILLS_KEY) ?? '[]') } catch { return [] }
  })
  const [showHolds, setShowHolds] = useState(false)
  const [holdName, setHoldName] = useState('')
  const [showHoldNameDialog, setShowHoldNameDialog] = useState(false)

  // Order-level discount (applied post-tax, on grand total)
  const [orderDiscountType, setOrderDiscountType] = useState<DiscountType>('percent')
  const [orderDiscountValue, setOrderDiscountValue] = useState('')
  const [showTaxDetails, setShowTaxDetails] = useState(false)

  // Customer state
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null)
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [showAddCustomer, setShowAddCustomer] = useState(false)

  // Loyalty redemption (applied post order-discount, on net_payable)
  const [redeemLoyalty, setRedeemLoyalty] = useState(false)
  const [loyaltyRedeemValue, setLoyaltyRedeemValue] = useState('')

  // Any change of customer (search-select, quick-add, or resuming a held bill for someone
  // else) must drop a previous customer's redemption — otherwise a stale points amount can
  // silently discount the wrong customer's bill.
  useEffect(() => {
    setRedeemLoyalty(false)
    setLoyaltyRedeemValue('')
  }, [selectedCustomer?.id])

  // Keep a ref to current cart so onSuccess can capture it after cart is cleared
  const cartRef = useRef<CartItem[]>([])
  cartRef.current = cart

  // Warn before leaving the page (tab close / refresh) with an unsaved cart
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (cartRef.current.length === 0) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Warn before in-app navigation away (sidebar links, sign out, etc.) with an unsaved cart
  useRegisterNavigationGuard(useCallback(() => cartRef.current.length > 0, []))

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

  // Compute totals (pre order-discount)
  const baseTotals = useMemo(() => {
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
        order_discount_amount: 0,
        loyalty_redeem_amount: 0,
        net_payable: 0,
      } as InvoiceTotals
    }
    return computeGST(gstContext, cart)
  }, [cart, gstContext])

  const resolvedOrderDiscountValue = parseFloat(orderDiscountValue) || 0

  // Totals with order-level discount applied (pre-loyalty)
  const discountedTotals = useMemo(() => {
    if (resolvedOrderDiscountValue <= 0) return baseTotals
    return applyOrderDiscount(baseTotals, orderDiscountType, resolvedOrderDiscountValue)
  }, [baseTotals, orderDiscountType, resolvedOrderDiscountValue])

  const resolvedLoyaltyRedeemValue = parseFloat(loyaltyRedeemValue) || 0

  // Final totals with loyalty redemption applied on top of order discount
  const totals = useMemo(() => {
    if (!redeemLoyalty || resolvedLoyaltyRedeemValue <= 0) return discountedTotals
    return applyLoyaltyRedemption(discountedTotals, resolvedLoyaltyRedeemValue)
  }, [discountedTotals, redeemLoyalty, resolvedLoyaltyRedeemValue])

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
        item.discount_type,
        item.discount_amount,
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
        query = query.or(`name.ilike.%${productSearch}%,barcode_value.ilike.%${productSearch}%`)
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

  // Loyalty: settings (rate/redeem rules) and the selected customer's balance, if enrolled
  const { data: loyaltySettings } = useQuery({
    queryKey: ['loyalty_settings', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await getLoyaltySettings(supabase as Parameters<typeof getLoyaltySettings>[0], orgId!)
      return data ?? { points_per_rupee: 1, rupees_per_point: 0.5, min_redeem_points: 100 }
    },
  })

  const { data: loyaltyCustomer } = useQuery({
    queryKey: ['loyalty-customer', orgId, selectedCustomer?.id],
    enabled: !!orgId && !!selectedCustomer?.id,
    queryFn: async () => {
      const { data } = await getLoyaltyByCustomerId(supabase as Parameters<typeof getLoyaltyByCustomerId>[0], orgId!, selectedCustomer!.id)
      return data
    },
  })

  const pointsToEarn = useMemo(() => {
    const rate = loyaltySettings?.points_per_rupee ?? 0
    return Math.floor(totals.net_payable * rate)
  }, [totals.net_payable, loyaltySettings])

  const canRedeemLoyalty = !!loyaltyCustomer && loyaltyCustomer.points_balance >= (loyaltySettings?.min_redeem_points ?? 100)
  const loyaltyRedeemCap = useMemo(() => {
    if (!loyaltyCustomer || !loyaltySettings) return 0
    const balanceValue = Math.round(loyaltyCustomer.points_balance * loyaltySettings.rupees_per_point * 100) / 100
    return Math.min(balanceValue, discountedTotals.net_payable)
  }, [loyaltyCustomer, loyaltySettings, discountedTotals.net_payable])

  // Last completed sale (quick reference strip)
  const [lastSale, setLastSale] = useState<{ invoiceNo: string; grandTotal: number } | null>(null)
  const { data: recentSales } = useQuery({
    queryKey: ['billing-last-sale', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await getSales(supabase as Parameters<typeof getSales>[0], orgId!, { limit: 1 })
      return data ?? []
    },
  })
  useEffect(() => {
    if (!lastSale && recentSales && recentSales.length > 0) {
      const s = recentSales[0] as { invoice_no: string; grand_total: number; net_payable?: number }
      setLastSale({ invoiceNo: s.invoice_no, grandTotal: s.net_payable ?? s.grand_total })
    }
  }, [recentSales, lastSale])

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
        discount_type: 'percent',
        discount_amount: 0,
        barcode_value: product.barcode_value ?? undefined,
      }
      return [...prev, newItem]
    })
    setProductSearch('')
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

  const updateDiscount = useCallback((productId: string, discountType: DiscountType, value: number) => {
    setCart((prev) =>
      prev.map((c) =>
        c.product_id === productId
          ? {
              ...c,
              discount_type: discountType,
              discount_pct: discountType === 'percent' ? value : 0,
              discount_amount: discountType === 'flat' ? value : 0,
            }
          : c,
      ),
    )
  }, [])

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((c) => c.product_id !== productId))
  }, [])

  const saveHeldBills = (bills: HeldBill[]) => {
    sessionStorage.setItem(HELD_BILLS_KEY, JSON.stringify(bills))
    setHeldBills(bills)
  }

  const holdBill = (name?: string) => {
    if (cart.length === 0) return
    const billName = name?.trim() || `Bill ${heldBills.length + 1}`
    const newBill: HeldBill = {
      id: Date.now().toString(),
      name: billName,
      cart,
      customer: selectedCustomer,
      savedAt: Date.now(),
    }
    saveHeldBills([...heldBills, newBill])
    setCart([])
    setSelectedCustomer(null)
    setCustomerSearch('')
    setHoldName('')
    setShowHoldNameDialog(false)
    setRedeemLoyalty(false)
    setLoyaltyRedeemValue('')
    toast.success(`"${billName}" held`, 'Tap Held Bills to resume.')
  }

  const resumeHeldBill = (bill: HeldBill) => {
    if (cart.length > 0) {
      toast.error('Clear current cart first', 'Hold or complete the current bill before resuming another.')
      return
    }
    setCart(bill.cart)
    if (bill.customer) setSelectedCustomer(bill.customer)
    saveHeldBills(heldBills.filter((b) => b.id !== bill.id))
    setShowHolds(false)
    toast.success(`Resumed "${bill.name}"`)
  }

  const deleteHeldBill = (id: string) => {
    saveHeldBills(heldBills.filter((b) => b.id !== id))
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
      sale.totals.order_discount_amount > 0 ? `Discount: -${formatINR(sale.totals.order_discount_amount)}` : '',
      `*Total: ${formatINR(sale.totals.net_payable)}*`,
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
      if (!orgId || !user) throw new Error('Not authenticated')

      let paymentFields: {
        payment_mode: PaymentMode | 'split'
        cash_amount?: number
        card_amount?: number
        upi_amount?: number
      }

      if (splitPayment) {
        if (splitTotal < totals.net_payable) {
          throw new Error(`Split amount (${formatINR(splitTotal)}) is less than payable amount (${formatINR(totals.net_payable)})`)
        }
        paymentFields = {
          payment_mode: 'split',
          cash_amount: parseFloat(splitAmounts.cash) || 0,
          card_amount: parseFloat(splitAmounts.card) || 0,
          upi_amount: parseFloat(splitAmounts.upi) || 0,
        }
      } else {
        // Empty field = exact payment (net payable after any order discount)
        const amountPaid = paymentAmount === '' ? totals.net_payable : (parseFloat(paymentAmount) || 0)
        if (amountPaid < totals.net_payable) {
          throw new Error(`Payment amount (${formatINR(amountPaid)}) is less than payable amount (${formatINR(totals.net_payable)})`)
        }
        const cashMap: Record<PaymentMode, { cash_amount?: number; card_amount?: number; upi_amount?: number }> = {
          cash: { cash_amount: amountPaid },
          card: { card_amount: amountPaid },
          upi: { upi_amount: amountPaid },
        }
        paymentFields = { payment_mode: paymentMode, ...cashMap[paymentMode] }
      }

      // Auto-enroll the customer into loyalty the first time they actually earn points —
      // no separate "add member" step for the cashier.
      let loyaltyCustomerId = loyaltyCustomer?.id
      if (!loyaltyCustomerId && selectedCustomer && pointsToEarn > 0) {
        const { data: enrolled, error: enrollError } = await ensureLoyaltyCustomer(
          supabase as Parameters<typeof ensureLoyaltyCustomer>[0],
          orgId,
          { id: selectedCustomer.id, name: selectedCustomer.name, phone: selectedCustomer.phone },
        )
        if (enrollError) {
          console.error('Loyalty enrollment failed, sale will proceed without earning points', enrollError)
        }
        loyaltyCustomerId = enrolled?.id
      }

      const result = await createSale(supabase as Parameters<typeof createSale>[0], {
        organization_id: orgId,
        customer_id: selectedCustomer?.id,
        items: cart,
        ...paymentFields,
        gst_context: gstContext,
        created_by: user.id,
        order_discount_type: resolvedOrderDiscountValue > 0 ? orderDiscountType : undefined,
        order_discount_value: resolvedOrderDiscountValue > 0 ? resolvedOrderDiscountValue : undefined,
        loyalty_customer_id: loyaltyCustomerId,
        loyalty_points_redeemed: redeemLoyalty && totals.loyalty_redeem_amount > 0 && loyaltyCustomer && loyaltySettings?.rupees_per_point
          ? Math.min(loyaltyCustomer.points_balance, Math.round(totals.loyalty_redeem_amount / loyaltySettings.rupees_per_point))
          : undefined,
        loyalty_redeem_amount: redeemLoyalty && totals.loyalty_redeem_amount > 0 ? totals.loyalty_redeem_amount : undefined,
        loyalty_points_earned: pointsToEarn > 0 ? pointsToEarn : undefined,
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
      const saleRow = d.sale as { invoice_no: string; payment_mode: string; cash_amount: number | null; card_amount: number | null; upi_amount: number | null }
      const paymentDetail =
        saleRow.payment_mode === 'split'
          ? [
              saleRow.cash_amount ? `Cash ${formatINR(saleRow.cash_amount)}` : '',
              saleRow.card_amount ? `Card ${formatINR(saleRow.card_amount)}` : '',
              saleRow.upi_amount ? `UPI ${formatINR(saleRow.upi_amount)}` : '',
            ].filter(Boolean).join(', ')
          : undefined
      setCompletedSale({
        invoiceNo: d.sale.invoice_no,
        totals: d.totals,
        items: saleItems,
        paymentMode: saleRow.payment_mode,
        paymentDetail,
      })
      setLastSale({ invoiceNo: d.sale.invoice_no, grandTotal: d.totals.net_payable })
      setShowInvoice(true)
      setCart([])
      setPaymentAmount('')
      setSplitPayment(false)
      setSplitAmounts({ cash: '', card: '', upi: '' })
      setOrderDiscountValue('')
      setRedeemLoyalty(false)
      setLoyaltyRedeemValue('')
      queryClient.invalidateQueries({ queryKey: ['billing-products', orgId] })
      queryClient.invalidateQueries({ queryKey: ['today-summary', orgId] })
      queryClient.invalidateQueries({ queryKey: ['loyalty-customer', orgId] })
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

  const amountPaid = paymentAmount === '' ? totals.net_payable : (parseFloat(paymentAmount) || 0)
  const change = Math.max(0, amountPaid - totals.net_payable)

  const splitTotal = Math.round(
    ((parseFloat(splitAmounts.cash) || 0) +
      (parseFloat(splitAmounts.card) || 0) +
      (parseFloat(splitAmounts.upi) || 0)) *
      100,
  ) / 100
  const splitRemaining = Math.max(0, Math.round((totals.net_payable - splitTotal) * 100) / 100)

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

      {/* Right: Product panel (narrower) */}
      <div className="flex flex-col w-full lg:w-[40%] xl:w-[35%] overflow-hidden order-2">
        {/* Search bar */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              placeholder="Search products... (scan barcode or type)"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="pl-9 pr-9"
            />
            {productSearch && (
              <button
                type="button"
                onClick={() => setProductSearch('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-3 gap-2">
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

      {/* Left: Cart panel (wider) */}
      <div className="flex flex-col w-full lg:w-[60%] xl:w-[65%] border-r border-border overflow-hidden order-1">
        {/* Cart header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-zinc-400" />
            <span className="text-sm font-semibold text-zinc-200">
              Cart ({cart.length} items)
            </span>
          </div>
          <div className="flex items-center gap-2">
            {heldBills.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowHolds(true)}
                className="h-7 text-xs text-emerald-400 relative">
                <Play className="h-3 w-3" />
                Held Bills
                <span className="ml-1 rounded-full bg-emerald-500 text-white text-[9px] px-1.5 py-0.5 font-bold">
                  {heldBills.length}
                </span>
              </Button>
            )}
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowHoldNameDialog(true)} className="h-7 text-xs">
                <Pause className="h-3 w-3" />
                Hold
              </Button>
            )}
          </div>
        </div>

        {/* Last bill quick reference */}
        {lastSale && (
          <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-border bg-zinc-900/50 text-[11px] text-zinc-500">
            <Receipt className="h-3 w-3" />
            <span>Last: {lastSale.invoiceNo}</span>
            <span className="text-zinc-600">·</span>
            <span className="font-medium text-zinc-400">{formatINR(lastSale.grandTotal)}</span>
          </div>
        )}

        {/* Customer picker */}
        <div className="px-3 py-2 border-b border-border relative z-20">
          {selectedCustomer ? (
            <div className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium text-foreground">{selectedCustomer.name}</p>
                    {loyaltyCustomer && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400">
                        <Star className="h-2.5 w-2.5" />{loyaltyCustomer.points_balance.toLocaleString()} pts
                      </span>
                    )}
                  </div>
                  {selectedCustomer.phone && (
                    <p className="text-[10px] text-muted-foreground">{selectedCustomer.phone}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); setRedeemLoyalty(false); setLoyaltyRedeemValue('') }}
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
                placeholder="Search customer by name or mobile..."
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value)
                  setShowCustomerDropdown(true)
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                className="w-full h-8 pl-8 pr-3 text-xs rounded-md bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {showCustomerDropdown && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border border-border bg-popover shadow-lg max-h-56 overflow-y-auto">
                  {customers?.map((c) => (
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
                  <button
                    onMouseDown={() => setShowAddCustomer(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary transition-colors border-t border-border text-indigo-400"
                  >
                    <UserPlus className="h-3 w-3 shrink-0" />
                    <span className="text-xs font-medium">Add new customer</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
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
          <div className="border-t border-border bg-card shrink-0">
            <div className="px-3 py-2 space-y-1 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatINR(totals.subtotal)}</span>
              </div>
              {totals.discount_total > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Item Discount</span>
                  <span className="tabular-nums">-{formatINR(totals.discount_total)}</span>
                </div>
              )}

              {/* Tax summary line (collapsible breakup) */}
              {totals.tax_total > 0 && (
                <button
                  type="button"
                  onClick={() => setShowTaxDetails((v) => !v)}
                  className="flex w-full justify-between items-center text-zinc-400 hover:text-zinc-300"
                >
                  <span className="inline-flex items-center gap-1">
                    GST
                    {showTaxDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </span>
                  <span className="tabular-nums">{formatINR(totals.tax_total)}</span>
                </button>
              )}
              {showTaxDetails && totals.tax_breakup.map((line) => (
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

              <div className="flex justify-between items-center">
                <span className="font-semibold text-white">Grand Total</span>
                <span className="font-semibold text-zinc-300 tabular-nums">
                  {formatINR(baseTotals.grand_total)}
                </span>
              </div>

              {/* Order-level discount (applied after tax, on grand total) */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-zinc-400 text-[11px]">Bill Discount</span>
                <div className="flex rounded border border-zinc-700 overflow-hidden ml-auto">
                  <button
                    type="button"
                    onClick={() => setOrderDiscountType('percent')}
                    className={cn(
                      'h-5 w-5 text-[10px] font-medium transition-colors',
                      orderDiscountType === 'percent' ? 'bg-indigo-600 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300',
                    )}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderDiscountType('flat')}
                    className={cn(
                      'h-5 w-5 text-[10px] font-medium transition-colors border-l border-zinc-700',
                      orderDiscountType === 'flat' ? 'bg-indigo-600 text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300',
                    )}
                  >
                    ₹
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  max={orderDiscountType === 'percent' ? 100 : undefined}
                  step={orderDiscountType === 'percent' ? 0.5 : 1}
                  placeholder="0"
                  value={orderDiscountValue}
                  onChange={(e) => setOrderDiscountValue(e.target.value)}
                  className="h-5 w-14 rounded border border-zinc-700 bg-zinc-900 px-1 text-center text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              {totals.order_discount_amount > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount Applied</span>
                  <span className="tabular-nums">-{formatINR(totals.order_discount_amount)}</span>
                </div>
              )}

              {/* Loyalty points redemption */}
              {canRedeemLoyalty && loyaltyCustomer && (
                <div className="pt-0.5">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={redeemLoyalty}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setRedeemLoyalty(checked)
                        if (checked) setLoyaltyRedeemValue(loyaltyRedeemCap.toFixed(2))
                      }}
                      className="h-3 w-3 rounded accent-yellow-500"
                    />
                    <Star className="h-3 w-3 text-yellow-400" />
                    <span className="text-zinc-400 text-[11px]">
                      Redeem points ({loyaltyCustomer.points_balance.toLocaleString()} available)
                    </span>
                    {redeemLoyalty && (
                      <input
                        type="number"
                        min="0"
                        max={loyaltyRedeemCap}
                        step="0.01"
                        value={loyaltyRedeemValue}
                        onChange={(e) => setLoyaltyRedeemValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="ml-auto h-5 w-16 rounded border border-zinc-700 bg-zinc-900 px-1 text-center text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-yellow-500"
                      />
                    )}
                  </label>
                </div>
              )}
              {totals.loyalty_redeem_amount > 0 && (
                <div className="flex justify-between text-yellow-400">
                  <span>Loyalty Redeemed</span>
                  <span className="tabular-nums">-{formatINR(totals.loyalty_redeem_amount)}</span>
                </div>
              )}

              <div className="flex justify-between items-center pt-1 border-t border-zinc-800">
                <span className="text-sm font-bold text-white">Payable</span>
                <span className="text-lg font-bold text-indigo-300 tabular-nums">
                  {formatINR(totals.net_payable)}
                </span>
              </div>
              {pointsToEarn > 0 && (
                <div className="flex justify-between items-center text-[10px] text-zinc-500">
                  <span className="inline-flex items-center gap-1"><Gift className="h-2.5 w-2.5" />Earns on this sale</span>
                  <span>+{pointsToEarn.toLocaleString()} pts</span>
                </div>
              )}
            </div>

            {/* Payment section */}
            <div className="px-3 pb-3 space-y-2">
              {!splitPayment && (
                <>
                  {/* Payment mode tabs + amount, single row */}
                  <div className="flex items-stretch gap-1.5">
                    <div className="flex rounded-lg bg-zinc-800 p-0.5 gap-0.5 shrink-0">
                      {(['cash', 'card', 'upi'] as PaymentMode[]).map((mode) => {
                        const icons = { cash: Banknote, card: CreditCard, upi: Smartphone }
                        const Icon = icons[mode]
                        return (
                          <button
                            key={mode}
                            onClick={() => setPaymentMode(mode)}
                            className={cn(
                              'flex items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium capitalize transition-all',
                              paymentMode === mode
                                ? 'bg-indigo-600 text-white shadow'
                                : 'text-zinc-400 hover:text-zinc-200',
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            {mode}
                          </button>
                        )
                      })}
                    </div>

                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={`Amount received (${formatINR(totals.net_payable)})`}
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="text-sm font-bold text-white h-9 flex-1 min-w-0"
                    />
                  </div>

                  {(change > 0 || (amountPaid > 0 && amountPaid < totals.net_payable)) && (
                    <div className="flex justify-between text-xs">
                      {amountPaid < totals.net_payable ? (
                        <span className="flex items-center gap-1 text-red-400">
                          <AlertCircle className="h-3 w-3" />
                          Short by {formatINR(totals.net_payable - amountPaid)}
                        </span>
                      ) : (
                        <>
                          <span className="text-zinc-400">Balance</span>
                          <span className="font-semibold text-emerald-400">{formatINR(change)}</span>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Split payment toggle */}
              <button
                type="button"
                onClick={() => {
                  setSplitPayment((v) => {
                    const next = !v
                    if (next) {
                      setSplitAmounts({ cash: totals.net_payable.toFixed(2), card: '', upi: '' })
                    }
                    return next
                  })
                }}
                className={cn(
                  'flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  splitPayment
                    ? 'border-indigo-600 bg-indigo-600/10 text-indigo-300 hover:bg-indigo-600/20'
                    : 'border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800 hover:text-white',
                )}
              >
                <Split className="h-3.5 w-3.5" />
                {splitPayment ? 'Use a single payment method' : 'Split payment across methods'}
              </button>

              {splitPayment && (
                <div
                  className={cn(
                    'rounded-lg border p-2 transition-colors',
                    splitRemaining <= 0
                      ? 'border-emerald-800 bg-emerald-950/30'
                      : 'border-zinc-800 bg-zinc-900/40',
                  )}
                >
                  {/* Single row: 3 method fields + remaining/paid status */}
                  <div className="flex items-stretch gap-1.5">
                    {(['cash', 'card', 'upi'] as PaymentMode[]).map((mode) => {
                      const meta = {
                        cash: { icon: Banknote, ring: 'ring-emerald-500/40 text-emerald-400 bg-emerald-500/10' },
                        card: { icon: CreditCard, ring: 'ring-indigo-500/40 text-indigo-400 bg-indigo-500/10' },
                        upi: { icon: Smartphone, ring: 'ring-sky-500/40 text-sky-400 bg-sky-500/10' },
                      }[mode]
                      const Icon = meta.icon
                      const filled = (parseFloat(splitAmounts[mode]) || 0) > 0
                      const otherModesTotal = Math.round((splitTotal - (parseFloat(splitAmounts[mode]) || 0)) * 100) / 100
                      const fillValue = Math.max(0, Math.round((totals.net_payable - otherModesTotal) * 100) / 100)
                      return (
                        <div
                          key={mode}
                          className="flex-1 min-w-0 flex flex-col gap-0.5 rounded-md bg-zinc-950/40 px-1.5 py-1 focus-within:ring-1 focus-within:ring-indigo-500"
                        >
                          <div className="flex items-center gap-1">
                            <span className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-1',
                              filled ? meta.ring : 'ring-zinc-700 text-zinc-500 bg-zinc-800/60',
                            )}>
                              <Icon className="h-2.5 w-2.5" />
                            </span>
                            <span className="text-[10px] text-zinc-500 capitalize truncate">{mode}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0"
                              value={splitAmounts[mode]}
                              onChange={(e) => setSplitAmounts((prev) => ({ ...prev, [mode]: e.target.value }))}
                              className="w-full min-w-0 bg-transparent text-sm font-semibold text-zinc-100 tabular-nums focus:outline-none placeholder:text-zinc-600 placeholder:font-normal"
                            />
                            {fillValue > 0 && (
                              <button
                                type="button"
                                onClick={() => setSplitAmounts((prev) => ({ ...prev, [mode]: fillValue.toFixed(2) }))}
                                title={`Fill remaining ${formatINR(fillValue)}`}
                                className="shrink-0 flex items-center justify-center h-4 w-4 rounded-full text-indigo-400 hover:text-white hover:bg-indigo-600 transition-colors"
                              >
                                <ArrowDownToLine className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Remaining-to-collect status */}
                  <div className="flex items-center justify-between mt-1.5 px-0.5">
                    <span className="text-[10px] text-zinc-500">
                      {splitRemaining <= 0 ? 'Fully collected' : 'Remaining to collect'}
                    </span>
                    <span className={cn(
                      'flex items-center gap-1 text-xs font-bold tabular-nums',
                      splitRemaining <= 0 ? 'text-emerald-400' : 'text-amber-400',
                    )}>
                      {splitRemaining <= 0 ? (
                        <>Paid <CheckCircle2 className="h-3 w-3" /></>
                      ) : (
                        formatINR(splitRemaining)
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* Complete sale button */}
              <Button
                className="w-full h-11 text-sm font-semibold"
                onClick={handleCompleteSale}
                disabled={
                  cart.length === 0 ||
                  completeSaleMutation.isPending ||
                  (splitPayment
                    ? splitTotal < totals.net_payable
                    : (amountPaid > 0 && amountPaid < totals.net_payable))
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
                    Complete Sale · {formatINR(totals.net_payable)}
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
                paymentMode={completedSale.paymentMode}
                paymentDetail={completedSale.paymentDetail}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Hold Name Dialog */}
      <Dialog open={showHoldNameDialog} onOpenChange={setShowHoldNameDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pause className="h-4 w-4" /> Hold This Bill
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Give this bill a name so you can easily find it later. ({cart.length} items)
            </p>
            <Input
              placeholder={`Bill ${heldBills.length + 1} (default)`}
              value={holdName}
              onChange={(e) => setHoldName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && holdBill(holdName)}
              autoFocus
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowHoldNameDialog(false)}>Cancel</Button>
            <Button className="flex-1" onClick={() => holdBill(holdName)}>
              <Pause className="h-4 w-4" /> Hold Bill
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Held Bills List Dialog */}
      <Dialog open={showHolds} onOpenChange={setShowHolds}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-4 w-4 text-emerald-400" /> Held Bills ({heldBills.length})
            </DialogTitle>
          </DialogHeader>
          {heldBills.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">No held bills</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {heldBills.map((bill) => (
                <div key={bill.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{bill.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {bill.cart.length} items
                      {bill.customer ? ` · ${bill.customer.name}` : ''}
                      {' · '}
                      {new Date(bill.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" className="h-7 text-xs" onClick={() => resumeHeldBill(bill)}>
                      <Play className="h-3 w-3" /> Resume
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-400"
                      onClick={() => deleteHeldBill(bill.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quick-add customer dialog */}
      <QuickAddCustomerDialog
        open={showAddCustomer}
        onOpenChange={setShowAddCustomer}
        orgId={orgId ?? ''}
        initialName={customerSearch}
        onCreated={(customer) => {
          setSelectedCustomer(customer)
          setCustomerSearch('')
          setShowCustomerDropdown(false)
          queryClient.invalidateQueries({ queryKey: ['billing-customers', orgId] })
        }}
      />
    </div>
  )
}
