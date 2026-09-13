'use client'

import { useState, useEffect } from 'react'
import { Check, ThumbsUp, MessageCircle, Clock } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  getMarcacoes,
  confirmarMarcacao,
  desconfirmarMarcacao,
  getObraGlobal,
  FASE_MACRO_LABELS,
  FASE_MACRO_COLORS,
} from '@/lib/marcacoes'
import { FASES_GRANULARES, type ObraMarcacao, type ObraGlobal } from '@/lib/supabase/types'
import { ModalMarcarFase } from './ModalMarcarFase'

interface Props {
  obraId: string  // ID da obra do tenant
  obraGlobalId: string | null | undefined
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
}

export function CardConfirmacoes({ obraId, obraGlobalId, obraData, tenantId, userId }: Props) {
  const { toast } = useToast()
  const [obraGlobal, setObraGlobal] = useState<ObraGlobal | null>(null)
  const [marcacoes, setMarcacoes] = useState<ObraMarcacao[]>([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [processandoId, setProcessandoId] = useState<string | null>(null)

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraGlobalId])

  async function carregar() {
    setLoading(true)
    try {
      if (!obraGlobalId) {
        setObraGlobal(null)
        setMarcacoes([])
        setLoading(false)
        return
      }
      const og = await getObraGlobal(obraGlobalId)
      setObraGlobal(og)
      const lista = await getMarcacoes(obraGlobalId, userId)
      setMarcacoes(lista)
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmar(marcacaoId: string) {
    setProcessandoId(marcacaoId)
    const ok = await confirmarMarcacao(marcacaoId, userId)
    if (ok) {
      toast({ title: '✓ Confirmado!', description: 'Obrigado por contribuir.' })
    } else {
      toast({ title: 'Você já confirmou esta marcação', variant: 'destructive' })
    }
    setProcessandoId(null)
    carregar()
  }

  async function handleDesconfirmar(marcacaoId: string) {
    setProcessandoId(marcacaoId)
    await desconfirmarMarcacao(marcacaoId, userId)
    setProcessandoId(null)
    carregar()
  }

  function tempoRelativo(iso?: string) {
    if (!iso) return ''
    const diff = Date.now() - new Date(iso).getTime()
    const dias = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (dias === 0) return 'hoje'
    if (dias === 1) return 'ontem'
    if (dias < 30) return `há ${dias} dias`
    const meses = Math.floor(dias / 30)
    if (meses === 1) return 'há 1 mês'
    return `há ${meses} meses`
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Carregando marcações...
      </div>
    )
  }

  // Sem obra global ainda (nunca foi marcada)
  if (!obraGlobalId || !obraGlobal || marcacoes.length === 0) {
    return (
      <>
        <div className="rounded-lg border bg-card p-5">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <ThumbsUp className="h-4 w-4 text-muted-foreground" />
            Fase da comunidade
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            Ninguém marcou esta obra ainda. Que tal ser o primeiro?
          </p>
          <button
            onClick={() => setModalAberto(true)}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
          >
            + Marcar fase
          </button>
        </div>
        {modalAberto && (
          <ModalMarcarFase
            obraId={obraId}
            obraData={obraData}
            tenantId={tenantId}
            userId={userId}
            onClose={() => setModalAberto(false)}
            onSucesso={carregar}
          />
        )}
      </>
    )
  }

  const faseConsolidada = obraGlobal.fase_consolidada
  const faseMacro = obraGlobal.fase_macro_consolidada
  const granular = faseConsolidada && faseMacro
    ? FASES_GRANULARES[faseMacro]?.find((g) => g.valor === faseConsolidada)
    : null

  return (
    <>
      <div className="rounded-lg border bg-card p-5 space-y-4">
        {/* Cabeçalho — fase consolidada */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <ThumbsUp className="h-4 w-4" />
            Fase segundo a comunidade
          </h3>
          {faseMacro ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {granular && <span className="text-3xl">{granular.emoji}</span>}
                <div>
                  <div className="text-xl font-bold">{granular?.label || faseConsolidada}</div>
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 ${FASE_MACRO_COLORS[faseMacro]}`}>
                    {FASE_MACRO_LABELS[faseMacro]}
                  </span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-3 mt-2">
                <span>✓ {obraGlobal.total_confirmacoes} confirmações</span>
                <span>·</span>
                <span>📍 {obraGlobal.total_marcacoes} marcações</span>
                {obraGlobal.ultima_atividade_em && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {tempoRelativo(obraGlobal.ultima_atividade_em)}
                    </span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sem fase consolidada ainda.</p>
          )}
        </div>

        {/* Ações: confirmar fase consolidada OU abrir modal */}
        {(() => {
          const marcacaoTop = marcacoes[0]
          if (!marcacaoTop) return null
          // Não permitir confirmar a própria marcação
          if (marcacaoTop.user_id === userId) {
            return (
              <div className="text-xs text-muted-foreground italic">
                Esta marcação é sua. Aguarde outros usuários confirmarem.
              </div>
            )
          }
          return (
            <div className="flex gap-2">
              {marcacaoTop.ja_confirmei ? (
                <button
                  onClick={() => handleDesconfirmar(marcacaoTop.id)}
                  disabled={processandoId === marcacaoTop.id}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 hover:bg-muted"
                >
                  <Check className="h-4 w-4 text-green-600" />
                  Você confirmou · desfazer
                </button>
              ) : (
                <button
                  onClick={() => handleConfirmar(marcacaoTop.id)}
                  disabled={processandoId === marcacaoTop.id}
                  className="flex-1 rounded-md bg-green-600 text-white px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 hover:bg-green-700"
                >
                  <Check className="h-4 w-4" />
                  {processandoId === marcacaoTop.id ? 'Confirmando...' : 'Confirmar'}
                </button>
              )}
              <button
                onClick={() => setModalAberto(true)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                + Outra
              </button>
            </div>
          )
        })()}

        {/* Lista de outras marcações */}
        {marcacoes.length > 1 && (
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase">Outras marcações</p>
            {marcacoes.slice(1).map((m) => {
              const granular = FASES_GRANULARES[m.fase_macro]?.find((g) => g.valor === m.fase)
              const isPropria = m.user_id === userId
              return (
                <div key={m.id} className="rounded-md border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        {granular?.emoji && <span>{granular.emoji}</span>}
                        {granular?.label || m.fase}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span>👤 {m.autor_nome}</span>
                        <span>·</span>
                        <span>{tempoRelativo(m.created_at)}</span>
                        <span>·</span>
                        <span>{m.total_confirmacoes || 0} confirmações</span>
                      </div>
                      {m.nota && (
                        <div className="text-xs text-foreground/70 mt-1.5 flex gap-1.5">
                          <MessageCircle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="italic">"{m.nota}"</span>
                        </div>
                      )}
                    </div>
                    {!isPropria && (
                      <div>
                        {m.ja_confirmei ? (
                          <button
                            onClick={() => handleDesconfirmar(m.id)}
                            disabled={processandoId === m.id}
                            className="rounded p-1 text-green-600 hover:bg-green-50"
                            title="Você confirmou — clicar para desfazer"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleConfirmar(m.id)}
                            disabled={processandoId === m.id}
                            className="rounded p-1 text-muted-foreground hover:text-green-600 hover:bg-green-50"
                            title="Confirmar"
                          >
                            <ThumbsUp className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modalAberto && (
        <ModalMarcarFase
          obraId={obraId}
          obraData={obraData}
          tenantId={tenantId}
          userId={userId}
          onClose={() => setModalAberto(false)}
          onSucesso={carregar}
        />
      )}
    </>
  )
}
