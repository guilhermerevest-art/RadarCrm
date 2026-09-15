'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { createClient } from '@/lib/supabase/client'

const MOTIVOS = [
  { value: 'preco_alto', label: 'Preço alto' },
  { value: 'concorrente', label: 'Perdido para concorrente' },
  { value: 'sem_interesse', label: 'Sem interesse / despriorizou' },
  { value: 'sem_resposta', label: 'Sem resposta' },
  { value: 'sem_orcamento', label: 'Sem orçamento' },
  { value: 'projeto_cancelado', label: 'Projeto cancelado' },
  { value: 'outro', label: 'Outro' },
] as const

interface Props {
  open: boolean
  onClose: () => void
  dealId: string
  tenantId: string
  onConfirm: (motivo: string, observacao: string) => Promise<void>
}

export function MotivoPerdaModal({ open, onClose, dealId, tenantId, onConfirm }: Props) {
  const [motivo, setMotivo] = useState<string>('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  if (!open) return null

  async function salvar() {
    if (!motivo) {
      toast({ title: 'Escolha um motivo', variant: 'destructive' })
      return
    }
    setSalvando(true)
    try {
      await onConfirm(motivo, observacao)
      onClose()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err.message ?? 'Falha desconhecida',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl border border-border max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-lg font-bold">Por que este deal foi perdido?</h3>
          <button onClick={onClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Saber o motivo ajuda a identificar padrões e melhorar sua taxa de conversão.
        </p>

        <div className="space-y-2 mb-4">
          {MOTIVOS.map((m) => (
            <label
              key={m.value}
              className={`flex items-center gap-2 p-3 border rounded-md cursor-pointer transition-colors ${
                motivo === m.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/40'
              }`}
            >
              <input
                type="radio"
                name="motivo"
                value={m.value}
                checked={motivo === m.value}
                onChange={() => setMotivo(m.value)}
                className="text-primary"
              />
              <span className="text-sm">{m.label}</span>
            </label>
          ))}
        </div>

        <textarea
          placeholder="Observação (opcional)"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-md text-sm min-h-[80px] mb-4 bg-card"
          maxLength={500}
        />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || !motivo}>
            {salvando ? 'Salvando...' : 'Marcar como perdido'}
          </Button>
        </div>
      </div>
    </div>
  )
}
