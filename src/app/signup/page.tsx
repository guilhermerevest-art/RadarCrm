'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { createClient } from '@/lib/supabase/client'
import { Mail, ArrowLeft, Loader2, CheckCircle2, Lock } from 'lucide-react'

const PASSOS = [
  {
    numero: 1,
    titulo: 'Criar conta',
    desc: 'E-mail e senha',
  },
  {
    numero: 2,
    titulo: 'Sua empresa',
    desc: 'Nome e segmento',
  },
  {
    numero: 3,
    titulo: 'Cidades',
    desc: 'Onde você opera',
  },
]

export default function SignupPage() {
  const [passo, setPasso] = useState(1)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [nome, setNome] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [cidades, setCidades] = useState<string[]>([])
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  function validarSenha(_s: string): string | null {
    return null
  }

  async function handleCriarConta(e: React.FormEvent) {
    e.preventDefault()
    if (!email) {
      toast({ title: 'Informe seu e-mail', variant: 'destructive' })
      return
    }

    if (!senha) {
      toast({ title: 'Informe uma senha', variant: 'destructive' })
      return
    }

    if (senha !== confirmarSenha) {
      toast({ title: 'As senhas não conferem', variant: 'destructive' })
      return
    }

    setLoading(true)

    // Cria conta com email/senha
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          nome: nome || email.split('@')[0],
        },
      },
    })

    if (error) {
      toast({ title: 'Erro ao criar conta', description: error.message, variant: 'destructive' })
      setLoading(false)
      return
    }

    // Verifica se precisa confirmar email
    if (data.user && !data.session) {
      toast({
        title: 'Conta criada!',
        description: 'Verifique seu e-mail para confirmar o cadastro.',
      })
      setLoading(false)
      return
    }

    // Se já tem sessão (email confirmado automaticamente), segue para o passo 2
    setPasso(2)
    setLoading(false)
  }

  async function handleGoogle() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' })
      setLoading(false)
    }
  }

  function handleContinuar() {
    if (!nome || !empresa) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' })
      return
    }
    setPasso(3)
  }

  async function handleFinalizar() {
    if (cidades.length === 0) {
      toast({ title: 'Selecione pelo menos uma cidade', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Não autenticado')

      const slug = `${empresa.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`

      // Tenta criar via RPC primeiro
      const { error: rpcError } = await supabase.rpc('fn_tenant_criar', {
        p_user_id: user.id,
        p_nome: empresa,
        p_slug: slug,
      })

      if (rpcError) {
        // Fallback: cria via insert direto
        const { error: tenantError } = await supabase.from('tenants').insert({
          nome: empresa,
          slug,
          plano: 'individual',
          status: 'trial',
          onboard_completo: false,
          segmento_principal: [],
          raio_km: 50,
        })

        if (tenantError) {
          console.log('Tenant creation:', tenantError.message)
        }

        // Associa usuário ao tenant
        await supabase.from('tenant_users').insert({
          tenant_id: (await supabase.from('tenants').select('id').eq('slug', slug).single()).data?.id,
          user_id: user.id,
          role: 'owner',
        })
      }

      router.push('/dashboard')
    } catch (err) {
      console.error(err)
      router.push('/dashboard')
    }
  }

  function toggleCidade(cidade: string) {
    setCidades((prev) =>
      prev.includes(cidade) ? prev.filter((c) => c !== cidade) : [...prev, cidade]
    )
  }

  const TODAS_CIDADES = [
    'Uberlândia', 'Uberaba', 'Araguari', 'Ituiutaba',
    'Patos de Minas', 'Patrocínio', 'Frutal', 'Ribeirão Preto',
  ]

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="absolute inset-0 -z-10">
        <div className="absolute -left-1/4 top-0 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -right-1/4 bottom-0 h-96 w-96 rounded-full bg-secondary/5 blur-3xl" />
      </div>

      <div className="w-full max-w-lg">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="h-4 w-4" />
            Voltar para home
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="3" fill="white"/>
              </svg>
            </div>
            <span className="font-heading text-xl font-bold text-dark">Radar Canteiro</span>
          </div>
        </div>

        {/* Indicador de progresso */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {PASSOS.map((p, i) => (
            <div key={p.numero} className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                passo > p.numero
                  ? 'bg-primary text-white'
                  : passo === p.numero
                  ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {passo > p.numero ? <CheckCircle2 className="h-4 w-4" /> : p.numero}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold text-dark">{p.titulo}</p>
                <p className="text-xs text-muted-foreground">{p.desc}</p>
              </div>
              {i < PASSOS.length - 1 && (
                <div className={`h-px w-8 sm:w-16 ${passo > p.numero ? 'bg-primary' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">
              {passo === 1 && 'Criar sua conta'}
              {passo === 2 && 'Sobre a empresa'}
              {passo === 3 && 'Onde você opera?'}
            </CardTitle>
            <CardDescription>
              {passo === 1 && 'Trial 14 dias grátis. Sem cartão de crédito.'}
              {passo === 2 && 'Esses dados aparecem nas suas propostas.'}
              {passo === 3 && 'Selecione as cidades que você quer monitorar.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {passo === 1 && (
              <div className="space-y-4">
                <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  {loading ? 'Redirecionando...' : 'Continuar com Google'}
                </Button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">ou</span>
                  </div>
                </div>

                <form onSubmit={handleCriarConta} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com.br"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="senha">Senha</Label>
                    <Input
                      id="senha"
                      type="password"
                      placeholder="Sua senha"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmar">Confirmar senha</Label>
                    <Input
                      id="confirmar"
                      type="password"
                      placeholder="Digite a senha novamente"
                      value={confirmarSenha}
                      onChange={(e) => setConfirmarSenha(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                    {confirmarSenha && senha !== confirmarSenha && (
                      <p className="text-xs text-red-500">As senhas não conferem</p>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Ao criar a conta, você concorda com nossos{' '}
                    <Link href="/termos" className="text-primary hover:underline">Termos</Link>
                    {' '}e{' '}
                    <Link href="/privacidade" className="text-primary hover:underline">Política de Privacidade</Link>.
                  </p>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Criando conta...
                      </>
                    ) : (
                      <>
                        <Lock className="mr-2 h-4 w-4" />
                        Criar conta
                      </>
                    )}
                  </Button>
                </form>
              </div>
            )}

            {passo === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Seu nome</Label>
                  <Input
                    id="nome"
                    placeholder="Ex: João Silva"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="empresa">Nome da empresa</Label>
                  <Input
                    id="empresa"
                    placeholder="Ex: Concremax Ltda"
                    value={empresa}
                    onChange={(e) => setEmpresa(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Este nome aparece nas suas propostas e no WhatsApp.
                  </p>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => setPasso(1)}>Voltar</Button>
                  <Button className="flex-1" onClick={handleContinuar}>Continuar</Button>
                </div>
              </div>
            )}

            {passo === 3 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {TODAS_CIDADES.map((cidade) => (
                    <button
                      key={cidade}
                      type="button"
                      onClick={() => toggleCidade(cidade)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                        cidades.includes(cidade)
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border bg-background text-foreground hover:border-primary/50'
                      }`}
                    >
                      <div className={`h-4 w-4 rounded border flex items-center justify-center ${
                        cidades.includes(cidade) ? 'bg-primary border-primary' : 'border-border'
                      }`}>
                        {cidades.includes(cidade) && (
                          <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      {cidade}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {cidades.length === 0
                    ? 'Selecione pelo menos uma cidade.'
                    : `${cidades.length} cidade${cidades.length > 1 ? 's' : ''} selecionada${cidades.length > 1 ? 's' : ''}.`}
                </p>
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => setPasso(2)}>Voltar</Button>
                  <Button className="flex-1" onClick={handleFinalizar} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Criar conta grátis
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
