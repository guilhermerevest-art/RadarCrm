'use client'

import { useState } from 'react'

const PERGUNTAS = [
  {
    p: 'Como vocês coletam os dados das obras?',
    r: 'Cruzamos dados públicos do CNO (Cadastro Nacional de Obras), Receita Federal e prefeituras. Atualizamos semanalmente. Você não precisa informar nada — a obra aparece sozinha no radar.',
  },
  {
    p: 'Funciona para qualquer cidade do Brasil?',
    r: 'Sim. Temos cobertura nacional. Algumas capitais e regiões metropolitanas têm dados mais detalhados (alvarás, licenças) — identificamos isso no mapa.',
  },
  {
    p: 'Como funciona o trial?',
    r: '14 dias grátis, sem cartão. Acesso completo ao Radar, CRM e WhatsApp. Ao final, você escolhe o plano ou cancela — sem cobrança automática.',
  },
  {
    p: 'Posso cancelar a qualquer momento?',
    r: 'Sim. Cancelamento online pelo painel, sem multa. Reembolso proporcional nos primeiros 30 dias.',
  },
  {
    p: 'Os dados são LGPD?',
    r: 'Sim. Usamos apenas dados públicos (CNO, Receita, prefeituras). Não comercializamos dados pessoais. DPA disponível sob solicitação.',
  },
  {
    p: 'Vocês têm API?',
    r: 'Sim, no plano Corporate. Documentação OpenAPI, autenticação por API key, rate limit de 1000 req/min. Webhooks disponíveis para alertas em tempo real.',
  },
]

export function FAQ() {
  const [aberto, setAberto] = useState<number | null>(null)
  return (
    <section className="bg-muted/30 px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Perguntas frequentes
          </h2>
        </div>
        <div className="space-y-3">
          {PERGUNTAS.map((item, i) => (
            <div
              key={i}
              className="bg-card rounded-lg border border-border/50 overflow-hidden"
            >
              <button
                onClick={() => setAberto(aberto === i ? null : i)}
                className="w-full px-6 py-4 text-left font-medium flex items-center justify-between hover:bg-muted/40 transition-colors"
              >
                <span>{item.p}</span>
                <span className="text-muted-foreground text-xl ml-4">
                  {aberto === i ? '−' : '+'}
                </span>
              </button>
              {aberto === i && (
                <div className="px-6 pb-4 text-muted-foreground leading-relaxed">
                  {item.r}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
