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
  MessageSquare,
  Search,
  LogOut,
  ChevronDown,
  Plus,
  TrendingUp,
  Trophy,
  ChevronLeft,
  ChevronRight,
  Activity,
  BarChart3,
  Database,
  Zap,
  X,
  CreditCard,
  Shield,
  HelpCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ThemeToggle from '@/components/theme-toggle'
import { MinhaPontuacao } from '@/components/marcacao/MinhaPontuacao'
import { Badge } from '@/components/ui/badge'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Visão Geral', icon: LayoutDashboard },
  { href: '/dashboard/radar', label: 'Radar de Obras', icon: MapPin },
  { href: '/dashboard/crm', label: 'CRM', icon: Users, submenu: [
      { href: '/dashboard/crm', label: 'Leads', icon: Users },
      { href: '/dashboard/crm/quadro', label: 'Pipeline', icon: TrendingUp },
      { href: '/dashboard/crm/calendario', label: 'Calendário', icon: Activity },
      { href: '/dashboard/crm/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/dashboard/crm/automacoes', label: 'Automações', icon: Zap },
    ]},
  { href: '/dashboard/whatsapp', label: 'WhatsApp', icon: MessageSquare, submenu: [
      { href: '/dashboard/whatsapp', label: 'Conversas', icon: MessageSquare },
      { href: '/dashboard/whatsapp/alertas', label: 'Alertas', icon: Bell },
    ]},
  { href: '/dashboard/deals', label: 'Oportunidades', icon: Building2 },
  { href: '/dashboard/comerciais', label: 'Cad. Comerciais', icon: Database },
  { href: '/dashboard/pontuacao', label: 'Minhas Marcações', icon: Trophy },
  { href: '/dashboard/relatorios', label: 'Relatórios', icon: TrendingUp },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/configuracao', label: 'Configurações', icon: Settings },
]

const SUPPORT_ITEMS = [
  { href: '/help', label: 'Central de Ajuda', icon: HelpCircle, external: true },
]

const ADMIN_ITEMS = [
  { href: '/dashboard/admin', label: 'Admin Panel', icon: Shield },
  { href: '/dashboard/admin/etl', label: 'ETL / Fontes', icon: Zap },
]

function UserMenu() {
  const [user, setUser] = useState<{ email?: string; nome?: string } | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id)
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
        className={cn(
          'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium',
          'hover:bg-accent/50 transition-all duration-200',
          open && 'bg-accent/50'
        )}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-white text-sm font-bold shadow-sm">
          {user?.nome?.[0] ?? user?.email?.[0] ?? 'U'}
        </div>
        <span className="hidden lg:block font-medium text-foreground truncate max-w-36">
          {user?.nome ?? user?.email?.split('@')[0] ?? 'Usuário'}
        </span>
        <ChevronDown className={cn(
          'h-4 w-4 text-muted-foreground transition-transform duration-200',
          open && 'rotate-180'
        )} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border bg-card shadow-soft-lg z-50 animate-scale-in">
          <div className="p-4 border-b bg-gradient-primary/5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-white text-lg font-bold shadow-md">
                {user?.nome?.[0] ?? user?.email?.[0] ?? 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{user?.nome ?? 'Usuário'}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
            {userId && (
              <div className="mt-3 pt-3 border-t">
                <MinhaPontuacao userId={userId} compact />
              </div>
            )}
          </div>
          <div className="p-2">
            <Link
              href="/dashboard/pontuacao"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <Trophy className="h-4 w-4" />
              Minhas Marcações
            </Link>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sair da conta
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col border-r bg-card transition-all duration-300 ease-out',
          'relative z-20',
          sidebarCollapsed ? 'w-[72px]' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex h-16 items-center border-b transition-all duration-300',
          sidebarCollapsed ? 'justify-center px-2' : 'px-5'
        )}>
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-white shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="3" fill="currentColor"/>
              </svg>
            </div>
            {!sidebarCollapsed && (
              <div className="flex flex-col">
                <span className="font-heading text-lg font-bold text-foreground leading-tight">Radar Canteiro</span>
                <span className="text-[10px] text-muted-foreground font-medium tracking-wide uppercase">CRM</span>
              </div>
            )}
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1 scrollbar-thin">
          {NAV_ITEMS.map((item, idx) => {
            // Item pai fica ativo apenas se nao ha submenu ativo E o proprio path dele bate
            const isParentActive = pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))

            // Verificar se algum submenu está ativo
            const submenuActive = item.submenu?.some(sub =>
              pathname === sub.href || pathname.startsWith(sub.href + '/')
            ) ?? false

            // Item pai NAO fica ativo se algum submenu estiver ativo
            const showParentActive = isParentActive && !submenuActive

            if (item.submenu) {
              return (
                <div key={item.href}>
                  <div className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                    showParentActive
                      ? 'bg-gradient-primary text-white shadow-md'
                      : submenuActive
                        ? 'text-foreground bg-accent/40'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}>
                    <item.icon className={cn(
                      'h-5 w-5 flex-shrink-0 transition-colors',
                      showParentActive ? 'text-white' : ''
                    )} />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </div>
                  {!sidebarCollapsed && item.submenu.map(sub => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200 ml-4',
                        pathname === sub.href || pathname.startsWith(sub.href + '/')
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      )}
                    >
                      <sub.icon className="h-4 w-4 flex-shrink-0" />
                      <span>{sub.label}</span>
                    </Link>
                  ))}
                </div>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  showParentActive
                    ? 'bg-gradient-primary text-white shadow-md'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <item.icon className={cn(
                  'h-5 w-5 flex-shrink-0 transition-colors',
                  showParentActive ? 'text-white' : ''
                )} />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </Link>
            )
          })}

          {/* Support section */}
          {SUPPORT_ITEMS.length > 0 && (
            <div className="pt-4 mt-4 border-t">
              {!sidebarCollapsed && (
                <p className="px-3 pb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Suporte</p>
              )}
              {SUPPORT_ITEMS.map((item) => {
                const isActive = pathname === item.href
                const Icon = item.icon
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    target={item.external ? '_blank' : undefined}
                    rel={item.external ? 'noopener noreferrer' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-200',
                      isActive
                        ? 'bg-secondary/10 text-secondary border border-secondary/20'
                        : 'text-muted-foreground/70 hover:text-foreground hover:bg-accent border border-transparent'
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </a>
                )
              })}
            </div>
          )}

          {/* Admin section */}
          {ADMIN_ITEMS.length > 0 && (
            <div className="pt-4 mt-4 border-t">
              {!sidebarCollapsed && (
                <p className="px-3 pb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Admin</p>
              )}
              {ADMIN_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-200',
                      isActive
                        ? 'bg-secondary/10 text-secondary border border-secondary/20'
                        : 'text-muted-foreground/70 hover:text-foreground hover:bg-accent border border-transparent'
                    )}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          )}
        </nav>

        {/* Bottom - Collapse button */}
        <div className="border-t p-2">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={cn(
              'flex w-full items-center rounded-xl py-2.5 text-muted-foreground',
              'hover:bg-accent hover:text-foreground transition-all duration-200',
              sidebarCollapsed ? 'justify-center' : 'justify-center gap-2 px-3'
            )}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span className="text-sm">Recolher</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b bg-card/80 backdrop-blur-sm px-4 sm:px-6">
          <div className="flex items-center gap-4 flex-1">
            <BuscaGlobal />
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/crm/novo">
              <Button size="sm" className="shadow-sm">
                <Plus className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Novo Lead</span>
              </Button>
            </Link>
            <SinoNotificacoes />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-background via-background to-muted/20">
          {children}
        </main>
      </div>
    </div>
  )
}

// ============================================================================
// Sino de notificações
// ============================================================================

function SinoNotificacoes() {
  const supabase = createClient()
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState<Array<{ id: string; tipo: 'obra' | 'lead'; titulo: string; link: string; created_at: string }>>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    carregar()

    const channel = supabase
      .channel('sino')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'radar_obras' }, (payload) => {
        const n = payload.new as any
        setNotifs(prev => [{
          id: `o-${n.id}`,
          tipo: 'obra',
          titulo: `🏗️ ${n.endereco_logradouro}, ${n.endereco_cidade}/${n.endereco_uf}`,
          link: `/dashboard/radar/${n.id}`,
          created_at: new Date().toISOString(),
        }, ...prev.slice(0, 9)])
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_leads' }, (payload) => {
        const n = payload.new as any
        setNotifs(prev => [{
          id: `l-${n.id}`,
          tipo: 'lead',
          titulo: `👤 ${n.nome}`,
          link: `/dashboard/crm/${n.id}`,
          created_at: new Date().toISOString(),
        }, ...prev.slice(0, 9)])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    setCount(notifs.length)
  }, [notifs])

  async function carregar() {
    const [obrasRes, leadsRes] = await Promise.all([
      supabase
        .from('radar_obras')
        .select('id, endereco_logradouro, endereco_cidade, endereco_uf, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('crm_leads')
        .select('id, nome, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    const items: typeof notifs = []
    ;(obrasRes.data ?? []).forEach(o => {
      items.push({
        id: `o-${o.id}`,
        tipo: 'obra',
        titulo: `🏗️ ${o.endereco_logradouro}, ${o.endereco_cidade}/${o.endereco_uf}`,
        link: `/dashboard/radar/${o.id}`,
        created_at: o.created_at,
      })
    })
    ;(leadsRes.data ?? []).forEach(l => {
      items.push({
        id: `l-${l.id}`,
        tipo: 'lead',
        titulo: `👤 ${l.nome}`,
        link: `/dashboard/crm/${l.id}`,
        created_at: l.created_at,
      })
    })
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setNotifs(items.slice(0, 10))
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'relative rounded-xl p-2.5 transition-all duration-200',
          open
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        )}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center shadow-sm animate-pulse-soft">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border bg-card shadow-soft-lg z-50 animate-scale-in overflow-hidden">
          <div className="px-4 py-3 border-b bg-gradient-to-r from-primary/5 to-transparent flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="font-heading font-bold text-sm">Notificações</h3>
              {count > 0 && <Badge variant="default" className="h-5 text-[10px] px-1.5">{count}</Badge>}
            </div>
            <Link href="/dashboard/notificacoes" onClick={() => setOpen(false)} className="text-xs text-primary hover:underline font-medium">
              Ver todas
            </Link>
          </div>
          {notifs.length === 0 ? (
            <div className="p-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Bell className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhuma notificação no momento</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y">
              {notifs.map(n => (
                <Link
                  key={n.id}
                  href={n.link}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-3 hover:bg-accent/50 transition-colors"
                >
                  <p className="text-sm font-medium truncate">{n.titulo}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(n.created_at).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BuscaGlobal() {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resultados, setResultados] = useState<{
    obras: Array<{ id: string; endereco_logradouro: string; endereco_cidade: string; endereco_uf: string; fase_atual: string }>
    leads: Array<{ id: string; nome: string; empresa?: string; status: string }>
  }>({ obras: [], leads: [] })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (!query || query.length < 2) {
      setResultados({ obras: [], leads: [] })
      return
    }
    const timeoutId = setTimeout(async () => {
      setLoading(true)
      const [obrasRes, leadsRes] = await Promise.all([
        supabase
          .from('radar_obras')
          .select('id, endereco_logradouro, endereco_cidade, endereco_uf, fase_atual')
          .or(`endereco_logradouro.ilike.%${query}%,endereco_bairro.ilike.%${query}%,endereco_cidade.ilike.%${query}%`)
          .limit(5),
        supabase
          .from('crm_leads')
          .select('id, nome, empresa, status')
          .or(`nome.ilike.%${query}%,empresa.ilike.%${query}%`)
          .limit(5),
      ])
      setResultados({
        obras: obrasRes.data ?? [],
        leads: leadsRes.data ?? [],
      })
      setLoading(false)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [query, supabase])

  const total = resultados.obras.length + resultados.leads.length

  return (
    <div ref={ref} className="relative hidden sm:block flex-1 max-w-md">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground z-10" />
        <Input
          placeholder="Buscar obras, leads, empresas..."
          className="pl-10 pr-10 bg-muted/50 border-transparent focus:bg-background focus:border-primary/30 focus:ring-2 focus:ring-primary/20"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setOpen(false) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && query.length >= 2 && (
        <div className="absolute top-full mt-2 w-full rounded-xl border bg-card shadow-soft-lg z-50 max-h-96 overflow-y-auto animate-fade-in">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              <div className="flex items-center justify-center gap-2">
                <Activity className="h-4 w-4 animate-pulse" />
                Buscando...
              </div>
            </div>
          ) : total === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Nenhum resultado para "{query}"
            </div>
          ) : (
            <>
              {resultados.obras.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-bold text-muted-foreground uppercase bg-muted/30 flex items-center gap-2">
                    <MapPin className="h-3 w-3" /> Obras ({resultados.obras.length})
                  </div>
                  {resultados.obras.map(o => (
                    <Link
                      key={o.id}
                      href={`/dashboard/radar/${o.id}`}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2.5 hover:bg-accent/50 transition-colors"
                    >
                      <p className="text-sm font-medium truncate">{o.endereco_logradouro}</p>
                      <p className="text-xs text-muted-foreground">
                        {o.endereco_cidade}/{o.endereco_uf} · {o.fase_atual}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
              {resultados.leads.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-bold text-muted-foreground uppercase bg-muted/30 flex items-center gap-2">
                    <Users className="h-3 w-3" /> Leads ({resultados.leads.length})
                  </div>
                  {resultados.leads.map(l => (
                    <Link
                      key={l.id}
                      href={`/dashboard/crm/${l.id}`}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2.5 hover:bg-accent/50 transition-colors"
                    >
                      <p className="text-sm font-medium truncate">{l.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.empresa || '—'} · {l.status}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
