'use client'

import { useEffect, useRef } from 'react'

export default function ApiDocsPage() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Carregar Scalar UI
    const loadScalar = async () => {
      if (!containerRef.current) return

      // Carregar CSS do Scalar
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@latest/style.min.css'
      document.head.appendChild(link)

      // Carregar e inicializar Scalar
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@latest'
      script.onload = () => {
        if (typeof window !== 'undefined' && (window as unknown as { Scalar: { apiReference: (options: unknown) => void } }).Scalar) {
          ;(window as unknown as { Scalar: { apiReference: (options: unknown) => void } }).Scalar.apiReference({
            container: containerRef.current,
            spec: {
              url: '/api/docs/openapi.json',
            },
            theme: 'purple',
            showSidebar: true,
          })
        }
      }
      document.body.appendChild(script)
    }

    loadScalar()
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-muted/50">
        <div className="container py-4">
          <h1 className="text-2xl font-bold">Radar CRM API</h1>
          <p className="text-muted-foreground mt-1">
            Documentacao da API RESTful para integracao com o Radar CRM
          </p>
        </div>
      </div>
      <div ref={containerRef} className="min-h-[calc(100vh-80px)]" />
    </div>
  )
}
