'use client'

import { Building, Phone, Mail, MapPin, ExternalLink, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { RadarObraEmpresa, FonteEnriquecimento } from '@/lib/supabase/types'

interface CardEmpresaProps {
  empresa: RadarObraEmpresa | null
  loading?: boolean
}

function formatarTelefone(tel: string): string {
  const d = tel.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return tel
}

function formatarCEP(cep: string): string {
  const d = cep.replace(/\D/g, '')
  if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`
  return cep
}

function formatarCNPJ(cnpj: string): string {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14) return cnpj
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

const SITUACAO_COLORS: Record<string, string> = {
  'Ativa': 'bg-green-100 text-green-700',
  'Ativa com Pendência': 'bg-yellow-100 text-yellow-700',
  'Inativa': 'bg-red-100 text-red-700',
  'Baixada': 'bg-red-100 text-red-700',
  'Suspensa': 'bg-yellow-100 text-yellow-700',
  'Nula': 'bg-red-100 text-red-700',
}

export function CardEmpresa({ empresa, loading }: CardEmpresaProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-5 bg-muted rounded w-1/3" />
            <div className="h-4 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!empresa) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground text-sm">
            <Building className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>Empresa não enriquecida</p>
            <p className="text-xs mt-1">Será consultada via BrasilAPI em breve</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (empresa.fonte_enriquecimento === 'nao_encontrado') {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building className="h-5 w-5" />
            Empresa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div>
              <p>CNPJ {formatarCNPJ(empresa.cnpj)} não encontrado na Receita Federal.</p>
              <p className="text-xs mt-1">Pode ser CNPJ inválido, baixado ou inativo há muito tempo.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const sitClass = empresa.situacao_cadastral
    ? SITUACAO_COLORS[empresa.situacao_cadastral] || 'bg-gray-100 text-gray-700'
    : 'bg-gray-100 text-gray-500'

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building className="h-5 w-5" />
          Empresa
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            {empresa.fonte_enriquecimento === 'brasilapi' ? 'BrasilAPI' : 'publica.cnpj.ws'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <h3 className="font-semibold leading-tight">{empresa.razao_social || '—'}</h3>
          {empresa.nome_fantasia && (
            <p className="text-sm text-muted-foreground">{empresa.nome_fantasia}</p>
          )}
          <p className="text-xs font-mono text-muted-foreground mt-1">
            {formatarCNPJ(empresa.cnpj)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {empresa.situacao_cadastral && (
            <Badge className={sitClass}>{empresa.situacao_cadastral}</Badge>
          )}
          {empresa.porte && (
            <Badge variant="outline">{empresa.porte}</Badge>
          )}
          {empresa.data_abertura && (
            <Badge variant="outline">
              Desde {new Date(empresa.data_abertura).getFullYear()}
            </Badge>
          )}
        </div>

        {empresa.cnae_principal && (
          <div className="text-sm">
            <span className="text-muted-foreground">CNAE: </span>
            <span className="font-mono text-xs">{empresa.cnae_principal}</span>
          </div>
        )}

        <div className="space-y-2 text-sm">
          {empresa.telefone && (
            <a href={`tel:${empresa.telefone}`} className="flex items-center gap-2 hover:text-primary">
              <Phone className="h-4 w-4 text-muted-foreground" />
              {formatarTelefone(empresa.telefone)}
            </a>
          )}
          {empresa.email && (
            <a href={`mailto:${empresa.email}`} className="flex items-center gap-2 hover:text-primary truncate">
              <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{empresa.email}</span>
            </a>
          )}
          {(empresa.logradouro || empresa.municipio) && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <span>
                {empresa.logradouro}
                {empresa.bairro && `, ${empresa.bairro}`}
                {empresa.municipio && ` — ${empresa.municipio}/${empresa.uf}`}
                {empresa.cep && ` — CEP ${formatarCEP(empresa.cep)}`}
              </span>
            </div>
          )}
        </div>

        {empresa.capital_social && (
          <div className="text-xs text-muted-foreground pt-2 border-t">
            Capital social: R$ {empresa.capital_social.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        )}

        <div className="pt-2 border-t">
          <a
            href={`https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp?cnpj=${empresa.cnpj}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            Ver na Receita Federal
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  )
}
