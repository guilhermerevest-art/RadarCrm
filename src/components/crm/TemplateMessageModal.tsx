'use client'

import { useEffect, useState } from 'react'
import { X, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { renderTemplate, VARIAVEIS_CONHECIDAS } from '@/lib/templates'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

interface Template {
  id: string
  nome: string
  conteudo: string
}

interface Props {
  open: boolean
  onClose: () => void
  lead: {
    nome: string
    empresa?: string | null
    telefone?: string | null
    obra?: string | null
    cidade?: string | null
  }
}

export function TemplateMessageModal({ open, onClose, lead }: Props) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [selecionado, setSelecionado] = useState<string>('')
  const [enviando, setEnviando] = useState(false)
  const supabase = createClient()
  const { toast } = useToast()

  useEffect(() => {
    if (!open) return
    async function load() {
      const { data } = await supabase
        .from('crm_templates_mensagem')
        .select('id, nome, conteudo')
        .eq('ativo', true)
        .order('nome')
      if (data) setTemplates(data)
    }
    void load()
  }, [open, supabase])

  if (!open) return null

  const tpl = templates.find((t) => t.id === selecionado)
  const preview = tpl
    ? renderTemplate(tpl.conteudo, {
        nome: lead.nome,
        empresa: lead.empresa ?? '',
        obra: lead.obra ?? '',
        telefone: lead.telefone ?? '',
        cidade: lead.cidade ?? '',
      })
    : ''

  async function enviar() {
    if (!tpl) {
      toast({
        title: 'Selecione um template',
        variant: 'destructive',
      })
      return
    }
    if (!lead.telefone) {
      toast({
        title: 'Telefone ausente',
        description: 'Adicione telefone antes de enviar.',
        variant: 'destructive',
      })
      return
    }
    setEnviando(true)
    try {
      const { error } = await supabase.functions.invoke('whatsapp-enviar', {
        body: { telefone: lead.telefone, mensagem: preview },
      })
      if (error) throw error
      toast({ title: 'Mensagem enviada' })
      onClose()
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar',
        description: err.message ?? 'Falha desconhecida',
        variant: 'destructive',
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl border border-border max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-lg font-bold">Enviar mensagem WhatsApp</h3>
          <button onClick={onClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {templates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="mb-2">Você ainda não tem templates.</p>
            <a
              href="/dashboard/configuracao/templates"
              className="text-primary underline text-sm"
            >
              Criar primeiro template →
            </a>
          </div>
        ) : (
          <>
            <label className="text-sm font-medium mb-1 block">Template</label>
            <select
              value={selecionado}
              onChange={(e) => setSelecionado(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-card text-sm mb-3"
            >
              <option value="">Selecione um template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>

            {tpl && (
              <>
                <label className="text-sm font-medium mb-1 block">Preview</label>
                <div className="bg-muted/40 rounded-md p-3 text-sm whitespace-pre-wrap mb-3 min-h-[80px]">
                  {preview}
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Variáveis disponíveis:{' '}
                  {VARIAVEIS_CONHECIDAS.map((v) => `{${v}}`).join(', ')}
                </p>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={enviar} disabled={!tpl || enviando}>
                <Send className="h-4 w-4 mr-1" />
                {enviando ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
