import React, { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, ChevronRight, Phone, Mail, CreditCard, X, Download, Upload, FileSpreadsheet, ArrowUpDown, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { formatDate, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { logActivity } from '@/lib/activityLog'
import { exportToCSV, parseCSV } from '@/lib/csvUtils'
import { usePlanLimits } from '@/hooks/usePlanLimits'
import { PlanLimitModal } from '@/components/common/PlanLimitModal'
import type { Customer } from '@billscape/core'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const INDIAN_STATES = [
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'MH', name: 'Maharashtra' },
  { code: 'DL', name: 'Delhi' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'WB', name: 'West Bengal' },
  { code: 'RJ', name: 'Rajasthan' },
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'TS', name: 'Telangana' },
  { code: 'KL', name: 'Kerala' },
  { code: 'MP', name: 'Madhya Pradesh' },
  { code: 'PB', name: 'Punjab' },
  { code: 'HR', name: 'Haryana' },
]

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)} ${digits.slice(5)}`
}

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z
    .string()
    .refine((v) => v === '' || v.replace(/\D/g, '').length === 10, 'Enter a valid 10-digit mobile number')
    .optional()
    .or(z.literal('')),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN')
    .optional()
    .or(z.literal('')),
  state_code: z.string().optional(),
  address: z.string().optional(),
  opening_balance: z.coerce.number().min(0, 'Must be positive').optional().default(0),
  opening_balance_type: z.enum(['to_collect', 'to_pay']).default('to_collect'),
})

type CustomerFormValues = z.infer<typeof customerSchema>

interface CustomerWithLastSale extends Customer {
  last_sale?: string
}

export function CustomersPage() {
  const { org } = useAuth()
  const orgId = org?.id

  const { limitModalOpen, setLimitModalOpen, limitInfo, checkQuota, handleInsertError } = usePlanLimits()

  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithLastSale | null>(null)

  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'balance-desc' | 'balance-asc' | 'date-newest' | 'date-oldest'>('name-asc')
  const [balanceFilter, setBalanceFilter] = useState('all')
  const [isImporting, setIsImporting] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema) as any,
  })

  const { data: rawCustomers = [], isLoading } = useQuery({
    queryKey: ['customers', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('organization_id', orgId!)
        .order('name')
      if (error) throw error
      return (data ?? []) as CustomerWithLastSale[]
    },
  })

  // Filter & Sort
  const customers = rawCustomers
    .filter((c) => {
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchSearch =
          c.name.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.gstin?.toLowerCase().includes(q)
        if (!matchSearch) return false
      }
      if (balanceFilter === 'due' && Number(c.balance ?? 0) <= 0) return false
      if (balanceFilter === 'advance' && Number(c.balance ?? 0) >= 0) return false
      if (balanceFilter === 'zero' && Number(c.balance ?? 0) !== 0) return false
      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return a.name.localeCompare(b.name)
        case 'name-desc':
          return b.name.localeCompare(a.name)
        case 'balance-desc':
          return Number(b.balance ?? 0) - Number(a.balance ?? 0)
        case 'balance-asc':
          return Number(a.balance ?? 0) - Number(b.balance ?? 0)
        case 'date-newest':
          return (b.created_at || '').localeCompare(a.created_at || '')
        case 'date-oldest':
          return (a.created_at || '').localeCompare(b.created_at || '')
        default:
          return 0
      }
    })

  const handleExportCSV = () => {
    if (!customers.length) {
      toast.error('No customers to export')
      return
    }
    const headers = ['Name', 'Phone', 'Email', 'GSTIN', 'State Code', 'Address', 'Current Balance']
    const rows = customers.map((c) => [
      c.name,
      c.phone ?? '',
      c.email ?? '',
      c.gstin ?? '',
      c.state_code ?? '',
      c.address ?? '',
      c.balance ?? 0,
    ])
    const dateStr = new Date().toISOString().slice(0, 10)
    exportToCSV(`customers-${dateStr}`, headers, rows)
    toast.success('Customers exported to CSV')
  }

  const handleDownloadTemplate = () => {
    const headers = ['Name', 'Phone', 'Email', 'GSTIN', 'State Code', 'Address', 'Opening Balance']
    const sampleRows = [
      ['Anand Textiles', '9876543210', 'anand@example.com', '33AAAAA0000A1Z5', 'TN', '123 Main St, Chennai', '1500'],
      ['Bala Traders', '9123456789', 'bala@example.com', '', 'TN', '45 Cross St, Madurai', '0'],
    ]
    exportToCSV('customers_import_template', headers, sampleRows)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !orgId) return
    setIsImporting(true)
    try {
      const records = await parseCSV(file)
      if (!records.length) {
        toast.error('Import Failed', 'CSV file is empty or invalid format')
        return
      }

      let importedCount = 0
      for (const row of records) {
        const name = row['name'] || row['customer name'] || row['party name'] || ''
        if (!name.trim()) continue

        const rawPhone = row['phone'] || row['mobile'] || row['phone number'] || ''
        const phoneDigits = rawPhone.replace(/\D/g, '').slice(0, 10)
        const email = row['email'] || row['email address'] || ''
        const gstin = row['gstin'] || row['gst'] || ''
        const stateCode = row['state code'] || row['state'] || ''
        const address = row['address'] || ''
        const balance = parseFloat(row['current balance'] || row['opening balance'] || row['balance'] || '0') || 0

        await supabase.from('customers').insert({
          organization_id: orgId,
          name: name.trim(),
          phone: phoneDigits || null,
          email: email.trim() || null,
          gstin: gstin.trim().toUpperCase() || null,
          state_code: stateCode.trim().toUpperCase() || null,
          address: address.trim() || null,
          balance: balance,
        })
        importedCount++
      }

      await queryClient.invalidateQueries({ queryKey: ['customers', orgId] })
      await logActivity({
        organizationId: orgId,
        action: 'imported',
        entity: 'customer',
        metadata: { count: importedCount, filename: file.name },
      })
      toast.success(`Import Complete`, `Successfully imported ${importedCount} customers!`)
    } catch (err: any) {
      toast.error('Import Failed', err.message || 'Failed to parse CSV file')
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Customer purchase history
  const { data: customerSales } = useQuery({
    queryKey: ['customer-sales', selectedCustomer?.id],
    enabled: !!selectedCustomer && !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('sales')
        .select('id, invoice_no, grand_total, payment_mode, created_at')
        .eq('organization_id', orgId!)
        .eq('customer_id', selectedCustomer!.id)
        .order('created_at', { ascending: false })
        .limit(20)
      return data ?? []
    },
  })

  const handleAddCustomerClick = async () => {
    const { allowed } = await checkQuota('customers')
    if (allowed) {
      setShowForm(true)
    }
  }

  const createMutation = useMutation({
    mutationFn: async (values: CustomerFormValues) => {
      const { allowed } = await checkQuota('customers')
      if (!allowed) throw new Error('Quota exceeded')

      const openBal = Number(values.opening_balance) || 0
      const initialBalance = values.opening_balance_type === 'to_pay' ? -openBal : openBal

      const { data: customer, error } = await supabase.from('customers').insert({
        organization_id: orgId!,
        name: values.name,
        phone: values.phone || null,
        email: values.email || null,
        gstin: values.gstin || null,
        state_code: values.state_code || null,
        address: values.address || null,
        balance: initialBalance,
      }).select().single()
      if (error) throw error

      await logActivity({
        organizationId: orgId!,
        action: 'created',
        entity: 'customer',
        entityId: customer?.id,
        metadata: {
          name: values.name,
          phone: values.phone,
          email: values.email,
          opening_balance: openBal,
          balance_type: values.opening_balance_type,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', orgId] })
      queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
      toast.success('Customer added')
      reset()
      setShowForm(false)
    },
    onError: (err: any) => {
      const handled = handleInsertError(err)
      if (!handled && err.message !== 'Quota exceeded') {
        toast.error('Failed to add customer', err.message)
      }
    },
  })

  return (
    <div className="p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Customers</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{customers.length} customers listed</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)} disabled={isImporting}>
            {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1 text-indigo-400" />}
            Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 mr-1 text-blue-400" /> Export CSV
          </Button>
          <Button onClick={handleAddCustomerClick}>
            <Plus className="h-4 w-4 mr-1" /> Add Customer
          </Button>
        </div>
      </div>

      {/* Filters & Sort Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search by name, phone, email or GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowUpDown className="h-3.5 w-3.5 text-indigo-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="flex h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-foreground"
            >
              <option value="name-asc">Sort: Name (A to Z)</option>
              <option value="name-desc">Sort: Name (Z to A)</option>
              <option value="balance-desc">Sort: Due Balance (High to Low)</option>
              <option value="balance-asc">Sort: Advance Balance (High to Low)</option>
              <option value="date-newest">Sort: Created (Newest)</option>
              <option value="date-oldest">Sort: Created (Oldest)</option>
            </select>
          </div>

          <select
            value={balanceFilter}
            onChange={(e) => setBalanceFilter(e.target.value)}
            className="flex h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-foreground"
          >
            <option value="all">All Balances</option>
            <option value="due">Pending Due (&gt; ₹0)</option>
            <option value="advance">Advance Credit (&lt; ₹0)</option>
            <option value="zero">Zero Balance (₹0)</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Last Purchase</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-zinc-800 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : customers && customers.length > 0 ? (
              customers.map((customer) => (
                <TableRow
                  key={customer.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedCustomer(customer)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-700 text-xs font-bold text-white">
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-zinc-100">{customer.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-zinc-400 flex items-center gap-1">
                      {customer.phone ? (
                        <>
                          <Phone className="h-3 w-3" />
                          {customer.phone}
                        </>
                      ) : (
                        '—'
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-zinc-400 flex items-center gap-1">
                      {customer.email ? (
                        <>
                          <Mail className="h-3 w-3" />
                          {customer.email}
                        </>
                      ) : (
                        '—'
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        'text-xs font-semibold px-2 py-0.5 rounded-full border',
                        (customer.balance ?? 0) > 0
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : (customer.balance ?? 0) < 0
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'text-zinc-500 border-transparent',
                      )}
                    >
                      {(customer.balance ?? 0) > 0
                        ? `Due: ${formatINR(customer.balance ?? 0)} (Dr)`
                        : (customer.balance ?? 0) < 0
                        ? `Adv: ${formatINR(Math.abs(customer.balance ?? 0))} (Cr)`
                        : 'Nil'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-zinc-500 text-sm">
                      {customer.last_sale ? formatDate(customer.last_sale) : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-zinc-600" />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-500 py-12">
                  No customers found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Customer Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((v: any) => createMutation.mutate(v))} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cust-name">Name *</Label>
              <Input id="cust-name" placeholder="Customer name" {...register('name')} />
              {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust-phone">Phone</Label>
                <Input
                  id="cust-phone"
                  inputMode="numeric"
                  placeholder="98765 43210"
                  maxLength={11}
                  {...register('phone', {
                    onChange: (e) => {
                      e.target.value = formatPhone(e.target.value)
                    },
                  })}
                />
                {errors.phone && <p className="text-xs text-red-400">{errors.phone.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-email">Email</Label>
                <Input id="cust-email" type="email" placeholder="email@example.com" {...register('email')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-gstin">GSTIN (optional)</Label>
              <Input id="cust-gstin" placeholder="33AABCU9603R1ZX" className="uppercase" {...register('gstin')} />
              {errors.gstin && <p className="text-xs text-red-400">{errors.gstin.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-state">State</Label>
              <select
                id="cust-state"
                className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                {...register('state_code')}
              >
                <option value="" className="bg-zinc-900">Select state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code} className="bg-zinc-900">
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust-op-bal">Opening Balance (₹)</Label>
                <Input
                  id="cust-op-bal"
                  type="number"
                  step="any"
                  placeholder="0.00"
                  {...register('opening_balance')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-op-type">Balance Type</Label>
                <select
                  id="cust-op-type"
                  className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  {...register('opening_balance_type')}
                >
                  <option value="to_collect">To Collect / Receivable (Dr)</option>
                  <option value="to_pay">To Pay / Advance (Cr)</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-address">Address</Label>
              <Input id="cust-address" placeholder="Street, City, Pincode" {...register('address')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { reset(); setShowForm(false) }}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
                {createMutation.isPending ? 'Adding...' : 'Add Customer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Customer Detail Dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedCustomer && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-700 text-sm font-bold text-white">
                    {selectedCustomer.name.charAt(0).toUpperCase()}
                  </div>
                  {selectedCustomer.name}
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {selectedCustomer.phone && (
                  <div className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm">
                    <Phone className="h-4 w-4 text-zinc-500" />
                    <span className="text-zinc-300">{selectedCustomer.phone}</span>
                  </div>
                )}
                {selectedCustomer.email && (
                  <div className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm">
                    <Mail className="h-4 w-4 text-zinc-500" />
                    <span className="text-zinc-300">{selectedCustomer.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm">
                  <CreditCard className="h-4 w-4 text-zinc-500" />
                  <span className="text-zinc-300">
                    Balance: {formatINR(selectedCustomer.balance ?? 0)}
                  </span>
                </div>
                {selectedCustomer.gstin && (
                  <div className="rounded-lg bg-zinc-800 px-3 py-2 text-sm">
                    <span className="text-zinc-500">GSTIN: </span>
                    <span className="font-mono text-zinc-300">{selectedCustomer.gstin}</span>
                  </div>
                )}
              </div>

              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Purchase History</h3>
              <div className="rounded-lg border border-zinc-800 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerSales && customerSales.length > 0 ? (
                      customerSales.map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell className="font-mono text-xs">{sale.invoice_no}</TableCell>
                          <TableCell className="text-zinc-400 text-sm">
                            {formatDate(sale.created_at)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="capitalize text-xs">
                              {sale.payment_mode}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatINR(sale.grand_total)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-zinc-500 py-6">
                          No purchases yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Import Customers Modal */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-md bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-100">
              <FileSpreadsheet className="h-5 w-5 text-indigo-400" />
              Import Customers from CSV
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Step 1 */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3.5">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-400">
                  1
                </span>
                <div className="space-y-2 flex-1">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">Download the template</p>
                    <p className="text-[11px] text-zinc-400">Sample CSV format with column headers and example customer rows</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadTemplate}
                    className="w-full text-xs gap-1.5 border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                  >
                    <Download className="h-3.5 w-3.5 text-emerald-400" />
                    Download Template (CSV)
                  </Button>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3.5">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-400">
                  2
                </span>
                <div className="space-y-2 flex-1">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">Upload your filled CSV file</p>
                    <p className="text-[11px] text-zinc-400">Select your completed customer CSV file to batch import records</p>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      handleFileChange(e)
                      setShowImport(false)
                    }}
                    accept=".csv"
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                    className="w-full text-xs gap-1.5 border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                  >
                    {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 text-indigo-400" />}
                    Choose CSV file
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowImport(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PlanLimitModal open={limitModalOpen} onClose={() => setLimitModalOpen(false)} limitInfo={limitInfo} />
    </div>
  )
}
