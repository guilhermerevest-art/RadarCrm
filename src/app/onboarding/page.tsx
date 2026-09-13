'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { createClient } from '@/lib/supabase/client'
import {
  Building2,
  MapPin,
  Users,
  Check,
  ArrowRight,
  Sparkles,
} from 'lucide-react'

const PASSOS = [
  { id: 1, title: 'Sua empresa', icon: Building2, key: 'empresa' },
  { id: 2, title: 'Sua região', icon: MapPin, key: 'regiao' },
  { id: 3, title: 'Equipe', icon: Users, key: 'equipe' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()
  const [passo, setPasso] = useState(1)
  const [loading, setLoading] = useState(false)
  const [dados, setDados] = useState({
    empresa: '',
    cnpj: '',
    cidade: '',
    uf: 'MG',
    nicho: 'construtora',
    tamanho_equipe: '1-5',
  })

  async function finalizar() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Não autenticado')

      const { data: tu } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single()

      if (!tu) throw new Error('Tenant não encontrado')

      // Atualiza tenant com dados de onboarding
      await supabase
        .from('tenants')
        .update({
          nome: dados.empresa,
          cidade: dados.cidade,
          uf: dados.uf,
          nicho: dados.nicho,
          tamanho_equipe: dados.tamanho_equipe,
          onboard_completo: true,
        })
        .eq('id', tu.tenant_id)

      toast({ title: '🎉 Onboarding completo!', description: 'Vamos começar a captar obras.' })
      router.push('/dashboard')
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="font-heading text-2xl font-bold text-dark">Radar Canteiro</span>
        </div>

        <Card className="border-primary/20 shadow-xl">
          <CardContent className="p-8">
            {/* Progress */}
            <div className="flex items-center justify-between mb-8">
              {PASSOS.map((p) => {
                const Icon = p.icon
                const ativo = p.id === passo
                const completo = p.id < passo
                return (
                  <div key={p.id} className="flex items-center gap-2 flex-1">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
                        completo ? 'bg-green-500 text-white' :
                        ativo ? 'bg-primary text-white shadow-lg scale-110' :
                        'bg-muted text-muted-foreground'
                      }`}
                    >
                      {completo ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </div>
                    {p.id < PASSOS.length && (
                      <div className={`flex-1 h-1 rounded ${
                        p.id < passo ? 'bg-green-500' : 'bg-muted'
                      }`} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Título */}
            <div className="text-center mb-6">
              <h2 className="font-heading text-2xl font-bold text-dark">
                {passo === 1 && 'Sobre sua empresa'}
                {passo === 2 && 'Onde você atua?'}
                {passo === 3 && 'Tamanho da equipe'}
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                {passo === 1 && 'Vamos personalizar o radar para o seu negócio'}
                {passo === 2 && 'Focamos nas obras da sua região'}
                {passo === 3 && 'Para calibrar o volume de leads'}
              </p>
            </div>

            {/* Formulários por passo */}
            <div className="space-y-4">
              {passo === 1 && (
                <>
                  <div>
                    <label className="text-sm font-medium">Nome da empresa *</label>
                    <Input
                      value={dados.empresa}
                      onChange={(e) => setDados({ ...dados, empresa: e.target.value })}
                      placeholder="Ex: Construtora ABC Ltda"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">CNPJ (opcional)</label>
                    <Input
                      value={dados.cnpj}
                      onChange={(e) => setDados({ ...dados, cnpj: e.target.value })}
                      placeholder="00.000.000/0000-00"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Seu nicho principal</label>
                    <select
                      className="w-full h-10 px-3 rounded-md border border-input bg-background mt-1"
                      value={dados.nicho}
                      onChange={(e) => setDados({ ...dados, nicho: e.target.value })}
                    >
                      <option value="construtora">Construtora / Incorporadora</option>
                      <option value="material">Loja de Material de Construção</option>
                      <option value="prestador">Prestador de Serviços (eletricista, encanador, etc.)</option>
                      <option value="arquitetura">Escritório de Arquitetura/Engenharia</option>
                      <option value="industria">Indústria / Fabricante</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>
                </>
              )}

              {passo === 2 && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="text-sm font-medium">Cidade principal *</label>
                      <Input
                        value={dados.cidade}
                        onChange={(e) => setDados({ ...dados, cidade: e.target.value })}
                        placeholder="Uberlândia"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">UF</label>
                      <select
                        className="w-full h-10 px-3 rounded-md border border-input bg-background mt-1"
                        value={dados.uf}
                        onChange={(e) => setDados({ ...dados, uf: e.target.value })}
                      >
                        <option value="MG">MG</option>
                        <option value="SP">SP</option>
                        <option value="RJ">RJ</option>
                        <option value="GO">GO</option>
                        <option value="DF">DF</option>
                      </select>
                    </div>
                  </div>
                  <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-sm text-muted-foreground">
                    💡 <strong>Dica:</strong> Você pode adicionar mais cidades depois em
                    Configurações. Por enquanto focamos nas obras próximas a você.
                  </div>
                </>
              )}

              {passo === 3 && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: '1', label: 'Só eu' },
                      { value: '2-5', label: '2-5 pessoas' },
                      { value: '6-15', label: '6-15 pessoas' },
                      { value: '16+', label: '16+ pessoas' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDados({ ...dados, tamanho_equipe: opt.value })}
                        className={`p-4 rounded-lg border-2 text-left transition-all ${
                          dados.tamanho_equipe === opt.value
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <div className="font-heading font-bold">{opt.label}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Botões */}
            <div className="flex justify-between mt-8">
              <Button
                variant="outline"
                onClick={() => setPasso(Math.max(1, passo - 1))}
                disabled={passo === 1}
              >
                Voltar
              </Button>
              {passo < PASSOS.length ? (
                <Button
                  onClick={() => setPasso(passo + 1)}
                  disabled={(passo === 1 && !dados.empresa) || (passo === 2 && !dados.cidade)}
                >
                  Próximo
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={finalizar} disabled={loading}>
                  {loading ? 'Salvando...' : 'Começar a usar'} 🚀
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Pode pular e configurar depois em Configurações.
        </p>
      </div>
    </div>
  )
}
