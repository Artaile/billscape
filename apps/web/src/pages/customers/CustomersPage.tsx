import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, ChevronRight, Phone, Mail, CreditCard, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { formatDate } from '@/lib/utils'
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
})

type CustomerFormValues = z.infer<typeof customerSchema>

interface CustomerWithLastSale extends Customer {
  last_sale?: string
}

export function CustomersPage() {
  const { org } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithLastSale | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
  })

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers', orgId, search],
    enabled: !!orgId,
    queryFn: async () => {
      let query = supabase
        .from('customers')
        .select('*')
        .eq('organization_id', orgId!)
        .order('name')

      if (search) {
        query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
      }

      const { data } = await query
      return (data ?? []) as CustomerWithLastSale[]
    },
  })

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

  const createMutation = useMutation({
    mutationFn: async (values: CustomerFormValues) => {
      const { error } = await supabase.from('customers').insert({
        organization_id: orgId!,
        name: values.name,
        phone: values.phone || null,
        email: values.email || null,
        gstin: values.gstin || null,
        state_code: values.state_code || null,
        address: values.address || null,
        balance: 0,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', orgId] })
      toast.success('Customer added')
      reset()
      setShowForm(false)
    },
    onError: (err: Error) => {
      toast.error('Failed to add customer', err.message)
    },
  })

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Customers</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{customers?.length ?? 0} customers</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Add Customer
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
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
                      className={
                        (customer.balance ?? 0) < 0
                          ? 'text-red-400 font-semibold'
                          : 'text-zinc-400'
                      }
                    >
                      {formatINR(customer.balance ?? 0)}
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
          <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
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
    </div>
  )
}
