'use client'

import { useEffect, useState } from 'react'
import { Trophy, Award, Target } from 'lucide-react'
import { getMinhaPontuacao, getBadges, calcularProximoNivel, NIVEL_LABELS, NIVEL_COLORS } from '@/lib/marcacoes'
import type { UserPontuacao, BadgeInfo } from '@/lib/supabase/types'

interface Props {
  userId: string
  compact?: boolean  // versão compacta para sidebar
}

export function MinhaPontuacao({ userId, compact = false }: Props) {
  const [pontuacao, setPontuacao] = useState<UserPontuacao | null>(null)
  const [badges, setBadges] = useState<BadgeInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function carregar() {
      setLoading(true)
      const [p, b] = await Promise.all([getMinhaPontuacao(userId), getBadges()])
      setPontuacao(p)
      setBadges(b)
      setLoading(false)
    }
    carregar()
  }, [userId])

  if (loading) {
    return compact ? null : (
      <div className="text-sm text-muted-foreground">Carregando pontuação...</div>
    )
  }

  const pontos = pontuacao?.pontos || 0
  const nivel = pontuacao?.nivel || 'observador'
  const { proximoNivel, pontosParaProximo } = calcularProximoNivel(pontos)
  const minhasBadges = new Set(pontuacao?.badges || [])

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Trophy className="h-4 w-4 text-amber-500" />
        <span className="font-semibold">{pontos}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${NIVEL_COLORS[nivel]}`}>
          {NIVEL_LABELS[nivel]}
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold mb-1 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          Sua contribuição para o Radar
        </h3>
        <p className="text-xs text-muted-foreground">
          Você ganha pontos quando outros usuários confirmam suas marcações de fase.
        </p>
      </div>

      {/* Nível atual + pontos */}
      <div className="flex items-baseline gap-3">
        <span className="text-4xl font-bold">{pontos}</span>
        <div className="flex-1">
          <span className={`inline-block text-xs px-2 py-1 rounded-full ${NIVEL_COLORS[nivel]}`}>
            {NIVEL_LABELS[nivel]}
          </span>
          {proximoNivel && pontosParaProximo !== null && (
            <p className="text-xs text-muted-foreground mt-1">
              Faltam <strong>{pontosParaProximo}</strong> pontos para {NIVEL_LABELS[proximoNivel]}
            </p>
          )}
          {!proximoNivel && (
            <p className="text-xs text-muted-foreground mt-1">Nível máximo! 🎉</p>
          )}
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-muted/40 p-2">
          <div className="text-2xl font-bold">{pontuacao?.marcacoes_criadas || 0}</div>
          <div className="text-xs text-muted-foreground">Marcações</div>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <div className="text-2xl font-bold">{pontuacao?.confirmacoes_feitas || 0}</div>
          <div className="text-xs text-muted-foreground">Confirmações</div>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <div className="text-2xl font-bold">{pontuacao?.marcacoes_confirmadas || 0}</div>
          <div className="text-xs text-muted-foreground">Validações</div>
        </div>
      </div>

      {/* Badges */}
      <div>
        <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
          <Award className="h-4 w-4" />
          Badges
        </h4>
        <div className="grid grid-cols-3 gap-2">
          {badges.map((b) => {
            const conquistada = minhasBadges.has(b.id)
            return (
              <div
                key={b.id}
                className={`rounded-md border p-2 text-center ${
                  conquistada
                    ? 'bg-amber-50 border-amber-300'
                    : 'bg-muted/30 border-dashed opacity-40'
                }`}
                title={`${b.nome}: ${b.descricao}`}
              >
                <div className="text-2xl">{conquistada ? b.icone : '🔒'}</div>
                <div className="text-xs font-medium mt-0.5">{b.nome}</div>
                <div className="text-[10px] text-muted-foreground">{b.descricao}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="text-xs text-muted-foreground flex items-start gap-1.5 pt-2 border-t">
        <Target className="h-3 w-3 mt-0.5 shrink-0" />
        <span>
          <strong>Dica:</strong> visite obras no mapa e marque a fase. Quem marca a fase certa ganha pontos!
        </span>
      </div>
    </div>
  )
}
