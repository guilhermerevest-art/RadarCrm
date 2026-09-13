'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Mail,
  Phone,
  Building2,
  LayoutGrid,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

type Lead = {
  id: string
  nome: string
  empresa?: string
  email?: string
  telefone?: string
  origem: string
  status: string
  score_engajamento?: number
  valor_estimado?: number
}

const COLUNAS = [
  { value: 'novo', label: '🆕 Novos', color: 'border-blue-300' },
  { value: 'qualificado', label: '🔥 Qualificados', color: 'border-primary' },
  { value: 'convertido', label: '✅ Convertidos', color: 'border-green-300' },
  { value: 'descarte', label: '🗑️ Descartes', color: 'border-gray-300' },
]

export default function CrmKanbanPage() {
  const supabase = createClient()
  const { toast } = useToast()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('crm_leads')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
    } else {
      setLeads(data || [])
    }
    setLoading(false)
  }

  async function moverLead(leadId: string, novoStatus: string) {
    // Otimista
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: novoStatus } : l))

    const { error } = await supabase
      .from('crm_leads')
      .update({ status: novoStatus, updated_at: new Date().toISOString() })
      .eq('id', leadId)

    if (error) {
      toast({ title: 'Erro ao mover', description: error.message, variant: 'destructive' })
      carregar()
    } else {
      const col = COLUNAS.find(c => c.value === novoStatus)
      toast({ title: `Lead movido para ${col?.label}` })
    }
  }

  function onDragStart(e: React.DragEvent, id: string) {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e: React.DragEvent, col: string) {
    e.preventDefault()
    setDragOverCol(col)
  }

  function onDrop(e: React.DragEvent, novoStatus: string) {
    e.preventDefault()
    setDragOverCol(null)
    if (draggedId) {
      moverLead(draggedId, novoStatus)
      setDraggedId(null)
    }
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-dark flex items-center gap-2">
            <LayoutGrid className="h-6 w-6 text-primary" />
            Quadro de Leads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Arraste os cards para mudar o estágio do lead
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/crm">
            <Button variant="outline">Lista</Button>
          </Link>
          <Link href="/dashboard/crm/novo">
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              Novo Lead
            </Button>
          </Link>
        </div>
      </div>

      {/* Board */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUNAS.map((col) => {
            const colLeads = leads.filter(l => l.status === col.value)
            const total = colLeads.reduce((sum, l) => sum + (l.valor_estimado || 0), 0)

            return (
              <div
                key={col.value}
                onDragOver={(e) => onDragOver(e, col.value)}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={(e) => onDrop(e, col.value)}
                className={`border-t-4 ${col.color} bg-muted/30 rounded-lg p-3 transition-all ${
                  dragOverCol === col.value ? 'ring-2 ring-primary bg-primary/5' : ''
                }`}
              >
                {/* Header coluna */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="font-heading font-bold text-sm">
                    {col.label}
                  </h3>
                  <Badge variant="outline">{colLeads.length}</Badge>
                </div>
                {total > 0 && (
                  <div className="text-xs text-muted-foreground px-1 mb-3">
                    💰 R$ {(total / 1000).toFixed(0)}k
                  </div>
                )}

                {/* Cards */}
                <div className="space-y-2 min-h-[100px]">
                  {colLeads.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-6 border-2 border-dashed rounded-lg">
                      Solte leads aqui
                    </div>
                  ) : (
                    colLeads.map((lead) => (
                      <Link key={lead.id} href={`/dashboard/crm/${lead.id}`}>
                        <Card
                          draggable
                          onDragStart={(e) => onDragStart(e, lead.id)}
                          onDragEnd={() => setDraggedId(null)}
                          className={`border-border/50 hover:shadow-md cursor-pointer transition-all ${
                            draggedId === lead.id ? 'opacity-40' : ''
                          }`}
                        >
                          <CardContent className="p-3">
                            <p className="font-semibold text-sm text-dark truncate mb-1">
                              {lead.nome}
                            </p>
                            {lead.empresa && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                                <Building2 className="h-3 w-3" />
                                {lead.empresa}
                              </p>
                            )}
                            <div className="space-y-1 text-xs text-muted-foreground">
                              {lead.email && (
                                <p className="flex items-center gap-1 truncate">
                                  <Mail className="h-3 w-3" />
                                  {lead.email}
                                </p>
                              )}
                              {lead.telefone && (
                                <p className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {lead.telefone}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center justify-between mt-2 pt-2 border-t">
                              <Badge variant="outline" className="text-xs">
                                {lead.origem}
                              </Badge>
                              {lead.score_engajamento && (
                                <span className="text-xs font-bold text-primary">
                                  {lead.score_engajamento}
                                </span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
