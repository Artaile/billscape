import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useSearchParams } from 'react-router-dom'
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
  Tag,
  Percent,
  Sparkles,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRegisterNavigationGuard } from '@/contexts/NavigationGuardContext'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { computeGST, computeLineTax, applyOrderDiscount, applyLoyaltyRedemption, applyRoundOff, formatINR, qtyStepForUnit, toBaseQty } from '@billscape/core'
import { createSale, getSales, getLoyaltyByCustomerId, getLoyaltySettings, ensureLoyaltyCustomer } from '@billscape/api'
import type { CartItem, DiscountType, GSTContext, InvoiceTotals, Unit } from '@billscape/core'
import type { LoyaltyCustomer, LoyaltySettings } from '@billscape/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  state_code?: string | null
  address?: string | null
}

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
  const { org, user, role } = useAuth()
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

  // Auto-resume a held bill written by another page (e.g. QuotationViewPage's "Convert to
  // Sale") when arriving via /billing?resumeHold=<id> — same held-bill store, just entered
  // without the user manually opening the Held Bills panel and clicking Resume.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const resumeId = searchParams.get('resumeHold')
    if (!resumeId) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('resumeHold')
      return next
    }, { replace: true })
    let stored: HeldBill[] = []
    try { stored = JSON.parse(sessionStorage.getItem(HELD_BILLS_KEY) ?? '[]') } catch { stored = [] }
    const bill = stored.find((b) => b.id === resumeId)
    if (!bill) return
    setCart(bill.cart)
    if (bill.customer) setSelectedCustomer(bill.customer)
    const remaining = stored.filter((b) => b.id !== resumeId)
    sessionStorage.setItem(HELD_BILLS_KEY, JSON.stringify(remaining))
    setHeldBills(remaining)
    toast.success(`Resumed "${bill.name}"`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Coupon & Promotion state
  const [couponCodeInput, setCouponCodeInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<{
    promotion: {
      id: string
      name: string
      code: string | null
      type: 'percentage' | 'flat'
      value: number
      scope: string
      target_id: string | null
      min_order_amount: number | null
      max_discount_amount: number | null
      max_uses: number | null
      usage_count: number
      valid_from: string | null
      valid_until: string | null
      is_active: boolean
    }
    discountAmount: number
  } | null>(null)
  const [showCouponModal, setShowCouponModal] = useState(false)

  const { data: promotions = [] } = useQuery({
    queryKey: ['promotions', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('promotions')
        .select('*')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  const applyCoupon = (target: string | any) => {
    let promo: any
    if (typeof target === 'string') {
      const cleanCode = target.trim().toUpperCase()
      if (!cleanCode) return
      promo = promotions.find((p) => (p.code || '').toUpperCase() === cleanCode || p.name.toUpperCase() === cleanCode)
      if (!promo) {
        toast.error('Invalid Coupon', `Coupon code "${target}" not found or inactive.`)
        return
      }
    } else {
      promo = target
    }

    const now = new Date()
    if (promo.valid_from && new Date(promo.valid_from) > now) {
      toast.error('Coupon Not Started', `Coupon starts on ${new Date(promo.valid_from).toLocaleDateString('en-IN')}`)
      return
    }
    if (promo.valid_until && new Date(promo.valid_until) < now) {
      toast.error('Coupon Expired', `Coupon expired on ${new Date(promo.valid_until).toLocaleDateString('en-IN')}`)
      return
    }

    if (promo.max_uses !== null && (promo.usage_count || 0) >= promo.max_uses) {
      toast.error('Coupon Limit Reached', 'This coupon has reached its maximum usage limit.')
      return
    }

    const cartSubtotal = cart.reduce((sum, item) => sum + item.unit_price * item.qty, 0)

    if (promo.min_order_amount && cartSubtotal < promo.min_order_amount) {
      toast.error(
        'Minimum Order Required',
        `Coupon "${promo.code || promo.name}" requires a minimum order of ${formatINR(promo.min_order_amount)}. (Cart total: ${formatINR(cartSubtotal)})`
      )
      return
    }

    let discount = 0
    if (promo.scope === 'order' || promo.scope === 'store') {
      if (promo.type === 'percentage') {
        discount = (cartSubtotal * promo.value) / 100
      } else {
        discount = promo.value
      }
    } else if (promo.scope === 'product' && promo.target_id) {
      const matchingItems = cart.filter((it) => it.product_id === promo.target_id)
      if (!matchingItems.length) {
        toast.error('Coupon Not Applicable', 'Cart does not contain the required product for this coupon.')
        return
      }
      const productTotal = matchingItems.reduce((sum, it) => sum + it.unit_price * it.qty, 0)
      discount = promo.type === 'percentage' ? (productTotal * promo.value) / 100 : promo.value
    } else if (promo.scope === 'category' && promo.target_id) {
      const matchingItems = cart.filter((it) => (it as any).category_id === promo.target_id)
      if (!matchingItems.length) {
        toast.error('Coupon Not Applicable', 'Cart does not contain products from the required category for this coupon.')
        return
      }
      const categoryTotal = matchingItems.reduce((sum, it) => sum + it.unit_price * it.qty, 0)
      discount = promo.type === 'percentage' ? (categoryTotal * promo.value) / 100 : promo.value
    }

    if (promo.max_discount_amount && discount > promo.max_discount_amount) {
      discount = promo.max_discount_amount
    }

    discount = Math.min(discount, cartSubtotal)

    if (discount <= 0) {
      toast.error('Coupon Not Applicable', 'Calculated discount is ₹0 for current cart items.')
      return
    }

    setOrderDiscountType('flat')
    setOrderDiscountValue(discount.toFixed(2))
    setAppliedCoupon({
      promotion: promo,
      discountAmount: discount,
    })
    setShowCouponModal(false)
    setCouponCodeInput('')
    toast.success('Coupon Applied!', `Coupon "${promo.code || promo.name}" saved you ${formatINR(discount)}.`)
  }

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

  // GST context
  const gstContext: GSTContext = useMemo(() => ({
    shopStateCode: org?.state_code ?? 'TN',
    customerStateCode: selectedCustomer?.state_code ?? undefined,
    taxInclusive: org?.branding?.tax_inclusive ?? false,
  }), [org?.state_code, org?.branding?.tax_inclusive, selectedCustomer?.state_code])

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
        round_off_amount: 0,
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

  // Final totals with loyalty redemption & dynamic round-off applied
  const totals = useMemo(() => {
    const loyaltyTotals = (!redeemLoyalty || resolvedLoyaltyRedeemValue <= 0)
      ? discountedTotals
      : applyLoyaltyRedemption(discountedTotals, resolvedLoyaltyRedeemValue)

    return applyRoundOff(
      loyaltyTotals,
      (org as any)?.invoice_template?.enable_round_off ?? true,
      (org as any)?.invoice_template?.round_off_type,
    )
  }, [discountedTotals, redeemLoyalty, resolvedLoyaltyRedeemValue, org])

  // Line totals per item
  const lineTotals = useMemo(() => {
    const interstate = totals.is_interstate
    const taxInclusive = org?.branding?.tax_inclusive ?? false
    return cart.map((item) => {
      const lt = computeLineTax(
        item.unit_price,
        item.qty,
        item.discount_pct,
        item.tax_rate,
        interstate,
        item.discount_type,
        item.discount_amount,
        taxInclusive,
      )
      return lt.lineTotal
    })
  }, [cart, totals.is_interstate, org?.branding?.tax_inclusive])

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['billing-products', orgId, productSearch],
    enabled: !!orgId,
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('id, name, price, tax_rate, hsn_code, barcode_value, track_stock, inventory(stock_qty), unit:unit_id(id, name, symbol, allow_decimal), secondary_unit:secondary_unit_id(id, name, symbol, allow_decimal), conversion_factor')
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
        .select('id, name, phone, gstin, address')
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

  // Add item to cart by product data
  // Supabase returns single-row FK joins (inventory, unit, secondary_unit) as an object or a
  // 1-element array depending on how the relation was declared — normalize both shapes here.
  const getStock = (inv: unknown): number => {
    if (!inv) return 0
    if (Array.isArray(inv)) return (inv[0] as { stock_qty: number })?.stock_qty ?? 0
    return (inv as { stock_qty: number })?.stock_qty ?? 0
  }

  const getUnit = (u: unknown): Unit | undefined => {
    if (!u) return undefined
    return (Array.isArray(u) ? u[0] : u) as Unit | undefined
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
    unit?: unknown
    secondary_unit?: unknown
    conversion_factor?: number | null
  }) => {
    const stock = getStock(product.inventory)
    const unit = getUnit(product.unit)
    const secondaryUnit = getUnit(product.secondary_unit)
    const allowNegativeStock = (org as any)?.feature_flags?.allow_negative_stock ?? false

    if (!allowNegativeStock && product.track_stock && stock <= 0) {
      toast.error(`Out of stock: ${product.name}`, 'Negative stock billing is disabled in Settings > Inventory.')
      return
    }

    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === product.id)
      if (existing) {
        if (!allowNegativeStock && product.track_stock && existing.qty >= stock) {
          toast.error(`Insufficient stock: ${product.name}`, `Only ${stock} units available in inventory.`)
          return prev
        }
        // Existing-line increment respects the unit's step (1 for count-based, 0.1 for
        // decimal-allowed units like Kg) — first add below always starts at a full 1 unit.
        const step = qtyStepForUnit(existing.unit?.allow_decimal ?? false)
        return prev.map((c) =>
          c.product_id === product.id ? { ...c, qty: c.qty + step } : c,
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
        unit,
        secondary_unit: secondaryUnit,
        conversion_factor: product.conversion_factor ?? undefined,
      }
      return [...prev, newItem]
    })
    setProductSearch('')
  }, [])

  // USB scanner keyboard wedge handler
  const handleBarcodeScan = useCallback(
    (code: string) => {
      const found = products?.find((p) => p.barcode_value === code)
      if (found) {
        addToCart(found)
      } else {
        toast({ title: `Product not found: ${code}`, variant: 'warning' })
      }
    },
    [products, addToCart],
  )
  const { inputRef: scanInputRef, handleKeyDown: handleScanKeydown, focusInput: focusScanInput } = useBarcodeScanner(handleBarcodeScan)

  const updateQty = useCallback((productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.product_id !== productId))
      return
    }
    setCart((prev) =>
      prev.map((c) => (c.product_id === productId ? { ...c, qty } : c)),
    )
  }, [])

  // Switches which unit a cart line is being rung up in (base vs secondary, e.g. Piece vs Box).
  // Purely a display/entry convenience — sale_items.qty is always persisted in the product's
  // base unit (see createSale's item-building below), so this never touches what's stored.
  const updateSellingUnit = useCallback((productId: string, unitId: string) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.product_id !== productId) return c
        // Switching units resets the line to "1 of the new unit" rather than carrying over
        // a converted fractional qty (e.g. 1 Piece becoming 0.083 Box) — matches the same
        // "first add always starts at 1" convention used when a product first enters the cart.
        const isSecondary = unitId === c.secondary_unit?.id
        const nextQty = isSecondary
          ? toBaseQty(1, { unitId: c.unit?.id ?? '', secondaryUnitId: c.secondary_unit?.id, conversionFactor: c.conversion_factor })
          : 1
        return { ...c, selling_unit_id: unitId, qty: nextQty }
      }),
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

      const operatorName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
      const roleLabel = role ? (role.charAt(0).toUpperCase() + role.slice(1)) : 'Cashier'
      const operatorWithRole = `${operatorName} (${roleLabel})`

      const result = await createSale(supabase as Parameters<typeof createSale>[0], {
        organization_id: orgId,
        customer_id: selectedCustomer?.id,
        items: cart,
        ...paymentFields,
        gst_context: gstContext,
        created_by: user.id,
        billed_by_name: operatorWithRole,
        invoice_template: (org as any)?.invoice_template,
        order_discount_type: resolvedOrderDiscountValue > 0 ? orderDiscountType : undefined,
        order_discount_value: resolvedOrderDiscountValue > 0 ? resolvedOrderDiscountValue : undefined,
        loyalty_customer_id: loyaltyCustomerId,
        loyalty_points_redeemed: redeemLoyalty && totals.loyalty_redeem_amount > 0 && loyaltyCustomer && loyaltySettings?.rupees_per_point
          ? Math.min(loyaltyCustomer.points_balance, Math.round(totals.loyalty_redeem_amount / loyaltySettings.rupees_per_point))
          : undefined,
        loyalty_redeem_amount: redeemLoyalty && totals.loyalty_redeem_amount > 0 ? totals.loyalty_redeem_amount : undefined,
        loyalty_points_earned: pointsToEarn > 0 ? pointsToEarn : undefined,
      })

      if (appliedCoupon?.promotion?.id) {
        try {
          await supabase
            .from('promotions')
            .update({ usage_count: (appliedCoupon.promotion.usage_count || 0) + 1 })
            .eq('id', appliedCoupon.promotion.id)
        } catch {}
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
      setAppliedCoupon(null)
      setCouponCodeInput('')
      setRedeemLoyalty(false)
      setLoyaltyRedeemValue('')
      queryClient.invalidateQueries({ queryKey: ['billing-products', orgId] })
      queryClient.invalidateQueries({ queryKey: ['today-summary', orgId] })
      queryClient.invalidateQueries({ queryKey: ['loyalty-customer', orgId] })
      queryClient.invalidateQueries({ queryKey: ['promotions', orgId] })
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
            {products
              ?.filter((product) => {
                const showOutOfStock = (org as any)?.feature_flags?.show_out_of_stock_in_billing ?? true
                if (showOutOfStock) return true
                if (!product.track_stock) return true
                return getStock(product.inventory) > 0
              })
              .map((product) => {
                const stock = getStock(product.inventory)
                const allowNegativeStock = (org as any)?.feature_flags?.allow_negative_stock ?? false
                const lowStockThreshold = (org as any)?.feature_flags?.low_stock_threshold ?? 10
                const isOutOfStock = product.track_stock && stock <= 0
                const isLowStock = product.track_stock && stock > 0 && stock <= lowStockThreshold
                const isDisabled = !allowNegativeStock && isOutOfStock

                return (
                  <button
                    key={product.id}
                    onClick={() => (!isDisabled || allowNegativeStock) && addToCart(product)}
                    disabled={isDisabled}
                    className={cn(
                      'relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all',
                      isDisabled
                        ? 'border-zinc-800 bg-zinc-900/30 opacity-50 cursor-not-allowed'
                        : 'border-zinc-800 bg-card hover:border-indigo-500 hover:bg-indigo-600/5 active:scale-95 cursor-pointer',
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
                        {isOutOfStock ? (
                          <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Out of stock</Badge>
                        ) : isLowStock ? (
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
                onSellingUnitChange={updateSellingUnit}
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
                  onChange={(e) => {
                    setOrderDiscountValue(e.target.value)
                    setAppliedCoupon(null)
                  }}
                  className="h-5 w-14 rounded border border-zinc-700 bg-zinc-900 px-1 text-center text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Coupon / Promo Code Section */}
              <div className="pt-1.5 border-t border-zinc-800/60">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-emerald-950/50 border border-emerald-800/60 rounded px-2 py-1 text-xs text-emerald-400">
                    <span className="flex items-center gap-1.5 font-medium truncate">
                      <Tag className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">Coupon {appliedCoupon.promotion.code || appliedCoupon.promotion.name}</span>
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-1">
                      <span className="font-bold">-{formatINR(appliedCoupon.discountAmount)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setAppliedCoupon(null)
                          setOrderDiscountValue('')
                          toast.success('Coupon removed')
                        }}
                        className="text-emerald-400/70 hover:text-emerald-200"
                        title="Remove Coupon"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <div className="relative flex-1">
                        <Tag className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500" />
                        <input
                          type="text"
                          placeholder="Coupon Code..."
                          value={couponCodeInput}
                          onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              applyCoupon(couponCodeInput)
                            }
                          }}
                          className="h-6 w-full rounded border border-zinc-700 bg-zinc-900 pl-6 pr-1 text-[11px] text-zinc-100 uppercase focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-6 px-2 text-[10px] font-semibold"
                        onClick={() => applyCoupon(couponCodeInput)}
                        disabled={!couponCodeInput.trim()}
                      >
                        Apply
                      </Button>
                      {promotions.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/40"
                          onClick={() => setShowCouponModal(true)}
                          title="Browse Active Coupons"
                        >
                          <Sparkles className="h-3 w-3 mr-0.5" />
                          Coupons
                        </Button>
                      )}
                    </div>
                  </div>
                )}
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
                shopPan={org?.pan}
                shopLogoUrl={org?.branding?.logo_url}
                shopPhone={org?.phone}
                shopEmail={org?.email}
                customerName={selectedCustomer?.name}
                customerPhone={selectedCustomer?.phone ?? undefined}
                customerGstin={selectedCustomer?.gstin ?? undefined}
                customerAddress={selectedCustomer?.address ?? undefined}
                items={completedSale.items}
                totals={completedSale.totals}
                paymentMode={completedSale.paymentMode}
                paymentDetail={completedSale.paymentDetail}
                branding={org?.branding}
                invoiceTemplate={(org as any)?.invoice_template}
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

      {/* Browse Coupons Modal */}
      <Dialog open={showCouponModal} onOpenChange={setShowCouponModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4 text-indigo-400" />
              Available Promotions &amp; Coupons
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {promotions.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-6">No active promotions or coupons available.</p>
            ) : (
              promotions.map((promo) => {
                const discountText =
                  promo.type === 'percentage'
                    ? `${promo.value}% OFF`
                    : `${formatINR(promo.value)} OFF`

                const scopeText =
                  promo.scope === 'order' || promo.scope === 'store'
                    ? 'Entire Bill'
                    : promo.scope === 'product'
                    ? 'Selected Product'
                    : 'Selected Category'

                return (
                  <div
                    key={promo.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/30 hover:border-indigo-500/50 transition-colors gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                          {promo.code || promo.name}
                        </span>
                        <span className="text-xs font-semibold text-emerald-400">{discountText}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 truncate">
                        Scope: {scopeText}
                        {promo.min_order_amount ? ` · Min: ${formatINR(promo.min_order_amount)}` : ''}
                        {promo.max_discount_amount ? ` · Max: ${formatINR(promo.max_discount_amount)}` : ''}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      className="h-7 text-xs font-semibold shrink-0"
                      onClick={() => applyCoupon(promo)}
                    >
                      Apply
                    </Button>
                  </div>
                )
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowCouponModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
