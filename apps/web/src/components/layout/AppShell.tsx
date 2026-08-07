import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Users,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  Store,
  Menu,
  X,
  User,
  ShoppingBag,
  Truck,
  Receipt,
  Tag,
  RotateCcw,
  FileText,
  Star,
  Activity,
  Clock,
  BookOpen,
  UserCog,
  Shield,
  Bell,
  AlertCircle,
  Calendar,
  DollarSign,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import type { UserRole } from '@billscape/core'
import { formatINR } from '@billscape/core'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badge?: string
  group?: string
  permission?: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: 'dashboard' },
  { label: 'Billing', href: '/billing', icon: ShoppingCart, badge: 'POS', permission: 'billing' },
  { label: 'Products', href: '/products', icon: Package, permission: 'products' },
  { label: 'Inventory', href: '/inventory', icon: Boxes, permission: 'inventory' },
  { label: 'Purchases', href: '/purchases', icon: ShoppingBag, permission: 'purchases' },
  { label: 'Suppliers', href: '/suppliers', icon: Truck, permission: 'suppliers' },
  { label: 'Customers', href: '/customers', icon: Users, permission: 'customers' },
  { label: 'Returns', href: '/returns', icon: RotateCcw, permission: 'returns' },
  { label: 'Quotations', href: '/quotations', icon: FileText, permission: 'quotations' },
  { label: 'Loyalty', href: '/loyalty', icon: Star, permission: 'loyalty' },
  { label: 'Employees', href: '/employees', icon: UserCog, permission: 'employees' },
  { label: 'Roles', href: '/roles', icon: Shield, permission: 'roles' },
  { label: 'Expenses', href: '/expenses', icon: Receipt, permission: 'expenses' },
  { label: 'Promotions', href: '/promotions', icon: Tag, permission: 'promotions' },
  { label: 'Activity', href: '/activity', icon: Activity, permission: 'activity' },
  { label: 'Shifts', href: '/shifts', icon: Clock, permission: 'shifts' },
  { label: 'Ledger', href: '/ledger', icon: BookOpen, permission: 'ledger' },
  { label: 'Reports', href: '/reports', icon: BarChart3, permission: 'reports' },
  { label: 'Settings', href: '/settings', icon: Settings, permission: 'settings' },
]

export function AppShell({ children }: { children?: React.ReactNode }) {
  const location = useLocation()
  const { user, org, role, signOut, hasPermission } = useAuth()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const brandColor = org?.branding?.primary_color ?? '#6366f1'

  const queryClient = useQueryClient()
  const orgId = org?.id
  const currentMonth = new Date().toISOString().slice(0, 7) // e.g. "2026-07"
  const today = new Date().toISOString().slice(0, 10)

  // Notification and Dialog states
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [salaryPayoutOpen, setSalaryPayoutOpen] = useState(false)
  const [confirmExpenseTemplate, setConfirmExpenseTemplate] = useState<any>(null)
  
  // Salary inputs mapping: employeeId -> PayoutValues
  const [salaryInputs, setSalaryInputs] = useState<Record<string, {
    baseSalary: number
    bonus: string
    advanceDeduction: string
    otherDeduction: string
  }>>({})

  // Standard expense amount state (when paying rent, utilities, etc.)
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(today)
  const [expenseNotes, setExpenseNotes] = useState('')
  const [paymentMode, setPaymentMode] = useState<'cash' | 'card' | 'upi'>('cash')

  // Fetch active routine templates
  const { data: templates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ['routine-templates-navbar', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_templates')
        .select('*')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
      if (error) throw error
      return data ?? []
    }
  })

  // Fetch active employees
  const { data: activeEmployees = [], refetch: refetchEmployees } = useQuery({
    queryKey: ['active-employees-navbar', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, role, base_salary, salary_advance_balance')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
      if (error) throw error
      return data ?? []
    }
  })

  // Fetch salary payments for current month
  const { data: salaryPayments = [], refetch: refetchSalaryPayments } = useQuery({
    queryKey: ['salary-payments-navbar', orgId, currentMonth],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salary_payments')
        .select('id, employee_id')
        .eq('organization_id', orgId!)
        .eq('payment_month', currentMonth)
      if (error) throw error
      return data ?? []
    }
  })

  // Compute pending state
  const unpaidEmployees = activeEmployees.filter(emp => 
    !salaryPayments.some((sp: any) => sp.employee_id === emp.id)
  )

  const pendingStandard = templates.filter((t: any) => 
    t.category !== 'salary' && t.last_billed_month !== currentMonth
  )

  const hasSalaryTemplate = templates.some((t: any) => t.category === 'salary')
  const isSalaryPending = hasSalaryTemplate && unpaidEmployees.length > 0

  const completedStandard = templates.filter((t: any) => 
    t.category !== 'salary' && t.last_billed_month === currentMonth
  )
  const isSalaryCompleted = hasSalaryTemplate && unpaidEmployees.length === 0 && activeEmployees.length > 0

  const pendingCount = pendingStandard.length + (isSalaryPending ? 1 : 0)

  // Initialize salary inputs when modal opens
  React.useEffect(() => {
    if (salaryPayoutOpen) {
      const inputs: typeof salaryInputs = {}
      unpaidEmployees.forEach(emp => {
        const adv = emp.salary_advance_balance ?? 0
        const base = emp.base_salary ?? 0
        const defaultDeduction = String(Math.min(base, adv))
        inputs[emp.id] = {
          baseSalary: base,
          bonus: '0',
          advanceDeduction: defaultDeduction,
          otherDeduction: '0'
        }
      })
      setSalaryInputs(inputs)
    }
  }, [salaryPayoutOpen])

  // Initialize standard template input when modal opens
  React.useEffect(() => {
    if (confirmExpenseTemplate) {
      setExpenseAmount(String(confirmExpenseTemplate.default_amount))
      setExpenseDate(today)
      setExpenseNotes(`Monthly ${confirmExpenseTemplate.name} payment for ${new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}`)
      setPaymentMode('cash')
    }
  }, [confirmExpenseTemplate])

  // Mutation to pay standard recurring expense
  const payExpenseMutation = useMutation({
    mutationFn: async () => {
      if (!confirmExpenseTemplate || !user || !orgId) return
      const amount = parseFloat(expenseAmount)
      if (isNaN(amount) || amount <= 0) throw new Error('Enter a valid payment amount')

      // 1. Create expense
      const { data: exp, error: expError } = await supabase
        .from('expenses')
        .insert({
          organization_id: orgId,
          category: confirmExpenseTemplate.category,
          amount,
          description: expenseNotes.trim() || `Monthly ${confirmExpenseTemplate.name} payout`,
          expense_date: expenseDate,
          created_by: user.id
        })
        .select('id')
        .single()

      if (expError) throw expError

      // 2. Update last billed month
      const { error: tempError } = await supabase
        .from('recurring_templates')
        .update({ last_billed_month: currentMonth })
        .eq('id', confirmExpenseTemplate.id)

      if (tempError) throw tempError

      // 3. Log to activity_log
      const { error: logError } = await supabase
        .from('activity_log')
        .insert({
          organization_id: orgId,
          actor_id: user.id,
          actor_name: displayName,
          action: 'Expense_paid',
          entity: 'Expenses',
          entity_id: exp.id,
          metadata: {
            template_name: confirmExpenseTemplate.name,
            category: confirmExpenseTemplate.category,
            amount: amount,
            notes: expenseNotes.trim()
          }
        })
      if (logError) throw logError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routine-templates-navbar', orgId] })
      queryClient.invalidateQueries({ queryKey: ['expenses', orgId] })
      queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
      toast.success(`${confirmExpenseTemplate?.name} payout processed successfully`)
      setConfirmExpenseTemplate(null)
    },
    onError: (err: Error) => toast.error('Failed to post payment', err.message)
  })

  // Mutation to run payroll
  const runPayrollMutation = useMutation({
    mutationFn: async () => {
      if (!user || !orgId) return
      
      const payloadPromises = unpaidEmployees.map(async emp => {
        const input = salaryInputs[emp.id]
        if (!input) return

        const base = input.baseSalary
        const bonus = parseFloat(input.bonus) || 0
        const advDeduct = parseFloat(input.advanceDeduction) || 0
        const otherDeduct = parseFloat(input.otherDeduction) || 0
        const netPaid = base + bonus - advDeduct - otherDeduct

        if (netPaid < 0) throw new Error(`Net payout for ${emp.full_name} cannot be negative`)

        // 1. Log expense record
        const { data: exp, error: expError } = await supabase
          .from('expenses')
          .insert({
            organization_id: orgId,
            category: 'salary',
            amount: netPaid,
            description: `Salary Payout for ${currentMonth} - ${emp.full_name}`,
            expense_date: today,
            created_by: user.id
          })
          .select('id')
          .single()

        if (expError) throw expError

        // 2. Log payment record
        const { error: payError } = await supabase
          .from('salary_payments')
          .insert({
            organization_id: orgId,
            employee_id: emp.id,
            payment_month: currentMonth,
            base_salary: base,
            allowances_bonus: bonus,
            advance_deducted: advDeduct,
            other_deductions: otherDeduct,
            net_paid: netPaid,
            payment_date: today,
            payment_mode: paymentMode,
            expense_id: exp.id,
            created_by: user.id
          })

        if (payError) throw payError

        // 2b. Log to activity_log
        const { error: logError } = await supabase
          .from('activity_log')
          .insert({
            organization_id: orgId,
            actor_id: user.id,
            actor_name: displayName,
            action: 'Salary_paid',
            entity: 'Employees',
            entity_id: emp.id,
            metadata: {
              employee_name: emp.full_name,
              month: currentMonth,
              net_paid: netPaid,
              base_salary: base,
              bonus,
              advance_deducted: advDeduct,
              other_deductions: otherDeduct
            }
          })
        if (logError) throw logError

        // 3. Update employee advance balance if deducted
        if (advDeduct > 0) {
          // Log advance recovery record
          const { error: advError } = await supabase
            .from('employee_advances')
            .insert({
              organization_id: orgId,
              employee_id: emp.id,
              amount: advDeduct,
              advance_date: today,
              notes: `Salary deduction recovery for ${currentMonth}`,
              status: 'deducted',
              created_by: user.id
            })

          if (advError) throw advError

          // Decrement employee running balance
          const { error: empUpdateError } = await supabase
            .from('employees')
            .update({
              salary_advance_balance: Math.max(0, (emp.salary_advance_balance ?? 0) - advDeduct)
            })
            .eq('id', emp.id)

          if (empUpdateError) throw empUpdateError
        }
      })

      await Promise.all(payloadPromises)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-payments-navbar', orgId] })
      queryClient.invalidateQueries({ queryKey: ['active-employees-navbar', orgId] })
      queryClient.invalidateQueries({ queryKey: ['expenses', orgId] })
      queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
      toast.success('Payroll payout completed successfully')
      setSalaryPayoutOpen(false)
    },
    onError: (err: Error) => toast.error('Failed to execute payroll', err.message)
  })

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'User'
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const handleSignOut = async () => {
    await signOut()
    setUserMenuOpen(false)
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-zinc-700/50 dark:border-zinc-700/50">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: brandColor }}
        >
          <Store className="h-4 w-4 text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-foreground tracking-wide">BillScape</span>
          <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
            {org?.name ?? 'Your Shop'}
          </span>
        </div>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <ul className="space-y-0.5">
          {NAV_ITEMS.filter((item) =>
            !item.permission || hasPermission(item.permission)
          ).map((item) => {
            const isActive =
              item.href === '/dashboard'
                ? location.pathname === '/dashboard' || location.pathname === '/'
                : location.pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'text-white shadow-sm'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                  style={isActive ? { backgroundColor: brandColor } : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span
                      className="ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{ backgroundColor: `${brandColor}30`, color: brandColor }}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom user info */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: brandColor }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-xs font-medium text-foreground">{displayName}</p>
            <p className="truncate text-[10px] text-muted-foreground">{user?.email}</p>
          </div>
        </div>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-sidebar border-r border-border">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative flex flex-col w-56 h-full bg-sidebar border-r border-border shadow-2xl">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:px-6">
          <button
            className="lg:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1">
            <h1 className="text-sm font-semibold text-foreground lg:hidden">
              {org?.name ?? 'BillScape'}
            </h1>
          </div>

          {/* Notifications Bell */}
          <div className="relative">
            <button
              onClick={() => setNotificationsOpen((prev) => !prev)}
              className="relative p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Bell className="h-5 w-5" />
              {pendingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setNotificationsOpen(false)}
                />
                <div className="absolute right-0 top-full z-40 mt-2 w-80 rounded-lg border border-border bg-card shadow-xl p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <p className="text-xs font-bold text-foreground">Routine Monthly Works</p>
                    <Badge variant={pendingCount > 0 ? 'default' : 'secondary'} className="text-[10px]">
                      {pendingCount} Pending
                    </Badge>
                  </div>

                  {/* Pending List */}
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {pendingCount === 0 ? (
                      <div className="text-center py-6 text-xs text-muted-foreground flex flex-col items-center gap-1.5">
                        <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                        All routine works completed for {new Date().toLocaleString('en-IN', { month: 'long' })}!
                      </div>
                    ) : (
                      <>
                        {isSalaryPending && (
                          <div className="flex items-center justify-between gap-2 p-2 rounded border border-border bg-secondary/20">
                            <div>
                              <p className="text-xs font-semibold text-zinc-200">Run Monthly Payroll</p>
                              <p className="text-[10px] text-zinc-500">{unpaidEmployees.length} employees pending</p>
                            </div>
                            <Button size="sm" className="h-7 text-xs" onClick={() => { setSalaryPayoutOpen(true); setNotificationsOpen(false) }}>
                              Run
                            </Button>
                          </div>
                        )}

                        {pendingStandard.map((t: any) => (
                          <div key={t.id} className="flex items-center justify-between gap-2 p-2 rounded border border-border bg-secondary/20">
                            <div>
                              <p className="text-xs font-semibold text-zinc-200">{t.name}</p>
                              <p className="text-[10px] text-zinc-500">Day {t.due_day} • Default: {formatINR(t.default_amount)}</p>
                            </div>
                            <Button size="sm" className="h-7 text-xs" onClick={() => { setConfirmExpenseTemplate(t); setNotificationsOpen(false) }}>
                              Pay
                            </Button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>

                  {/* Completed List */}
                  {(completedStandard.length > 0 || isSalaryCompleted) && (
                    <div className="pt-2 border-t border-border space-y-2">
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Completed This Month</p>
                      <div className="space-y-1 text-xs">
                        {isSalaryCompleted && (
                          <div className="flex items-center gap-1.5 text-emerald-400 py-0.5 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                            <span>Salary payroll completed</span>
                          </div>
                        )}
                        {completedStandard.map((t: any) => (
                          <div key={t.id} className="flex items-center gap-1.5 text-zinc-400 py-0.5">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500/80" />
                            <span>{t.name} posted</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* User avatar dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-secondary transition-colors"
            >
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: brandColor }}
              >
                {initials}
              </div>
              <span className="hidden sm:block max-w-[120px] truncate text-xs">
                {displayName}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="absolute right-0 top-full z-40 mt-1 w-52 rounded-lg border border-border bg-card shadow-xl py-1">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-xs font-medium text-foreground truncate">{displayName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                  </div>
                  <Link
                    to="/profile"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    <User className="h-4 w-4" />
                    My Profile
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Salary Payroll Payout Modal */}
      <Dialog open={salaryPayoutOpen} onOpenChange={setSalaryPayoutOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Monthly Payroll Payout — {new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {unpaidEmployees.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No employees pending payment for this month.</p>
            ) : (
              <>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead className="w-[18%]">Base Salary (₹)</TableHead>
                        <TableHead className="w-[18%]">Advance (₹)</TableHead>
                        <TableHead className="w-[15%]">Bonus (₹)</TableHead>
                        <TableHead className="w-[15%]">Deductions (₹)</TableHead>
                        <TableHead className="text-right">Net Payout</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unpaidEmployees.map((emp) => {
                        const input = salaryInputs[emp.id] || { baseSalary: emp.base_salary ?? 0, bonus: '0', advanceDeduction: '0', otherDeduction: '0' }
                        const adv = emp.salary_advance_balance ?? 0
                        const base = input.baseSalary
                        const bonusVal = parseFloat(input.bonus) || 0
                        const advDeductVal = parseFloat(input.advanceDeduction) || 0
                        const otherDeductVal = parseFloat(input.otherDeduction) || 0
                        const netPay = base + bonusVal - advDeductVal - otherDeductVal

                        return (
                          <TableRow key={emp.id}>
                            <TableCell>
                              <p className="text-sm font-semibold text-zinc-200">{emp.full_name}</p>
                              <p className="text-[10px] text-zinc-500 capitalize">{emp.role}</p>
                            </TableCell>
                            <TableCell className="py-1">
                              <Input
                                type="number"
                                value={input.baseSalary}
                                onChange={(e) => setSalaryInputs(prev => ({
                                  ...prev,
                                  [emp.id]: { ...prev[emp.id], baseSalary: parseFloat(e.target.value) || 0 }
                                }))}
                                className="h-8 text-xs text-center"
                              />
                            </TableCell>
                            <TableCell className="py-1">
                              <div className="space-y-1">
                                <span className="text-[10px] text-zinc-500 block text-center">Bal: {formatINR(adv)}</span>
                                <Input
                                  type="number"
                                  max={adv}
                                  value={input.advanceDeduction}
                                  onChange={(e) => setSalaryInputs(prev => ({
                                    ...prev,
                                    [emp.id]: { ...prev[emp.id], advanceDeduction: e.target.value }
                                  }))}
                                  className="h-8 text-xs text-center"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="py-1">
                              <Input
                                type="number"
                                value={input.bonus}
                                onChange={(e) => setSalaryInputs(prev => ({
                                  ...prev,
                                  [emp.id]: { ...prev[emp.id], bonus: e.target.value }
                                }))}
                                className="h-8 text-xs text-center"
                              />
                            </TableCell>
                            <TableCell className="py-1">
                              <Input
                                type="number"
                                value={input.otherDeduction}
                                onChange={(e) => setSalaryInputs(prev => ({
                                  ...prev,
                                  [emp.id]: { ...prev[emp.id], otherDeduction: e.target.value }
                                }))}
                                className="h-8 text-xs text-center"
                              />
                            </TableCell>
                            <TableCell className="text-right font-bold text-zinc-200">
                              {formatINR(netPay)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Overall Details */}
                <div className="grid grid-cols-2 gap-4 bg-secondary/10 p-3 rounded-lg border border-border">
                  <div className="space-y-1.5">
                    <Label>Payment Mode</Label>
                    <select
                      value={paymentMode}
                      onChange={(e: any) => setPaymentMode(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="cash" className="bg-zinc-900">Cash Payout</option>
                      <option value="card" className="bg-zinc-900">Bank Transfer / Card</option>
                      <option value="upi" className="bg-zinc-900">UPI (GPay / PhonePe)</option>
                    </select>
                  </div>
                  <div className="text-right flex flex-col justify-center pr-2">
                    <p className="text-xs text-muted-foreground">Total Net Payout Amount</p>
                    <p className="text-2xl font-bold text-primary">
                      {formatINR(
                        unpaidEmployees.reduce((sum, emp) => {
                          const input = salaryInputs[emp.id]
                          if (!input) return sum
                          const base = input.baseSalary
                          const bonusVal = parseFloat(input.bonus) || 0
                          const advDeductVal = parseFloat(input.advanceDeduction) || 0
                          const otherDeductVal = parseFloat(input.otherDeduction) || 0
                          return sum + (base + bonusVal - advDeductVal - otherDeductVal)
                        }, 0)
                      )}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSalaryPayoutOpen(false)}>Cancel</Button>
            <Button onClick={() => runPayrollMutation.mutate()} disabled={runPayrollMutation.isPending || unpaidEmployees.length === 0}>
              {runPayrollMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Processing...</> : 'Confirm Payouts'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Standard Recurring Expense Payout Modal */}
      <Dialog open={!!confirmExpenseTemplate} onOpenChange={() => setConfirmExpenseTemplate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Payment — {confirmExpenseTemplate?.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Payment Amount (₹) *</Label>
              <Input
                type="number"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Payment Date</Label>
              <Input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Notes / Description</Label>
              <Input
                value={expenseNotes}
                onChange={(e) => setExpenseNotes(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Payment Mode</Label>
              <select
                value={paymentMode}
                onChange={(e: any) => setPaymentMode(e.target.value)}
                className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="cash" className="bg-zinc-900">Cash</option>
                <option value="card" className="bg-zinc-900">Bank Transfer / Card</option>
                <option value="upi" className="bg-zinc-900">UPI</option>
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmExpenseTemplate(null)}>Cancel</Button>
            <Button onClick={() => payExpenseMutation.mutate()} disabled={payExpenseMutation.isPending}>
              {payExpenseMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Confirming...</> : 'Confirm Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
