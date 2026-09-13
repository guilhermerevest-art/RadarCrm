'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, BookOpen, MessageCircle, Mail, ExternalLink, ChevronRight } from 'lucide-react'

const ARTICLES = [
  {
    id: 'primeiros-passos',
    title: 'Primeiros Passos',
    description: 'Aprenda a usar o Radar Canteiro',
    icon: '🚀',
    articles: [
      { title: 'Como fazer login', slug: 'como-fazer-login' },
      { title: 'Conhecendo o dashboard', slug: 'conhecendo-dashboard' },
      { title: 'Configurar minha empresa', slug: 'configurar-empresa' },
    ],
  },
  {
    id: 'radar-obras',
    title: 'Radar de Obras',
    description: 'Tudo sobre monitoramento de obras',
    icon: '🏗️',
    articles: [
      { title: 'Como funciona o mapa de obras', slug: 'mapa-obras' },
      { title: 'Entendendo as fases da obra', slug: 'fases-obra' },
      { title: 'Como buscar obras por região', slug: 'buscar-obras' },
      { title: 'Filtrar obras por segmento', slug: 'filtrar-segmento' },
    ],
  },
  {
    id: 'crm',
    title: 'CRM e Leads',
    description: 'Gestão de relacionamento com clientes',
    icon: '👥',
    articles: [
      { title: 'Criar um lead', slug: 'criar-lead' },
      { title: 'Pipeline de vendas', slug: 'pipeline-vendas' },
      { title: 'Atividades e tarefas', slug: 'atividades-tarefas' },
    ],
  },
  {
    id: 'whatsapp',
    title: 'WhatsApp',
    description: 'Integração com WhatsApp',
    icon: '💬',
    articles: [
      { title: 'Conectar número de WhatsApp', slug: 'conectar-whatsapp' },
      { title: 'Enviar mensagens', slug: 'enviar-mensagens' },
      { title: 'Modelos de mensagem', slug: 'modelos-mensagem' },
    ],
  },
  {
    id: 'configuracoes',
    title: 'Configurações',
    description: 'Personalize sua conta',
    icon: '⚙️',
    articles: [
      { title: 'Alterar plano', slug: 'alterar-plano' },
      { title: 'Gerenciar usuários', slug: 'gerenciar-usuarios' },
      { title: 'Configurar notificações', slug: 'notificacoes' },
    ],
  },
]

const FAQ = [
  {
    q: 'Como funciona o trial gratuito?',
    a: 'Você tem 14 dias para testar todas as funcionalidades sem informar dados de pagamento. Após esse período, pode escolher um plano ou sua conta será pausada.',
  },
  {
    q: 'Posso mudar de plano depois?',
    a: 'Sim! Você pode fazer upgrade ou downgrade a qualquer momento. O upgrade é imediato; o downgrade é aplicado no próximo ciclo de cobrança.',
  },
  {
    q: 'Como cancelo minha assinatura?',
    a: 'Acesse Configurações > Assinatura > Cancelar. O cancelamento é imediato e você perde acesso no fim do período já pago.',
  },
  {
    q: 'Posso exportar meus dados?',
    a: 'Sim! Você pode exportar seus leads, deals e obras a qualquer momento em Configurações > Exportar Dados.',
  },
  {
    q: 'O WhatsApp é gratuito?',
    a: 'O uso do WhatsApp dentro da plataforma não tem custo adicional. Você paga apenas pelo plano escolhido.',
  },
]

export function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  const filteredArticles = ARTICLES.map(cat => ({
    ...cat,
    articles: cat.articles.filter(article =>
      article.title.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(cat => cat.articles.length > 0 || !searchQuery)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Central de Ajuda</h1>
        <p className="text-muted-foreground mb-6">
          Encontre respostas para suas dúvidas ou entre em contato com nosso suporte
        </p>

        {/* Busca */}
        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar artigos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12"
          />
        </div>
      </div>

      {/* Links Rápidos */}
      <div className="flex flex-wrap justify-center gap-4">
        <Button variant="outline" asChild>
          <a href="mailto:suporte@radarcanteiro.com.br">
            <Mail className="h-4 w-4 mr-2" />
            E-mail
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href="https://api.whatsapp.com/send?phone=5534999999999" target="_blank" rel="noopener">
            <MessageCircle className="h-4 w-4 mr-2" />
            WhatsApp
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href="https://docs.radarcanteiro.com.br" target="_blank" rel="noopener">
            <BookOpen className="h-4 w-4 mr-2" />
            Documentação
          </a>
        </Button>
      </div>

      {/* Artigos por Categoria */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredArticles.map((category) => (
          <Card
            key={category.id}
            className={`cursor-pointer transition-all ${
              expandedCategory === category.id ? 'ring-2 ring-primary' : ''
            }`}
            onClick={() => setExpandedCategory(
              expandedCategory === category.id ? null : category.id
            )}
          >
            <CardHeader className="flex flex-row items-center space-y-0 gap-3">
              <span className="text-2xl">{category.icon}</span>
              <div>
                <CardTitle className="text-lg">{category.title}</CardTitle>
                <CardDescription>{category.description}</CardDescription>
              </div>
            </CardHeader>

            {expandedCategory === category.id && (
              <CardContent>
                <div className="space-y-2">
                  {category.articles.map((article) => (
                    <a
                      key={article.slug}
                      href={`/help/${article.slug}`}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors"
                    >
                      <span className="text-sm">{article.title}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>Perguntas Frequentes</CardTitle>
          <CardDescription>
            Respostas para as dúvidas mais comuns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {FAQ.map((item, index) => (
              <div
                key={index}
                className="border rounded-lg"
              >
                <button
                  onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <span className="font-medium">{item.q}</span>
                  <ChevronRight
                    className={`h-4 w-4 transition-transform ${
                      expandedFaq === index ? 'rotate-90' : ''
                    }`}
                  />
                </button>
                {expandedFaq === index && (
                  <div className="px-4 pb-4 pt-0 text-sm text-muted-foreground">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Suporte adicional */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="flex flex-col md:flex-row items-center justify-between gap-4 py-6">
          <div>
            <h3 className="font-semibold">Precisa de mais ajuda?</h3>
            <p className="text-sm text-muted-foreground">
              Nossa equipe está pronta para ajudar você
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <a href="mailto:suporte@radarcanteiro.com.br">
                <Mail className="h-4 w-4 mr-2" />
                E-mail
              </a>
            </Button>
            <Button asChild>
              <a href="https://api.whatsapp.com/send?phone=5534999999999" target="_blank" rel="noopener">
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
