import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Política de Privacidade - Radar Canteiro',
  description: 'Política de Privacidade e tratamento de dados pessoais',
}

export default function PrivacidadePage() {
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
          <h1 className="text-3xl font-bold text-foreground">Política de Privacidade</h1>
          <p className="mt-2 text-muted-foreground">Versão 1.0 - Atualizado em 01 de Janeiro de 2026</p>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <section className="mb-8">
            <h2>1. INTRODUÇÃO</h2>
            <p>
              A presente Política de Privacidade descreve como a empresa titular ("Empresa", "nós", "nosso")
              coleta, utiliza, armazena e protege os dados pessoais dos usuários ("você", "seu") da
              plataforma Radar Canteiro ("Plataforma").
            </p>
          </section>

          <section className="mb-8">
            <h2>2. DADOS COLETADOS</h2>
            <ul>
              <li><strong>2.1 Dados de cadastro:</strong> Nome, e-mail, telefone, empresa, CNPJ.</li>
              <li><strong>2.2 Dados de uso:</strong> Comportamento na plataforma, interações, preferências.</li>
              <li><strong>2.3 Dados de navegação:</strong> IP, dispositivo, navegador, cookies.</li>
              <li><strong>2.4 Dados de terceiros:</strong> Informações de leads e clientes inseridos pelo Usuário.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>3. FINALIDADE DO TRATAMENTO</h2>
            <ul>
              <li><strong>3.1</strong> Prestação dos serviços contratados.</li>
              <li><strong>3.2</strong> Melhoria da Plataforma e experiência do usuário.</li>
              <li><strong>3.3</strong> Comunicação sobre atualizações e suporte.</li>
              <li><strong>3.4</strong> Cumprimento de obrigações legais.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>4. COMPARTILHAMENTO DE DADOS</h2>
            <ul>
              <li><strong>4.1</strong> Não vendemos seus dados pessoais.</li>
              <li><strong>4.2</strong> Compartilhamos dados apenas com fornecedores essenciais (hospedagem, pagamentos).</li>
              <li><strong>4.3</strong> Dados podem ser compartilhados para cumprimento de lei.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>5. ARMAZENAMENTO E SEGURANÇA</h2>
            <ul>
              <li><strong>5.1</strong> Dados são armazenados em servidores seguros.</li>
              <li><strong>5.2</strong> Utilizamos criptografia e medidas de segurança técnicas.</li>
              <li><strong>5.3</strong> Período de retenção conforme necessidade operacional ou legal.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>6. SEUS DIREITOS (LGPD)</h2>
            <p>Você tem direito a:</p>
            <ul>
              <li><strong>6.1</strong> Confirmar a existência de tratamento.</li>
              <li><strong>6.2</strong> Acessar seus dados pessoais.</li>
              <li><strong>6.3</strong> Corrigir dados incompletos ou desatualizados.</li>
              <li><strong>6.4</strong> Anonimizar, bloquear ou eliminar dados desnecessários.</li>
              <li><strong>6.5</strong> Solicitar portabilidade dos dados.</li>
              <li><strong>6.6</strong> Solicitar exclusão de dados tratados com consentimento.</li>
              <li><strong>6.7</strong> Revogar consentimento a qualquer momento.</li>
              <li><strong>6.8</strong> Opor-se a tratamento não autorizado.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>7. ENCARREGADO (DPO)</h2>
            <p>
              Para questões sobre privacidade, entre em contato:<br/>
              <strong>E-mail:</strong> privacidade@radarcanteiro.com.br
            </p>
          </section>

          <section className="mb-8">
            <h2>8. COOKIES</h2>
            <ul>
              <li><strong>8.1</strong> Utilizamos cookies essenciais para funcionamento.</li>
              <li><strong>8.2</strong> Cookies analíticos para melhorar a experiência.</li>
              <li><strong>8.3</strong> Você pode configurar seu navegador para bloquear cookies.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2>9. ALTERAÇÕES</h2>
            <p>Esta política pode ser atualizada. Notificaremos sobre mudanças significativas.</p>
          </section>

          <section className="mb-8">
            <h2>10. CONTATO</h2>
            <p>
              <strong>E-mail:</strong> privacidade@radarcanteiro.com.br<br/>
              <strong>Endereço:</strong> Uberlândia, MG - Brasil
            </p>
          </section>
        </div>

        <div className="mt-12 border-t pt-8 flex gap-6">
          <Link
            href="/termos"
            className="text-sm text-primary hover:underline"
          >
            Termos de Uso
          </Link>
          <Link
            href="/dpa"
            className="text-sm text-primary hover:underline"
          >
            Data Processing Agreement (DPA)
          </Link>
        </div>
      </div>
    </div>
  )
}
