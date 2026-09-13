'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  Phone,
  Mail,
  Building2,
  MapPin,
  DollarSign,
  MessageSquare,
  ChevronRight,
  User,
  Calendar,
  Edit,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { WhatsAppModal } from '@/components/whatsapp/WhatsAppModal'

type CadastroComercial = {
  id: string
  tenant_id: string
  nome: string
  cnpj?: string
  telefone?: string
  email?: string
  segmento?: string
  porte: string
  etapa: string
  origem: string
  responsavel_id?: string
  valor_estimado?: number
  probabilidade?: number
  notas?: string
  ultimo_contato?: string
  endereco_logradouro?: string
  endereco_numero?: string
  endereco_bairro?: string
  endereco_cidade?: string
  endereco_uf?: string
  created_at: string
}

const ETAPA_OPTIONS = [
  { value: 'novo', label: 'Novo', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'contato_inicial', label: 'Contato Inicial', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { value: 'qualificacao', label: 'Qualificacao', color: 'bg-indigo-50 text-indindigo-700 border-indigo-200' },
  { value: 'proposta', label: 'Proposta', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'negociacao', label: 'Negociacao', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { value: 'fechado_ganho', label: 'Fechado - Ganho', color: 'bg-green-50 text-green-700 border-green-200' },
  { value: 'fechado_perdido', label: 'Fechado - Perdido', color: 'bg-red-50 text-red-700 border-red-200' },
  { value: 'inativo', label: 'Inativo', color: 'bg-gray-50 text-gray-500 border-gray-200' },
]

const ETAPA_LABELS: Record<string, string> = {
  novo: 'Novo',
  contato_inicial: 'Contato',
  qualificacao: 'Qualificacao',
  proposta: 'Proposta',
  negociacao: 'Negociacao',
  fechado_ganho: 'Ganho',
  fechado_perdido: 'Perdido',
  inativo: 'Inativo',
}

export default function ComercioDetalhePage() {
  const params = useParams()
  const router = useRouter()
  const comercioId = params.id as string
  const supabase = createClient()

  const [comercio, setComercio] = useState<CadastroComercial | null>(null)
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [tenantId, setTenantId] = useState<string>('')

  // Form state
  const [form, setForm] = useState({
    nome: '',
    cnpj: '',
    telefone: '',
    email: '',
    segmento: '',
    porte: 'desconhecido',
    etapa: 'novo',
    valor_estimado: '',
    probabilidade: '',
    notas: '',
  })

  // WhatsApp modal
  const [whatsappOpen, setWhatsappOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: tu } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single()

      if (!tu) { router.push('/dashboard'); return }
      setTenantId(tu.tenant_id)

      const { data } = await supabase
        .from('cadastros_comerciais')
        .select('*')
        .eq('id', comercioId)
        .single()

      if (!data) { router.push('/dashboard/comerciais'); return }
      setComercio(data as CadastroComercial)

      setForm({
        nome: data.nome ?? '',
        cnpj: data.cnpj ?? '',
        telefone: data.telefone ?? '',
        email: data.email ?? '',
        segmento: data.segmento ?? '',
        porte: data.porte ?? 'desconhecido',
        etapa: data.etapa ?? 'novo',
        valor_estimado: data.valor_estimado ? String(data.valor_estimado) : '',
        probabilidade: data.probabilidade ? String(data.probabilidade) : '',
        notas: data.notas ?? '',
      })

      setLoading(false)
    }
    load()
  }, [comercioId])

  const handleSave = async () => {
    setSalvando(true)
    const { error } = await supabase
      .from('cadastros_comerciais')
      .update({
        nome: form.nome,
        cnpj: form.cnpj || null,
        telefone: form.telefone || null,
        email: form.email || null,
        segmento: form.segmento || null,
        porte: form.porte,
        etapa: form.etapa,
        valor_estimado: form.valor_estimado ? Number(form.valor_estimado) : null,
        probabilidade: form.probabilidade ? Number(form.probabilidade) : null,
        notas: form.notas || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', comercioId)

    if (!error) {
      setEditando(false)
      // Reload
      const { data } = await supabase
        .from('cadastros_comerciais')
        .select('*')
        .eq('id', comercioId)
        .single()
      if (data) setComercio(data as CadastroComercial)
    }
    setSalvando(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!comercio) return null

  const etapaAtual = ETAPA_OPTIONS.find(e => e.value === comercio.etapa)

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/comerciais">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {comercio.nome}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              {comercio.cnpj && (
                <span className="text-xs text-muted-foreground">{comercio.cnpj}</span>
              )}
              {comercio.segmento && (
                <Badge variant="outline" className="text-xs">{comercio.segmento}</Badge>
              )}
              {etapaAtual && (
                <Badge className={`text-xs ${etapaAtual.color}`}>
                  {etapaAtual.label}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {comercio.telefone && (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => setWhatsappOpen(true)}
            >
              <MessageSquare className="h-4 w-4 mr-1" />
              WhatsApp
            </Button>
          )}
          <Button
            size="sm"
            variant={editando ? 'default' : 'outline'}
            onClick={() => setEditando(!editando)}
          >
            <Edit className="h-4 w-4 mr-1" />
            {editando ? 'Cancelar' : 'Editar'}
          </Button>
        </div>
      </div>

      {/* Info basica */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Dados da Empresa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editando ? (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Nome / Razao Social</label>
                  <Input
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    placeholder="Nome da empresa"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">CNPJ</label>
                    <Input
                      value={form.cnpj}
                      onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                      placeholder="00.000.000/0000-00"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Segmento</label>
                    <Input
                      value={form.segmento}
                      onChange={(e) => setForm({ ...form, segmento: e.target.value })}
                      placeholder="Ex: Atacado de materiais"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Porte</label>
                    <select
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                      value={form.porte}
                      onChange={(e) => setForm({ ...form, porte: e.target.value })}
                    >
                      <option value="micro">Micro</option>
                      <option value="pequeno">Pequeno</option>
                      <option value="medio">Medio</option>
                      <option value="grande">Grande</option>
                      <option value="desconhecido">Desconhecido</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Origem</label>
                    <Input value={comercio.origem} disabled className="bg-muted" />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{comercio.nome}</span>
                </div>
                {comercio.cnpj && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">CNPJ:</span>
                    <span>{comercio.cnpj}</span>
                  </div>
                )}
                {comercio.segmento && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Segmento:</span>
                    <span>{comercio.segmento}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Porte:</span>
                  <span className="capitalize">{comercio.porte}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editando ? (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Telefone</label>
                  <Input
                    value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Email</label>
                  <Input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="email@empresa.com"
                    type="email"
                  />
                </div>
              </>
            ) : (
              <>
                {comercio.telefone ? (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${comercio.telefone}`} className="text-sm hover:underline">
                      {comercio.telefone}
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Sem telefone</p>
                )}
                {comercio.email ? (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${comercio.email}`} className="text-sm hover:underline">
                      {comercio.email}
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Sem email</p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pipeline Comercial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editando ? (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Etapa</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={form.etapa}
                    onChange={(e) => setForm({ ...form, etapa: e.target.value })}
                  >
                    {ETAPA_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Valor Estimado (R$)</label>
                    <Input
                      type="number"
                      value={form.valor_estimado}
                      onChange={(e) => setForm({ ...form, valor_estimado: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Probabilidade (%)</label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={form.probabilidade}
                      onChange={(e) => setForm({ ...form, probabilidade: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Badge className={etapaAtual?.color ?? ''}>
                    {ETAPA_LABELS[comercio.etapa] ?? comercio.etapa}
                  </Badge>
                </div>
                {comercio.valor_estimado ? (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(comercio.valor_estimado)}
                    </span>
                    {comercio.probabilidade && (
                      <span className="text-xs text-muted-foreground">({comercio.probabilidade}%)</span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Sem valor estimado</p>
                )}
                {comercio.ultimo_contato && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Ultimo contato:</span>
                    <span>{new Date(comercio.ultimo_contato).toLocaleDateString('pt-BR')}</span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Notas</CardTitle>
          </CardHeader>
          <CardContent>
            {editando ? (
              <Textarea
                value={form.notas}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, notas: e.target.value })}
                placeholder="Observacoes sobre a empresa..."
                className="min-h-32"
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap">
                {comercio.notas || 'Sem notas.'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Botao salvar */}
      {editando && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={salvando || !form.nome}>
            {salvando ? 'Salvando...' : (
              <>
                <Save className="h-4 w-4 mr-1" />
                Salvar Alteracoes
              </>
            )}
          </Button>
        </div>
      )}

      {/* WhatsApp Modal */}
      {comercio.telefone && tenantId && (
        <WhatsAppModal
          open={whatsappOpen}
          onClose={() => setWhatsappOpen(false)}
          telefone={comercio.telefone}
          nome={comercio.nome}
          tenantId={tenantId}
        />
      )}
    </div>
  )
}
