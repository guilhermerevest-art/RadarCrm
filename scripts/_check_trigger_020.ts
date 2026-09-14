// =============================================================================
// _check_trigger_020.ts
// Verifica estado pos-deploy do trigger de enriquecimento automatico.
// Conta: obras ativas com CNPJ, ja enriquecidos, nao encontrados, na fila.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { count: obrasAtivas } = await supabase
    .from('radar_obras')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ativa')
    .not('responsavel_documento', 'is', null)

  const { count: jaEnriquecidos } = await supabase
    .from('radar_obras_empresas')
    .select('cnpj', { count: 'exact', head: true })
    .not('fonte_enriquecimento', 'eq', 'nao_encontrado')

  const { count: naoEncontrados } = await supabase
    .from('radar_obras_empresas')
    .select('cnpj', { count: 'exact', head: true })
    .eq('fonte_enriquecimento', 'nao_encontrado')

  const { count: naFila } = await supabase
    .from('enrich_cnpj_queue')
    .select('cnpj', { count: 'exact', head: true })

  console.log({ obrasAtivas, jaEnriquecidos, naoEncontrados, naFila })
}

main().catch((e) => {
  console.error('Erro ao verificar trigger 020:', e)
  process.exit(1)
})
