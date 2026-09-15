'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react'

export default function RadarError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log para Vercel Logs (funciona em produção)
    console.error('[RadarPage Error]', error)
  }, [error])

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Erro ao carregar o Radar
          </h1>
          <p className="text-sm text-gray-600 mb-4 max-w-md">
            Ocorreu um erro ao carregar a lista de obras. Tente recarregar a página.
          </p>

          {error.message && (
            <details className="text-xs text-left w-full max-w-2xl mb-4 bg-white border rounded p-3">
              <summary className="cursor-pointer font-medium text-gray-700">
                Detalhes técnicos
              </summary>
              <pre className="mt-2 text-[11px] text-gray-600 overflow-auto whitespace-pre-wrap">
{`Mensagem: ${error.message}
${error.digest ? `Digest: ${error.digest}` : ''}
${error.stack ? `\n${error.stack.split('\n').slice(0, 8).join('\n')}` : ''}`}
              </pre>
            </details>
          )}

          <div className="flex gap-2">
            <Button onClick={reset} variant="default">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
            <Link href="/dashboard">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar ao Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
