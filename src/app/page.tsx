import Link from 'next/link'
import {
  Building2,
  MapPin,
  Phone,
  TrendingUp,
  Users,
  Zap,
  CheckCircle2,
  ArrowRight,
  Star,
  Shield,
  BarChart3,
  Bell,
  Target,
  Clock,
  Award,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const CIDADES = [
  'Uberlândia', 'Uberaba', 'Araguari', 'Patos de Minas',
  'Ituiutaba', 'Patrocínio', 'Frutal', 'Ribeirão Preto',
]

const RECURSOS = [
  {
    icon: MapPin,
    titulo: 'Radar de Obras',
    desc: 'Detecção automática de obras novas a partir de alvarás, CNO e fontes públicas. Alerta no seu WhatsApp no mesmo dia.',
    highlight: true,
  },
  {
    icon: TrendingUp,
    titulo: 'CRM Completo',
    desc: 'Pipeline kanban, gestão de leads, deals e atividades. Cada vendedor vê só o que é dele.',
    highlight: true,
  },
  {
    icon: Phone,
    titulo: 'WhatsApp Integrado',
    desc: 'Conversas atreladas ao lead. Janela de 24h respeitada. Opt-in LGPD-compliant.',
    highlight: true,
  },
  {
    icon: Users,
    titulo: 'Gestão de Equipe',
    desc: 'Papeis, alcadas de desconto, comissões por venda. Gerente tem visibilidade completa.',
    highlight: false,
  },
  {
    icon: Building2,
    titulo: 'Propostas Profissionais',
    desc: 'Gere PDFs com a marca do cliente. Portal para o lead aceitar online.',
    highlight: false,
  },
  {
    icon: Zap,
    titulo: 'Configuração em Minutos',
    desc: 'Signup com Google ou e-mail. Mapa com obras reais em 5 minutos.',
    highlight: false,
  },
]

const ESTATISTICAS = [
  { valor: '40%', label: 'Menos obras perdidas', sub: 'chegando primeiro' },
  { valor: '5min', label: 'Para configurar', sub: 'e ver sua primeira obra' },
  { valor: '24h', label: 'Alertas no WhatsApp', sub: 'mesmo dia' },
]

const DEPOIMENTOS = [
  {
    nome: 'Ricardo Souza',
    cargo: 'Diretor Comercial — Concremax',
    texto: 'Perdíamos 40% das obras porque só ficávamos sabendo depois que já tinham começado. Agora a gente chega primeiro.',
    cidades: 'Uberlândia + Uberaba',
    avatar: 'RS',
  },
  {
    nome: 'Fernanda Lima',
    cargo: 'Gerente de Vendas — Locatres',
    texto: 'O CRM era planilha e WhatsApp. O Radar Canteiro organizou tudo. Minha equipe fechou 30% mais em 3 meses.',
    cidades: 'Patos de Minas',
    avatar: 'FL',
  },
  {
    nome: 'Marcos Oliveira',
    cargo: 'Vendedor — CompreI',
    texto: 'Eu prospectava na munheca. Hoje entro no mapa, seleciono 8 obras do dia e monto minha rota. Jogo limpo.',
    cidades: 'Ribeirão Preto',
    avatar: 'MO',
  },
]

const PLANOS = [
  {
    nome: 'Starter',
    preco: 97,
    desc: 'Para começar a prospectar obras',
    usuarios: '1 usuário',
    obras: '300 obras/mês',
    leads: '100 leads',
    recursos: [
      'Radar de Obras básico',
      'CRM simplificado',
      'WhatsApp integrado',
      '1 cidade',
      'E-mail de suporte',
    ],
    destaque: false,
  },
  {
    nome: 'Profissional',
    preco: 297,
    desc: 'Para equipes comerciais',
    usuarios: '5 usuários',
    obras: '2.000 obras/mês',
    leads: '1.000 leads',
    recursos: [
      'Tudo do Starter',
      'Pipeline kanban completo',
      'Gestão de equipe',
      'Comissões automáticas',
      'Propostas em PDF',
      'Alertas WhatsApp',
      'Relatórios avançados',
    ],
    destaque: true,
  },
  {
    nome: 'Corporate',
    preco: 697,
    desc: 'Para regionais e frotas',
    usuarios: '20 usuários',
    obras: 'Ilimitadas',
    leads: 'Ilimitados',
    recursos: [
      'Tudo do Profissional',
      'Multi-cidade',
      'API de integração',
      'White-label opcional',
      'Gerente de conta dedicado',
    ],
    destaque: false,
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="3" fill="white"/>
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-heading text-lg font-bold tracking-tight">
                Radar Canteiro
              </span>
              <span className="text-[10px] text-muted-foreground -mt-0.5">CRM para Construção Civil</span>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#recursos" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Recursos
            </a>
            <a href="#planos" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Planos
            </a>
            <a href="#depoimentos" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Depoimentos
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors sm:block">
              Entrar
            </Link>
            <Link href="/signup">
              <Button size="sm" className="shadow-md">
                Começar grátis <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pt-20 pb-28 sm:px-6 lg:px-8">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-secondary/5 rounded-full blur-3xl" />
          {/* Grid pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000003_1px,transparent_1px),linear-gradient(to_bottom,#00000003_1px,transparent_1px)] bg-[size:32px_32px]" />
        </div>

        <div className="mx-auto max-w-5xl text-center">
          <Badge className="px-4 py-1.5 text-sm mb-6">🚀 MVP disponível em Uberlândia, Uberaba e região</Badge>
          <h1 className="font-heading text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl animate-fade-in-up">
            Encontre a obra antes
            <br />
            <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">de virar concreto.</span>
          </h1>
          <p className="mt-8 text-lg text-muted-foreground sm:text-xl max-w-2xl mx-auto leading-relaxed animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            Radar Canteiro combina radar de obras públicas, CRM de vendas e WhatsApp
            integrado. Para concreteiras, locadoras e fornecedores da construção civil.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <Link href="/signup">
              <Button size="lg" className="text-base px-8 shadow-lg shadow-primary/25">
                Começar grátis — 14 dias
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="text-base">
                Já tenho conta
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground/70 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
            <Shield className="inline h-4 w-4 mr-1" />
            Sem cartão de crédito. Cancele quando quiser.
          </p>
        </div>

        {/* Mapa simulado */}
        <div className="mx-auto mt-20 max-w-5xl animate-fade-in-up" style={{ animationDelay: '400ms' }}>
          <div className="relative rounded-2xl border bg-card shadow-soft-xl overflow-hidden">
            {/* Header do mapa */}
            <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-yellow-400" />
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">
                  Radar Canteiro — Uberlândia, MG
                </span>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="success" className="text-xs">
                  <span className="relative mr-1.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  24 obras ativas
                </Badge>
              </div>
            </div>
            {/* Mapa illustration */}
            <div className="relative h-80 sm:h-[420px] bg-gradient-to-br from-muted/30 to-muted/10">
              {/* Grid lines */}
              <svg className="absolute inset-0 w-full h-full opacity-30" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                    <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#1B4965" strokeWidth="0.5"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
              {/* Mapa roads */}
              <svg className="absolute inset-0 w-full h-full opacity-40" xmlns="http://www.w3.org/2000/svg">
                <line x1="0" y1="150" x2="100%" y2="150" stroke="#1B4965" strokeWidth="6"/>
                <line x1="250" y1="0" x2="250" y2="100%" stroke="#1B4965" strokeWidth="5"/>
                <line x1="500" y1="0" x2="500" y2="100%" stroke="#1B4965" strokeWidth="4"/>
                <line x1="750" y1="0" x2="750" y2="100%" stroke="#1B4965" strokeWidth="4"/>
                <line x1="0" y1="250" x2="100%" y2="250" stroke="#1B4965" strokeWidth="4"/>
                <line x1="0" y1="380" x2="100%" y2="380" stroke="#1B4965" strokeWidth="3"/>
                <line x1="125" y1="0" x2="125" y2="100%" stroke="#1B4965" strokeWidth="3"/>
                <line x1="625" y1="0" x2="625" y2="100%" stroke="#1B4965" strokeWidth="3"/>
              </svg>
              {/* Pins de obras */}
              {[
                { x: 22, y: 30, fase: 'Alvará', score: 95 },
                { x: 45, y: 55, fase: 'Fundação', score: 78 },
                { x: 65, y: 25, fase: 'Alvará', score: 88 },
                { x: 35, y: 70, fase: 'Estrutura', score: 65 },
                { x: 78, y: 60, fase: 'Fundação', score: 82 },
                { x: 55, y: 80, fase: 'Alvará', score: 91 },
                { x: 15, y: 55, fase: 'Acabamento', score: 45 },
                { x: 85, y: 35, fase: 'Alvará', score: 87 },
              ].map((obra, i) => (
                <div
                  key={i}
                  className="absolute group cursor-pointer"
                  style={{ left: `${obra.x}%`, top: `${obra.y}%`, transform: 'translate(-50%, -100%)' }}
                >
                  <div className="relative flex flex-col items-center animate-float" style={{ animationDelay: `${i * 0.2}s` }}>
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full shadow-lg ring-4 ring-background transition-transform group-hover:scale-110"
                      style={{
                        backgroundColor: obra.score > 80 ? '#E85D04' : obra.score > 60 ? '#D97706' : '#1B4965',
                        boxShadow: obra.score > 80 ? '0 4px 20px rgba(232, 93, 4, 0.4)' : '0 4px 12px rgba(0,0,0,0.2)'
                      }}
                    >
                      <span className="text-white text-sm font-bold">{obra.score}</span>
                    </div>
                    <div className="h-4 w-1.5 rotate-45 translate-y-1 -mt-1 opacity-80" style={{ backgroundColor: obra.score > 80 ? '#E85D04' : obra.score > 60 ? '#D97706' : '#1B4965' }} />
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 hidden group-hover:block z-10 animate-fade-in">
                      <div className="bg-card text-foreground text-xs rounded-xl px-4 py-3 shadow-soft-xl border min-w-[160px]">
                        <p className="font-bold capitalize flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${obra.score > 80 ? 'bg-primary' : obra.score > 60 ? 'bg-amber-500' : 'bg-secondary'}`} />
                          {obra.fase}
                        </p>
                        <p className="text-muted-foreground mt-1">Score: <strong>{obra.score}/100</strong></p>
                        <p className="text-muted-foreground">R. Amazonas, 1245</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {/* Legenda */}
              <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur rounded-xl px-4 py-3 text-xs space-y-2 border shadow-soft">
                <p className="font-semibold text-muted-foreground mb-1">Potencial</p>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-primary" />
                  <span>Alto (&gt;80)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-amber-500" />
                  <span>Médio (60-80)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-secondary" />
                  <span>Em andamento</span>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground/70">
            Mapa interativo com score de oportunidade por segmento
          </p>
        </div>
      </section>

      {/* Estatísticas */}
      <section className="border-y bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-3">
            {ESTATISTICAS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="font-heading text-5xl font-bold text-primary">{stat.valor}</div>
                <div className="mt-1 font-semibold text-foreground">{stat.label}</div>
                <div className="text-sm text-muted-foreground">{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <Badge className="px-4 py-1.5 text-sm mb-4">Recursos</Badge>
            <h2 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl">
              Tudo que você precisa
              <br />para fechar mais vendas.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Uma plataforma completa para prospectar obras novas, gerenciar clientes e
              acompanhar o time comercial — sem planilha, sem WhatsApp pessoal.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {RECURSOS.map((recurso, i) => (
              <Card
                key={recurso.titulo}
                className={`group relative overflow-hidden border-border/50 transition-all duration-300 hover:shadow-soft-lg hover:border-primary/20 animate-fade-in-up`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {recurso.highlight && (
                  <div className="absolute top-3 right-3">
                    <Badge variant="default" className="text-[10px]">Destaque</Badge>
                  </div>
                )}
                <CardContent className="pt-6">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10 group-hover:scale-110 group-hover:shadow-glow transition-all">
                    <recurso.icon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="font-heading text-xl font-bold mb-2">
                    {recurso.titulo}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {recurso.desc}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Cobertura geográfica */}
      <section className="bg-gradient-to-br from-dark via-dark to-secondary/20 text-paper">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge className="bg-paper/10 text-paper border-0">Geografia do MVP</Badge>
              <h2 className="mt-6 font-heading text-4xl font-bold tracking-tight sm:text-5xl">
                Começamos pelo
                <br /><span className="text-primary">Triângulo Mineiro.</span>
              </h2>
              <p className="mt-4 text-lg text-white/70 leading-relaxed">
                A primeira versão cobre 7 cidades de MG com dados de alvarás
                de construção e CNO. Expansão para SP começa no mês 9.
              </p>
              <ul className="mt-8 space-y-4">
                {CIDADES.map((cidade, i) => (
                  <li key={cidade} className="flex items-center gap-3 text-white/80">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 border border-primary/30">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-medium">{cidade}</span>
                  </li>
                ))}
              </ul>
            </div>
            {/* Mapa ilustrativo de MG */}
            <div className="flex items-center justify-center">
              <div className="relative w-full max-w-sm">
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
                <svg viewBox="0 0 400 300" className="relative w-full">
                  {/* Minas Gerais outline simplificado */}
                  <path
                    d="M120 50 L280 30 L320 80 L340 150 L310 200 L260 240 L200 260 L140 240 L80 200 L60 140 L80 90 Z"
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="2"
                  />
                  {/* Cidade pins */}
                  <circle cx="200" cy="120" r="10" fill="#E85D04" className="animate-pulse"/>
                  <text x="215" y="115" fill="white" fontSize="11" fontFamily="Plus Jakarta Sans" fontWeight="600">Uberlândia</text>
                  <circle cx="160" cy="145" r="7" fill="#E85D04" opacity="0.8"/>
                  <text x="172" y="143" fill="rgba(255,255,255,0.8)" fontSize="9" fontFamily="Plus Jakarta Sans">Uberaba</text>
                  <circle cx="185" cy="90" r="5" fill="rgba(255,255,255,0.6)"/>
                  <text x="196" y="88" fill="rgba(255,255,255,0.6)" fontSize="8" fontFamily="Plus Jakarta Sans">Araguari</text>
                  <circle cx="230" cy="170" r="5" fill="rgba(255,255,255,0.6)"/>
                  <text x="241" y="168" fill="rgba(255,255,255,0.6)" fontSize="8" fontFamily="Plus Jakarta Sans">Patos</text>
                  <circle cx="130" cy="185" r="5" fill="rgba(255,255,255,0.6)"/>
                  <text x="141" y="183" fill="rgba(255,255,255,0.6)" fontSize="8" fontFamily="Plus Jakarta Sans">Ituiutaba</text>
                  <circle cx="255" cy="120" r="5" fill="rgba(255,255,255,0.6)"/>
                  <text x="266" y="118" fill="rgba(255,255,255,0.6)" fontSize="8" fontFamily="Plus Jakarta Sans">Patrocínio</text>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <Badge className="px-4 py-1.5 text-sm mb-4">Planos</Badge>
            <h2 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl">
              Simples e transparente.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
              Comece grátis por 14 dias. Escolha o plano que faz sentido pro tamanho da sua equipe.
            </p>
          </div>
          <div className="grid gap-8 lg:grid-cols-3">
            {PLANOS.map((plano, i) => (
              <Card
                key={plano.nome}
                className={`relative overflow-hidden transition-all duration-300 hover:shadow-soft-lg animate-fade-in-up ${
                  plano.destaque
                    ? 'border-primary shadow-soft-lg ring-2 ring-primary/20'
                    : 'border-border/50'
                }`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {plano.destaque && (
                  <div className="bg-gradient-to-r from-primary to-primary/80 px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-white">
                      <Award className="h-4 w-4" />
                      Mais popular
                    </span>
                  </div>
                )}
                <CardContent className={`p-6 ${plano.destaque ? 'pt-6' : ''}`}>
                  <h3 className="font-heading text-2xl font-bold">{plano.nome}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{plano.desc}</p>
                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="font-heading text-5xl font-bold">R$ {plano.preco}</span>
                    <span className="text-muted-foreground">/mês</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {plano.usuarios} · {plano.obras} · {plano.leads}
                  </p>
                  <ul className="mt-6 space-y-3">
                    {plano.recursos.map((recurso) => (
                      <li key={recurso} className="flex items-start gap-2.5 text-sm">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                        <span>{recurso}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/signup" className="mt-8 block">
                    <Button
                      className="w-full"
                      size="lg"
                      variant={plano.destaque ? 'default' : 'outline'}
                    >
                      Começar grátis
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Shield className="h-4 w-4" />
            Trial 14 dias sem cartão. Fatura via Stripe. Cancele quando quiser.
          </p>
        </div>
      </section>

      {/* Depoimentos */}
      <section id="depoimentos" className="bg-muted/30 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <Badge className="px-4 py-1.5 text-sm mb-4">Depoimentos</Badge>
            <h2 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl">
              Quem usa, recomenda.
            </h2>
          </div>
          <div className="grid gap-8 lg:grid-cols-3">
            {DEPOIMENTOS.map((depoimento, i) => (
              <Card
                key={depoimento.nome}
                className="border-border/50 animate-fade-in-up"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <CardContent className="p-6">
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                    ))}
                  </div>
                  <p className="leading-relaxed italic">
                    &ldquo;{depoimento.texto}&rdquo;
                  </p>
                  <div className="mt-6 flex items-center gap-3 pt-4 border-t">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-white font-bold shadow-md">
                      {depoimento.avatar}
                    </div>
                    <div>
                      <p className="font-bold">{depoimento.nome}</p>
                      <p className="text-sm text-muted-foreground">{depoimento.cargo}</p>
                      <p className="text-xs text-primary font-medium mt-0.5">{depoimento.cidades}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="bg-gradient-to-br from-dark via-dark to-secondary/30 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl text-white">
            Sua próxima venda está
            <br />
            <span className="text-primary">numa obra que você ainda não viu.</span>
          </h2>
          <p className="mt-6 text-lg text-white/70">
            14 dias grátis. Sem compromisso. Leva 5 minutos para configurar.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/signup">
              <Button size="lg" className="text-base px-10 shadow-lg shadow-primary/25">
                Começar grátis agora
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
                    <circle cx="12" cy="12" r="3" fill="white"/>
                  </svg>
                </div>
                <span className="font-heading text-lg font-bold">Radar Canteiro</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                CRM SaaS para construção civil. Radar de obras, gestão de leads e WhatsApp integrado.
              </p>
            </div>
            <div>
              <h4 className="font-bold mb-3">Produto</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#recursos" className="hover:text-foreground transition-colors">Recursos</a></li>
                <li><a href="#planos" className="hover:text-foreground transition-colors">Planos</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Mapa de obras</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Integrações</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-3">Empresa</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Sobre</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Carreiras</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Contato</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Termos de Uso</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Política de Privacidade</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">LGPD</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t pt-8 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              © 2026 Radar Canteiro. Todos os direitos reservados.
            </p>
            <p className="text-sm text-muted-foreground">
              CNPJ 00.000.000/0001-00 · Triângulo Mineiro, MG
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
