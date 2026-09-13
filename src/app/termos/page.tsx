import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Termos de Uso - Radar Canteiro',
  description: 'Termos de Uso da plataforma Radar Canteiro',
}

export default function TermosPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
                <circle cx="12" cy="12" r="3" fill="white"/>
              </svg>
            </div>
            <span className="font-heading text-xl font-bold text-foreground">Radar Canteiro</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Termos de Uso</h1>
          <p className="mt-2 text-muted-foreground">Versão 1.0 - Atualizado em 01 de Janeiro de 2026</p>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <section className="mb-8">
            <h2>1. OBJETO</h2>
            <p>
              Estes Termos de Uso regulam a utilização da plataforma Radar Canteiro ("Plataforma"),
              desenvolvida e operada pela empresa titular ("Fornecedor"), voltada à identificação
              de obras em fase inicial, gestão de relacionamento com clientes (CRM) e comunicação via WhatsApp.
            </p>
          </section>

          <section className="mb-8">
            <h2>2. ACEITE</h2>
            <p>
              Ao criar uma conta e utilizar a Plataforma, o usuário ("Usuário") declara que leu,
              compreendeu e concorda com estes Termos de Uso.
            </p>
          </section>

          <section className="mb-8">
            <h2>3. DESCRIÇÃO DOS SERVIÇOS</h2>
            <ul>
              <li><strong>3.1 Radar de Obras:</strong> Identificação automática de obras em fase inicial a partir de fontes públicas.</li>
              <li><strong>3.2 Radar de Empresas:</strong> Base de dados de CNPJ com filtros setoriais.</li>
              <li><strong>3.3 CRM:</strong> Gestão de leads, deals, atividades, agendamentos e fluxos de WhatsApp.</li>
              <li><strong>3.4 Canal WhatsApp:</strong> Mensagens transacionais, marketing e atendimento.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>4. PLANOS E PREÇOS</h2>
            <ul>
              <li><strong>Individual:</strong> R$ 197/mês - 1 usuário</li>
              <li><strong>Equipe:</strong> R$ 397/mês - até 5 usuários</li>
              <li><strong>Regional:</strong> R$ 797/mês - até 20 usuários</li>
              <li><strong>Obras:</strong> Sob consulta - ilimitado</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>5. PERÍODO DE TESTE (TRIAL)</h2>
            <ul>
              <li><strong>5.1</strong> O Usuário tem direito a 14 dias de uso gratuito sem necessidade de informar dados de pagamento.</li>
              <li><strong>5.2</strong> Após o período de teste, a cobrança será ativada automaticamente caso o Usuário não cancele.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>6. CANCELAMENTO E REEMBOLSO</h2>
            <ul>
              <li><strong>6.1</strong> O Usuário pode cancelar a qualquer momento pela interface da Plataforma.</li>
              <li><strong>6.2</strong> Reembolso integral em até 7 dias após o pagamento para novos assinantes.</li>
              <li><strong>6.3</strong> Após 7 dias, não há reembolso para o período em curso.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>7. PROPRIEDADE INTELECTUAL</h2>
            <ul>
              <li><strong>7.1</strong> Todo conteúdo da Plataforma é propriedade do Fornecedor.</li>
              <li><strong>7.2</strong> O Usuário mantém propriedade sobre os dados inseridos ("Dados do Cliente").</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>8. RESPONSABILIDADES</h2>
            <ul>
              <li><strong>8.1</strong> O Fornecedor se compromete a manter a disponibilidade da Plataforma conforme SLA acordado.</li>
              <li><strong>8.2</strong> O Usuário é responsável pela veracidade das informações inseridas.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>9. DADOS E PRIVACIDADE</h2>
            <ul>
              <li><strong>9.1</strong> O tratamento de dados pessoais segue a Política de Privacidade.</li>
              <li><strong>9.2</strong> O Fornecedor atua como Operador de dados conforme LGPD.</li>
              <li><strong>9.3</strong> Dados de contatos de terceiros (leads, clientes) são de responsabilidade do Usuário.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>10. LIMITAÇÃO DE RESPONSABILIDADE</h2>
            <ul>
              <li><strong>10.1</strong> O Fornecedor não se responsabiliza por decisões comerciais tomadas com base nos dados fornecidos.</li>
              <li><strong>10.2</strong> Dados de obras são derivados de fontes públicas e podem conter imprecisões.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>11. DISPOSIÇÕES GERAIS</h2>
            <ul>
              <li><strong>11.1</strong> Lei aplicável: legislação brasileira.</li>
              <li><strong>11.2</strong> Foro: comarca de Uberlândia, MG.</li>
              <li><strong>11.3</strong> O Fornecedor pode alterar estes termos mediante aviso prévio de 30 dias.</li>
            </ul>
          </section>
        </div>

        <div className="mt-12 border-t pt-8">
          <Link
            href="/privacidade"
            className="text-sm text-primary hover:underline"
          >
            Ver também nossa Política de Privacidade
          </Link>
        </div>
      </div>
    </div>
  )
}
