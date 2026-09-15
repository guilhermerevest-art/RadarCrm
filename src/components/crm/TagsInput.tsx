'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

const SUGESTOES = ['VIP', 'Concorrente', 'Frio', 'Indisposto', 'Indicação']

interface Props {
  value: string[]
  onChange: (tags: string[]) => void
}

export function TagsInput({ value, onChange }: Props) {
  const [input, setInput] = useState('')

  function adicionar(tag: string) {
    const t = tag.trim()
    if (!t || value.includes(t)) return
    onChange([...value, t])
    setInput('')
  }

  function remover(tag: string) {
    onChange(value.filter((v) => v !== tag))
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-2">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md"
          >
            {tag}
            <button
              type="button"
              onClick={() => remover(tag)}
              className="hover:bg-primary/20 rounded"
              aria-label={`Remover tag ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            adicionar(input)
          }
          if (e.key === 'Backspace' && input === '' && value.length > 0) {
            remover(value[value.length - 1])
          }
        }}
        placeholder="Adicionar tag..."
        className="w-full px-3 py-2 border border-border rounded-md text-sm bg-card"
        maxLength={40}
      />
      <div className="flex flex-wrap gap-1 mt-2">
        {SUGESTOES.filter((s) => !value.includes(s)).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => adicionar(s)}
            className="text-xs px-2 py-1 bg-muted text-muted-foreground hover:bg-muted/70 rounded-md transition-colors"
          >
            + {s}
          </button>
        ))}
      </div>
    </div>
  )
}
