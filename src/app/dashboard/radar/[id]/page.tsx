'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  MapPin,
  Building,
  User,
  Plus,
  Calendar,
  DollarSign,
  Ruler,
  ExternalLink,
  Copy,
  Check,
  TrendingUp,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { CardConfirmacoes } from '@/components/marcacao/CardConfirmacoes'
import { RadarScoreBadge, RadarScoreBreakdown } from '@/components/radar/RadarScoreBadge'

type Obra = {
  id: string
  fonte: string
  fonte_id?: string
  endereco_logradouro: string
  endereco_numero?: string
  endereco_bairro?: string
  endereco_cidade: string
  endereco_uf: string
  endereco_cep?: string
  lat?: number
  lng?: number
  fase_atual: string | null
  porte: string
  valor_estimado?: number
  status: string
  qualidade_score?: number
  data_inicio?: string
  data_previsao_termino?: string
  descricao?: string
  raw_payload?: any
  tenant_id?: string
  obra_global_id?: string
  hash_deduplicacao?: string
  responsavel_nome?: string
  responsavel_documento?: string
  responsavel_qualificacao?: string
}

const FASE_LABELS: Record<string, string> = {
  alvara: 'Alvará',
  fundacao: 'Fundação',
  estrutura: 'Estrutura',
  acabamento: 'Acabamento',
  concluida: 'Concluída',
  nao_iniciou: 'Não iniciou',
}

const FASE_COLORS: Record<string, string> = {
  alvara: 'bg-red-100 text-red-700',
  fundacao: 'bg-amber-100 text-amber-700',
  estrutura: 'bg-yellow-100 text-yellow-700',
  acabamento: 'bg-green-100 text-green-700',
  concluida: 'bg-gray-100 text-gray-500',
  nao_iniciou: 'bg-slate-100 text-slate-600',
}

const FASE_NAO_IDENTIFICADA = {
  label: 'Não identificada',
  color: 'bg-slate-100 text-slate-500 border-dashed',
}

export default function ObraDetalhePage() {
  const params = useParams()
  const router = useRouter()
  const obraId = params.id as string
  const supabase = createClient()
  const { toast } = useToast()

  const [obra, setObra] = useState<Obra | null>(null)
  const [loading, setLoading] = useState(true)
  const [gerandoLead, setGerandoLead] = useState(false)
  const [copied, setCopied] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      const { data: tu } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user?.id || '')
        .maybeSingle()
      if (tu) setTenantId(tu.tenant_id)

      const { data, error } = await supabase
        .from('radar_obras')
        .select('*')
        .eq('id', obraId)
        .single()

      if (error) {
        console.error(error)
        toast({ title: 'Erro ao carregar obra', variant: 'destructive' })
        router.push('/dashboard/radar')
        return
      }
      setObra(data)
      setLoading(false)
    }
    carregar()
  }, [obraId, router, supabase, toast])

  async function gerarLead() {
    if (!obra) return
    setGerandoLead(true)
    try {
      const nomeResponsavel = obra.responsavel_nome || obra.raw_payload?.responsavel
      const documento = obra.responsavel_documento || obra.raw_payload?.responsavel_documento
      const { data, error } = await supabase
        .from('crm_leads')
        .insert({
          tenant_id: obra.raw_payload?.tenant_id,
          origem: 'radar',
          nome: nomeResponsavel || `Obra em ${obra.endereco_cidade}`,
          email: null,
          telefone: null,
          empresa: nomeResponsavel || null,
          documento: documento || null,
          endereco_cidade: obra.endereco_cidade,
          score_engajamento: obra.qualidade_score || 50,
          status: 'novo',
          observacoes: `Lead gerado automaticamente da obra CNO ${obra.fonte_id || obra.id}.\nEndereço: ${obra.endereco_logradouro}${obra.endereco_numero ? ', ' + obra.endereco_numero : ''}, ${obra.endereco_cidade}/${obra.endereco_uf}${obra.endereco_cep ? ' - CEP ' + obra.endereco_cep : ''}\nValor estimado: ${obra.valor_estimado ? 'R$ ' + obra.valor_estimado.toLocaleString('pt-BR') : 'N/I'}\nÁrea: ${obra.raw_payload?.area_m2 ? obra.raw_payload.area_m2 + ' m²' : 'N/I'}${documento ? `\nDocumento do responsável: ${formatarDocumento(documento)}` : ''}`,
        })
        .select()
        .single()

      if (error) throw error

      toast({
        title: '✅ Lead criado com sucesso!',
        description: `Você pode acompanhar em /dashboard/crm`,
      })
      setTimeout(() => router.push(`/dashboard/crm/${data.id}`), 1500)
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao gerar lead',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setGerandoLead(false)
    }
  }

  function copiarEndereco() {
    if (!obra) return
    const endereco = `${obra.endereco_logradouro}${obra.endereco_numero ? ', ' + obra.endereco_numero : ''}, ${obra.endereco_bairro || ''} - ${obra.endereco_cidade}/${obra.endereco_uf}${obra.endereco_cep ? ' - CEP ' + obra.endereco_cep : ''}`
    navigator.clipboard.writeText(endereco.trim())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({ title: '📋 Endereço copiado!' })
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Carregando obra...</div>
      </div>
    )
  }

  if (!obra) {
    return (
      <div className="p-8">
        <div className="text-center">Obra não encontrada.</div>
      </div>
    )
  }

  // URL do Google Maps
  const mapsUrl = obra.lat && obra.lng
    ? `https://www.google.com/maps?q=${obra.lat},${obra.lng}`
    : `https://www.google.com/maps?q=${encodeURIComponent(`${obra.endereco_logradouro}, ${obra.endereco_cidade}/${obra.endereco_uf}`)}`

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard/radar">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
        </Link>
        <span className="text-xs text-muted-foreground">
          Fonte: <Badge variant="outline" className="ml-1">{obra.fonte.toUpperCase()}</Badge>
        </span>
      </div>

      {/* Header */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="font-heading text-2xl font-bold text-dark mb-2">
                {obra.responsavel_nome || obra.raw_payload?.responsavel || `Obra em ${obra.endereco_cidade}`}
              </h1>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm truncate">
                  {obra.endereco_logradouro}{obra.endereco_numero ? `, ${obra.endereco_numero}` : ''}
                  {obra.endereco_bairro ? ` - ${obra.endereco_bairro}` : ''}
                </span>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {obra.endereco_cidade}/{obra.endereco_uf}
                {obra.endereco_cep ? ` · CEP ${obra.endereco_cep}` : ''}
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {obra.fase_atual ? (
                <Badge className={FASE_COLORS[obra.fase_atual]}>
                  {FASE_LABELS[obra.fase_atual]}
                </Badge>
              ) : (
                <Badge variant="outline" className={FASE_NAO_IDENTIFICADA.color}>
                  {FASE_NAO_IDENTIFICADA.label}
                </Badge>
              )}
              <Badge variant="outline">{obra.porte}</Badge>
              <div className="flex items-center gap-1">
                <RadarScoreBadge score={obra.qualidade_score ?? 50} size="md" showLabel />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <DollarSign className="h-3 w-3" />
              Valor estimado
            </div>
            <div className="font-heading font-bold text-lg">
              {obra.valor_estimado
                ? `R$ ${obra.valor_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                : 'Não estimado'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Ruler className="h-3 w-3" />
              Área
            </div>
            <div className="font-heading font-bold text-lg">
              {obra.raw_payload?.area_m2
                ? `${obra.raw_payload.area_m2.toLocaleString('pt-BR')} m²`
                : 'Não informada'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Calendar className="h-3 w-3" />
              Início
            </div>
            <div className="font-heading font-bold text-lg">
              {obra.data_inicio
                ? new Date(obra.data_inicio).toLocaleDateString('pt-BR')
                : 'Não informada'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Score de Oportunidade */}
      <Card className="mb-6 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Score de Oportunidade
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center gap-4">
              <RadarScoreBadge score={obra.qualidade_score ?? 50} size="lg" showLabel />
              <div className="text-xs text-muted-foreground">
                Baseado em fase atual, proximidade,<br />
                porte e valor estimado
              </div>
            </div>
            <div className="text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground">Fase atual</span>
                <span className="font-medium">{obra.fase_atual ? FASE_LABELS[obra.fase_atual] : 'N/I'}</span>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground">Porte</span>
                <span className="font-medium capitalize">{obra.porte}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Valor estimado</span>
                <span className="font-medium">
                  {obra.valor_estimado
                    ? `R$ ${obra.valor_estimado.toLocaleString('pt-BR')}`
                    : 'N/I'}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Mapa */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Localização</span>
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                Abrir no Maps
                <ExternalLink className="h-3 w-3" />
              </a>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <iframe
              src={`https://www.google.com/maps?q=${encodeURIComponent(`${obra.endereco_logradouro}, ${obra.endereco_cidade}/${obra.endereco_uf}`)}&output=embed`}
              width="100%"
              height="300"
              style={{ border: 0, borderRadius: '0 0 8px 8px' }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </CardContent>
        </Card>

        {/* Detalhes técnicos */}
        <Card>
          <CardHeader>
            <CardTitle>Detalhes Técnicos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Responsável" value={obra.responsavel_nome || obra.raw_payload?.responsavel} copy />
            <Row label="Documento" value={formatarDocumento(obra.responsavel_documento || obra.raw_payload?.responsavel_documento)} copy />
            <Row label="Qualificação" value={obra.responsavel_qualificacao || obra.raw_payload?.responsavel_qualificacao} />
            <Row label="CNO" value={obra.fonte_id} copy />
            <Row label="Situação" value={obra.raw_payload?.situacao === '01' ? 'Ativa' : obra.raw_payload?.situacao === '14' ? 'Ativa (c/ pendência)' : obra.raw_payload?.situacao || 'N/I'} />
            <Row label="Data situação" value={obra.raw_payload?.data_situacao} />
            <Row label="Data início resp." value={obra.raw_payload?.data_inicio_responsabilidade} />
            <Row label="Endereço" value={`${obra.endereco_logradouro}, ${obra.endereco_numero || 's/n'} - ${obra.endereco_bairro || ''}`} copy />
            <Row label="Score qualidade" value={`${obra.qualidade_score}/100`} />
          </CardContent>
        </Card>
      </div>

      {/* Sistema de Marcações da Comunidade (estilo Waze) */}
      {userId && tenantId && (
        <div className="mb-6">
          <CardConfirmacoes
            obraId={obra.id}
            obraGlobalId={obra.obra_global_id}
            obraData={{
              hash_deduplicacao: obra.hash_deduplicacao,
              endereco_logradouro: obra.endereco_logradouro,
              endereco_numero: obra.endereco_numero,
              endereco_bairro: obra.endereco_bairro,
              endereco_cidade: obra.endereco_cidade,
              endereco_uf: obra.endereco_uf,
              endereco_cep: obra.endereco_cep,
              lat: obra.lat,
              lng: obra.lng,
            }}
            tenantId={tenantId}
            userId={userId}
          />
        </div>
      )}

      {/* Ações */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-heading font-bold text-lg text-dark mb-1">
                <User className="inline h-5 w-5 mr-1 text-primary" />
                Converteu essa obra em lead?
              </h3>
              <p className="text-sm text-muted-foreground">
                Crie um lead automaticamente a partir dessa obra.
                Ideal para começar a abordagem comercial.
              </p>
            </div>
            <Button
              onClick={gerarLead}
              disabled={gerandoLead}
              size="lg"
              className="shadow-lg"
            >
              <Plus className="h-4 w-4 mr-2" />
              {gerandoLead ? 'Gerando...' : 'Gerar Lead'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function formatarDocumento(doc?: string | null): string | null {
  if (!doc) return null
  const d = doc.replace(/\D/g, '')
  if (d.length === 11) {
    // CPF: 000.000.000-00
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`
  }
  if (d.length === 14) {
    // CNPJ: 00.000.000/0000-00
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`
  }
  return doc
}

function Row({ label, value, copy }: { label: string; value?: string | null; copy?: boolean }) {
  if (!value || value === 'null' || value === 'undefined') return null
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-1 max-w-[60%]">
        <span className="font-mono text-sm truncate">{value}</span>
        {copy && (
          <button
            onClick={() => navigator.clipboard.writeText(value)}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}
