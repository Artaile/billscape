import React, { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useNavigationGuard } from '@/contexts/NavigationGuardContext'
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
  CheckCircle2,
  CalendarClock,
  Loader2,
  ClipboardList,
  EyeOff,
  Eye,
  Search,
  ChevronRight,
  Plus,
  Tags,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { GlobalSearchDialog } from '@/components/search/GlobalSearchDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { UserRole } from '@billscape/core'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badge?: string
  permissionKey?: string
  /** Path used to test "is this item (or its group) active" when it differs from href (e.g. query-param deep links). */
  matchHref?: string
  /** Sub-paths that must NOT count as a match, even though they share this item's path prefix
   *  (e.g. Products shouldn't stay active on /products/categories once Categories has its own entry). */
  excludeSubpaths?: string[]
  /** When set, this item still counts as active if the disambiguating query key from matchHref
   *  is entirely absent from the current URL (e.g. bare /returns falls back to "Sales Returns"
   *  rather than leaving the whole group unhighlighted). */
  defaultWhenAbsent?: boolean
}

interface NavGroup {
  label: string
  icon: React.ElementType
  items: NavItem[]
  /** Any nav item's permissionKey in this group being enabled is enough to show the group. */
}

type NavEntry = { kind: 'item'; item: NavItem } | { kind: 'group'; group: NavGroup }

const NAV_ENTRIES: NavEntry[] = [
  { kind: 'item', item: { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permissionKey: 'dashboard' } },
  {
    kind: 'group',
    group: {
      label: 'Sales',
      icon: ShoppingCart,
      items: [
        { label: 'Billing (POS)', href: '/billing', icon: ShoppingCart, badge: 'POS', permissionKey: 'billing', matchHref: '/billing', excludeSubpaths: ['/billing/sales'] },
        { label: 'Sales History', href: '/billing?tab=history', icon: Receipt, permissionKey: 'billing', matchHref: '/billing' },
        { label: 'Quotations', href: '/quotations', icon: FileText, permissionKey: 'quotations' },
        { label: 'Sales Returns', href: '/returns?type=sale', icon: RotateCcw, permissionKey: 'returns', matchHref: '/returns', defaultWhenAbsent: true },
      ],
    },
  },
  {
    kind: 'group',
    group: {
      label: 'Purchase',
      icon: ShoppingBag,
      items: [
        { label: 'Purchases', href: '/purchases', icon: ShoppingBag, permissionKey: 'purchases' },
        { label: 'Purchase Returns', href: '/returns?type=purchase', icon: RotateCcw, permissionKey: 'returns', matchHref: '/returns' },
      ],
    },
  },
  {
    kind: 'group',
    group: {
      label: 'Inventory',
      icon: Boxes,
      items: [
        { label: 'Products', href: '/products', icon: Package, permissionKey: 'products', excludeSubpaths: ['/products/categories'] },
        { label: 'Categories', href: '/products/categories', icon: Tags, permissionKey: 'products' },
        { label: 'Stock & Inventory', href: '/inventory', icon: Boxes, permissionKey: 'inventory' },
      ],
    },
  },
  { kind: 'item', item: { label: 'Suppliers', href: '/suppliers', icon: Truck, permissionKey: 'suppliers' } },
  { kind: 'item', item: { label: 'Customers', href: '/customers', icon: Users, permissionKey: 'customers' } },
  { kind: 'item', item: { label: 'Loyalty', href: '/loyalty', icon: Star, permissionKey: 'loyalty' } },
  { kind: 'item', item: { label: 'Employees', href: '/employees', icon: UserCog, permissionKey: 'employees' } },
  { kind: 'item', item: { label: 'Roles', href: '/roles', icon: Shield, permissionKey: 'roles' } },
  { kind: 'item', item: { label: 'Expenses', href: '/expenses', icon: Receipt, permissionKey: 'expenses' } },
  { kind: 'item', item: { label: 'Promotions', href: '/promotions', icon: Tag, permissionKey: 'promotions' } },
  { kind: 'item', item: { label: 'Activity', href: '/activity', icon: Activity, permissionKey: 'activity' } },
  { kind: 'item', item: { label: 'Shifts', href: '/shifts', icon: Clock, permissionKey: 'shifts' } },
  { kind: 'item', item: { label: 'Ledger', href: '/ledger', icon: BookOpen, permissionKey: 'ledger' } },
  { kind: 'item', item: { label: 'Reports', href: '/reports', icon: BarChart3, permissionKey: 'reports' } },
  { kind: 'item', item: { label: 'Settings', href: '/settings', icon: Settings, permissionKey: 'settings' } },
]

function isNavItemActive(item: NavItem, pathname: string, search: string) {
  const target = item.matchHref ?? item.href
  const targetPath = target.split('?')[0]
  if (targetPath === '/dashboard') {
    return pathname === '/dashboard' || pathname === '/'
  }
  if (!pathname.startsWith(targetPath)) return false
  // A path-prefix match must land on a route boundary, not mid-segment
  // (e.g. '/products' must not match '/productsomething').
  if (pathname.length > targetPath.length && pathname[targetPath.length] !== '/') return false
  // Yield to a sibling that owns a more specific sub-path, e.g. Products vs. Products >
  // Categories, or Billing (POS) vs. a sale-detail page that isn't really "POS" or "History".
  if (targetPath !== pathname && item.excludeSubpaths?.some((p) => pathname.startsWith(p))) return false
  if (!item.matchHref) return true
  // Disambiguate sub-items that share a base path (e.g. /billing vs /billing?tab=history):
  // every query key this item's href sets (or, if it sets none, every key any of its siblings
  // set — read from currentQuery) must match exactly, so "no tab param" and "tab=history" are
  // treated as distinct states rather than the bare-path item matching both.
  const itemQuery = new URLSearchParams(item.href.split('?')[1] ?? '')
  const currentQuery = new URLSearchParams(search)
  if (item.defaultWhenAbsent && [...itemQuery.keys()].every((k) => !currentQuery.has(k))) return true
  const keysToCheck = new Set([...itemQuery.keys(), ...currentQuery.keys()])
  for (const key of keysToCheck) {
    if ((itemQuery.get(key) ?? null) !== (currentQuery.get(key) ?? null)) return false
  }
  return true
}

function NavLinkItem({
  item,
  isActive,
  brandColor,
  onNavigate,
  compact,
}: {
  item: NavItem
  isActive: boolean
  brandColor: string
  onNavigate: (href: string) => void
  compact?: boolean
}) {
  const Icon = item.icon
  return (
    <li>
      <Link
        to={item.href}
        onClick={(e) => {
          e.preventDefault()
          onNavigate(item.href)
        }}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
          compact && 'py-1.5 text-[13px]',
          isActive
            ? 'text-white shadow-sm'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        )}
        style={isActive ? { backgroundColor: brandColor } : undefined}
      >
        <Icon className={cn('h-4 w-4 shrink-0', compact && 'h-3.5 w-3.5')} />
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
}

function QuickAddLink({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      {label}
    </button>
  )
}

export function AppShell({ children }: { children?: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { requestNavigation } = useNavigationGuard()
  const { user, org, role, permissions, signOut } = useAuth()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  const isGroupActive = (group: NavGroup) =>
    group.items.some((item) => isNavItemActive(item, location.pathname, location.search))

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    let stored: Record<string, boolean> = {}
    try {
      stored = JSON.parse(localStorage.getItem('billscape_nav_groups') ?? '{}')
    } catch {
      stored = {}
    }
    const initial: Record<string, boolean> = {}
    for (const entry of NAV_ENTRIES) {
      if (entry.kind === 'group') {
        initial[entry.group.label] = entry.group.label in stored ? stored[entry.group.label] : isGroupActive(entry.group)
      }
    }
    return initial
  })

  // Auto-expand a group the moment its route becomes active, but only on that transition —
  // navigating between siblings within an already-active group must not re-force it open after
  // the user has manually collapsed it (previouslyActiveGroups tracks what was active last render
  // so a group already active on both the previous and current location is left alone).
  const previouslyActiveGroupsRef = React.useRef<Set<string>>(new Set())
  useEffect(() => {
    const currentlyActive = new Set<string>()
    for (const entry of NAV_ENTRIES) {
      if (entry.kind === 'group' && isGroupActive(entry.group)) {
        currentlyActive.add(entry.group.label)
        if (!previouslyActiveGroupsRef.current.has(entry.group.label)) {
          setOpenGroups((prev) => {
            const next = { ...prev, [entry.group.label]: true }
            localStorage.setItem('billscape_nav_groups', JSON.stringify(next))
            return next
          })
        }
      }
    }
    previouslyActiveGroupsRef.current = currentlyActive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search])

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] }
      localStorage.setItem('billscape_nav_groups', JSON.stringify(next))
      return next
    })
  }

  const brandColor = org?.branding?.primary_color ?? '#6366f1'

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'User'
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const handleSignOut = () => {
    requestNavigation(async () => {
      await signOut()
      setUserMenuOpen(false)
    })
  }

  // --- Routine Works Logic ---
  const queryClient = useQueryClient()
  const today = new Date().toISOString().split('T')[0]
  const currentMonth = today.substring(0, 7)
  const orgId = org?.id

  const { data: recurringTemplates } = useQuery({
    queryKey: ['recurring_templates', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('recurring_templates').select('*').eq('organization_id', orgId!).eq('is_active', true)
      return data ?? []
    }
  })

  const { data: activeEmployees } = useQuery({
    queryKey: ['employees', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('id, full_name, role, base_salary, salary_advance_balance').eq('organization_id', orgId!).eq('is_active', true)
      return data ?? []
    }
  })

  const { data: salaryPayments } = useQuery({
    queryKey: ['salary_payments', orgId, currentMonth],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('salary_payments').select('employee_id').eq('organization_id', orgId!).eq('payment_month', currentMonth)
      return data ?? []
    }
  })

  const unpaidEmployees = activeEmployees?.filter(emp => !salaryPayments?.some(sp => sp.employee_id === emp.id)) ?? []
  const salaryTemplate = recurringTemplates?.find(t => t.category === 'salary')
  const isSalaryPending = !!salaryTemplate && unpaidEmployees.length > 0
  const pendingStandard = recurringTemplates?.filter(t => t.category !== 'salary' && t.last_billed_month !== currentMonth) ?? []
  const pendingCount = pendingStandard.length + (isSalaryPending ? 1 : 0)

  const [routineWorksOpen, setRoutineWorksOpen] = useState(false)
  const [systemNotificationsOpen, setSystemNotificationsOpen] = useState(false)
  const { notifications: sysNotifications, markAsPaid } = useNotifications()
  const [salaryPayoutOpen, setSalaryPayoutOpen] = useState(false)
  const [confirmExpenseTemplate, setConfirmExpenseTemplate] = useState<any>(null)

  const [salaryInputs, setSalaryInputs] = useState<Record<string, { baseSalary: number, bonus: number, advanceDeduction: number, otherDeduction: number }>>({})
  const [salaryPaymentMode, setSalaryPaymentMode] = useState('cash')
  const [standardExpenseInput, setStandardExpenseInput] = useState({ amount: 0, date: today, notes: '', paymentMode: 'cash' })

  // Initialize salary inputs when modal opens
  useEffect(() => {
    if (salaryPayoutOpen && unpaidEmployees.length > 0) {
      const init: Record<string, any> = {}
      unpaidEmployees.forEach(emp => {
        init[emp.id] = {
          baseSalary: emp.base_salary || 0,
          bonus: 0,
          advanceDeduction: 0,
          otherDeduction: 0
        }
      })
      setSalaryInputs(init)
      setSalaryPaymentMode('cash')
    }
  }, [salaryPayoutOpen, unpaidEmployees]) // removed unpaidEmployees object dependency if it caused loops, wait, just watch length.

  // Initialize standard expense when modal opens
  useEffect(() => {
    if (confirmExpenseTemplate) {
      setStandardExpenseInput({
        amount: confirmExpenseTemplate.default_amount || 0,
        date: today,
        notes: `Monthly payout for ${confirmExpenseTemplate.name} - ${currentMonth}`,
        paymentMode: 'cash'
      })
    }
  }, [confirmExpenseTemplate, today, currentMonth])

  const handleSalaryInput = (empId: string, field: string, val: string) => {
    setSalaryInputs(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        [field]: parseFloat(val) || 0
      }
    }))
  }

  const processSalaryMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !orgId) throw new Error('Not authenticated')
      
      const promises = unpaidEmployees.map(async (emp) => {
        const inputs = salaryInputs[emp.id]
        const netPaid = inputs.baseSalary + inputs.bonus - inputs.advanceDeduction - inputs.otherDeduction
        
        // 1. Insert into expenses
        const { data: expData, error: expErr } = await supabase.from('expenses').insert({
          organization_id: orgId,
          created_by: user.id,
          category: 'Salary',
          amount: netPaid,
          description: `Salary for ${emp.full_name} - ${currentMonth}`,
          expense_date: today,
        }).select().single()
        
        if (expErr) throw expErr

        // 2. Insert into salary_payments
        const { error: salErr } = await supabase.from('salary_payments').insert({
          organization_id: orgId,
          employee_id: emp.id,
          payment_month: currentMonth,
          base_salary: inputs.baseSalary,
          allowances_bonus: inputs.bonus,
          advance_deducted: inputs.advanceDeduction,
          other_deductions: inputs.otherDeduction,
          net_paid: netPaid,
          payment_date: today,
          payment_mode: salaryPaymentMode,
          expense_id: expData.id,
        })
        if (salErr) throw salErr

        // 3. Insert into activity log
        await supabase.from('activity_log').insert({
          actor_id: user.id,
          actor_name: displayName,
          action: 'create',
          entity: 'salary_payment',
          entity_id: emp.id,
          metadata: { month: currentMonth, amount: netPaid }
        })

        // 4. Update advance if deducted
        if (inputs.advanceDeduction > 0) {
          await supabase.from('employee_advances').insert({
            organization_id: orgId,
            employee_id: emp.id,
            amount: inputs.advanceDeduction,
            advance_date: today,
            notes: `Deducted from ${currentMonth} salary`,
            status: 'deducted'
          })
          const newBal = (emp.salary_advance_balance || 0) - inputs.advanceDeduction
          await supabase.from('employees').update({ salary_advance_balance: newBal }).eq('id', emp.id)
        }
      })
      await Promise.all(promises)

      // Also update the salary recurring template's last_billed_month if exists
      if (salaryTemplate) {
        await supabase.from('recurring_templates').update({ last_billed_month: currentMonth }).eq('id', salaryTemplate.id)
      }
    },
    onSuccess: () => {
      toast.success('Payroll processed successfully')
      queryClient.invalidateQueries({ queryKey: ['salary_payments'] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      queryClient.invalidateQueries({ queryKey: ['recurring_templates'] })
      setSalaryPayoutOpen(false)
      setRoutineWorksOpen(false)
    },
    onError: (err: Error) => toast.error('Failed to process payroll', err.message)
  })

  const processStandardMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !orgId || !confirmExpenseTemplate) throw new Error('Invalid state')

      const { data: expData, error: expErr } = await supabase.from('expenses').insert({
        organization_id: orgId,
        created_by: user.id,
        category: confirmExpenseTemplate.category,
        amount: standardExpenseInput.amount,
        description: standardExpenseInput.notes,
        expense_date: standardExpenseInput.date,
      }).select().single()
      
      if (expErr) throw expErr

      await supabase.from('recurring_templates').update({
        last_billed_month: currentMonth
      }).eq('id', confirmExpenseTemplate.id)

      await supabase.from('activity_log').insert({
        actor_id: user.id,
        actor_name: displayName,
        action: 'create',
        entity: 'routine_expense',
        entity_id: confirmExpenseTemplate.id,
        metadata: { month: currentMonth, amount: standardExpenseInput.amount }
      })
    },
    onSuccess: () => {
      toast.success(`${confirmExpenseTemplate.name} processed successfully`)
      queryClient.invalidateQueries({ queryKey: ['recurring_templates'] })
      setConfirmExpenseTemplate(null)
      setRoutineWorksOpen(false)
    },
    onError: (err: Error) => toast.error('Failed to process expense', err.message)
  })

  const SidebarContent = () => (
    <>
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-sidebar-border">
        {org?.branding?.logo_url ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden border border-border bg-white dark:bg-zinc-900 p-0.5 shrink-0 shadow-sm">
            <img
              src={org.branding.logo_url}
              alt={org?.name || 'Shop Logo'}
              className="h-full w-full object-contain"
            />
          </div>
        ) : (
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
            style={{ backgroundColor: brandColor }}
          >
            <Store className="h-4 w-4 text-white" />
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold text-foreground tracking-wide truncate">BillScape</span>
          <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
            {org?.name ?? 'Your Shop'}
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <ul className="space-y-0.5">
          {NAV_ENTRIES.map((entry) => {
            if (entry.kind === 'item') {
              if (entry.item.permissionKey && permissions?.[entry.item.permissionKey] === false) return null
              return (
                <NavLinkItem
                  key={entry.item.href}
                  item={entry.item}
                  isActive={isNavItemActive(entry.item, location.pathname, location.search)}
                  brandColor={brandColor}
                  onNavigate={(href) => {
                    if (isNavItemActive(entry.item, location.pathname, location.search)) {
                      setSidebarOpen(false)
                      return
                    }
                    requestNavigation(() => {
                      setSidebarOpen(false)
                      navigate(href)
                    })
                  }}
                />
              )
            }

            const visibleItems = entry.group.items.filter(
              (item) => !item.permissionKey || permissions?.[item.permissionKey] !== false
            )
            if (visibleItems.length === 0) return null
            const GroupIcon = entry.group.icon
            const isOpen = openGroups[entry.group.label] ?? false
            const groupActive = isGroupActive(entry.group)

            return (
              <li key={entry.group.label}>
                <button
                  onClick={() => toggleGroup(entry.group.label)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                    groupActive ? 'text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  <GroupIcon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{entry.group.label}</span>
                  <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', isOpen && 'rotate-90')} />
                </button>
                {isOpen && (
                  <ul className="mt-0.5 space-y-0.5 border-l border-border ml-5 pl-2">
                    {visibleItems.map((item) => (
                      <NavLinkItem
                        key={item.href}
                        item={item}
                        isActive={isNavItemActive(item, location.pathname, location.search)}
                        brandColor={brandColor}
                        compact
                        onNavigate={(href) => {
                          if (isNavItemActive(item, location.pathname, location.search)) {
                            setSidebarOpen(false)
                            return
                          }
                          requestNavigation(() => {
                            setSidebarOpen(false)
                            navigate(href)
                          })
                        }}
                      />
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </nav>

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
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-sidebar border-r border-border no-print">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden no-print">
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

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 lg:px-6 no-print">
          <button
            className="lg:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1 max-w-sm lg:max-w-md">
            <button
              onClick={() => setGlobalSearchOpen(true)}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-border/80 transition-colors shadow-sm"
            >
              <div className="flex items-center gap-2 truncate">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">Search products, parties, bills...</span>
              </div>
              <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground shrink-0">
                <span className="text-[11px]">⌘</span>K
              </kbd>
            </button>
          </div>

          {/* Quick action shortcuts */}
          <div className="hidden md:flex items-center gap-2 ml-auto">
            {(!permissions || permissions['purchases'] !== false) && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={() => requestNavigation(() => navigate('/purchases/new'))}
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                New Purchase
              </Button>
            )}
            {(!permissions || permissions['billing'] !== false) && (
              <Button
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={() => requestNavigation(() => navigate('/billing'))}
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                POS
              </Button>
            )}

            {/* Quick-add dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setQuickAddOpen((prev) => !prev)}
              >
                <Plus className="h-4 w-4" />
              </Button>

              {quickAddOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setQuickAddOpen(false)} />
                  <div className="absolute right-0 top-full z-40 mt-1 w-64 rounded-lg border border-border bg-card shadow-xl overflow-hidden py-1">
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Sales</div>
                    <QuickAddLink icon={ShoppingCart} label="New Sale (POS)" onClick={() => { setQuickAddOpen(false); requestNavigation(() => navigate('/billing')) }} />
                    <QuickAddLink icon={FileText} label="New Quotation" onClick={() => { setQuickAddOpen(false); requestNavigation(() => navigate('/quotations')) }} />
                    <QuickAddLink icon={RotateCcw} label="New Return" onClick={() => { setQuickAddOpen(false); requestNavigation(() => navigate('/returns')) }} />

                    {(!permissions || permissions['purchases'] !== false) && (
                      <>
                        <div className="mt-1 border-t border-border px-3 pt-2 pb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Purchases &amp; Expenses</div>
                        <QuickAddLink icon={ShoppingBag} label="New Purchase" onClick={() => { setQuickAddOpen(false); requestNavigation(() => navigate('/purchases/new')) }} />
                        <QuickAddLink icon={Receipt} label="New Expense" onClick={() => { setQuickAddOpen(false); requestNavigation(() => navigate('/expenses')) }} />
                      </>
                    )}

                    <div className="mt-1 border-t border-border px-3 pt-2 pb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Masters</div>
                    {(!permissions || permissions['products'] !== false) && (
                      <QuickAddLink icon={Package} label="New Product" onClick={() => { setQuickAddOpen(false); requestNavigation(() => navigate('/products/new')) }} />
                    )}
                    <QuickAddLink icon={Users} label="New Customer" onClick={() => { setQuickAddOpen(false); requestNavigation(() => navigate('/customers')) }} />
                    {(!permissions || permissions['suppliers'] !== false) && (
                      <QuickAddLink icon={Truck} label="New Supplier" onClick={() => { setQuickAddOpen(false); requestNavigation(() => navigate('/suppliers')) }} />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* System Notifications */}
          <div className="relative">
            <button
              onClick={() => setSystemNotificationsOpen(prev => !prev)}
              className="relative p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <Bell className="h-5 w-5" />
              {sysNotifications.length > 0 && (
                <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center border-2 border-card">
                  {sysNotifications.length}
                </span>
              )}
            </button>

            {systemNotificationsOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setSystemNotificationsOpen(false)} />
                <div className="absolute right-0 top-full z-40 mt-1 w-80 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-secondary/30">
                    <h3 className="font-semibold text-sm">Notifications</h3>
                    <p className="text-xs text-muted-foreground">{sysNotifications.length} pending items</p>
                  </div>
                  
                  <div className="max-h-80 overflow-y-auto">
                    {sysNotifications.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500/50" />
                        <p>You're all caught up!</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {sysNotifications.map((n: any) => (
                          <div key={n.id} className="p-4 flex items-start justify-between gap-3 hover:bg-secondary/30 transition-colors">
                            <div>
                              <p className="text-sm font-medium text-foreground">{n.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{n.description}</p>
                              {n.type === 'low_stock' ? (
                                <p className="text-xs font-bold text-red-500 mt-1">Stock: {n.amount}</p>
                              ) : (
                                <p className="text-xs font-semibold mt-1">₹{n.amount}</p>
                              )}
                            </div>
                            {n.type === 'low_stock' ? (
                               <Button size="sm" variant="outline" onClick={() => { setSystemNotificationsOpen(false); navigate('/inventory') }}>Restock</Button>
                            ) : (
                               <Button size="sm" variant="outline" onClick={() => markAsPaid.mutate(n)}>Done</Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Routine Works */}
          <div className="relative">
            <button
              onClick={() => setRoutineWorksOpen(prev => !prev)}
              className="relative p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <ClipboardList className="h-5 w-5" />
              {pendingCount > 0 && (
                <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-orange-500 text-[10px] font-bold text-white flex items-center justify-center border-2 border-card">
                  {pendingCount}
                </span>
              )}
            </button>

            {routineWorksOpen && (

              <>
                <div className="fixed inset-0 z-30" onClick={() => setRoutineWorksOpen(false)} />
                <div className="absolute right-0 top-full z-40 mt-1 w-80 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-secondary/30">
                    <h3 className="font-semibold text-sm">Routine Works</h3>
                    <p className="text-xs text-muted-foreground">{currentMonth} Pending</p>
                  </div>
                  
                  <div className="max-h-80 overflow-y-auto">
                    {pendingCount === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500/50" />
                        <p>All routine works completed for this month!</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {isSalaryPending && (
                          <div className="p-4 flex items-start justify-between gap-3 hover:bg-secondary/30 transition-colors">
                            <div>
                              <p className="text-sm font-medium text-foreground">Monthly Payroll</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{unpaidEmployees.length} employee{unpaidEmployees.length > 1 ? 's' : ''} unpaid</p>
                            </div>
                            <Button size="sm" onClick={() => setSalaryPayoutOpen(true)}>Run Payroll</Button>
                          </div>
                        )}
                        {pendingStandard.map(t => (
                          <div key={t.id} className="p-4 flex items-start justify-between gap-3 hover:bg-secondary/30 transition-colors">
                            <div>
                              <p className="text-sm font-medium text-foreground">{t.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Due: Day {t.due_day} • ₹{t.default_amount}</p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => setConfirmExpenseTemplate(t)}>Pay</Button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Completed Section */}
                    {recurringTemplates && recurringTemplates.length > pendingCount && (
                      <div className="border-t border-border bg-secondary/10 px-4 py-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Completed</p>
                        <div className="space-y-2">
                          {!isSalaryPending && salaryTemplate && (
                            <div className="flex items-center gap-2 text-sm text-zinc-400">
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              Monthly Payroll
                            </div>
                          )}
                          {recurringTemplates.filter(t => t.category !== 'salary' && t.last_billed_month === currentMonth).map(t => (
                            <div key={t.id} className="flex items-center gap-2 text-sm text-zinc-400">
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              {t.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

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

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Salary Payroll Modal */}
      <Dialog open={salaryPayoutOpen} onOpenChange={setSalaryPayoutOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Run Monthly Payroll - {currentMonth}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="w-28">Base Salary</TableHead>
                    <TableHead className="w-32">Adv. Deduction</TableHead>
                    <TableHead className="w-24">Bonus</TableHead>
                    <TableHead className="w-24">Other Ded.</TableHead>
                    <TableHead className="w-28 text-right">Net Payout</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unpaidEmployees.map(emp => {
                    const inputs = salaryInputs[emp.id] || { baseSalary: 0, advanceDeduction: 0, bonus: 0, otherDeduction: 0 }
                    const netPaid = inputs.baseSalary + inputs.bonus - inputs.advanceDeduction - inputs.otherDeduction
                    return (
                      <TableRow key={emp.id}>
                        <TableCell>
                          <p className="font-medium">{emp.full_name}</p>
                          {emp.salary_advance_balance > 0 && (
                            <p className="text-[10px] text-amber-500 mt-0.5">Adv. Bal: ₹{emp.salary_advance_balance}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input type="number" min="0" value={inputs.baseSalary} onChange={e => handleSalaryInput(emp.id, 'baseSalary', e.target.value)} className="h-8 text-xs" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min="0" max={emp.salary_advance_balance} value={inputs.advanceDeduction} onChange={e => handleSalaryInput(emp.id, 'advanceDeduction', e.target.value)} className="h-8 text-xs" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min="0" value={inputs.bonus} onChange={e => handleSalaryInput(emp.id, 'bonus', e.target.value)} className="h-8 text-xs" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min="0" value={inputs.otherDeduction} onChange={e => handleSalaryInput(emp.id, 'otherDeduction', e.target.value)} className="h-8 text-xs" />
                        </TableCell>
                        <TableCell className="text-right font-medium">₹{netPaid}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            
            <div className="flex items-center justify-between bg-secondary/30 p-4 rounded-lg">
              <div className="flex items-center gap-4">
                <Label>Payment Mode</Label>
                <select 
                  value={salaryPaymentMode}
                  onChange={e => setSalaryPaymentMode(e.target.value)}
                  className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="upi">UPI</option>
                </select>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Payout</p>
                <p className="text-2xl font-bold text-foreground">
                  ₹{unpaidEmployees.reduce((sum, emp) => {
                    const inputs = salaryInputs[emp.id] || { baseSalary: 0, advanceDeduction: 0, bonus: 0, otherDeduction: 0 }
                    return sum + (inputs.baseSalary + inputs.bonus - inputs.advanceDeduction - inputs.otherDeduction)
                  }, 0)}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSalaryPayoutOpen(false)}>Cancel</Button>
            <Button onClick={() => processSalaryMutation.mutate()} disabled={processSalaryMutation.isPending}>
              {processSalaryMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</> : 'Confirm Payouts'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Standard Recurring Expense Modal */}
      <Dialog open={!!confirmExpenseTemplate} onOpenChange={(open) => !open && setConfirmExpenseTemplate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Process {confirmExpenseTemplate?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input 
                type="number" 
                min="0" 
                value={standardExpenseInput.amount} 
                onChange={e => setStandardExpenseInput(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))} 
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input 
                type="date" 
                value={standardExpenseInput.date} 
                onChange={e => setStandardExpenseInput(prev => ({ ...prev, date: e.target.value }))} 
              />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Mode</Label>
              <select 
                value={standardExpenseInput.paymentMode}
                onChange={e => setStandardExpenseInput(prev => ({ ...prev, paymentMode: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="upi">UPI</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input 
                value={standardExpenseInput.notes} 
                onChange={e => setStandardExpenseInput(prev => ({ ...prev, notes: e.target.value }))} 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmExpenseTemplate(null)}>Cancel</Button>
            <Button onClick={() => processStandardMutation.mutate()} disabled={processStandardMutation.isPending}>
              {processStandardMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</> : 'Confirm Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Global Command & Search Dialog */}
      <GlobalSearchDialog open={globalSearchOpen} onOpenChange={setGlobalSearchOpen} />
    </div>
  )
}
