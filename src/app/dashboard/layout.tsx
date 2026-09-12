'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  MapPin,
  Building2,
  Settings,
  Bell,
  Search,
  LogOut,
  ChevronDown,
  Plus,
  User,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Visão Geral', icon: LayoutDashboard },
  { href: '/dashboard/radar', label: 'Radar de Obras', icon: MapPin },
  { href: '/dashboard/crm', label: 'CRM', icon: Users },
  { href: '/dashboard/deals', label: 'Oportunidades', icon: Building2 },
  { href: '/dashboard/configuracao', label: 'Configurações', icon: Settings },
]

function UserMenu() {
  const [user, setUser] = useState<{ email?: string; nome?: string } | null>(null)
  const [open, setOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser({
          email: data.user.email,
          nome: data.user.user_metadata?.full_name,
        })
      }
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white text-xs font-bold">
          {user?.nome?.[0] ?? user?.email?.[0] ?? 'U'}
        </div>
        <span className="hidden sm:block font-medium text-foreground truncate max-w-32">
          {user?.nome ?? user?.email?.split('@')[0] ?? 'Usuário'}
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border bg-paper shadow-lg z-50">
          <div className="px-3 py-2 border-b">
            <p className="text-xs font-medium truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      )}
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r bg-paper transition-all duration-200',
          sidebarOpen ? 'w-64' : 'w-16'
        )}
      >
        {/* Logo */}
        <div className={cn('flex h-16 items-center border-b px-4', sidebarOpen ? 'justify-between' : 'justify-center')}>
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="3" fill="white"/>
              </svg>
            </div>
            {sidebarOpen && (
              <span className="font-heading text-lg font-bold text-dark">Radar Canteiro</span>
            )}
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Bottom */}
        <div className="border-t p-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex w-full items-center justify-center rounded-lg py-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <svg className={cn('h-4 w-4 transition-transform', sidebarOpen ? '' : 'rotate-180')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b bg-paper px-4 sm:px-6">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative hidden sm:block flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar obras, leads..."
                className="pl-9 bg-muted/50 border-0 focus-visible:ring-1"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/crm/novo">
              <Button size="sm" className="hidden sm:flex">
                <Plus className="h-4 w-4 mr-1" />
                Novo Lead
              </Button>
            </Link>
            <button className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />
            </button>
            <UserMenu />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
