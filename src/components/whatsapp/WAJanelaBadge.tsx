'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, AlertCircle } from 'lucide-react'

interface WAJanelaBadgeProps {
  contatoId: string
  numero: string
  className?: string
}

interface JanelaInfo {
  ultima_msg_recebida: string | null
  segundos_restantes: number | null
  janela_aberta: boolean
}

export function WAJanelaBadge({ contatoId, numero, className }: WAJanelaBadgeProps) {
  const supabase = createClient()
  const [janela, setJanela] = useState<JanelaInfo>({
    ultima_msg_recebida: null,
    segundos_restantes: null,
    janela_aberta: false,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregarJanela()
    const interval = setInterval(carregarJanela, 60000) // Atualizar a cada minuto
    return () => clearInterval(interval)
  }, [contatoId])

  async function carregarJanela() {
    try {
      // Buscar ultima mensagem recebida deste contato
      const { data, error } = await supabase
        .from('whatsapp_mensagens')
        .select('created_at')
        .eq('contato_id', contatoId)
        .eq('direcao', 'received')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned
        console.error('Erro ao buscar janela:', error)
        return
      }

      if (data) {
        const ultimaMsg = new Date(data.created_at)
        const agora = new Date()
        const diffMs = agora.getTime() - ultimaMsg.getTime()
        const diffSegundos = diffMs / 1000

        // Janela de 24 horas = 86400 segundos
        const segundosRestantes = 86400 - diffSegundos
        const janelaAberta = segundosRestantes > 0

        setJanela({
          ultima_msg_recebida: data.created_at,
          segundos_restantes: Math.max(0, Math.floor(segundosRestantes)),
          janela_aberta: janelaAberta,
        })
      } else {
        setJanela({
          ultima_msg_recebida: null,
          segundos_restantes: null,
          janela_aberta: false,
        })
      }
    } catch (err) {
      console.error('Erro ao carregar janela:', err)
    } finally {
      setLoading(false)
    }
  }

  function formatarTempo(segundos: number): string {
    const horas = Math.floor(segundos / 3600)
    const minutos = Math.floor((segundos % 3600) / 60)

    if (horas > 0) {
      return `${horas}h ${minutos}m`
    }
    return `${minutos}m`
  }

  if (loading) {
    return null
  }

  if (!janela.janela_aberta) {
    return (
      <Badge
        variant="outline"
        className={`text-amber-600 border-amber-300 bg-amber-50 ${className || ''}`}
      >
        <AlertCircle className="h-3 w-3 mr-1" />
        Janela fechada
      </Badge>
    )
  }

  // Se menos de 2 horas restantes, mostrar aviso
  const isUrgente = janela.segundos_restantes !== null && janela.segundos_restantes < 7200

  return (
    <Badge
      variant="outline"
      className={`
        ${isUrgente
          ? 'text-amber-600 border-amber-300 bg-amber-50'
          : 'text-green-600 border-green-300 bg-green-50'
        }
        ${className || ''}
      `}
    >
      <Clock className="h-3 w-3 mr-1" />
      {formatarTempo(janela.segundos_restantes!)}
    </Badge>
  )
}

// =============================================================================
// Componente de banner para campo de texto bloqueado
// =============================================================================

interface WAJanelaBannerProps {
  contatoId: string
  numero: string
  onSolicitarTemplate?: () => void
}

export function WAJanelaBanner({ contatoId, numero, onSolicitarTemplate }: WAJanelaBannerProps) {
  const supabase = createClient()
  const [janela, setJanela] = useState<JanelaInfo>({
    ultima_msg_recebida: null,
    segundos_restantes: null,
    janela_aberta: false,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregarJanela()
  }, [contatoId])

  async function carregarJanela() {
    try {
      const { data } = await supabase
        .from('whatsapp_mensagens')
        .select('created_at')
        .eq('contato_id', contatoId)
        .eq('direcao', 'received')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (data) {
        const ultimaMsg = new Date(data.created_at)
        const agora = new Date()
        const diffMs = agora.getTime() - ultimaMsg.getTime()
        const diffSegundos = diffMs / 1000
        const segundosRestantes = 86400 - diffSegundos

        setJanela({
          ultima_msg_recebida: data.created_at,
          segundos_restantes: Math.max(0, Math.floor(segundosRestantes)),
          janela_aberta: segundosRestantes > 0,
        })
      } else {
        setJanela({
          ultima_msg_recebida: null,
          segundos_restantes: null,
          janela_aberta: false,
        })
      }
    } catch {
      // Erro é esperado se não houver mensagens
    } finally {
      setLoading(false)
    }
  }

  if (loading || janela.janela_aberta) {
    return null
  }

  return (
    <Card className="p-4 bg-amber-50 border-amber-200">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-medium text-amber-800">Janela de mensagens fechada</h4>
          <p className="text-sm text-amber-700 mt-1">
            A janela de 24 horas para responder mensagens livres foi fechada.
            Para continuar a conversa, você precisa usar um template de mensagem aprovado pela Meta.
          </p>
          {onSolicitarTemplate && (
            <button
              onClick={onSolicitarTemplate}
              className="mt-3 text-sm font-medium text-amber-800 underline hover:text-amber-900"
            >
              Solicitar template de mensagem
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}
