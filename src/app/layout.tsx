import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Radar Canteiro — CRM para construção civil',
    template: '%s | Radar Canteiro',
  },
  description:
    'Identifique obras novas antes da concorrência. CRM completo com radar de obras, gestão de leads e WhatsApp integrado para concreteiras, locadoras e fornecedores.',
  keywords: ['CRM', 'radar de obras', 'construção civil', 'prospecção', 'vendas'],
  authors: [{ name: 'Radar Canteiro' }],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: process.env.NEXT_PUBLIC_APP_URL ?? 'https://radarcanteiro.com.br',
    siteName: 'Radar Canteiro',
    title: 'Radar Canteiro — CRM para construção civil',
    description: 'Identifique obras novas antes da concorrência.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Radar Canteiro — CRM para construção civil',
    description: 'Identifique obras novas antes da concorrência.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
