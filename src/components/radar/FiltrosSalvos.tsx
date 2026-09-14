'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type ScoreFiltro = 'todos' | 'alto' | 'medio'

interface Lista {
  id: string
  nome: string
  filtros: {
    fase: string | null
    cidade: string | null
    score: ScoreFiltro
    raioKm: number
  }
  updated_at: string
}

interface Props {
  filtrosAtuais: {
    fase: string | null
    cidade: string | null
    score: ScoreFiltro
    raioKm: number
  }
  onCarregar: (filtros: Lista['filtros']) => void
}

export function FiltrosSalvos({ filtrosAtuais, onCarregar }: Props) {
  const [listas, setListas] = useState<Lista[]>([])
  const [salvando, setSalvando] = useState(false)
  const [nome, setNome] = useState('')
  const [carregando, setCarregando] = useState(true)
  const supabase = createClient()

  async function carregar() {
    setCarregando(true)
    const { data } = await supabase
      .from('radar_listas_prospeccao')
      .select('id, nome, filtros, updated_at')
      .order('updated_at', { ascending: false })
    if (data) setListas(data as Lista[])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  async function salvar() {
    const trimmed = nome.trim()
    if (!trimmed || trimmed.length > 80) return
    setSalvando(true)
    const { error } = await supabase
      .from('radar_listas_prospeccao')
      .upsert(
        {
          nome: trimmed,
          filtros: filtrosAtuais,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,nome' }
      )
    setSalvando(false)
    setNome('')
    if (!error) await carregar()
  }

  async function deletar(id: string) {
    if (!confirm('Apagar esta lista?')) return
    await supabase.from('radar_listas_prospeccao').delete().eq('id', id)
    await carregar()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="px-3 py-2 border border-border rounded-md text-sm bg-card"
        onChange={(e) => {
          const lista = listas.find(l => l.id === e.target.value)
          if (lista) onCarregar(lista.filtros)
          e.target.value = ''
        }}
        defaultValue=""
        disabled={carregando}
      >
        <option value="" disabled>
          {carregando ? 'Carregando...' : 'Carregar lista...'}
        </option>
        {listas.map(l => (
          <option key={l.id} value={l.id}>{l.nome}</option>
        ))}
      </select>

      <div className="flex items-center gap-1">
        <input
          type="text"
          placeholder="Nome da lista..."
          value={nome}
          onChange={e => setNome(e.target.value.slice(0, 80))}
          className="px-3 py-2 border border-border rounded-md text-sm w-40 bg-card"
          maxLength={80}
        />
        <button
          onClick={salvar}
          disabled={!nome.trim() || salvando}
          className="px-3 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {listas.length > 0 && (
        <select
          className="px-3 py-2 border border-red-200 rounded-md text-sm text-red-600 bg-card"
          onChange={(e) => {
            if (e.target.value) {
              void deletar(e.target.value)
              e.target.value = ''
            }
          }}
          defaultValue=""
        >
          <option value="">Apagar lista...</option>
          {listas.map(l => (
            <option key={l.id} value={l.id}>{l.nome}</option>
          ))}
        </select>
      )}
    </div>
  )
}
