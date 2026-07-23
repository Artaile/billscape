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
} from 'lucide-react'
import JsBarcode from 'jsbarcode'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { ProductSchema, type ProductInput } from '@billscape/core'
import { generateBarcode } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
      tax_rate: 18,
      price: 0,
      cost_price: 0,
      barcode_value: '',
      track_stock: true,
    },
  })

  const trackStock = watch('track_stock')
  const barcodeValue = watch('barcode_value')

  // Fetch existing product for edit
  const { data: existingProduct } = useQuery({
    queryKey: ['product', id],
    enabled: isEdit && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
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
        barcode_value: existingProduct.barcode_value ?? '',
        track_stock: existingProduct.track_stock,
      })
      if (existingProduct.image_url) setImagePreview(existingProduct.image_url)
      if (existingProduct.category_id) setCategoryId(existingProduct.category_id)
      if ((existingProduct as any).has_variants) setHasVariants(true)
      if ((existingProduct as any).has_batches) setHasBatches(true)
      if ((existingProduct as any).brand) setBrand((existingProduct as any).brand)
    }
  }, [existingProduct, reset])

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
    const printWindow = window.open('', '_blank', 'width=400,height=300')
    if (!printWindow) return
    const bc = barcodeValue ?? ''
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Product Label</title>
          <style>
            @page { size: 58mm 40mm; margin: 0; }
            body { margin: 0; padding: 4mm; font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 32mm; }
            h3 { font-size: 9px; margin: 0 0 2mm; text-align: center; max-width: 50mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            svg { width: 50mm; height: 18mm; }
            p { font-size: 8px; margin: 1mm 0 0; }
          </style>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3/dist/JsBarcode.all.min.js"></script>
        </head>
        <body>
          <h3>${watch('name')}</h3>
          <svg id="barcode"></svg>
          <p>₹${watch('price')}</p>
          <script>
            JsBarcode('#barcode', '${bc}', { format: 'CODE128', width: 1, height: 30, displayValue: true, fontSize: 8 });
            window.onload = () => { window.print(); window.close(); };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
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
        barcode_value: values.barcode_value || null,
        track_stock: values.track_stock,
        image_url: imageUrl,
        is_active: true,
        category_id: categoryId || null,
        has_variants: hasVariants,
        has_batches: hasBatches,
        brand: brand.trim() || null,
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', orgId] })
      toast.success(isEdit ? 'Product updated' : 'Product created')
      navigate('/products')
    },
    onError: (err: Error) => {
      toast.error('Save failed', err.message)
    },
  })

  const [initialStock, setInitialStock] = useState(0)

  const onSubmit = handleSubmit((values) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    saveMutation.mutate({ ...(values as any), initialStock })
  })

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/products')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold text-white">
          {isEdit ? 'Edit Product' : 'Add Product'}
        </h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300">Basic Information</h2>

          <div className="space-y-1.5">
            <Label htmlFor="name">Product Name *</Label>
            <Input id="name" placeholder="e.g. Tata Salt 1kg" {...register('name')} />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
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
                  className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
          <h2 className="text-sm font-semibold text-zinc-300">Pricing & Tax</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="price">Selling Price (₹) *</Label>
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
            <h2 className="text-sm font-semibold text-zinc-300">Inventory</h2>
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

          {trackStock && !isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="initialStock">Opening Stock Qty</Label>
              <Input
                id="initialStock"
                type="number"
                min="0"
                value={initialStock}
                onChange={(e) => setInitialStock(Number(e.target.value))}
                placeholder="0"
              />
            </div>
          )}
        </div>

        {/* Product Variants */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-300">Product Variants</h2>
            </div>
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
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-300">Batch & Expiry Tracking</h2>
            </div>
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
                <span className="col-span-2">Batch No</span>
                <span>Expiry Date</span>
                <span>Qty</span>
                <span></span>
              </div>
              {batches.map((b, i) => (
                <div key={i} className="grid grid-cols-5 gap-2 items-center">
                  <Input
                    placeholder="BATCH-001"
                    value={b.batch_no}
                    onChange={(e) => setBatches((prev) => prev.map((x, j) => j === i ? { ...x, batch_no: e.target.value } : x))}
                    className="h-8 text-xs col-span-2"
                  />
                  <Input
                    type="date"
                    value={b.expiry_date}
                    onChange={(e) => setBatches((prev) => prev.map((x, j) => j === i ? { ...x, expiry_date: e.target.value } : x))}
                    className="h-8 text-xs"
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
              ))}
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
          <h2 className="text-sm font-semibold text-zinc-300">Barcode</h2>
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
          <h2 className="text-sm font-semibold text-zinc-300">Product Image</h2>
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

        {/* Submit */}
        <div className="flex gap-3">
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
      </form>
    </div>
  )
}
