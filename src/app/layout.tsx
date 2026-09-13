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
        <link rel="manifest" href="/manifest.json" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="anonymous" />
        <meta name="theme-color" content="#D9541F" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Radar Canteiro" />
      </head>
      <body className="min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
