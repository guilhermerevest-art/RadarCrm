'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { DollarSign, Calendar, User, FileText } from 'lucide-react'
import type { PipelineEstagio, Responsavel, Deal } from '@/lib/crm-types'

type Lead = {
  id: string
  nome: string
  empresa?: string
}

type DealModalProps = {
  open: boolean
  onClose: () => void
  onSave: (deal: Deal) => void
  deal: Deal | null
  tenantId: string
  responsaveis: Responsavel[]
  estagios: PipelineEstagio[]
}

export default function DealModal({
  open,
  onClose,
  onSave,
  deal,
  tenantId,
  responsaveis,
  estagios,
}: DealModalProps) {
  const supabase = createClient()
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [leads, setLeads] = useState<Lead[]>([])

  const [form, setForm] = useState({
    titulo: '',
    lead_id: '',
    estagio: 'Novo',
    valor_estimado: '',
    data_fechamento_prevista: '',
    responsavel_id: '',
  })

  // Carregar leads
  useEffect(() => {
    async function carregarLeads() {
      const { data } = await supabase
        .from('crm_leads')
        .select('id, nome, empresa')
        .eq('tenant_id', tenantId)
        .order('nome')
      setLeads(data ?? [])
    }
    if (open) {
      carregarLeads()
    }
  }, [open, tenantId, supabase])

  // Preencher form ao editar
  useEffect(() => {
    if (deal) {
      setForm({
        titulo: deal.titulo,
        lead_id: deal.lead_id,
        estagio: deal.estagio,
        valor_estimado: deal.valor_estimado?.toString() || '',
        data_fechamento_prevista: deal.data_fechamento_prevista?.split('T')[0] || '',
        responsavel_id: deal.responsavel_id || '',
      })
    } else {
      setForm({
        titulo: '',
        lead_id: '',
        estagio: estagios[0]?.nome || 'Novo',
        valor_estimado: '',
        data_fechamento_prevista: '',
        responsavel_id: '',
      })
    }
  }, [deal, estagios])

  // Pegar probabilidade do estagio
  const probabilidadeEstagio = estagios.find(e => e.nome === form.estagio)?.probabilidade_padrao || 10

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titulo.trim()) {
      toast({ title: 'Erro', description: 'Título é obrigatório', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      const payload = {
        tenant_id: tenantId,
        titulo: form.titulo.trim(),
        lead_id: form.lead_id || null,
        estagio: form.estagio,
        valor_estimado: form.valor_estimado ? parseFloat(form.valor_estimado) : null,
        probabilidade: probabilidadeEstagio,
        data_fechamento_prevista: form.data_fechamento_prevista || null,
        responsavel_id: form.responsavel_id || null,
      }

      let result
      if (deal?.id) {
        result = await supabase
          .from('crm_deals')
          .update(payload)
          .eq('id', deal.id)
          .select()
          .single()
      } else {
        result = await supabase
          .from('crm_deals')
          .insert(payload)
          .select()
          .single()
      }

      if (result.error) throw result.error

      toast({ title: deal?.id ? 'Deal atualizado' : 'Deal criado' })
      onSave({
        ...result.data,
        leads: leads.find(l => l.id === result.data.lead_id),
        responsavel: responsaveis.find(r => r.id === result.data.responsavel_id),
      })
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {deal?.id ? 'Editar Deal' : 'Novo Deal'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4">
          {/* Título */}
          <div className="space-y-2">
            <Label htmlFor="titulo">Título *</Label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="titulo"
                placeholder="Nome do deal..."
                className="pl-9"
                value={form.titulo}
                onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                required
              />
            </div>
          </div>

          {/* Lead */}
          <div className="space-y-2">
            <Label htmlFor="lead">Lead</Label>
            <select
              id="lead"
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={form.lead_id}
              onChange={e => setForm(f => ({ ...f, lead_id: e.target.value }))}
            >
              <option value="">Selecione um lead...</option>
              {leads.map(lead => (
                <option key={lead.id} value={lead.id}>
                  {lead.nome}{lead.empresa ? ` (${lead.empresa})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Estágio */}
          <div className="space-y-2">
            <Label htmlFor="estagio">Estágio</Label>
            <select
              id="estagio"
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={form.estagio}
              onChange={e => setForm(f => ({ ...f, estagio: e.target.value }))}
            >
              {estagios.map(estagio => (
                <option key={estagio.id} value={estagio.nome}>
                  {estagio.nome} ({estagio.probabilidade_padrao}%)
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Probabilidade: {probabilidadeEstagio}%
            </p>
          </div>

          {/* Valor */}
          <div className="space-y-2">
            <Label htmlFor="valor">Valor Estimado (R$)</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="valor"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="pl-9"
                value={form.valor_estimado}
                onChange={e => setForm(f => ({ ...f, valor_estimado: e.target.value }))}
              />
            </div>
          </div>

          {/* Data Prevista */}
          <div className="space-y-2">
            <Label htmlFor="data">Data de Fechamento Prevista</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="data"
                type="date"
                className="pl-9"
                value={form.data_fechamento_prevista}
                onChange={e => setForm(f => ({ ...f, data_fechamento_prevista: e.target.value }))}
              />
            </div>
          </div>

          {/* Responsável */}
          <div className="space-y-2">
            <Label htmlFor="responsavel">Responsável</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                id="responsavel"
                className="w-full h-10 px-3 pl-9 rounded-md border border-input bg-background text-sm"
                value={form.responsavel_id}
                onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))}
              >
                <option value="">Sem responsável</option>
                {responsaveis.map(r => (
                  <option key={r.id} value={r.id}>{r.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : deal?.id ? 'Salvar' : 'Criar Deal'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
