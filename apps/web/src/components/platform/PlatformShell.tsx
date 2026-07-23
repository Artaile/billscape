import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Building2, CreditCard, Users2, BarChart3,
  Settings, LogOut, Menu, X, Shield, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

const NAV = [
  { label: 'Dashboard', href: '/platform', icon: LayoutDashboard, exact: true },
  { label: 'Tenants', href: '/platform/tenants', icon: Building2 },
  { label: 'Plans', href: '/platform/plans', icon: CreditCard },
  { label: 'Subscriptions', href: '/platform/subscriptions', icon: Users2 },
  { label: 'Usage', href: '/platform/usage', icon: BarChart3 },
  { label: 'Settings', href: '/platform/settings', icon: Settings },
]

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const displayName = user?.email?.split('@')[0] ?? 'Super Admin'

  const handleSignOut = async () => {
    await signOut()
    navigate('/platform/login')
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-700/50">
        <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
          <Shield className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white tracking-wide">BillScape</p>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Master Admin</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV.map((item) => {
          const isActive = item.exact
            ? location.pathname === item.href
            : location.pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom user */}
      <div className="p-3 border-t border-slate-700/50">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm">
          <div className="h-7 w-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {displayName[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{displayName}</p>
            <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
          </div>
        </div>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-slate-900 border-r border-slate-700/50">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setSidebarOpen(false)} />
          <aside className="relative flex flex-col w-56 h-full bg-slate-900 border-r border-slate-700/50 shadow-2xl">
            <button onClick={() => setSidebarOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded text-slate-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center gap-3 border-b border-slate-700/50 bg-slate-900/50 backdrop-blur px-4 lg:px-6 shrink-0">
          <button className="lg:hidden p-1.5 rounded text-slate-400 hover:text-white"
            onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest hidden lg:block">
              Platform Portal
            </span>
          </div>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((p) => !p)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
            >
              <div className="h-7 w-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                {displayName[0]?.toUpperCase()}
              </div>
              <span className="hidden sm:block text-xs font-medium max-w-[120px] truncate text-slate-300">
                {displayName}
              </span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full z-40 mt-1 w-48 rounded-lg border border-slate-700 bg-slate-800 shadow-xl py-1">
                  <div className="px-3 py-2 border-b border-slate-700">
                    <p className="text-xs font-semibold text-white">{displayName}</p>
                    <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
                  </div>
                  <Link
                    to="/dashboard"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                  >
                    <Building2 className="h-4 w-4" />
                    My Shop
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-slate-700 hover:text-red-300 transition-colors"
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
        <main className="flex-1 overflow-y-auto bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  )
}
