import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, FileText, Download } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Data Processing Agreement (DPA) - Radar Canteiro',
  description: 'Acordo de Tratamento de Dados Pessoais para clientes enterprise',
}

export default function DpaPage() {
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
          <h1 className="text-3xl font-bold text-foreground">Data Processing Agreement (DPA)</h1>
          <p className="mt-2 text-muted-foreground">
            Acordo de Tratamento de Dados Pessoais - Versão 1.0
          </p>
        </div>

        <div className="mb-6 p-4 bg-muted/50 rounded-lg border">
          <p className="text-sm text-muted-foreground">
            Este DPA está disponível para clientes do plano <strong>Obras</strong> e clientes enterprise.
            Para solicitar uma cópia assinada, entre em contato com{' '}
            <a href="mailto:legal@radarcanteiro.com.br" className="text-primary hover:underline">
              legal@radarcanteiro.com.br
            </a>
            .
          </p>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <section className="mb-8">
            <h2>DATA PROCESSING AGREEMENT (DPA)</h2>
            <p className="text-lg font-medium">Acordo de Tratamento de Dados Pessoais</p>
          </section>

          <section className="mb-8">
            <h2>ENTRE:</h2>
            <p>
              <strong>OPERADOR:</strong> [Razão Social], inscrito no CNPJ sob nº [XX.XXX.XXX/XXXX-XX],
              com sede em [Endereço] ("Operador")
            </p>
            <p className="mt-2">
              <strong>E</strong>
            </p>
            <p>
              <strong>CONTROLADOR:</strong> conforme cadastro na Plataforma Radar Canteiro ("Controlador")
            </p>
          </section>

          <section className="mb-8">
            <h2>1. OBJETO</h2>
            <ul>
              <li>
                <strong>1.1</strong> Este DPA regula o tratamento de dados pessoais realizado pelo
                Operador em nome do Controlador no âmbito da prestação de serviços da Plataforma Radar Canteiro.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>2. DEFINIÇÕES</h2>
            <ul>
              <li><strong>2.1</strong> "Dados Pessoais": informações relacionadas a pessoa natural identificada ou identificável.</li>
              <li><strong>2.2</strong> "Tratamento": qualquer operação realizada com dados pessoais.</li>
              <li><strong>2.3</strong> "Titular": pessoa natural a quem se referem os dados.</li>
              <li><strong>2.4</strong> "Controlador": quem determina as finalidades e meios do tratamento.</li>
              <li><strong>2.5</strong> "Operador": quem realiza o tratamento em nome do Controlador.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>3. OBRIGAÇÕES DO OPERADOR</h2>
            <ul>
              <li><strong>3.1</strong> Tratar dados pessoais apenas conforme instruções documentadas do Controlador.</li>
              <li><strong>3.2</strong> Garantir que pessoas autorizadas mantenham confidencialidade.</li>
              <li><strong>3.3</strong> Implementar medidas técnicas e organizacionais de segurança.</li>
              <li><strong>3.4</strong> Não compartilhar dados com terceiros sem autorização.</li>
              <li><strong>3.5</strong> Auxiliar o Controlador no atendimento a pedidos de titulares.</li>
              <li><strong>3.6</strong> Notificar o Controlador sobre incidentes de segurança em até 24h.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>4. OBRIGAÇÕES DO CONTROLADOR</h2>
            <ul>
              <li><strong>4.1</strong> Garantir base legal válida para cada tratamento.</li>
              <li><strong>4.2</strong> Fornecer instruções claras ao Operador.</li>
              <li><strong>4.3</strong> Obter consentimentos quando necessário.</li>
              <li><strong>4.4</strong> Responder a solicitações de titulares.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>5. SUBCONTRATADOS</h2>
            <ul>
              <li><strong>5.1</strong> O Operador pode contratar suboperadores para serviços auxiliares.</li>
              <li><strong>5.2</strong> Suboperadores estão sujeitos às mesmas obrigações deste DPA.</li>
              <li><strong>5.3</strong> O Operador é responsável perante o Controlador pelos atos de suboperadores.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>6. TRANSFERÊNCIA INTERNACIONAL</h2>
            <ul>
              <li><strong>6.1</strong> Dados podem ser transferidos para países com proteção adequada.</li>
              <li><strong>6.2</strong> Garantias apropriadas serão aplicadas conforme LGPD.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>7. AUDITORIA</h2>
            <ul>
              <li><strong>7.1</strong> O Controlador pode solicitar auditorias mediante agendamento prévio.</li>
              <li><strong>7.2</strong> O Operador manterá registros das atividades de tratamento.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>8. INCIDENTES DE SEGURANÇA</h2>
            <ul>
              <li><strong>8.1</strong> Notificação em até 24h após conhecimento do incidente.</li>
              <li><strong>8.2</strong> Descrição da natureza dos dados afetados.</li>
              <li><strong>8.3</strong> Medidas adotadas e recomendações aos titulares.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>9. EXCLUSÃO DE DADOS</h2>
            <ul>
              <li><strong>9.1</strong> Ao término do contrato, o Operador devolverá ou excluirá dados conforme instrução.</li>
              <li><strong>9.2</strong> Dados necessários para obrigações legais serão mantidos pelo período exigido.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>10. RESPONSABILIDADE</h2>
            <ul>
              <li><strong>10.1</strong> Cada parte é responsável por suas obrigações legais.</li>
              <li><strong>10.2</strong> Limite de responsabilidade não se aplica em caso de dolo ou culpa grave.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>11. VIGÊNCIA</h2>
            <ul>
              <li><strong>11.1</strong> Este DPA entra em vigor na data de aceite dos Termos de Uso.</li>
              <li><strong>11.2</strong> Permanece vigente durante a prestação dos serviços.</li>
            </ul>
          </section>
        </div>

        <div className="mt-12 border-t pt-8 flex flex-wrap gap-6">
          <Link
            href="/termos"
            className="text-sm text-primary hover:underline"
          >
            Termos de Uso
          </Link>
          <Link
            href="/privacidade"
            className="text-sm text-primary hover:underline"
          >
            Política de Privacidade
          </Link>
        </div>
      </div>
    </div>
  )
}
