import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { UserRole } from '@billscape/core'
import { LoginPage } from '@/pages/auth/LoginPage'
import { OnboardingPage } from '@/pages/auth/OnboardingPage'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { BillingPage } from '@/pages/billing/BillingPage'
import { ProductsPage } from '@/pages/products/ProductsPage'
import { ProductFormPage } from '@/pages/products/ProductFormPage'
import { InventoryPage } from '@/pages/inventory/InventoryPage'
import { CustomersPage } from '@/pages/customers/CustomersPage'
import { ReportsPage } from '@/pages/reports/ReportsPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { PurchasesPage } from '@/pages/purchases/PurchasesPage'
import { SuppliersPage } from '@/pages/suppliers/SuppliersPage'
import { ExpensesPage } from '@/pages/expenses/ExpensesPage'
import { PromotionsPage } from '@/pages/promotions/PromotionsPage'
import { ReturnsPage } from '@/pages/returns/ReturnsPage'
import { QuotationsPage } from '@/pages/quotations/QuotationsPage'
import { LoyaltyPage } from '@/pages/loyalty/LoyaltyPage'
import { ActivityPage } from '@/pages/activity/ActivityPage'
import { ShiftsPage } from '@/pages/shifts/ShiftsPage'
import { LedgerPage } from '@/pages/ledger/LedgerPage'
import { EmployeesPage } from '@/pages/employees/EmployeesPage'
import { RolesPage } from '@/pages/roles/RolesPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireOrg({ children }: { children: React.ReactNode }) {
  const { org, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!org) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function RequireRole({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { role, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!role || !roles.includes(role)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Loading BillScape...</p>
      </div>
    </div>
  )
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <RequireOrg>
              <AppShell>
                <Routes>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="billing" element={<BillingPage />} />
                  <Route path="products" element={<ProductsPage />} />
                  <Route path="products/new" element={<ProductFormPage />} />
                  <Route path="products/:id/edit" element={<ProductFormPage />} />
                  <Route path="inventory" element={<InventoryPage />} />
                  <Route path="purchases" element={<RequireRole roles={['owner', 'manager']}><PurchasesPage /></RequireRole>} />
                  <Route path="suppliers" element={<RequireRole roles={['owner', 'manager']}><SuppliersPage /></RequireRole>} />
                  <Route path="customers" element={<CustomersPage />} />
                  <Route path="expenses" element={<RequireRole roles={['owner', 'manager']}><ExpensesPage /></RequireRole>} />
                  <Route path="promotions" element={<RequireRole roles={['owner', 'manager']}><PromotionsPage /></RequireRole>} />
                  <Route path="returns" element={<ReturnsPage />} />
                  <Route path="quotations" element={<QuotationsPage />} />
                  <Route path="loyalty" element={<LoyaltyPage />} />
                  <Route path="employees" element={<RequireRole roles={['owner', 'manager']}><EmployeesPage /></RequireRole>} />
                  <Route path="roles" element={<RequireRole roles={['owner']}><RolesPage /></RequireRole>} />
                  <Route path="activity" element={<RequireRole roles={['owner', 'manager']}><ActivityPage /></RequireRole>} />
                  <Route path="reports" element={<RequireRole roles={['owner', 'manager']}><ReportsPage /></RequireRole>} />
                  <Route path="shifts" element={<RequireRole roles={['owner', 'manager']}><ShiftsPage /></RequireRole>} />
                  <Route path="ledger" element={<RequireRole roles={['owner', 'manager']}><LedgerPage /></RequireRole>} />
                  <Route path="settings" element={<RequireRole roles={['owner']}><SettingsPage /></RequireRole>} />
                </Routes>
              </AppShell>
            </RequireOrg>
          </RequireAuth>
        }
      />
    </Routes>
  )
}
