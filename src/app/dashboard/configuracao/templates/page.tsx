'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Power, Edit2, Check } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { VARIAVEIS_CONHECIDAS } from '@/lib/templates'
import { useToast } from '@/hooks/use-toast'

interface Template {
  id: string
  nome: string
  conteudo: string
  ativo: boolean
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [novo, setNovo] = useState({ nome: '', conteudo: '' })
  const [editBuffer, setEditBuffer] = useState<{ nome: string; conteudo: string }>({
    nome: '',
    conteudo: '',
  })
  const supabase = createClient()
  const { toast } = useToast()

  async function carregar() {
    const { data } = await supabase
      .from('crm_templates_mensagem')
      .select('id, nome, conteudo, ativo')
      .order('nome')
    if (data) setTemplates(data)
  }

  useEffect(() => {
    carregar()
  }, [])

  async function criar() {
    if (!novo.nome.trim() || !novo.conteudo.trim()) return
    const { error } = await supabase
      .from('crm_templates_mensagem')
      .insert({ nome: novo.nome.trim(), conteudo: novo.conteudo.trim() })
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
      return
    }
    setNovo({ nome: '', conteudo: '' })
    await carregar()
    toast({ title: 'Template criado' })
  }

  async function atualizar(id: string, patch: Partial<Template>) {
    const { error } = await supabase
      .from('crm_templates_mensagem')
      .update(patch)
      .eq('id', id)
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
      return
    }
    await carregar()
  }

  async function apagar(id: string) {
    if (!confirm('Apagar este template?')) return
    const { error } = await supabase.from('crm_templates_mensagem').delete().eq('id', id)
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
      return
    }
    await carregar()
  }

  function iniciarEdicao(t: Template) {
    setEditandoId(t.id)
    setEditBuffer({ nome: t.nome, conteudo: t.conteudo })
  }

  async function salvarEdicao(id: string) {
    await atualizar(id, {
      nome: editBuffer.nome.trim(),
      conteudo: editBuffer.conteudo.trim(),
    })
    setEditandoId(null)
    toast({ title: 'Template atualizado' })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/dashboard/configuracao"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Configurações
        </Link>
      </div>
      <h1 className="font-heading text-3xl font-bold mb-2">Templates de mensagem</h1>
      <p className="text-muted-foreground mb-6">
        Mensagens WhatsApp reutilizáveis. Use variáveis:{' '}
        {VARIAVEIS_CONHECIDAS.map((v) => `{${v}}`).join(', ')}.
      </p>

      <div className="bg-card border border-border rounded-xl p-4 mb-6">
        <h2 className="font-bold mb-3">Novo template</h2>
        <input
          type="text"
          placeholder="Nome (ex: Primeiro contato)"
          value={novo.nome}
          onChange={(e) => setNovo({ ...novo, nome: e.target.value.slice(0, 80) })}
          className="w-full px-3 py-2 border border-border rounded-md text-sm mb-2 bg-card"
          maxLength={80}
        />
        <textarea
          placeholder="Conteúdo da mensagem..."
          value={novo.conteudo}
          onChange={(e) =>
            setNovo({ ...novo, conteudo: e.target.value.slice(0, 2000) })
          }
          className="w-full px-3 py-2 border border-border rounded-md text-sm min-h-[100px] bg-card"
          maxLength={2000}
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-muted-foreground">
            {novo.conteudo.length}/2000
          </span>
          <Button
            onClick={criar}
            disabled={!novo.nome.trim() || !novo.conteudo.trim()}
          >
            <Plus className="h-4 w-4 mr-1" /> Criar
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {templates.map((t) => (
          <div
            key={t.id}
            className="bg-card border border-border rounded-lg p-4"
          >
            {editandoId === t.id ? (
              <div>
                <input
                  value={editBuffer.nome}
                  onChange={(e) =>
                    setEditBuffer({ ...editBuffer, nome: e.target.value.slice(0, 80) })
                  }
                  className="w-full px-3 py-2 border border-border rounded-md text-sm mb-2 bg-card"
                />
                <textarea
                  value={editBuffer.conteudo}
                  onChange={(e) =>
                    setEditBuffer({
                      ...editBuffer,
                      conteudo: e.target.value.slice(0, 2000),
                    })
                  }
                  className="w-full px-3 py-2 border border-border rounded-md text-sm min-h-[80px] mb-2 bg-card"
                />
                <Button size="sm" onClick={() => salvarEdicao(t.id)}>
                  <Check className="h-3 w-3 mr-1" /> Pronto
                </Button>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{t.nome}</span>
                      {!t.ativo && (
                        <span className="text-xs px-2 py-0.5 bg-muted rounded">
                          Inativo
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">
                      {t.conteudo}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => iniciarEdicao(t)}
                      className="p-1 hover:bg-muted rounded"
                      aria-label="Editar"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => atualizar(t.id, { ativo: !t.ativo })}
                      className="p-1 hover:bg-muted rounded"
                      aria-label={t.ativo ? 'Desativar' : 'Ativar'}
                    >
                      <Power className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => apagar(t.id)}
                      className="p-1 hover:bg-muted rounded text-red-600"
                      aria-label="Apagar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {templates.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            Nenhum template ainda. Crie o primeiro acima.
          </p>
        )}
      </div>
    </div>
  )
}
