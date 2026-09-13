'use client'

import { cn } from '@/lib/utils'

interface RadarScoreBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
}

/**
 * Badge que exibe o score de oportunidade 0-100
 * - Verde (70-100): Alto potencial
 * - Amarelo (50-69): Médio potencial
 * - Vermelho (0-49): Baixo potencial
 */
export function RadarScoreBadge({
  score,
  size = 'md',
  showLabel = false,
  className,
}: RadarScoreBadgeProps) {
  // Normalizar score entre 0-100
  const normalizedScore = Math.max(0, Math.min(100, score))

  // Determinar cor e label
  const getScoreConfig = (s: number) => {
    if (s >= 70) {
      return {
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
        borderColor: 'border-emerald-200',
        label: 'Alto',
        icon: '▲',
      }
    } else if (s >= 50) {
      return {
        color: 'text-amber-600',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200',
        label: 'Médio',
        icon: '●',
      }
    } else {
      return {
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        label: 'Baixo',
        icon: '▼',
      }
    }
  }

  const config = getScoreConfig(normalizedScore)

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5 min-w-[28px]',
    md: 'text-sm px-2 py-1 min-w-[40px]',
    lg: 'text-base px-3 py-1.5 min-w-[52px]',
  }

  const iconSizes = {
    sm: 'text-[8px]',
    md: 'text-[10px]',
    lg: 'text-xs',
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div
        className={cn(
          'inline-flex items-center justify-center rounded-full font-semibold border',
          sizeClasses[size],
          config.bgColor,
          config.borderColor,
          config.color
        )}
        title={`Score de oportunidade: ${normalizedScore}/100`}
      >
        <span className={cn(iconSizes[size], 'mr-0.5')}>{config.icon}</span>
        <span>{normalizedScore}</span>
      </div>

      {showLabel && (
        <span className={cn('text-xs font-medium', config.color)}>
          {config.label} potencial
        </span>
      )}
    </div>
  )
}

/**
 * Componente detalhado que mostra o breakdown do score
 */
interface RadarScoreBreakdownProps {
  score: number
  scoreFase: number
  scoreProximidade: number
  scorePorte: number
  scoreValor: number
  scoreSegmento: number
  className?: string
}

export function RadarScoreBreakdown({
  score,
  scoreFase,
  scoreProximidade,
  scorePorte,
  scoreValor,
  scoreSegmento,
  className,
}: RadarScoreBreakdownProps) {
  const totalScore = scoreFase + scoreProximidade + scorePorte + scoreValor + scoreSegmento

  const items = [
    { label: 'Fase inicial', value: scoreFase, max: 40, color: 'bg-red-500' },
    { label: 'Proximidade', value: scoreProximidade, max: 20, color: 'bg-blue-500' },
    { label: 'Porte', value: scorePorte, max: 15, color: 'bg-purple-500' },
    { label: 'Valor estimado', value: scoreValor, max: 15, color: 'bg-emerald-500' },
    { label: 'Segmento', value: scoreSegmento, max: 10, color: 'bg-amber-500' },
  ]

  return (
    <div className={cn('space-y-3', className)}>
      {/* Score total */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Score Total</span>
        <RadarScoreBadge score={score} size="lg" />
      </div>

      {/* Breakdown */}
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium">
                {item.value}/{item.max}
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', item.color)}
                style={{ width: `${(item.value / item.max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Tag colorido para fases de obra
 */
export function RadarFaseTag({
  fase,
  size = 'md',
  className,
}: {
  fase: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const faseColors: Record<string, { bg: string; text: string; border: string }> = {
    alvara: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
    fundacao: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    estrutura: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
    acabamento: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
    concluida: { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200' },
    nao_iniciou: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
  }

  const faseLabels: Record<string, string> = {
    alvara: 'Alvará',
    fundacao: 'Fundação',
    estrutura: 'Estrutura',
    acabamento: 'Acabamento',
    concluida: 'Concluída',
    nao_iniciou: 'Não iniciou',
  }

  const faseColor = fase ? faseColors[fase] || faseColors.nao_iniciou : faseColors.nao_iniciou
  const faseLabel = fase ? faseLabels[fase] || fase : 'Não identificada'

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
    lg: 'text-sm px-3 py-1.5',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium capitalize',
        sizeClasses[size],
        faseColor.bg,
        faseColor.text,
        faseColor.border
      )}
    >
      {faseLabel}
    </span>
  )
}
