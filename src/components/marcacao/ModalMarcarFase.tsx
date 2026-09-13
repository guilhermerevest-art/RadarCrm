'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { FASES_GRANULARES, type FaseMacro } from '@/lib/supabase/types'
import { criarMarcacao, getOrCreateObraGlobal, FASE_MACRO_LABELS } from '@/lib/marcacoes'

interface Props {
  obraId: string  // ID da obra do tenant
  obraData: {
    hash_deduplicacao?: string
    endereco_logradouro: string
    endereco_numero?: string
    endereco_bairro?: string
    endereco_cidade: string
    endereco_uf: string
    endereco_cep?: string
    lat?: number
    lng?: number
  }
  tenantId: string
  userId: string
  onClose: () => void
  onSucesso: () => void
}

export function ModalMarcarFase({
  obraId,
  obraData,
  tenantId,
  userId,
  onClose,
  onSucesso,
}: Props) {
  const supabase = createClient()
  const { toast } = useToast()
  const [macro, setMacro] = useState<FaseMacro | null>(null)
  const [fase, setFase] = useState<string | null>(null)
  const [nota, setNota] = useState('')
  const [salvando, setSalvando] = useState(false)

  const macros: FaseMacro[] = [
    'nao_iniciou', 'fundacao', 'estrutura', 'acabamento', 'paralisada', 'concluida', 'alvara',
  ]

  async function salvar() {
    if (!macro || !fase) return
    setSalvando(true)

    try {
      // 1. Buscar/criar obra global
      const obraGlobal = await getOrCreateObraGlobal(obraData)
      if (!obraGlobal) {
        toast({ title: 'Erro', description: 'Não foi possível registrar a obra global', variant: 'destructive' })
        return
      }

      // 2. Linkar obra do tenant à obra global (idempotente)
      await supabase
        .from('radar_obras')
        .update({ obra_global_id: obraGlobal.id })
        .eq('id', obraId)

      // 3. Criar marcação
      const marcacao = await criarMarcacao({
        obraGlobalId: obraGlobal.id,
        tenantId,
        userId,
        fase,
        faseMacro: macro,
        nota: nota || undefined,
      })

      if (marcacao) {
        toast({
          title: '✓ Marcação registrada!',
          description: 'Outros usuários podem confirmar agora. Você ganha pontos quando confirmarem.',
        })
        onSucesso()
        onClose()
      } else {
        toast({ title: 'Erro ao criar marcação', variant: 'destructive' })
      }
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro inesperado', variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Marcar fase da obra</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          <p className="text-sm text-muted-foreground">
            O que você viu na obra? Sua marcação ajuda a construir um histórico confiável.
          </p>

          {/* ETAPA 1: Escolher macro */}
          {macro === null && (
            <div>
              <label className="text-sm font-medium mb-2 block">1. Fase geral</label>
              <div className="grid grid-cols-2 gap-2">
                {macros.map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMacro(m); setFase(null) }}
                    className="rounded-lg border-2 border-input bg-background px-3 py-3 text-sm font-medium hover:border-primary hover:bg-primary/5 transition"
                  >
                    {FASE_MACRO_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ETAPA 2: Escolher granular */}
          {macro !== null && (
            <div>
              <label className="text-sm font-medium mb-2 block">
                2. Detalhe — {FASE_MACRO_LABELS[macro]}
              </label>
              <div className="space-y-1">
                {FASES_GRANULARES[macro].map((g) => (
                  <button
                    key={g.valor}
                    onClick={() => setFase(g.valor)}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 flex items-center gap-2 transition ${
                      fase === g.valor
                        ? 'border-primary bg-primary/10'
                        : 'border-input bg-background hover:border-primary/50 hover:bg-muted'
                    }`}
                  >
                    <span className="text-xl">{g.emoji}</span>
                    <span className="text-sm">{g.label}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setMacro(null); setFase(null) }}
                className="text-xs text-muted-foreground hover:underline mt-2"
              >
                ← Voltar
              </button>
            </div>
          )}

          {/* ETAPA 3: nota opcional */}
          {fase !== null && (
            <div>
              <label className="text-sm font-medium mb-2 block">
                Observação <span className="text-muted-foreground">(opcional)</span>
              </label>
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ex: vi 3 pedreiros trabalhando, andaime no 2º andar..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={3}
                maxLength={500}
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t bg-muted/30">
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={!macro || !fase || salvando}
            className="flex-1 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {salvando ? 'Salvando...' : 'Registrar marcação'}
          </button>
        </div>
      </div>
    </div>
  )
}
