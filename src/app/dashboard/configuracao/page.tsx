'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { CheckCircle2, Loader2, Shield, Bell, Users, Database, Key, Webhook } from 'lucide-react'

const CIDADES = [
  'Uberlândia', 'Uberaba', 'Araguari', 'Ituiutaba',
  'Patos de Minas', 'Patrocínio', 'Frutal', 'Ribeirão Preto',
]

export default function ConfiguracaoPage() {
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [tenant, setTenant] = useState<any>(null)
  const [userEmail, setUserEmail] = useState('')
  const [form, setForm] = useState({
    nome: '',
    cnpj: '',
    cidade: '',
    segmento: '',
    raioKm: 50,
  })
  const [cidadesSelecionadas, setCidadesSelecionadas] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserEmail(user.email ?? '')

      const { data: tu } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single()

      if (!tu) return
      setTenantId(tu.tenant_id)

      const { data: t } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tu.tenant_id)
        .single()

      if (t) {
        setTenant(t)
        setForm({
          nome: t.nome ?? '',
          cnpj: t.cnpj ?? '',
          cidade: '',
          segmento: (t.segmento_principal ?? []).join(', '),
          raioKm: t.raio_km ?? 50,
        })
        setCidadesSelecionadas([])
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantId) return
    setSaving(true)

    const segmentos = form.segmento
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const { error } = await supabase
      .from('tenants')
      .update({
        nome: form.nome,
        cnpj: form.cnpj || null,
        segmento_principal: segmentos,
        raio_km: form.raioKm,
        onboard_completo: true,
      })
      .eq('id', tenantId)

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' })
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      toast({ title: 'Salvo com sucesso!', description: 'Configurações atualizadas.' })
    }
    setSaving(false)
  }

  function toggleCidade(cidade: string) {
    setCidadesSelecionadas((prev) =>
      prev.includes(cidade) ? prev.filter((c) => c !== cidade) : [...prev, cidade]
    )
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-dark">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {userEmail} · {tenant?.plano ? `Plano ${tenant.plano}` : ''}
        </p>
      </div>

      {/* Status da conta */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-primary" />
            Status da Conta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Plano', value: tenant?.plano?.charAt(0).toUpperCase() + tenant?.plano?.slice(1) || '—' },
              { label: 'Status', value: tenant?.status === 'ativo' ? 'Ativo' : tenant?.status === 'trial' ? 'Trial' : tenant?.status ?? '—', color: tenant?.status === 'ativo' ? 'text-green-600' : 'text-primary' },
              { label: 'Trial expira', value: tenant?.trial_expira_em ? new Date(tenant.trial_expira_em).toLocaleDateString('pt-BR') : 'N/A' },
              { label: 'Membros', value: '—' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-sm font-semibold ${color ?? 'text-dark'}`}>{value}</p>
              </div>
            ))}
          </div>
          {tenant?.status === 'trial' && (
            <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-sm text-primary font-medium">
                Período de teste ativo! Converta para um plano pago antes do vencimento.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Empresa */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-5 w-5 text-primary" />
            Dados da Empresa
          </CardTitle>
          <CardDescription>Informações que aparecem nas suas propostas e relatórios.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome da empresa</Label>
                <Input
                  id="nome"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  placeholder="00.000.000/0001-00"
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="segmento">Segmentos (separados por vírgula)</Label>
                <Input
                  id="segmento"
                  placeholder="Ex: concreto, locação, aço"
                  value={form.segmento}
                  onChange={(e) => setForm({ ...form, segmento: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="raioKm">Raio de monitoramento (km)</Label>
                <Input
                  id="raioKm"
                  type="number"
                  min={5}
                  max={200}
                  value={form.raioKm}
                  onChange={(e) => setForm({ ...form, raioKm: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Cidades monitoradas</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CIDADES.map((cidade) => (
                  <button
                    key={cidade}
                    type="button"
                    onClick={() => toggleCidade(cidade)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      cidadesSelecionadas.includes(cidade)
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border bg-background text-foreground hover:border-primary/50'
                    }`}
                  >
                    <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                      cidadesSelecionadas.includes(cidade) ? 'bg-primary border-primary' : 'border-border'
                    }`}>
                      {cidadesSelecionadas.includes(cidade) && (
                        <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    {cidade}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                {saved ? <CheckCircle2 className="h-4 w-4 mr-1" /> : null}
                {saved ? 'Salvo!' : 'Salvar alterações'}
              </Button>
              {saved && <span className="text-sm text-green-600">Alterações salvas.</span>}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Equipe */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-primary" />
            Equipe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Convide membros para sua equipe. Eles vão receber um link de convite por e-mail.
          </p>
          <div className="mt-4 flex gap-3">
            <Input placeholder="E-mail do colega" className="flex-1" />
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option>Vendedor</option>
              <option>Gerente</option>
              <option>Admin</option>
            </select>
            <Button>Convidar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Notificações */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5 text-primary" />
            Notificações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { label: 'Alertas de novas obras', desc: 'Receba por e-mail quando uma nova obra for detectada', defaultChecked: true },
              { label: 'Relatório semanal', desc: 'Resumo de obras e leads toda segunda-feira', defaultChecked: true },
              { label: 'Lembretes de follow-up', desc: 'Notificação quando um lead precisa de retorno', defaultChecked: false },
            ].map(({ label, desc, defaultChecked }) => (
              <div key={label} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-dark">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <input
                  type="checkbox"
                  defaultChecked={defaultChecked}
                  className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Perigo */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-lg text-red-600">Zona de Perigo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Cancelar minha conta</p>
              <p className="text-xs text-muted-foreground">
                Todos os dados serão excluídos permanentemente.
              </p>
            </div>
            <Button variant="destructive" size="sm">
              Cancelar conta
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* API e Webhooks */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Key className="h-5 w-5 text-primary" />
            Integracao e API
          </CardTitle>
          <CardDescription>
            Gerencie chaves de API e webhooks para integracoes externas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <a
              href="/dashboard/configuracao/api"
              className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <div className="p-2 bg-primary/10 rounded-lg">
                <Key className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">API Keys</p>
                <p className="text-xs text-muted-foreground">
                  Chaves para acesso programatico
                </p>
              </div>
            </a>
            <a
              href="/api/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <div className="p-2 bg-primary/10 rounded-lg">
                <Webhook className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Documentacao API</p>
                <p className="text-xs text-muted-foreground">
                  Referencia completa da API REST
                </p>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
