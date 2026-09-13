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
  X,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ThemeToggle from '@/components/theme-toggle'
import { MinhaPontuacao } from '@/components/marcacao/MinhaPontuacao'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Visão Geral', icon: LayoutDashboard },
  { href: '/dashboard/radar', label: 'Radar de Obras', icon: MapPin },
  { href: '/dashboard/crm', label: 'CRM', icon: Users },
  { href: '/dashboard/deals', label: 'Oportunidades', icon: Building2 },
  { href: '/dashboard/pontuacao', label: 'Minhas Marcações', icon: Trophy },
  { href: '/dashboard/relatorios', label: 'Relatórios', icon: TrendingUp },
  { href: '/dashboard/configuracao', label: 'Configurações', icon: Settings },
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
            {userId && (
              <div className="mt-2">
                <MinhaPontuacao userId={userId} compact />
              </div>
            )}
          </div>
          <Link
            href="/dashboard/pontuacao"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Trophy className="h-4 w-4" />
            Minhas Marcações
          </Link>
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
            <BuscaGlobal />
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/crm/novo">
              <Button size="sm" className="hidden sm:flex">
                <Plus className="h-4 w-4 mr-1" />
                Novo Lead
              </Button>
            </Link>
            <SinoNotificacoes />
            <ThemeToggle />
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
        className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute right-0 top-0 h-5 w-5 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center animate-pulse">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 rounded-lg border bg-paper shadow-xl z-50 max-h-96 overflow-y-auto">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="font-heading font-bold text-sm">Notificações</h3>
            <Link href="/dashboard/notificacoes" onClick={() => setOpen(false)} className="text-xs text-primary hover:underline">
              Ver todas
            </Link>
          </div>
          {notifs.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma notificação.
            </div>
          ) : (
            <div className="divide-y">
              {notifs.map(n => (
                <Link
                  key={n.id}
                  href={n.link}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-3 hover:bg-muted transition-colors"
                >
                  <p className="text-sm truncate">{n.titulo}</p>
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
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground z-10" />
      <Input
        placeholder="Buscar obras, leads..."
        className="pl-9 bg-muted/50 border-0 focus-visible:ring-1"
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
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {open && query.length >= 2 && (
        <div className="absolute top-full mt-1 w-full rounded-lg border bg-paper shadow-xl z-50 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Buscando...</div>
          ) : total === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Nenhum resultado para "{query}"
            </div>
          ) : (
            <>
              {resultados.obras.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-bold text-muted-foreground uppercase bg-muted/30">
                    📍 Obras ({resultados.obras.length})
                  </div>
                  {resultados.obras.map(o => (
                    <Link
                      key={o.id}
                      href={`/dashboard/radar/${o.id}`}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2 hover:bg-muted"
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
                  <div className="px-3 py-2 text-xs font-bold text-muted-foreground uppercase bg-muted/30">
                    👤 Leads ({resultados.leads.length})
                  </div>
                  {resultados.leads.map(l => (
                    <Link
                      key={l.id}
                      href={`/dashboard/crm/${l.id}`}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2 hover:bg-muted"
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
