'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { rowsToCSV } from '@/lib/csv'
import { useToast } from '@/hooks/use-toast'

interface Lead {
  id: string
  nome: string
  empresa?: string | null
  email?: string | null
  telefone?: string | null
  origem?: string | null
  status?: string | null
  score_engajamento?: number | null
  created_at: string
}

export function ExportCSVButton({ leads }: { leads: Lead[] }) {
  const { toast } = useToast()

  function exportar() {
    if (leads.length === 0) {
      toast({
        title: 'Nada para exportar',
        description: 'Lista vazia.',
        variant: 'destructive',
      })
      return
    }
    const headers = [
      'Nome',
      'Empresa',
      'Email',
      'Telefone',
      'Origem',
      'Status',
      'Score',
      'Criado em',
    ]
    const rows = leads.map((l) => [
      l.nome,
      l.empresa ?? '',
      l.email ?? '',
      l.telefone ?? '',
      l.origem ?? '',
      l.status ?? '',
      l.score_engajamento ?? '',
      new Date(l.created_at).toLocaleDateString('pt-BR'),
    ])
    const csv = rowsToCSV(rows, headers)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: `${leads.length} leads exportados` })
  }

  return (
    <Button variant="outline" size="sm" onClick={exportar}>
      <Download className="h-4 w-4 mr-1" />
      Exportar CSV
    </Button>
  )
}
