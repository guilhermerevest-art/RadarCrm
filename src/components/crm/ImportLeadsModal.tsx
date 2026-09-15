'use client'

import { useState } from 'react'
import { Upload, X, AlertCircle, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { parseCSV } from '@/lib/csv'

const COLUNAS_ACEITAS: Record<string, string[]> = {
  nome: ['nome', 'name'],
  empresa: ['empresa', 'company', 'company_name', 'razao_social', 'razao social'],
  email: ['email', 'e-mail', 'e_mail'],
  telefone: ['telefone', 'phone', 'celular', 'whatsapp'],
  cidade: ['cidade', 'city'],
  observacoes: ['observacoes', 'notes', 'obs'],
}

interface Props {
  open: boolean
  onClose: () => void
  onImportado?: () => void
}

interface Resultado {
  sucessos: number
  duplicados: number
  erros: number
  errosDetalhe: Array<{ linha: number; motivo: string }>
}

function normalizarCabecalho(h: string): string {
  return h.toLowerCase().trim().replace(/\s+/g, '_')
}

function mapearCabecalhos(cabecalhos: string[]): Record<string, string> {
  const mapa: Record<string, string> = {}
  const norm = cabecalhos.map(normalizarCabecalho)
  for (const [campo, aliases] of Object.entries(COLUNAS_ACEITAS)) {
    for (const alias of aliases) {
      const idx = norm.indexOf(alias)
      if (idx !== -1) {
        mapa[campo] = cabecalhos[idx]
        break
      }
    }
  }
  return mapa
}

function linhaParaDados(
  row: string[],
  headers: string[],
  mapa: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const campo of Object.keys(COLUNAS_ACEITAS)) {
    const colOriginal = mapa[campo]
    const i = colOriginal ? headers.indexOf(colOriginal) : -1
    out[campo] = i >= 0 ? (row[i] ?? '').trim() : ''
  }
  return out
}

function validarLinha(idx: number, dados: Record<string, string>): string | null {
  if (!dados.nome || dados.nome.trim().length === 0) {
    return `Linha ${idx}: nome é obrigatório`
  }
  if (dados.email && dados.email.length > 0) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) {
      return `Linha ${idx}: email inválido (${dados.email})`
    }
  }
  return null
}

export function ImportLeadsModal({ open, onClose, onImportado }: Props) {
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [processando, setProcessando] = useState(false)
  const supabase = createClient()
  const { toast } = useToast()

  if (!open) return null

  async function handleFile(file: File) {
    setProcessando(true)
    setResultado(null)
    try {
      const text = await file.text()
      const rows = parseCSV(text, ';')
      if (rows.length < 2) {
        toast({
          title: 'CSV vazio',
          description: 'Arquivo sem dados.',
          variant: 'destructive',
        })
        setProcessando(false)
        return
      }
      const headers = rows[0]
      const mapa = mapearCabecalhos(headers)

      if (!mapa.nome) {
        toast({
          title: 'Coluna nome ausente',
          description: 'O CSV precisa ter uma coluna nome.',
          variant: 'destructive',
        })
        setProcessando(false)
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        toast({ title: 'Não autenticado', variant: 'destructive' })
        setProcessando(false)
        return
      }
      const { data: tu } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single()
      if (!tu) {
        toast({ title: 'Tenant não encontrado', variant: 'destructive' })
        setProcessando(false)
        return
      }

      const sucessos: any[] = []
      const duplicados: any[] = []
      const errosDetalhe: Array<{ linha: number; motivo: string }> = []

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (row.every((c) => !c || !c.trim())) continue // pula vazias
        const dados = linhaParaDados(row, headers, mapa)
        const erro = validarLinha(i + 1, dados)
        if (erro) {
          errosDetalhe.push({ linha: i + 1, motivo: erro })
          continue
        }
        sucessos.push({
          tenant_id: tu.tenant_id,
          nome: dados.nome,
          empresa: dados.empresa || null,
          email: dados.email || null,
          telefone: dados.telefone || null,
          endereco_cidade: dados.cidade || null,
          origem: 'manual',
          status: 'novo',
          observacoes: dados.observacoes || null,
        })
      }

      // Detectar duplicados por email/telefone no próprio CSV
      const seenEmails = new Set<string>()
      const seenTelefones = new Set<string>()
      const inseridos: any[] = []
      for (const r of sucessos) {
        const email = (r.email ?? '').toLowerCase()
        const tel = r.telefone?.replace(/\D/g, '') ?? ''
        let dup = false
        if (email && seenEmails.has(email)) {
          dup = true
        } else if (tel && seenTelefones.has(tel)) {
          dup = true
        }
        if (dup) {
          duplicados.push(r)
        } else {
          if (email) seenEmails.add(email)
          if (tel) seenTelefones.add(tel)
          inseridos.push(r)
        }
      }

      // Detectar duplicados no banco
      const filtroBanco: string[] = []
      if (seenEmails.size > 0)
        filtroBanco.push(`email.in.(${Array.from(seenEmails).map((e) => `"${e}"`).join(',')})`)
      if (seenTelefones.size > 0)
        filtroBanco.push(
          `telefone.in.(${Array.from(seenTelefones)
            .map((t) => `"${t}"`)
            .join(',')})`
        )

      let jaExistentes = new Set<string>()
      if (filtroBanco.length > 0) {
        const { data: existentes } = await supabase
          .from('crm_leads')
          .select('email, telefone')
          .eq('tenant_id', tu.tenant_id)
          .or(filtroBanco.join(','))
        if (existentes) {
          for (const e of existentes) {
            if (e.email) jaExistentes.add(`e:${(e.email as string).toLowerCase()}`)
            if (e.telefone)
              jaExistentes.add(`t:${(e.telefone as string).replace(/\D/g, '')}`)
          }
        }
      }

      const reais: any[] = []
      for (const r of inseridos) {
        const email = (r.email ?? '').toLowerCase()
        const tel = r.telefone?.replace(/\D/g, '') ?? ''
        let dupBanco = false
        if (email && jaExistentes.has(`e:${email}`)) dupBanco = true
        else if (tel && jaExistentes.has(`t:${tel}`)) dupBanco = true
        if (dupBanco) {
          duplicados.push(r)
        } else {
          reais.push(r)
        }
      }

      let erros = 0
      if (reais.length > 0) {
        const { error } = await supabase.from('crm_leads').insert(reais)
        if (error) {
          erros = reais.length
          errosDetalhe.push({ linha: 0, motivo: `Falha ao inserir: ${error.message}` })
        }
      }

      // Log
      await supabase.from('crm_importacoes_log').insert({
        tenant_id: tu.tenant_id,
        nome_arquivo: file.name,
        total_linhas: rows.length - 1,
        sucessos: reais.length,
        duplicados: duplicados.length,
        erros,
        erros_detalhe: errosDetalhe,
        created_by: user.id,
      })

      setResultado({
        sucessos: reais.length,
        duplicados: duplicados.length,
        erros,
        errosDetalhe,
      })
      if (reais.length > 0) onImportado?.()
    } catch (err: any) {
      toast({
        title: 'Erro ao processar',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setProcessando(false)
    }
  }

  function baixarModelo() {
    const exemplo = `nome;empresa;email;telefone;cidade;observacoes
"João Silva";ACME Construtora;joao@acme.com;(34)99999-1111;Uberlândia;Cliente VIP
"Maria Souza";MRV;maria@mrv.com;(34)98888-2222;Uberaba;`
    const blob = new Blob(['﻿' + exemplo], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo-leads.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl border border-border max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-lg font-bold">Importar leads via CSV</h3>
          <button onClick={onClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!resultado ? (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Colunas aceitas: nome (obrigatório), empresa, email, telefone, cidade,
              observacoes. Aceita separador <code className="text-xs">;</code>.
            </p>

            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center mb-4">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <input
                type="file"
                accept=".csv,text/csv"
                id="csv-input"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
              <label
                htmlFor="csv-input"
                className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground h-10 px-4 hover:bg-primary/90"
              >
                {processando ? 'Processando...' : 'Escolher arquivo'}
              </label>
              <p className="text-xs text-muted-foreground mt-2">Tamanho máximo 5 MB</p>
            </div>

            <button
              onClick={baixarModelo}
              className="text-sm text-primary hover:underline"
            >
              ⬇ Baixar modelo de CSV
            </button>
          </>
        ) : (
          <div>
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>
                  <b>{resultado.sucessos}</b> leads importados
                </span>
              </div>
              {resultado.duplicados > 0 && (
                <div className="flex items-center gap-2 text-sm text-yellow-700">
                  <AlertCircle className="h-4 w-4" />
                  <span>
                    <b>{resultado.duplicados}</b> duplicados ignorados
                  </span>
                </div>
              )}
              {resultado.erros > 0 && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4" />
                  <span>
                    <b>{resultado.erros}</b> linhas com erro
                  </span>
                </div>
              )}
              {resultado.errosDetalhe.length > 0 && (
                <div className="bg-muted/50 rounded-md p-2 max-h-32 overflow-y-auto">
                  {resultado.errosDetalhe.map((e, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {e.motivo}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setResultado(null)}>
                Importar outro
              </Button>
              <Button onClick={onClose}>Fechar</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
