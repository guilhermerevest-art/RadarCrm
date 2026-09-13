'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Bell,
  MapPin,
  Users,
  Check,
  X,
  Trash2,
} from 'lucide-react'

type Notificacao = {
  id: string
  tipo: 'nova_obra' | 'novo_lead' | 'lead_atribuido' | 'sistema'
  titulo: string
  descricao: string
  link?: string
  lida: boolean
  created_at: string
}

export default function NotificacoesPage() {
  const supabase = createClient()
  const [notifs, setNotifs] = useState<Notificacao[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregar()
    // Realtime: escuta mudanças no radar_obras
    const channel = supabase
      .channel('notificacoes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'radar_obras' }, (payload) => {
        const novaObra = payload.new as any
        const n: Notificacao = {
          id: `new-${novaObra.id}`,
          tipo: 'nova_obra',
          titulo: '🏗️ Nova obra detectada!',
          descricao: `${novaObra.endereco_logradouro}, ${novaObra.endereco_cidade}/${novaObra.endereco_uf}`,
          link: `/dashboard/radar/${novaObra.id}`,
          lida: false,
          created_at: new Date().toISOString(),
        }
        setNotifs(prev => [n, ...prev])
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_leads' }, (payload) => {
        const novoLead = payload.new as any
        const n: Notificacao = {
          id: `lead-${novoLead.id}`,
          tipo: 'novo_lead',
          titulo: '👤 Novo lead criado!',
          descricao: novoLead.nome + (novoLead.empresa ? ` · ${novoLead.empresa}` : ''),
          link: `/dashboard/crm/${novoLead.id}`,
          lida: false,
          created_at: new Date().toISOString(),
        }
        setNotifs(prev => [n, ...prev])
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  async function carregar() {
    // Como não temos tabela de notificações persistida, mostramos as últimas obras/leads criados
    const [obrasRes, leadsRes] = await Promise.all([
      supabase
        .from('radar_obras')
        .select('id, endereco_logradouro, endereco_cidade, endereco_uf, created_at')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('crm_leads')
        .select('id, nome, empresa, created_at')
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    const items: Notificacao[] = []

    ;(obrasRes.data ?? []).forEach(o => {
      items.push({
        id: `obra-${o.id}`,
        tipo: 'nova_obra',
        titulo: 'Nova obra',
        descricao: `${o.endereco_logradouro}, ${o.endereco_cidade}/${o.endereco_uf}`,
        link: `/dashboard/radar/${o.id}`,
        lida: false,
        created_at: o.created_at,
      })
    })

    ;(leadsRes.data ?? []).forEach(l => {
      items.push({
        id: `lead-${l.id}`,
        tipo: 'novo_lead',
        titulo: 'Novo lead',
        descricao: l.nome + (l.empresa ? ` · ${l.empresa}` : ''),
        link: `/dashboard/crm/${l.id}`,
        lida: false,
        created_at: l.created_at,
      })
    })

    // Ordena por data
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    setNotifs(items)
    setLoading(false)
  }

  function marcarLida(id: string) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n))
  }

  function marcarTodasLidas() {
    setNotifs(prev => prev.map(n => ({ ...n, lida: true })))
  }

  function limpar() {
    setNotifs([])
  }

  const naoLidas = notifs.filter(n => !n.lida).length

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-dark flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Notificações
            {naoLidas > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary text-white text-xs font-bold h-6 w-6">
                {naoLidas}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Atualizado em tempo real · últimas obras e leads
          </p>
        </div>
        <div className="flex gap-2">
          {naoLidas > 0 && (
            <Button variant="outline" size="sm" onClick={marcarTodasLidas}>
              <Check className="h-4 w-4 mr-1" />
              Marcar todas
            </Button>
          )}
          {notifs.length > 0 && (
            <Button variant="ghost" size="sm" onClick={limpar}>
              <Trash2 className="h-4 w-4 mr-1" />
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : notifs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Bell className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-heading text-lg font-semibold text-dark">
              Tudo tranquilo por aqui
            </h3>
            <p className="text-sm text-muted-foreground mt-2">
              Você será notificado quando entrar uma nova obra ou lead.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifs.map(n => (
            <Link
              key={n.id}
              href={n.link ?? '#'}
              onClick={() => marcarLida(n.id)}
              className={`block rounded-lg border transition-all ${
                n.lida
                  ? 'bg-paper border-border/30 hover:border-border'
                  : 'bg-primary/5 border-primary/30 hover:bg-primary/10'
              }`}
            >
              <div className="p-4 flex items-start gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0 ${
                  n.tipo === 'nova_obra' ? 'bg-amber-100' : 'bg-blue-100'
                }`}>
                  {n.tipo === 'nova_obra' ? <MapPin className="h-5 w-5 text-amber-700" /> : <Users className="h-5 w-5 text-blue-700" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className={`font-semibold text-sm ${n.lida ? 'text-muted-foreground' : 'text-dark'}`}>
                      {n.titulo}
                    </p>
                    <p className="text-xs text-muted-foreground flex-shrink-0">
                      {new Date(n.created_at).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{n.descricao}</p>
                </div>
                {!n.lida && (
                  <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
