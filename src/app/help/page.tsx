import { HelpCenter } from '@/components/help/HelpCenter'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Central de Ajuda - Radar Canteiro',
  description: 'Encontre respostas para suas dúvidas sobre o Radar Canteiro',
}

export default function HelpPage() {
  return (
    <div className="container py-8">
      <HelpCenter />
    </div>
  )
}
