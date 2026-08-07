// Shift Management — v2
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock,
  DollarSign,
  TrendingUp,
  Receipt,
  Loader2,
  CalendarDays,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/hooks/use-toast'
import { formatINR } from '@billscape/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface Shift {
  id: string
  organization_id: string
  opened_by: string
  closed_by: string | null
  opened_at: string
  closed_at: string | null
  opening_cash: number
  closing_cash: number | null
  expected_cash: number | null
  cash_difference: number | null
  total_sales: number
  bill_count: number
  notes: string | null
  status: 'open' | 'closed'
  opener?: { email: string | null; full_name: string | null } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDuration(openedAt: string, closedAt: string | null): string {
  const end = closedAt ? new Date(closedAt) : new Date()
  const diffMs = end.getTime() - new Date(openedAt).getTime()
  const totalMinutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  loading?: boolean
}

function StatCard({ icon, label, value, loading }: StatCardProps) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-400">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-zinc-400 truncate">{label}</p>
            {loading ? (
              <div className="h-5 w-20 rounded bg-zinc-800 animate-pulse mt-1" />
            ) : (
              <p className="text-lg font-semibold text-white">{value}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ShiftsPage() {
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()

  const [openShiftDialogOpen, setOpenShiftDialogOpen] = useState(false)
  const [closeShiftDialogOpen, setCloseShiftDialogOpen] = useState(false)

  // Open Shift form state
  const [openingCash, setOpeningCash] = useState('')
  const [openNotes, setOpenNotes] = useState('')

  // Close Shift form state
  const [closingCash, setClosingCash] = useState('')
  const [closeNotes, setCloseNotes] = useState('')

  // ── Fetch all shifts (newest first, max 20) ──
  const { data: shifts, isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ['shifts', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('organization_id', orgId!)
        .order('opened_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as Shift[]
    },
  })

  // Derived: active shift
  const activeShift = shifts?.find((s) => s.status === 'open') ?? null

  // ── Fetch cash sales since shift opened (for expected cash) ──
  const { data: cashSalesTotal } = useQuery<number>({
    queryKey: ['shifts-cash-sales', orgId, activeShift?.id, activeShift?.opened_at],
    enabled: !!orgId && !!activeShift,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales')
        .select('grand_total, payment_mode, cash_amount')
        .eq('organization_id', orgId!)
        .in('payment_mode', ['cash', 'split'])
        .gte('created_at', activeShift!.opened_at)
      if (error) throw error
      return (data ?? []).reduce(
        (sum: number, row: { grand_total: number; payment_mode: string; cash_amount: number | null }) =>
          sum + (row.payment_mode === 'split' ? (row.cash_amount ?? 0) : (row.grand_total ?? 0)),
        0,
      )
    },
  })

  const expectedCash =
    activeShift != null
      ? (activeShift.opening_cash ?? 0) + (cashSalesTotal ?? 0)
      : 0

  const parsedClosingCash = parseFloat(closingCash) || 0
  const cashDifference = parsedClosingCash - expectedCash

  // ── Today's stats ──
  const { data: todayStats, isLoading: statsLoading } = useQuery<{
    shiftCount: number
    totalSales: number
    avgBill: number
    cashOnHand: number
  }>({
    queryKey: ['shifts-today-stats', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const today = todayISO()

      // Today's shifts
      const { data: todayShifts, error: e1 } = await supabase
        .from('shifts')
        .select('id, opening_cash, status')
        .eq('organization_id', orgId!)
        .gte('opened_at', `${today}T00:00:00`)
        .lte('opened_at', `${today}T23:59:59`)
      if (e1) throw e1

      // Today's sales
      const { data: todaySales, error: e2 } = await supabase
        .from('sales')
        .select('grand_total')
        .eq('organization_id', orgId!)
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`)
      if (e2) throw e2

      const shiftCount = todayShifts?.length ?? 0
      const salesArr = todaySales ?? []
      const totalSales = salesArr.reduce(
        (sum: number, s: { grand_total: number }) => sum + (s.grand_total ?? 0),
        0
      )
      const avgBill = salesArr.length > 0 ? totalSales / salesArr.length : 0
      const cashOnHand = (todayShifts ?? [])
        .filter((s: { status: string }) => s.status === 'open')
        .reduce((sum: number, s: { opening_cash: number }) => sum + (s.opening_cash ?? 0), 0)

      return { shiftCount, totalSales, avgBill, cashOnHand }
    },
  })

  // ── Open Shift mutation ──
  const openShiftMutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !user?.id) throw new Error('Not authenticated')
      const cash = parseFloat(openingCash)
      if (isNaN(cash) || cash < 0) throw new Error('Enter a valid opening cash amount')

      const { error } = await supabase.from('shifts').insert({
        organization_id: orgId,
        opened_by: user.id,
        opened_at: new Date().toISOString(),
        opening_cash: cash,
        notes: openNotes.trim() || null,
        total_sales: 0,
        bill_count: 0,
        status: 'open',
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Shift opened', 'New shift has started.')
      setOpenShiftDialogOpen(false)
      setOpeningCash('')
      setOpenNotes('')
      queryClient.invalidateQueries({ queryKey: ['shifts', orgId] })
      queryClient.invalidateQueries({ queryKey: ['shifts-today-stats', orgId] })
    },
    onError: (err: Error) => {
      toast.error('Failed to open shift', err.message)
    },
  })

  // ── Close Shift mutation ──
  const closeShiftMutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !user?.id || !activeShift) throw new Error('No active shift')
      const cash = parseFloat(closingCash)
      if (isNaN(cash) || cash < 0) throw new Error('Enter a valid closing cash amount')

      const diff = cash - expectedCash

      const { error } = await supabase
        .from('shifts')
        .update({
          status: 'closed',
          closed_by: user.id,
          closed_at: new Date().toISOString(),
          closing_cash: cash,
          expected_cash: expectedCash,
          cash_difference: diff,
          notes: closeNotes.trim() || null,
        })
        .eq('id', activeShift.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Shift closed', 'Shift has been closed successfully.')
      setCloseShiftDialogOpen(false)
      setClosingCash('')
      setCloseNotes('')
      queryClient.invalidateQueries({ queryKey: ['shifts', orgId] })
      queryClient.invalidateQueries({ queryKey: ['shifts-today-stats', orgId] })
      queryClient.invalidateQueries({ queryKey: ['shifts-cash-sales', orgId] })
    },
    onError: (err: Error) => {
      toast.error('Failed to close shift', err.message)
    },
  })

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Shift Management</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Track cashier sessions and daily cash
          </p>
        </div>
        {!activeShift && (
          <Button
            onClick={() => setOpenShiftDialogOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            Open Shift
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={<CalendarDays size={18} />}
          label="Today's Shifts"
          value={String(todayStats?.shiftCount ?? 0)}
          loading={statsLoading}
        />
        <StatCard
          icon={<TrendingUp size={18} />}
          label="Total Sales Today"
          value={formatINR(todayStats?.totalSales ?? 0)}
          loading={statsLoading}
        />
        <StatCard
          icon={<DollarSign size={18} />}
          label="Cash on Hand"
          value={formatINR(todayStats?.cashOnHand ?? 0)}
          loading={statsLoading}
        />
        <StatCard
          icon={<Receipt size={18} />}
          label="Avg Bill Value Today"
          value={formatINR(todayStats?.avgBill ?? 0)}
          loading={statsLoading}
        />
      </div>

      {/* Active Shift Banner */}
      {activeShift && (
        <div className="rounded-xl border border-green-700/50 bg-green-950/40 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-green-500 h-3 w-3 animate-pulse" />
              <div>
                <p className="font-semibold text-green-400 text-sm">
                  Shift Open since {formatTime(activeShift.opened_at)}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {formatDate(activeShift.opened_at)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-zinc-400 text-xs">Opening Cash</p>
                <p className="font-semibold text-white">
                  {formatINR(activeShift.opening_cash)}
                </p>
              </div>
              <div>
                <p className="text-zinc-400 text-xs">Current Sales</p>
                <p className="font-semibold text-white">
                  {formatINR(activeShift.total_sales)}
                </p>
              </div>
              <div>
                <p className="text-zinc-400 text-xs">Bills</p>
                <p className="font-semibold text-white">{activeShift.bill_count}</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="border-green-700 text-green-400 hover:bg-green-900/40"
              onClick={() => {
                setClosingCash('')
                setCloseNotes('')
                setCloseShiftDialogOpen(true)
              }}
            >
              Close Shift
            </Button>
          </div>
        </div>
      )}

      {/* Shift History Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-white font-semibold">
            <Clock size={16} className="text-indigo-400" />
            Shift History
          </div>
          <span className="text-xs text-zinc-500">Last 20 shifts</span>
        </div>

        {shiftsLoading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500">
            <Loader2 className="animate-spin mr-2" size={18} />
            Loading shifts…
          </div>
        ) : !shifts || shifts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
            <Clock size={36} className="mb-3 opacity-40" />
            <p>No shifts recorded yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Date</TableHead>
                  <TableHead className="text-zinc-400">Opened By</TableHead>
                  <TableHead className="text-zinc-400">Duration</TableHead>
                  <TableHead className="text-zinc-400 text-right">Opening Cash</TableHead>
                  <TableHead className="text-zinc-400 text-right">Sales Total</TableHead>
                  <TableHead className="text-zinc-400 text-right">Bills</TableHead>
                  <TableHead className="text-zinc-400 text-right">Cash Diff</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((shift) => {
                  const diff = shift.cash_difference
                  const openerLabel = shift.opened_by.slice(0, 8) + '…'
                  return (
                    <TableRow
                      key={shift.id}
                      className="border-zinc-800 hover:bg-zinc-800/40"
                    >
                      <TableCell className="text-zinc-200 whitespace-nowrap">
                        <div>{formatDate(shift.opened_at)}</div>
                        <div className="text-xs text-zinc-500">
                          {formatTime(shift.opened_at)}
                        </div>
                      </TableCell>
                      <TableCell className="text-zinc-300 max-w-[140px] truncate">
                        {openerLabel}
                      </TableCell>
                      <TableCell className="text-zinc-300 whitespace-nowrap">
                        {formatDuration(shift.opened_at, shift.closed_at)}
                      </TableCell>
                      <TableCell className="text-right text-zinc-200 whitespace-nowrap">
                        {formatINR(shift.opening_cash)}
                      </TableCell>
                      <TableCell className="text-right text-zinc-200 whitespace-nowrap">
                        {formatINR(shift.total_sales)}
                      </TableCell>
                      <TableCell className="text-right text-zinc-300">
                        {shift.bill_count}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {diff == null ? (
                          <span className="text-zinc-500">—</span>
                        ) : (
                          <span
                            className={
                              diff >= 0 ? 'text-green-400' : 'text-red-400'
                            }
                          >
                            {diff >= 0 ? '+' : ''}
                            {formatINR(diff)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {shift.status === 'open' ? (
                          <Badge className="bg-green-500/20 text-green-400 border border-green-700/50 hover:bg-green-500/20">
                            Open
                          </Badge>
                        ) : (
                          <Badge className="bg-zinc-700/40 text-zinc-400 border border-zinc-700 hover:bg-zinc-700/40">
                            Closed
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── Open Shift Dialog ── */}
      <Dialog open={openShiftDialogOpen} onOpenChange={setOpenShiftDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Open Shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="opening-cash" className="text-zinc-300">
                Opening Cash (₹)
              </Label>
              <Input
                id="opening-cash"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="open-notes" className="text-zinc-300">
                Notes{' '}
                <span className="text-zinc-500 font-normal">(optional)</span>
              </Label>
              <Input
                id="open-notes"
                type="text"
                placeholder="Any notes for this shift…"
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpenShiftDialogOpen(false)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={() => openShiftMutation.mutate()}
              disabled={openShiftMutation.isPending || !openingCash}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {openShiftMutation.isPending ? (
                <Loader2 className="animate-spin mr-2" size={16} />
              ) : null}
              Open Shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Close Shift Dialog ── */}
      <Dialog open={closeShiftDialogOpen} onOpenChange={setCloseShiftDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Close Shift</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Expected Cash info */}
            <div className="rounded-lg bg-zinc-800/60 border border-zinc-700 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">Opening Cash</span>
                <span className="text-zinc-200">
                  {formatINR(activeShift?.opening_cash ?? 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Cash Sales Since Open</span>
                <span className="text-zinc-200">
                  {formatINR(cashSalesTotal ?? 0)}
                </span>
              </div>
              <div className="border-t border-zinc-700 pt-2 flex justify-between font-semibold">
                <span className="text-zinc-300">Expected Cash</span>
                <span className="text-white">{formatINR(expectedCash)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="closing-cash" className="text-zinc-300">
                Actual Closing Cash (₹)
              </Label>
              <Input
                id="closing-cash"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>

            {/* Cash Difference */}
            {closingCash !== '' && (
              <div className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/40 px-4 py-3">
                <span className="text-zinc-400 text-sm">Cash Difference</span>
                <span
                  className={`font-semibold text-sm ${
                    cashDifference >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {cashDifference >= 0 ? '+' : ''}
                  {formatINR(cashDifference)}
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="close-notes" className="text-zinc-300">
                Notes{' '}
                <span className="text-zinc-500 font-normal">(optional)</span>
              </Label>
              <Input
                id="close-notes"
                type="text"
                placeholder="Any notes for closing this shift…"
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCloseShiftDialogOpen(false)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={() => closeShiftMutation.mutate()}
              disabled={closeShiftMutation.isPending || !closingCash}
              className="bg-red-700 hover:bg-red-800"
            >
              {closeShiftMutation.isPending ? (
                <Loader2 className="animate-spin mr-2" size={16} />
              ) : null}
              Close Shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
