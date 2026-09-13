'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  Building2,
  MapPin,
  DollarSign,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'

export default function NovoComercioPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [tenantId, setTenantId] = useState<string>('')

  const [form, setForm] = useState({
    nome: '',
    cnpj: '',
    telefone: '',
    email: '',
    segmento: '',
    porte: 'desconhecido',
    valor_estimado: '',
    probabilidade: '',
    notas: '',
    origem: 'manual',
  })

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: tu } = await supabase
        .from('tenant_users')
        .select('tenant_id, user_id')
        .eq('user_id', user.id)
        .single()

      if (!tu) { router.push('/dashboard'); return }
      setTenantId(tu.tenant_id)
      setLoading(false)
    }
    load()
  }, [])

  const handleSave = async () => {
    if (!form.nome.trim()) return
    setSalvando(true)

    const { data, error } = await supabase
      .from('cadastros_comerciais')
      .insert({
        tenant_id: tenantId,
        nome: form.nome.trim(),
        cnpj: form.cnpj || null,
        telefone: form.telefone || null,
        email: form.email || null,
        segmento: form.segmento || null,
        porte: form.porte,
        valor_estimado: form.valor_estimado ? Number(form.valor_estimado) : null,
        probabilidade: form.probabilidade ? Number(form.probabilidade) : null,
        notas: form.notas || null,
        origem: form.origem,
        etapa: 'novo',
      })
      .select('id')
      .single()

    if (!error && data) {
      router.push(`/dashboard/comerciais/${data.id}`)
    } else {
      console.error('Erro ao criar:', error)
      setSalvando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/comerciais">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Novo Cadastro Comercial
          </h1>
          <p className="text-sm text-muted-foreground">
            Cadastre uma empresa identificada no radar
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Dados da Empresa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Nome / Razao Social *
              </label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Nome da empresa"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">CNPJ</label>
                <Input
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Segmento</label>
                <Input
                  value={form.segmento}
                  onChange={(e) => setForm({ ...form, segmento: e.target.value })}
                  placeholder="Ex: Atacado de materiais"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Porte</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                  value={form.porte}
                  onChange={(e) => setForm({ ...form, porte: e.target.value })}
                >
                  <option value="desconhecido">Desconhecido</option>
                  <option value="micro">Micro</option>
                  <option value="pequeno">Pequeno</option>
                  <option value="medio">Medio</option>
                  <option value="grande">Grande</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Origem</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                  value={form.origem}
                  onChange={(e) => setForm({ ...form, origem: e.target.value })}
                >
                  <option value="manual">Manual</option>
                  <option value="radar">Radar</option>
                  <option value="indicacao">Indicacao</option>
                  <option value="formulario">Formulario</option>
                  <option value="importacao">Importacao</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Telefone</label>
              <Input
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                placeholder="(00) 00000-0000"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@empresa.com"
                type="email"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Valor Estimado (R$)</label>
                <Input
                  type="number"
                  value={form.valor_estimado}
                  onChange={(e) => setForm({ ...form, valor_estimado: e.target.value })}
                  placeholder="0.00"
                  className="mt-1"
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
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notas</label>
              <Textarea
                value={form.notas}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, notas: e.target.value })}
                placeholder="Observacoes sobre a empresa..."
                className="mt-1 min-h-24"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/comerciais">Cancelar</Link>
          </Button>
          <Button
            onClick={handleSave}
            disabled={salvando || !form.nome.trim()}
          >
            {salvando ? 'Salvando...' : (
              <>
                <Save className="h-4 w-4 mr-1" />
                Criar Cadastro
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
