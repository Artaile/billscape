import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Loader2,
  Upload,
  Printer,
  RefreshCw,
  Package,
  Plus,
  Trash2,
  Layers,
  CalendarClock,
  IndianRupee,
  Boxes,
  QrCode,
  Image as ImageIcon,
  Eye,
  Ruler,
} from 'lucide-react'
import JsBarcode from 'jsbarcode'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { ProductSchema, type ProductInput, formatINR } from '@billscape/core'
import { getUnits } from '@billscape/api'
import { generateBarcode } from '@/lib/utils'
import { printBarcodeLabel } from '@/lib/printBarcodeLabel'
import { logActivity } from '@/lib/activityLog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const GST_RATES = [0, 5, 12, 18, 28] as const

export function ProductFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const queryClient = useQueryClient()
  const { org } = useAuth()
  const orgId = org?.id

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string>('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)
  const barcodeRef = useRef<SVGSVGElement>(null)

  const [brand, setBrand] = useState('')

  // Variants state
  const [hasVariants, setHasVariants] = useState(false)
  const [variants, setVariants] = useState<{ size: string; color: string; price_delta: number; stock_qty: number; barcode_value: string }[]>([])

  // Batch tracking state
  const [hasBatches, setHasBatches] = useState(false)
  const [batches, setBatches] = useState<{ batch_no: string; expiry_date: string; qty: number; cost_price: number }[]>([])

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(ProductSchema) as any,
    defaultValues: {
      name: '',
      sku: '',
      hsn_code: '',
      tax_rate: (org?.branding?.default_gst_rate as 0 | 5 | 12 | 18 | 28) ?? 18,
      price: 0,
      cost_price: 0,
      mrp: undefined,
      special_price: undefined,
      barcode_value: '',
      track_stock: (org as any)?.feature_flags?.enable_stock_tracking ?? true,
      unit_id: '',
      secondary_unit_id: undefined,
      conversion_factor: undefined,
    },
  })

  const trackStock = watch('track_stock')
  const barcodeValue = watch('barcode_value')
  const watchedName = watch('name')
  const watchedPrice = watch('price')
  const watchedCostPrice = watch('cost_price')
  const watchedMrp = watch('mrp')
  const watchedTaxRate = watch('tax_rate')
  const watchedSku = watch('sku')
  const watchedUnitId = watch('unit_id')
  const watchedSecondaryUnitId = watch('secondary_unit_id')
  const watchedConversionFactor = watch('conversion_factor')

  const [hasSecondaryUnit, setHasSecondaryUnit] = useState(false)

  const { data: units } = useQuery({
    queryKey: ['units', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await getUnits(supabase, orgId!)
      if (error) throw error
      return data ?? []
    },
  })

  // Fetch existing product for edit
  const { data: existingProduct } = useQuery({
    queryKey: ['product', id],
    enabled: isEdit && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, inventory(stock_qty)')
        .eq('id', id!)
        .eq('organization_id', orgId!)
        .single()
      if (error) throw error
      return data
    },
  })

  const { data: categories, refetch: refetchCategories } = useQuery({
    queryKey: ['categories', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('categories')
        .select('id, name')
        .eq('organization_id', orgId!)
        .order('name')
      return data ?? []
    },
  })

  const selectedCategoryName = categories?.find((c) => c.id === categoryId)?.name
  const selectedUnitSymbol = units?.find((u: any) => u.id === watchedUnitId)?.symbol

  const addCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('categories')
        .insert({ organization_id: orgId!, name })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      setCategoryId(data.id)
      setNewCategoryName('')
      setShowNewCategory(false)
      refetchCategories()
      toast.success('Category added')
    },
    onError: (err: Error) => toast.error('Failed to add category', err.message),
  })

  // Load existing variants when editing
  const { data: existingVariants } = useQuery({
    queryKey: ['product_variants', id],
    enabled: isEdit && !!orgId && !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', id!)
        .eq('organization_id', orgId!)
        .order('created_at')
      return data ?? []
    },
  })

  // Load existing batches when editing
  const { data: existingBatches } = useQuery({
    queryKey: ['inventory_batches', id],
    enabled: isEdit && !!orgId && !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory_batches')
        .select('*')
        .eq('product_id', id!)
        .eq('organization_id', orgId!)
        .order('expiry_date')
      return data ?? []
    },
  })

  useEffect(() => {
    if (existingProduct) {
      reset({
        name: existingProduct.name,
        sku: existingProduct.sku ?? '',
        hsn_code: existingProduct.hsn_code ?? '',
        tax_rate: existingProduct.tax_rate as 0 | 5 | 12 | 18 | 28,
        price: existingProduct.price,
        cost_price: existingProduct.cost_price,
        mrp: existingProduct.mrp ?? undefined,
        special_price: existingProduct.special_price ?? undefined,
        barcode_value: existingProduct.barcode_value ?? '',
        track_stock: existingProduct.track_stock,
        unit_id: (existingProduct as any).unit_id ?? '',
        secondary_unit_id: (existingProduct as any).secondary_unit_id ?? undefined,
        conversion_factor: (existingProduct as any).conversion_factor ?? undefined,
      })
      if (existingProduct.image_url) setImagePreview(existingProduct.image_url)
      if (existingProduct.category_id) setCategoryId(existingProduct.category_id)
      if ((existingProduct as any).has_variants) setHasVariants(true)
      if ((existingProduct as any).has_batches) setHasBatches(true)
      if ((existingProduct as any).brand) setBrand((existingProduct as any).brand)
      if ((existingProduct as any).secondary_unit_id) setHasSecondaryUnit(true)

      const inv = (existingProduct as any).inventory
      if (inv) {
        if (Array.isArray(inv) && inv.length > 0) {
          setInitialStock(inv[0].stock_qty)
        } else if (!Array.isArray(inv)) {
          setInitialStock(inv.stock_qty)
        }
      }
    }
  }, [existingProduct, reset])

  // Default a new product's unit to the org's "Piece" row once units load — only for the
  // create flow (isEdit's unit_id comes from existingProduct above, don't stomp it).
  useEffect(() => {
    if (!isEdit && units && units.length > 0 && !watchedUnitId) {
      const piece = units.find((u: any) => u.name === 'Piece')
      setValue('unit_id', piece?.id ?? units[0].id)
    }
  }, [isEdit, units, watchedUnitId, setValue])

  useEffect(() => {
    if (existingVariants && existingVariants.length > 0) {
      setVariants(existingVariants.map((v: any) => ({
        size: v.size ?? '',
        color: v.color ?? '',
        price_delta: v.price_delta ?? 0,
        stock_qty: v.stock_qty ?? 0,
        barcode_value: v.barcode_value ?? '',
      })))
    }
  }, [existingVariants])

  useEffect(() => {
    if (existingBatches && existingBatches.length > 0) {
      setBatches(existingBatches.map((b: any) => ({
        batch_no: b.batch_no ?? '',
        expiry_date: b.expiry_date ?? '',
        qty: b.qty ?? 0,
        cost_price: b.cost_price ?? 0,
      })))
    }
  }, [existingBatches])

  // Render barcode SVG
  useEffect(() => {
    if (barcodeValue && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, barcodeValue, {
          format: 'CODE128',
          width: 1.5,
          height: 40,
          displayValue: true,
          fontSize: 10,
          background: 'transparent',
          lineColor: '#e4e4e7',
          fontOptions: 'bold',
        })
      } catch {
        // Invalid barcode value
      }
    }
  }, [barcodeValue])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleAutoGenerateBarcode = () => {
    const code = generateBarcode()
    setValue('barcode_value', code, { shouldValidate: true })
  }

  const handlePrintLabel = () => {
    printBarcodeLabel(watch('name'), barcodeValue ?? '', watch('price'))
  }

  const saveMutation = useMutation({
    mutationFn: async (values: ProductInput & { initialStock?: number }) => {
      let imageUrl = existingProduct?.image_url ?? null

      if (imageFile && orgId) {
        const ext = imageFile.name.split('.').pop()
        const path = `${orgId}/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('product-images')
          .upload(path, imageFile, { upsert: true })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path)
          imageUrl = urlData.publicUrl
        }
      }

      const productData = {
        organization_id: orgId!,
        name: values.name,
        sku: values.sku || null,
        hsn_code: values.hsn_code || null,
        tax_rate: values.tax_rate,
        price: values.price,
        cost_price: values.cost_price,
        mrp: values.mrp ?? null,
        special_price: values.special_price ?? null,
        barcode_value: values.barcode_value || null,
        track_stock: values.track_stock,
        image_url: imageUrl,
        is_active: true,
        category_id: categoryId || null,
        has_variants: hasVariants,
        has_batches: hasBatches,
        brand: brand.trim() || null,
        unit_id: values.unit_id,
        secondary_unit_id: hasSecondaryUnit ? values.secondary_unit_id || null : null,
        conversion_factor: hasSecondaryUnit ? values.conversion_factor ?? null : null,
      }

      let productId = id
      if (isEdit) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', id!)
          .eq('organization_id', orgId!)
        if (error) throw error
      } else {
        const { data: product, error } = await supabase
          .from('products')
          .insert(productData)
          .select()
          .single()
        if (error || !product) throw error
        productId = product.id
        if (values.track_stock) {
          await supabase.from('inventory').insert({
            product_id: product.id,
            organization_id: orgId!,
            stock_qty: values.initialStock ?? 0,
            reorder_level: 10, // Legacy fallback, actual threshold is global
          })
        }
      }

      if (isEdit && values.track_stock) {
        // Handle stock edit logic
        const { data: invCheck } = await supabase.from('inventory').select('id').eq('product_id', id!).single()
        if (invCheck) {
          await supabase.from('inventory').update({ stock_qty: values.initialStock ?? 0 }).eq('product_id', id!)
        } else {
          await supabase.from('inventory').insert({
            product_id: id!,
            organization_id: orgId!,
            stock_qty: values.initialStock ?? 0,
            reorder_level: 10,
          })
        }
      }

      // Save variants
      if (hasVariants && productId && variants.length > 0) {
        // Delete old variants then re-insert
        await supabase.from('product_variants').delete().eq('product_id', productId).eq('organization_id', orgId!)
        const validVariants = variants.filter((v) => v.size || v.color)
        if (validVariants.length > 0) {
          await supabase.from('product_variants').insert(
            validVariants.map((v) => ({
              product_id: productId!,
              organization_id: orgId!,
              size: v.size || null,
              color: v.color || null,
              price_delta: v.price_delta ?? 0,
              stock_qty: v.stock_qty ?? 0,
              barcode_value: v.barcode_value || null,
            }))
          )
        }
      }

      // Save batches
      if (hasBatches && productId && batches.length > 0) {
        const validBatches = batches.filter((b) => b.batch_no.trim())
        if (validBatches.length > 0) {
          // Upsert by batch_no — delete existing then insert
          await supabase.from('inventory_batches').delete().eq('product_id', productId).eq('organization_id', orgId!)
          await supabase.from('inventory_batches').insert(
            validBatches.map((b) => ({
              product_id: productId!,
              organization_id: orgId!,
              batch_no: b.batch_no,
              expiry_date: b.expiry_date || null,
              qty: b.qty ?? 0,
              cost_price: b.cost_price ?? 0,
            }))
          )
        }
      }

      await logActivity({
        organizationId: orgId!,
        action: isEdit ? 'updated' : 'created',
        entity: 'product',
        entityId: productId,
        metadata: {
          name: values.name,
          sku: values.sku,
          price: values.price,
          barcode: values.barcode_value,
          stock: values.initialStock,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', orgId] })
      queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
      toast.success(isEdit ? 'Product updated' : 'Product created')
      navigate('/products')
    },
    onError: (err: Error) => {
      toast.error('Save failed', err.message)
    },
  })

  const [initialStock, setInitialStock] = useState(0)

  const onSubmit = handleSubmit((values) => {
    if (hasVariants) {
      if (variants.some((v) => !v.size.trim() && !v.color.trim() && (v.price_delta || v.stock_qty))) {
        toast.error('Incomplete variant', 'Each variant row needs a Size or Color — remove empty rows before saving.')
        return
      }
    }
    if (hasBatches) {
      const incompleteBatch = batches.find((b) => !b.batch_no.trim() || !b.expiry_date)
      if (incompleteBatch) {
        toast.error('Incomplete batch', 'Each batch row needs both a Batch No and an Expiry Date — remove empty rows or fill them in before saving.')
        return
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    saveMutation.mutate({ ...(values as any), initialStock })
  })

  const marginPct =
    watchedPrice > 0 && watchedCostPrice > 0
      ? ((watchedPrice - watchedCostPrice) / watchedPrice) * 100
      : null

  const validVariantCount = variants.filter((v) => v.size || v.color).length
  const validBatchCount = batches.filter((b) => b.batch_no.trim()).length

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/products')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-white">
            {isEdit ? 'Edit Product' : 'Add Product'}
          </h1>
          {isEdit && (watchedSku || existingProduct?.sku) && (
            <p className="text-xs font-mono text-indigo-300 mt-0.5">
              {watchedSku || existingProduct?.sku}
            </p>
          )}
        </div>
      </div>

      <form onSubmit={onSubmit} className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
        {/* Left column: form sections */}
        <div className="space-y-5 min-w-0">
          {/* Basic Info */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <Package className="h-4 w-4 text-indigo-400" />Basic Information
            </h2>

            <div className="space-y-1.5">
              <Label htmlFor="name">Product Name *</Label>
              <Input id="name" placeholder="e.g. Tata Salt 1kg" {...register('name')} />
              {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Category</Label>
                <a
                  href="/products/categories"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Manage categories
                </a>
              </div>
              {showNewCategory ? (
                <div className="flex gap-2">
                  <Input
                    placeholder="Category name"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (newCategoryName.trim()) addCategoryMutation.mutate(newCategoryName.trim())
                      }
                      if (e.key === 'Escape') setShowNewCategory(false)
                    }}
                    autoFocus
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!newCategoryName.trim() || addCategoryMutation.isPending}
                    onClick={() => newCategoryName.trim() && addCategoryMutation.mutate(newCategoryName.trim())}
                  >
                    {addCategoryMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewCategory(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="flex h-9 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">— No category —</option>
                    {categories?.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowNewCategory(true)}
                    title="Add new category"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sku">SKU</Label>
                <Input id="sku" placeholder="e.g. SALT-001" {...register('sku')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand">Brand</Label>
                <Input id="brand" placeholder="e.g. Samsung" value={brand} onChange={(e) => setBrand(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hsn_code">HSN Code</Label>
                <Input id="hsn_code" placeholder="e.g. 2501" {...register('hsn_code')} />
                {errors.hsn_code && <p className="text-xs text-red-400">{errors.hsn_code.message}</p>}
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <IndianRupee className="h-4 w-4 text-indigo-400" />Pricing & Tax
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="price">Retail Price (₹) *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...register('price', { valueAsNumber: true })}
                />
                {errors.price && <p className="text-xs text-red-400">{errors.price.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cost_price">Cost Price (₹)</Label>
                <Input
                  id="cost_price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...register('cost_price', { valueAsNumber: true })}
                />
                {errors.cost_price && <p className="text-xs text-red-400">{errors.cost_price.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mrp">MRP (₹)</Label>
                <Input
                  id="mrp"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...register('mrp', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
                />
                {errors.mrp && <p className="text-xs text-red-400">{errors.mrp.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="special_price">Special Price (₹)</Label>
                <Input
                  id="special_price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...register('special_price', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
                />
                {errors.special_price && <p className="text-xs text-red-400">{errors.special_price.message}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>GST Rate *</Label>
              <Controller
                name="tax_rate"
                control={control}
                render={({ field }) => (
                  <div className="flex gap-2 flex-wrap">
                    {GST_RATES.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => field.onChange(rate)}
                        className={cn(
                          'px-3 py-1.5 rounded-md text-sm font-medium border transition-all',
                          field.value === rate
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'border-zinc-700 text-zinc-400 hover:border-zinc-600',
                        )}
                      >
                        {rate}%
                      </button>
                    ))}
                  </div>
                )}
              />
            </div>
          </div>

          {/* Stock */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                <Boxes className="h-4 w-4 text-indigo-400" />Inventory
              </h2>
              <Controller
                name="track_stock"
                control={control}
                render={({ field }) => (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-zinc-400">Track Stock</span>
                    <div
                      onClick={() => field.onChange(!field.value)}
                      className={cn(
                        'relative h-5 w-9 rounded-full transition-colors cursor-pointer',
                        field.value ? 'bg-indigo-600' : 'bg-zinc-700',
                      )}
                    >
                      <div
                        className={cn(
                          'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                          field.value ? 'translate-x-4' : 'translate-x-0',
                        )}
                      />
                    </div>
                  </label>
                )}
              />
            </div>

            {trackStock && (
              <div className="space-y-1.5">
                <Label htmlFor="initialStock">
                  {isEdit ? 'Current Stock' : 'Opening Stock'}{selectedUnitSymbol ? ` (${selectedUnitSymbol})` : ' Qty'}
                </Label>
                <Input
                  id="initialStock"
                  type="number"
                  step="0.001"
                  min="0"
                  value={initialStock}
                  onChange={(e) => setInitialStock(Number(e.target.value))}
                  placeholder="0"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Unit *</Label>
                <button
                  type="button"
                  onClick={() => navigate('/settings')}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Manage units
                </button>
              </div>
              <select
                {...register('unit_id')}
                className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {!watchedUnitId && <option value="">— Select unit —</option>}
                {units?.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
                ))}
              </select>
              {errors.unit_id && <p className="text-xs text-red-400">{errors.unit_id.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <div
                  onClick={() => {
                    setHasSecondaryUnit((v) => !v)
                    if (hasSecondaryUnit) {
                      setValue('secondary_unit_id', undefined)
                      setValue('conversion_factor', undefined)
                    }
                  }}
                  className={cn(
                    'relative h-5 w-9 rounded-full transition-colors cursor-pointer',
                    hasSecondaryUnit ? 'bg-indigo-600' : 'bg-zinc-700',
                  )}
                >
                  <div className={cn('absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform', hasSecondaryUnit ? 'translate-x-4' : 'translate-x-0')} />
                </div>
                <span className="text-xs text-zinc-400">Sell in a different unit too</span>
              </label>

              {hasSecondaryUnit && (
                <div className="grid grid-cols-2 gap-3 pl-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Secondary Unit</Label>
                    <select
                      {...register('secondary_unit_id')}
                      className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">— Select unit —</option>
                      {units?.filter((u: any) => u.id !== watchedUnitId).map((u: any) => (
                        <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
                      ))}
                    </select>
                    {errors.secondary_unit_id && <p className="text-xs text-red-400">{errors.secondary_unit_id.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Conversion Factor</Label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="e.g. 12"
                      {...register('conversion_factor', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
                    />
                    {errors.conversion_factor && <p className="text-xs text-red-400">{errors.conversion_factor.message}</p>}
                  </div>
                  {watchedSecondaryUnitId && watchedConversionFactor ? (
                    <p className="col-span-2 text-xs text-zinc-500">
                      1 {units?.find((u: any) => u.id === watchedSecondaryUnitId)?.symbol} = {watchedConversionFactor} {selectedUnitSymbol}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* Product Variants */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                <Layers className="h-4 w-4 text-indigo-400" />Product Variants
              </h2>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-zinc-400">Enable</span>
                <div
                  onClick={() => {
                    setHasVariants((v) => !v)
                    if (!hasVariants && variants.length === 0) {
                      setVariants([{ size: '', color: '', price_delta: 0, stock_qty: 0, barcode_value: '' }])
                    }
                  }}
                  className={cn(
                    'relative h-5 w-9 rounded-full transition-colors cursor-pointer',
                    hasVariants ? 'bg-indigo-600' : 'bg-zinc-700',
                  )}
                >
                  <div className={cn('absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform', hasVariants ? 'translate-x-4' : 'translate-x-0')} />
                </div>
              </label>
            </div>

            {hasVariants && (
              <div className="space-y-2">
                <div className="grid grid-cols-5 gap-2 text-xs text-zinc-500 px-1">
                  <span>Size</span>
                  <span>Color</span>
                  <span>Price +/-</span>
                  <span>Stock</span>
                  <span></span>
                </div>
                {variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-5 gap-2 items-center">
                    <Input
                      placeholder="S / M / L"
                      value={v.size}
                      onChange={(e) => setVariants((prev) => prev.map((x, j) => j === i ? { ...x, size: e.target.value } : x))}
                      className="h-8 text-xs"
                    />
                    <Input
                      placeholder="Red / Blue"
                      value={v.color}
                      onChange={(e) => setVariants((prev) => prev.map((x, j) => j === i ? { ...x, color: e.target.value } : x))}
                      className="h-8 text-xs"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={v.price_delta}
                      onChange={(e) => setVariants((prev) => prev.map((x, j) => j === i ? { ...x, price_delta: Number(e.target.value) } : x))}
                      className="h-8 text-xs"
                    />
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={v.stock_qty}
                      onChange={(e) => setVariants((prev) => prev.map((x, j) => j === i ? { ...x, stock_qty: Number(e.target.value) } : x))}
                      className="h-8 text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-400 hover:text-red-300"
                      onClick={() => setVariants((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setVariants((prev) => [...prev, { size: '', color: '', price_delta: 0, stock_qty: 0, barcode_value: '' }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Variant
                </Button>
              </div>
            )}
          </div>

          {/* Batch / Expiry Tracking */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                <CalendarClock className="h-4 w-4 text-indigo-400" />Batch & Expiry Tracking
              </h2>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-zinc-400">Enable</span>
                <div
                  onClick={() => {
                    setHasBatches((v) => !v)
                    if (!hasBatches && batches.length === 0) {
                      setBatches([{ batch_no: '', expiry_date: '', qty: 0, cost_price: 0 }])
                    }
                  }}
                  className={cn(
                    'relative h-5 w-9 rounded-full transition-colors cursor-pointer',
                    hasBatches ? 'bg-indigo-600' : 'bg-zinc-700',
                  )}
                >
                  <div className={cn('absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform', hasBatches ? 'translate-x-4' : 'translate-x-0')} />
                </div>
              </label>
            </div>

            {hasBatches && (
              <div className="space-y-2">
                <div className="grid grid-cols-5 gap-2 text-xs text-zinc-500 px-1">
                  <span className="col-span-2">Batch No *</span>
                  <span>Expiry Date *</span>
                  <span>Qty</span>
                  <span></span>
                </div>
                {batches.map((b, i) => {
                  const touched = b.batch_no.trim() || b.expiry_date || b.qty
                  const missingBatchNo = touched && !b.batch_no.trim()
                  const missingExpiry = touched && !b.expiry_date
                  return (
                  <div key={i} className="grid grid-cols-5 gap-2 items-center">
                    <Input
                      placeholder="BATCH-001"
                      value={b.batch_no}
                      onChange={(e) => setBatches((prev) => prev.map((x, j) => j === i ? { ...x, batch_no: e.target.value } : x))}
                      className={cn('h-8 text-xs col-span-2', missingBatchNo && 'border-red-500')}
                    />
                    <Input
                      type="date"
                      value={b.expiry_date}
                      onChange={(e) => setBatches((prev) => prev.map((x, j) => j === i ? { ...x, expiry_date: e.target.value } : x))}
                      className={cn('h-8 text-xs', missingExpiry && 'border-red-500')}
                    />
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={b.qty}
                      onChange={(e) => setBatches((prev) => prev.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))}
                      className="h-8 text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-400 hover:text-red-300"
                      onClick={() => setBatches((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  )
                })}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setBatches((prev) => [...prev, { batch_no: '', expiry_date: '', qty: 0, cost_price: 0 }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Batch
                </Button>
              </div>
            )}
          </div>

          {/* Barcode */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <QrCode className="h-4 w-4 text-indigo-400" />Barcode
            </h2>
            <div className="flex gap-2 max-w-sm">
              <Input
                placeholder="e.g. 8901234567890"
                {...register('barcode_value')}
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAutoGenerateBarcode}
                title="Auto-generate barcode"
                className="shrink-0"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {barcodeValue && (
              <div className="inline-flex flex-col items-center gap-2 p-3 rounded-lg bg-secondary border border-border">
                <svg ref={barcodeRef} className="max-w-[200px]" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePrintLabel}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Label (58×40mm)
                </Button>
              </div>
            )}
          </div>

          {/* Image */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <ImageIcon className="h-4 w-4 text-indigo-400" />Product Image
            </h2>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 shrink-0 rounded-lg border border-zinc-700 bg-zinc-800 overflow-hidden">
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-8 w-8 text-zinc-600" />
                  </div>
                )}
              </div>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />
                <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors">
                  <Upload className="h-4 w-4" />
                  {imageFile ? 'Change image' : 'Upload image'}
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Right column: sticky live preview */}
        <div className="space-y-5 lg:sticky lg:top-4">
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <Eye className="h-4 w-4 text-indigo-400" />Preview
            </h2>

            <div className="h-24 w-24 mx-auto rounded-lg border border-zinc-700 bg-zinc-800 overflow-hidden">
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Package className="h-8 w-8 text-zinc-600" />
                </div>
              )}
            </div>

            <div className="text-center">
              <p className={cn('text-sm font-semibold', watchedName ? 'text-white' : 'text-zinc-600 italic')}>
                {watchedName || 'Untitled product'}
              </p>
              {brand && <p className="text-xs text-zinc-500 mt-0.5">{brand}</p>}
            </div>

            <div className="flex items-center justify-center gap-2">
              <span className="text-lg font-bold text-indigo-300">{formatINR(watchedPrice || 0)}</span>
              {watchedMrp != null && watchedMrp > 0 && watchedMrp !== watchedPrice && (
                <span className="text-xs text-zinc-500 line-through">{formatINR(watchedMrp)}</span>
              )}
            </div>

            {marginPct != null && (
              <div className="flex justify-between items-center text-xs px-1">
                <span className="text-zinc-500">Margin</span>
                <span className={cn('font-semibold', marginPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {marginPct.toFixed(1)}%
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-indigo-700 text-indigo-300 bg-indigo-950/30">
                GST {watchedTaxRate}%
              </span>
              {selectedUnitSymbol && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-zinc-700 text-zinc-400 bg-zinc-800/60 flex items-center gap-1">
                  <Ruler className="h-2.5 w-2.5" />
                  {hasSecondaryUnit && watchedSecondaryUnitId && watchedConversionFactor
                    ? `${units?.find((u: any) => u.id === watchedSecondaryUnitId)?.symbol} · ${watchedConversionFactor} ${selectedUnitSymbol}`
                    : selectedUnitSymbol}
                </span>
              )}
              {selectedCategoryName && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-zinc-700 text-zinc-400 bg-zinc-800/60">
                  {selectedCategoryName}
                </span>
              )}
              {hasVariants && validVariantCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-zinc-700 text-zinc-400 bg-zinc-800/60">
                  {validVariantCount} variant{validVariantCount > 1 ? 's' : ''}
                </span>
              )}
              {hasBatches && validBatchCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-zinc-700 text-zinc-400 bg-zinc-800/60">
                  {validBatchCount} batch{validBatchCount > 1 ? 'es' : ''}
                </span>
              )}
            </div>

            <Separator />

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => navigate('/products')}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isSubmitting || saveMutation.isPending}>
                {isSubmitting || saveMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  isEdit ? 'Save Changes' : 'Add Product'
                )}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
