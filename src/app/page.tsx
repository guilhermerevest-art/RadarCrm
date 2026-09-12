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
  Menu,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const CIDADES = [
  'Uberlândia', 'Uberaba', 'Araguari', 'Patos de Minas',
  'Ituiutaba', 'Patrocínio', 'Frutal', 'Ribeirão Preto',
]

const RECURSOS = [
  {
    icon: MapPin,
    titulo: 'Radar de Obras',
    desc: 'Detecção automática de obras novas a partir de alvarás, CNO e fontes públicas. Alerta no seu WhatsApp no mesmo dia.',
  },
  {
    icon: TrendingUp,
    titulo: 'CRM Completo',
    desc: 'Pipeline kanban, gestão de leads, deals e atividades. Cada vendedor vê só o que é dele.',
  },
  {
    icon: Phone,
    titulo: 'WhatsApp Integrado',
    desc: 'Conversas atreladas ao lead. Janela de 24h respeitada. Opt-in LGPD-compliant.',
  },
  {
    icon: Users,
    titulo: 'Gestão de Equipe',
    desc: 'Papeis, alcadas de desconto, comissões por venda. Gerente tem visibilidade completa.',
  },
  {
    icon: Building2,
    titulo: 'Propostas Profissionais',
    desc: 'Gere PDFs com a marca do cliente. Portal para o lead aceitar online.',
  },
  {
    icon: Zap,
    titulo: 'Configuração em Minutos',
    desc: 'Signup com Google ou e-mail. Mapa com obras reais em 5 minutos.',
  },
]

const DEPOIMENTOS = [
  {
    nome: 'Ricardo Souza',
    cargo: 'Diretor Comercial — Concremax',
    texto:
      'Perdíamos 40% das obras porque só ficávamos sabendo depois que já tinham começado. Agora a gente chega primeiro.',
    cidades: 'Uberlândia + Uberaba',
  },
  {
    nome: 'Fernanda Lima',
    cargo: 'Gerente de Vendas — Locatres',
    texto:
      'O CRM era planilha e WhatsApp. O Radar Canteiro organizou tudo. Minha equipe fechou 30% mais em 3 meses.',
    cidades: 'Patos de Minas',
  },
  {
    nome: 'Marcos Oliveira',
    cargo: 'Vendedor — CompreI',
    texto:
      'Eu prospectava na munheca. Hoje entro no mapa, seleciono 8 obras do dia e monto minha rota. Jogo limpo.',
    cidades: 'Ribeirão Preto',
  },
]

const PLANOS = [
  {
    nome: 'Individual',
    preco: 197,
    usuarios: '1 usuário',
    obras: '500 obras/mês',
    leads: '200 leads',
    recursos: [
      'Radar de Obras',
      'CRM básico',
      'WhatsApp integrado',
      '1 cidade',
      'E-mail de suporte',
    ],
    destaque: false,
  },
  {
    nome: 'Equipe',
    preco: 397,
    usuarios: '5 usuários',
    obras: '2.500 obras/mês',
    leads: '1.000 leads',
    recursos: [
      'Tudo do Individual',
      'Pipeline kanban',
      'Gestão de equipe',
      'Comissões automáticas',
      'Propostas em PDF',
      'Alertas WhatsApp',
    ],
    destaque: true,
  },
  {
    nome: 'Regional',
    preco: 797,
    usuarios: '20 usuários',
    obras: '10.000 obras/mês',
    leads: '5.000 leads',
    recursos: [
      'Tudo do Equipe',
      'Multi-cidade',
      'API de integração',
      'Relatórios avançados',
      'Prioridade no suporte',
    ],
    destaque: false,
  },
]

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary ${className ?? ''}`}>
      {children}
    </span>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="3" fill="white"/>
              </svg>
            </div>
            <span className="font-heading text-xl font-bold tracking-tight text-dark">
              Radar Canteiro
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#recursos" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Recursos
            </a>
            <a href="#planos" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Planos
            </a>
            <a href="#depoimentos" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Depoimentos
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground transition-colors sm:block">
              Entrar
            </Link>
            <Link href="/signup">
              <Button size="sm">
                Começar grátis <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 pt-20 pb-24 sm:px-6 lg:px-8">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute -left-1/4 top-0 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -right-1/4 bottom-0 h-96 w-96 rounded-full bg-secondary/5 blur-3xl" />
        </div>

        <div className="mx-auto max-w-5xl text-center">
          <Badge>Cidades: Uberlândia · Uberaba · Araguari · e mais</Badge>
          <h1 className="mt-6 font-heading text-5xl font-bold tracking-tight text-dark sm:text-6xl lg:text-7xl">
            Encontre a obra antes
            <br />
            <span className="text-primary">de virar concreto.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground sm:text-xl max-w-2xl mx-auto leading-relaxed">
            Radar Canteiro combina radar de obras públicas, CRM de vendas e WhatsApp
            integrado. Para concreteiras, locadoras e fornecedores da construção civil.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/signup">
              <Button size="lg" className="text-base px-8">
                Começar grátis — 14 dias
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="text-base">
                Já tenho conta
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Sem cartão de crédito. Cancele quando quiser.
          </p>
        </div>

        {/* Mapa simulado */}
        <div className="mx-auto mt-16 max-w-5xl">
          <div className="relative rounded-xl border bg-paper shadow-2xl overflow-hidden">
            {/* Header do mapa */}
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
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
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">🔴 24 obras ativas</span>
              </div>
            </div>
            {/* Mapa illustration */}
            <div className="relative h-72 sm:h-96 bg-[#EEF1F2]">
              {/* Grid lines */}
              <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#0F1B24" strokeWidth="0.5"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
              {/* Mapa roads */}
              <svg className="absolute inset-0 w-full h-full opacity-40" xmlns="http://www.w3.org/2000/svg">
                <line x1="0" y1="120" x2="100%" y2="120" stroke="#2E6F8E" strokeWidth="4"/>
                <line x1="200" y1="0" x2="200" y2="100%" stroke="#2E6F8E" strokeWidth="4"/>
                <line x1="400" y1="0" x2="400" y2="100%" stroke="#2E6F8E" strokeWidth="3"/>
                <line x1="600" y1="0" x2="600" y2="100%" stroke="#2E6F8E" strokeWidth="3"/>
                <line x1="0" y1="200" x2="100%" y2="200" stroke="#2E6F8E" strokeWidth="3"/>
                <line x1="0" y1="300" x2="100%" y2="300" stroke="#2E6F8E" strokeWidth="2"/>
                <line x1="100" y1="0" x2="100" y2="100%" stroke="#2E6F8E" strokeWidth="2"/>
                <line x1="500" y1="0" x2="500" y2="100%" stroke="#2E6F8E" strokeWidth="2"/>
              </svg>
              {/* Pins de obras */}
              {[
                { x: 22, y: 30, fase: 'alvara', score: 95 },
                { x: 45, y: 55, fase: 'fundacao', score: 78 },
                { x: 65, y: 25, fase: 'alvara', score: 88 },
                { x: 35, y: 70, fase: 'estrutura', score: 65 },
                { x: 78, y: 60, fase: 'fundacao', score: 82 },
                { x: 55, y: 80, fase: 'alvara', score: 91 },
                { x: 15, y: 55, fase: 'acabamento', score: 45 },
                { x: 85, y: 35, fase: 'alvara', score: 87 },
              ].map((obra, i) => (
                <div
                  key={i}
                  className="absolute group cursor-pointer"
                  style={{ left: `${obra.x}%`, top: `${obra.y}%`, transform: 'translate(-50%, -100%)' }}
                >
                  {/* Pin */}
                  <div className={`relative flex flex-col items-center`}>
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full shadow-lg transition-transform group-hover:scale-110"
                      style={{ backgroundColor: obra.score > 80 ? '#D9541F' : obra.score > 60 ? '#D97706' : '#2E6F8E' }}
                    >
                      <span className="text-white text-xs font-bold">{obra.score}</span>
                    </div>
                    <div className="h-3 w-1.5 rotate-45 translate-y-1 opacity-80" style={{ backgroundColor: obra.score > 80 ? '#D9541F' : obra.score > 60 ? '#D97706' : '#2E6F8E' }} />
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                      <div className="bg-dark text-white text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                        <p className="font-semibold capitalize">{obra.fase}</p>
                        <p className="text-white/70">Score: {obra.score}/100</p>
                        <p className="text-white/70">R. Amazonas, 1245</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {/* Legenda */}
              <div className="absolute bottom-3 left-3 bg-paper/90 rounded-lg px-3 py-2 text-xs space-y-1 border">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-primary" />
                  <span>Alto potencial (&gt;80)</span>
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
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Mapa interativo com score de oportunidade por segmento — versão simplificada para demonstração
          </p>
        </div>
      </section>

      {/* Logos sociais */}
      <section className="border-y bg-paper py-8">
        <div className="mx-auto max-w-5xl px-4">
          <p className="text-center text-sm text-muted-foreground mb-6">
            Confiado por concreteiras e locadoras do Triângulo Mineiro
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 opacity-50">
            {['Concremax', 'Locatres', 'CompreI', 'Construtora Delta', 'Grupo Alfa'].map((nome) => (
              <span key={nome} className="font-heading text-lg font-semibold text-muted-foreground">
                {nome}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <Badge>O produto</Badge>
            <h2 className="mt-4 font-heading text-4xl font-bold text-dark sm:text-5xl">
              Tudo que você precisa
              <br />para fechar mais vendas.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Uma plataforma completa para prospectar obras novas, gerenciar clientes e
              acompanhar o time comercial — semplanilha, sem WhatsApp pessoal.
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {RECURSOS.map((recurso) => (
              <Card key={recurso.titulo} className="border-border/50 hover:border-primary/30 transition-colors">
                <CardContent className="pt-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <recurso.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-heading text-xl font-semibold text-dark mb-2">
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
      <section className="bg-dark text-paper">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <Badge className="bg-paper/10 text-paper border-0">Geografia do MVP</Badge>
              <h2 className="mt-4 font-heading text-4xl font-bold text-paper sm:text-5xl">
                Começamos pelo
                <br />Triângulo Mineiro.
              </h2>
              <p className="mt-4 text-lg text-white/70 leading-relaxed">
                A primeira versão cobre 7 cidades de MG com dados de alvarás
                de construção e CNO. Expansão para SP começa no mês 9.
              </p>
              <ul className="mt-8 space-y-3">
                {CIDADES.map((cidade) => (
                  <li key={cidade} className="flex items-center gap-3 text-white/80">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                    <span>{cidade}</span>
                  </li>
                ))}
              </ul>
            </div>
            {/* Mapa ilustrativo de MG */}
            <div className="flex items-center justify-center">
              <div className="relative w-full max-w-sm">
                <svg viewBox="0 0 400 300" className="w-full opacity-60">
                  {/* Minas Gerais outline simplificado */}
                  <path
                    d="M120 50 L280 30 L320 80 L340 150 L310 200 L260 240 L200 260 L140 240 L80 200 L60 140 L80 90 Z"
                    fill="none"
                    stroke="#EEF1F2"
                    strokeWidth="2"
                    opacity="0.3"
                  />
                  {/* Cidade pins */}
                  <circle cx="200" cy="120" r="8" fill="#D9541F" opacity="0.9"/>
                  <text x="215" y="115" fill="#EEF1F2" fontSize="10" fontFamily="Barlow Condensed" fontWeight="600">Uberlândia</text>
                  <circle cx="160" cy="145" r="6" fill="#D9541F" opacity="0.7"/>
                  <text x="170" y="143" fill="#EEF1F2" fontSize="9" fontFamily="Barlow Condensed">Uberaba</text>
                  <circle cx="185" cy="90" r="4" fill="#2E6F8E"/>
                  <text x="195" y="88" fill="#EEF1F2" fontSize="8" fontFamily="Barlow Condensed">Araguari</text>
                  <circle cx="230" cy="170" r="4" fill="#2E6F8E"/>
                  <text x="240" y="168" fill="#EEF1F2" fontSize="8" fontFamily="Barlow Condensed">Patos de Minas</text>
                  <circle cx="130" cy="185" r="4" fill="#2E6F8E"/>
                  <text x="140" y="183" fill="#EEF1F2" fontSize="8" fontFamily="Barlow Condensed">Ituiutaba</text>
                  <circle cx="255" cy="120" r="4" fill="#2E6F8E"/>
                  <text x="265" y="118" fill="#EEF1F2" fontSize="8" fontFamily="Barlow Condensed">Patrocínio</text>
                  <circle cx="260" cy="205" r="4" fill="#2E6F8E"/>
                  <text x="270" y="203" fill="#EEF1F2" fontSize="8" fontFamily="Barlow Condensed">Frutal</text>
                </svg>
                <div className="absolute bottom-2 right-2 flex items-center gap-2 text-xs text-white/50">
                  <div className="h-2 w-2 rounded-full bg-primary"/>
                  <span>Lançamento Mês 1-6</span>
                  <div className="h-2 w-2 rounded-full bg-secondary ml-2"/>
                  <span>Mês 9</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <Badge>Planos</Badge>
            <h2 className="mt-4 font-heading text-4xl font-bold text-dark sm:text-5xl">
              Simples e transparente.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
              Comece grátis por 14 dias. Escolha o plano que faz sentido pro tamanho da sua equipe.
            </p>
          </div>
          <div className="grid gap-8 lg:grid-cols-3">
            {PLANOS.map((plano) => (
              <Card
                key={plano.nome}
                className={`relative overflow-hidden ${
                  plano.destaque
                    ? 'border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/20'
                    : 'border-border/50'
                }`}
              >
                {plano.destaque && (
                  <div className="bg-primary px-4 py-2 text-center">
                    <span className="text-sm font-semibold text-white">Mais popular</span>
                  </div>
                )}
                <CardContent className={`p-6 ${plano.destaque ? 'pt-6' : ''}`}>
                  <h3 className="font-heading text-2xl font-bold text-dark">{plano.nome}</h3>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="font-heading text-5xl font-bold text-dark">
                      R$ {plano.preco}
                    </span>
                    <span className="text-muted-foreground">/mês</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {plano.usuarios} · {plano.obras} · {plano.leads}
                  </p>
                  <ul className="mt-6 space-y-3">
                    {plano.recursos.map((recurso) => (
                      <li key={recurso} className="flex items-start gap-2.5 text-sm">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                        <span className="text-foreground">{recurso}</span>
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
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Trial 14 dias sem cartão. Fatura via Stripe. Cancele quando quiser.
          </p>
        </div>
      </section>

      {/* Depoimentos */}
      <section id="depoimentos" className="bg-muted/30 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <Badge>Depoimentos</Badge>
            <h2 className="mt-4 font-heading text-4xl font-bold text-dark sm:text-5xl">
              Quem usa, recomenda.
            </h2>
          </div>
          <div className="grid gap-8 lg:grid-cols-3">
            {DEPOIMENTOS.map((depoimento) => (
              <Card key={depoimento.nome} className="border-border/50">
                <CardContent className="p-6">
                  <div className="flex gap-1 mb-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                    ))}
                  </div>
                  <p className="text-foreground leading-relaxed italic">
                    &ldquo;{depoimento.texto}&rdquo;
                  </p>
                  <div className="mt-4 pt-4 border-t">
                    <p className="font-semibold text-dark">{depoimento.nome}</p>
                    <p className="text-sm text-muted-foreground">{depoimento.cargo}</p>
                    <p className="mt-1 text-xs text-primary font-medium">{depoimento.cidades}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="bg-dark px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-heading text-4xl font-bold text-paper sm:text-5xl">
            Sua próxima venda está
            <br />
            <span className="text-primary">numa obra que você ainda não viu.</span>
          </h2>
          <p className="mt-6 text-lg text-white/70">
            14 dias grátis. Sem compromisso. Leva 5 minutos para configurar.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/signup">
              <Button size="lg" className="text-base px-10">
                Começar grátis agora
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-paper px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
                    <circle cx="12" cy="12" r="3" fill="white"/>
                  </svg>
                </div>
                <span className="font-heading text-lg font-bold text-dark">Radar Canteiro</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                CRM SaaS para construção civil. Radar de obras, gestão de leads e WhatsApp integrado.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-dark mb-3">Produto</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#recursos" className="hover:text-foreground transition-colors">Recursos</a></li>
                <li><a href="#planos" className="hover:text-foreground transition-colors">Planos</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Mapa de obras</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Integrações</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-dark mb-3">Empresa</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Sobre</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Carreiras</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Contato</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-dark mb-3">Legal</h4>
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
