import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  Plus,
  Trash2,
  Eye,
  Loader2,
  Lock,
  AlertTriangle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'

// ─── Types ───────────────────────────────────────────────────────────────────

type AccountType = 'asset' | 'liability' | 'income' | 'expense' | 'equity'
type VoucherType = 'receipt' | 'payment' | 'journal' | 'contra' | 'sales' | 'purchase'
type EntryType = 'debit' | 'credit'

interface Account {
  id: string
  organization_id: string
  name: string
  type: AccountType
  code: string | null
  is_system: boolean
  created_at: string
}

interface VoucherEntry {
  id: string
  voucher_id: string
  account_id: string
  type: EntryType
  amount: number
  narration: string | null
  account?: { name: string }
}

interface Voucher {
  id: string
  organization_id: string
  voucher_no: string
  type: VoucherType
  date: string
  narration: string | null
  reference: string | null
  created_by: string
  created_at: string
  voucher_entries?: VoucherEntry[]
}

interface VoucherLine {
  id: string
  account_id: string
  type: EntryType
  amount: string
  narration: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = {
  asset:     'bg-blue-500/10 text-blue-400 border-blue-500/20',
  liability: 'bg-red-500/10 text-red-400 border-red-500/20',
  income:    'bg-green-500/10 text-green-400 border-green-500/20',
  expense:   'bg-orange-500/10 text-orange-400 border-orange-500/20',
  equity:    'bg-purple-500/10 text-purple-400 border-purple-500/20',
}

const VOUCHER_TYPE_COLORS: Record<VoucherType, string> = {
  receipt:  'bg-green-500/10 text-green-400 border-green-500/20',
  payment:  'bg-red-500/10 text-red-400 border-red-500/20',
  journal:  'bg-blue-500/10 text-blue-400 border-blue-500/20',
  contra:   'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  sales:    'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  purchase: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
}

const today = new Date().toISOString().slice(0, 10)
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10)

const thisMonthStart = new Date(
  new Date().getFullYear(),
  new Date().getMonth(),
  1,
).toISOString().slice(0, 10)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function newLine(): VoucherLine {
  return {
    id: crypto.randomUUID(),
    account_id: '',
    type: 'debit',
    amount: '',
    narration: '',
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LedgerPage() {
  const { org, user } = useAuth()
  const qc = useQueryClient()

  // ── Summary state ──────────────────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo)
  const [dateTo, setDateTo]     = useState(today)

  // ── Account dialog state ───────────────────────────────────────────────────
  const [acctDialogOpen, setAcctDialogOpen] = useState(false)
  const [acctName, setAcctName]             = useState('')
  const [acctType, setAcctType]             = useState<AccountType>('asset')
  const [acctCode, setAcctCode]             = useState('')

  // ── Voucher dialog state ───────────────────────────────────────────────────
  const [vchDialogOpen, setVchDialogOpen]   = useState(false)
  const [vchType, setVchType]               = useState<VoucherType>('journal')
  const [vchDate, setVchDate]               = useState(today)
  const [vchNarration, setVchNarration]     = useState('')
  const [vchReference, setVchReference]     = useState('')
  const [vchLines, setVchLines]             = useState<VoucherLine[]>([newLine()])

  // ── View voucher dialog state ──────────────────────────────────────────────
  const [viewVoucher, setViewVoucher]       = useState<Voucher | null>(null)

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: accounts = [], isLoading: acctLoading } = useQuery<Account[]>({
    queryKey: ['accounts', org?.id],
    enabled: !!org?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('organization_id', org!.id)
        .order('code', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const { data: vouchers = [], isLoading: vchLoading } = useQuery<Voucher[]>({
    queryKey: ['vouchers', org?.id, dateFrom, dateTo],
    enabled: !!org?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vouchers')
        .select('*, voucher_entries(id, account_id, type, amount, narration)')
        .eq('organization_id', org!.id)
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  // Month totals derived from voucher_entries for this month
  const { data: monthEntries = [] } = useQuery<{ type: EntryType; amount: number }[]>({
    queryKey: ['voucher_entries_month', org?.id, thisMonthStart],
    enabled: !!org?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voucher_entries')
        .select('type, amount, vouchers!inner(organization_id, date)')
        .eq('vouchers.organization_id', org!.id)
        .gte('vouchers.date', thisMonthStart)
      if (error) throw error
      return (data ?? []).map((r: any) => ({ type: r.type, amount: r.amount }))
    },
  })

  const totalDebitsMonth  = monthEntries.filter(e => e.type === 'debit').reduce((s, e) => s + e.amount, 0)
  const totalCreditsMonth = monthEntries.filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0)

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createAccount = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('accounts').insert({
        organization_id: org!.id,
        name: acctName.trim(),
        type: acctType,
        code: acctCode.trim() || null,
        is_system: false,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts', org?.id] })
      toast({ title: 'Account created', description: `"${acctName}" added to chart of accounts.` })
      setAcctDialogOpen(false)
      setAcctName('')
      setAcctType('asset')
      setAcctCode('')
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    },
  })

  const deleteAccount = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('accounts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts', org?.id] })
      toast({ title: 'Account deleted' })
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    },
  })

  const createVoucher = useMutation({
    mutationFn: async () => {
      // 1. Generate voucher_no
      const { count } = await supabase
        .from('vouchers')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org!.id)
      const seq = ((count ?? 0) + 1).toString().padStart(4, '0')
      const voucher_no = `VCH-${seq}`

      // 2. Insert voucher
      const { data: vch, error: vchErr } = await supabase
        .from('vouchers')
        .insert({
          organization_id: org!.id,
          voucher_no,
          type: vchType,
          date: vchDate,
          narration: vchNarration.trim() || null,
          reference: vchReference.trim() || null,
          created_by: user!.id,
        })
        .select('id')
        .single()
      if (vchErr) throw vchErr

      // 3. Insert entries
      const entries = vchLines.map(l => ({
        voucher_id: vch.id,
        account_id: l.account_id,
        type: l.type,
        amount: parseFloat(l.amount),
        narration: l.narration.trim() || null,
      }))
      const { error: entErr } = await supabase.from('voucher_entries').insert(entries)
      if (entErr) throw entErr
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vouchers', org?.id] })
      qc.invalidateQueries({ queryKey: ['voucher_entries_month', org?.id] })
      toast({ title: 'Voucher created' })
      setVchDialogOpen(false)
      resetVoucherForm()
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' })
    },
  })

  // ── Helpers ────────────────────────────────────────────────────────────────

  function resetVoucherForm() {
    setVchType('journal')
    setVchDate(today)
    setVchNarration('')
    setVchReference('')
    setVchLines([newLine()])
  }

  function updateLine(id: string, patch: Partial<VoucherLine>) {
    setVchLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
  }

  function removeLine(id: string) {
    setVchLines(prev => prev.filter(l => l.id !== id))
  }

  const debitTotal  = vchLines.reduce((s, l) => l.type === 'debit'  ? s + (parseFloat(l.amount) || 0) : s, 0)
  const creditTotal = vchLines.reduce((s, l) => l.type === 'credit' ? s + (parseFloat(l.amount) || 0) : s, 0)
  const balanced    = debitTotal > 0 && Math.abs(debitTotal - creditTotal) < 0.001
  const canSave     = balanced && vchLines.length > 0 && vchLines.every(l => l.account_id && parseFloat(l.amount) > 0)

  async function handleViewVoucher(v: Voucher) {
    // Fetch with account names
    const { data, error } = await supabase
      .from('vouchers')
      .select('*, voucher_entries(id, voucher_id, account_id, type, amount, narration, account:accounts(name))')
      .eq('id', v.id)
      .single()
    if (error) {
      toast({ title: 'Error loading voucher', description: error.message, variant: 'destructive' })
      return
    }
    setViewVoucher(data as Voucher)
  }

  // Voucher entry totals for table
  function voucherDebit(v: Voucher) {
    return (v.voucher_entries ?? []).filter(e => e.type === 'debit').reduce((s, e) => s + e.amount, 0)
  }
  function voucherCredit(v: Voucher) {
    return (v.voucher_entries ?? []).filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Ledger</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Accounts</p>
            <p className="mt-1 text-2xl font-semibold">{accounts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Vouchers</p>
            <p className="mt-1 text-2xl font-semibold">{vouchers.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Debits (This Month)</p>
            <p className="mt-1 text-2xl font-semibold text-blue-400">{formatINR(totalDebitsMonth)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Credits (This Month)</p>
            <p className="mt-1 text-2xl font-semibold text-green-400">{formatINR(totalCreditsMonth)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="vouchers">Vouchers</TabsTrigger>
        </TabsList>

        {/* ── TAB 1: ACCOUNTS ─────────────────────────────────────────────── */}
        <TabsContent value="accounts" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Chart of Accounts</h2>
            <Button size="sm" onClick={() => setAcctDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Account
            </Button>
          </div>

          {acctLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>System?</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No accounts found. Add your first account.
                      </TableCell>
                    </TableRow>
                  ) : (
                    accounts.map(acct => (
                      <TableRow key={acct.id}>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {acct.code ?? '—'}
                        </TableCell>
                        <TableCell className="font-medium">{acct.name}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={ACCOUNT_TYPE_COLORS[acct.type]}
                          >
                            {acct.type.charAt(0).toUpperCase() + acct.type.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {acct.is_system ? (
                            <Lock className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!acct.is_system && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm(`Delete account "${acct.name}"?`)) {
                                  deleteAccount.mutate(acct.id)
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── TAB 2: VOUCHERS ─────────────────────────────────────────────── */}
        <TabsContent value="vouchers" className="mt-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
            <h2 className="text-lg font-semibold">Vouchers</h2>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="dateFrom" className="text-sm whitespace-nowrap">From</Label>
                <Input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-36"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="dateTo" className="text-sm whitespace-nowrap">To</Label>
                <Input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-36"
                />
              </div>
              <Button size="sm" onClick={() => setVchDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                New Voucher
              </Button>
            </div>
          </div>

          {vchLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Voucher No</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Narration</TableHead>
                    <TableHead className="text-right">Debit Total</TableHead>
                    <TableHead className="text-right">Credit Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vouchers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No vouchers yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    vouchers.map(v => (
                      <TableRow key={v.id}>
                        <TableCell className="font-mono text-sm">{v.voucher_no}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={VOUCHER_TYPE_COLORS[v.type]}
                          >
                            {v.type.charAt(0).toUpperCase() + v.type.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(v.date)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {v.narration ?? '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {formatINR(voucherDebit(v))}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {formatINR(voucherCredit(v))}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleViewVoucher(v)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── NEW ACCOUNT DIALOG ──────────────────────────────────────────────── */}
      <Dialog open={acctDialogOpen} onOpenChange={open => { setAcctDialogOpen(open); if (!open) { setAcctName(''); setAcctType('asset'); setAcctCode('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Account</DialogTitle>
            <DialogDescription>Add an account to your chart of accounts.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acctName">Name <span className="text-destructive">*</span></Label>
              <Input
                id="acctName"
                value={acctName}
                onChange={e => setAcctName(e.target.value)}
                placeholder="e.g. Cash in Hand"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acctType">Type <span className="text-destructive">*</span></Label>
              <select
                id="acctType"
                value={acctType}
                onChange={e => setAcctType(e.target.value as AccountType)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="asset">Asset</option>
                <option value="liability">Liability</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="equity">Equity</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acctCode">Code <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                id="acctCode"
                value={acctCode}
                onChange={e => setAcctCode(e.target.value)}
                placeholder="e.g. 1001"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAcctDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createAccount.mutate()}
              disabled={!acctName.trim() || createAccount.isPending}
            >
              {createAccount.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── NEW VOUCHER DIALOG ──────────────────────────────────────────────── */}
      <Dialog open={vchDialogOpen} onOpenChange={open => { setVchDialogOpen(open); if (!open) resetVoucherForm() }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Voucher</DialogTitle>
            <DialogDescription>Create a double-entry accounting voucher.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Top row */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vchType">Type</Label>
                <select
                  id="vchType"
                  value={vchType}
                  onChange={e => setVchType(e.target.value as VoucherType)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="receipt">Receipt</option>
                  <option value="payment">Payment</option>
                  <option value="journal">Journal</option>
                  <option value="contra">Contra</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vchDate">Date</Label>
                <Input
                  id="vchDate"
                  type="date"
                  value={vchDate}
                  onChange={e => setVchDate(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="vchRef">Reference <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  id="vchRef"
                  value={vchReference}
                  onChange={e => setVchReference(e.target.value)}
                  placeholder="Cheque no, bill no, etc."
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vchNarration">Narration</Label>
              <Input
                id="vchNarration"
                value={vchNarration}
                onChange={e => setVchNarration(e.target.value)}
                placeholder="Brief description of the transaction"
              />
            </div>

            {/* Voucher Lines */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Voucher Lines</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVchLines(prev => [...prev, newLine()])}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Line
                </Button>
              </div>

              {/* Header row */}
              <div className="grid grid-cols-[2fr_140px_120px_1fr_32px] gap-2 px-1">
                <span className="text-xs text-muted-foreground">Account</span>
                <span className="text-xs text-muted-foreground">Dr / Cr</span>
                <span className="text-xs text-muted-foreground">Amount</span>
                <span className="text-xs text-muted-foreground">Narration</span>
                <span />
              </div>

              {vchLines.map(line => (
                <div key={line.id} className="grid grid-cols-[2fr_140px_120px_1fr_32px] gap-2 items-center">
                  <select
                    value={line.account_id}
                    onChange={e => updateLine(line.id, { account_id: e.target.value })}
                    className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">— Select Account —</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.code ? `${a.code} · ` : ''}{a.name}
                      </option>
                    ))}
                  </select>

                  <div className="flex rounded-md border border-input overflow-hidden h-8">
                    <button
                      type="button"
                      className={`flex-1 text-xs font-medium transition-colors ${
                        line.type === 'debit'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-transparent text-muted-foreground hover:bg-muted'
                      }`}
                      onClick={() => updateLine(line.id, { type: 'debit' })}
                    >
                      Debit
                    </button>
                    <button
                      type="button"
                      className={`flex-1 text-xs font-medium transition-colors border-l border-input ${
                        line.type === 'credit'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-transparent text-muted-foreground hover:bg-muted'
                      }`}
                      onClick={() => updateLine(line.id, { type: 'credit' })}
                    >
                      Credit
                    </button>
                  </div>

                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.amount}
                    onChange={e => updateLine(line.id, { amount: e.target.value })}
                    placeholder="0.00"
                    className="h-8 text-sm"
                  />

                  <Input
                    value={line.narration}
                    onChange={e => updateLine(line.id, { narration: e.target.value })}
                    placeholder="Note"
                    className="h-8 text-sm"
                  />

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                    onClick={() => removeLine(line.id)}
                    disabled={vchLines.length === 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              {/* Totals */}
              <div className="flex items-center justify-end gap-6 mt-2 pt-2 border-t">
                <span className="text-sm">
                  <span className="text-muted-foreground">Debit Total: </span>
                  <span className="font-semibold text-blue-400">{formatINR(debitTotal)}</span>
                </span>
                <span className="text-sm">
                  <span className="text-muted-foreground">Credit Total: </span>
                  <span className="font-semibold text-green-400">{formatINR(creditTotal)}</span>
                </span>
              </div>

              {/* Balance warning */}
              {vchLines.length > 0 && !balanced && (debitTotal > 0 || creditTotal > 0) && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Debits must equal Credits to save
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setVchDialogOpen(false); resetVoucherForm() }}>
              Cancel
            </Button>
            <Button
              onClick={() => createVoucher.mutate()}
              disabled={!canSave || createVoucher.isPending}
            >
              {createVoucher.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save Voucher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── VIEW VOUCHER DIALOG ─────────────────────────────────────────────── */}
      <Dialog open={!!viewVoucher} onOpenChange={open => { if (!open) setViewVoucher(null) }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewVoucher && (
            <>
              <DialogHeader>
                <DialogTitle>Voucher — {viewVoucher.voucher_no}</DialogTitle>
                <DialogDescription>
                  <Badge variant="outline" className={VOUCHER_TYPE_COLORS[viewVoucher.type]}>
                    {viewVoucher.type.charAt(0).toUpperCase() + viewVoucher.type.slice(1)}
                  </Badge>
                  {' · '}
                  {formatDate(viewVoucher.date)}
                  {viewVoucher.reference && ` · Ref: ${viewVoucher.reference}`}
                </DialogDescription>
              </DialogHeader>

              {viewVoucher.narration && (
                <p className="text-sm text-muted-foreground -mt-2">{viewVoucher.narration}</p>
              )}

              <div className="rounded-md border mt-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Narration</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(viewVoucher.voucher_entries ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                          No entries found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (viewVoucher.voucher_entries ?? []).map(entry => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">
                            {entry.account?.name ?? entry.account_id}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {entry.narration ?? '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {entry.type === 'debit' ? formatINR(entry.amount) : '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {entry.type === 'credit' ? formatINR(entry.amount) : '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                    {/* Totals row */}
                    {(viewVoucher.voucher_entries ?? []).length > 0 && (
                      <TableRow className="border-t-2 font-semibold bg-muted/30">
                        <TableCell colSpan={2} className="text-right text-sm">Total</TableCell>
                        <TableCell className="text-right text-sm text-blue-400">
                          {formatINR(
                            (viewVoucher.voucher_entries ?? [])
                              .filter(e => e.type === 'debit')
                              .reduce((s, e) => s + e.amount, 0),
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm text-green-400">
                          {formatINR(
                            (viewVoucher.voucher_entries ?? [])
                              .filter(e => e.type === 'credit')
                              .reduce((s, e) => s + e.amount, 0),
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setViewVoucher(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
