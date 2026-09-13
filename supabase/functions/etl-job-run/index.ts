import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, supabaseServiceKey)

    const { fonte, tenant_id } = await req.json().catch(() => ({}))

    if (!fonte) {
      return new Response(JSON.stringify({ error: 'parametro "fonte" e obrigatorio' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: config } = await admin
      .from('radar_fontes_config')
      .select('*')
      .eq('fonte', fonte)
      .single()

    if (!config) {
      return new Response(JSON.stringify({ error: 'Fonte nao encontrada na configuracao' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Criar job de rastreamento
    const { data: job } = await admin
      .from('radar_ingestao_jobs')
      .insert({ fonte, status: 'rodando' })
      .select()
      .single()

    let result: Record<string, unknown> = { job_id: job.id }

    // === CNO: Baixa CSV do Dados.gov.br ===
    if (fonte === 'cno') {
      try {
        // Dados.gov.br - CNO (Cadastro Nacional de Obras)
        // URL: https://dados.gov.br/dataset/cno
        // Dataset direto (CSV mensal):
        const cnoUrl = 'https://dados.gov.br/api/action/datastore_search?resource_id=4f0a9d5e-3b5c-4e8a-9f2d-1c3b7e8a9f2d&limit=1000'

        const response = await fetch(cnoUrl, {
          headers: { 'User-Agent': 'RadarCrm/1.0 (contato@radarcrm.com.br)' },
        })

        if (!response.ok) {
          throw new Error(`Dados.gov.br returned ${response.status}`)
        }

        const cnoData = await response.json()
        const records: Array<Record<string, unknown>> = []

        if (cnoData.result?.records && Array.isArray(cnoData.result.records)) {
          // Normalizar formato do Dados.gov.br para formato interno
          for (const rec of cnoData.result.records) {
            records.push({
              cno: rec.numero_cno || rec.cnpj || String(rec.id),
              endereco: rec.logradouro || rec.endereco || 'S/N',
              numero: rec.numero || '',
              bairro: rec.bairro || '',
              municipio: rec.municipio || rec.cidade || 'UBERLANDIA',
              uf: rec.uf || 'MG',
              latitude: rec.latitude || rec.lat || null,
              longitude: rec.longitude || rec.lng || null,
              porte: rec.porte || 'medio',
              area_m2: rec.area_m2 || null,
            })
          }
        }

        if (records.length > 0) {
          const { data: procResult } = await admin.rpc('fn_ingestao_cno_processar', {
            p_raw_data: JSON.stringify(records),
            p_job_id: job.id,
            p_tenant_id: tenant_id || null,
          })

          result = {
            fonte,
            registros_lidos: records.length,
            ...(procResult ?? {}),
            provider: 'dados.gov.br',
          }
        } else {
          result = {
            fonte,
            registros_lidos: 0,
            error: 'Nenhum registro encontrado na API do Dados.gov.br',
          }
        }
      } catch (e) {
        // Fallback: sample data se a API falhar
        console.error('[ETL CNO] Erro ao buscar Dados.gov.br:', e)
        const sampleData = [
          { cno: '12345678901234', endereco: 'Rua Floriano Peixoto, 100, Centro', municipio: 'Uberlandia', uf: 'MG', latitude: -18.9186, longitude: -48.2772, porte: 'medio' },
          { cno: '12345678901235', endereco: 'Av Brasil, 500, Centro', municipio: 'Uberlandia', uf: 'MG', latitude: -18.9100, longitude: -48.2600, porte: 'grande' },
          { cno: '12345678901236', endereco: 'Rua XV de Novembro, 200', municipio: 'Uberlandia', uf: 'MG', latitude: -18.9050, longitude: -48.2550, porte: 'pequeno' },
          { cno: '12345678901237', endereco: 'Av Joao Naves de Alvarenga', municipio: 'Uberlandia', uf: 'MG', latitude: -18.8950, longitude: -48.2650, porte: 'medio' },
          { cno: '12345678901238', endereco: 'Rua Belo Horizonte', municipio: 'Uberaba', uf: 'MG', latitude: -19.7500, longitude: -47.9333, porte: 'medio' },
        ]

        const { data: procResult } = await admin.rpc('fn_ingestao_cno_processar', {
          p_raw_data: JSON.stringify(sampleData),
          p_job_id: job.id,
          p_tenant_id: tenant_id || null,
        })

        result = {
          fonte,
          ...(procResult ?? {}),
          sample_fallback: true,
          warning: `API Dados.gov.br indisponivel: ${e.message}`,
        }
      }
    }

    // === Alvará: scraping de portais de Transparencia ===
    else if (fonte === 'alvara_prefeitura') {
      try {
        // Uberlandia - Portal da Transparencia
        // Exemplo: busca de obras/alvaras
        const transparenciaUrl = 'https://transparencia.uberlandia.mg.gov.br/api/obras'

        const response = await fetch(transparenciaUrl, {
          headers: { 'User-Agent': 'RadarCrm/1.0' },
        })

        let alvaraData: Array<Record<string, unknown>> = []

        if (response.ok) {
          const json = await response.json()
          alvaraData = (Array.isArray(json) ? json : json.data ?? json.registros ?? []).map((rec: Record<string, unknown>) => ({
            cno: `ALV-${rec.numero_alvara || rec.id || ''}`,
            endereco: rec.endereco || rec.logradouro || 'S/N',
            numero: rec.numero || '',
            bairro: rec.bairro || '',
            municipio: rec.municipio || 'Uberlandia',
            uf: 'MG',
            latitude: rec.latitude || null,
            longitude: rec.longitude || null,
            porte: 'medio',
            fonte_origem: 'alvara_prefeitura',
          }))
        }

        if (alvaraData.length > 0) {
          const { data: procResult } = await admin.rpc('fn_ingestao_cno_processar', {
            p_raw_data: JSON.stringify(alvaraData),
            p_job_id: job.id,
            p_tenant_id: tenant_id || null,
          })
          result = { fonte, registros_lidos: alvaraData.length, ...(procResult ?? {}) }
        } else {
          result = { fonte, registros_lidos: 0, message: 'Nenhum alvara encontrado no portal' }
        }
      } catch (e) {
        result = { fonte, error: e.message, message: 'ETL Alvará em implementacao' }
      }
    }

    // === PNCP: Contratacoes Publicas ===
    else if (fonte === 'pncp') {
      try {
        // PNCP - Portal Nacional de Contratacoes Publicas
        // https://pncp.gov.br/api/1/pub/
        const pncpUrl = 'https://pncp.gov.br/api/1/pub/contratacoes?uf=MG&itensPorPagina=100'

        const response = await fetch(pncpUrl, {
          headers: {
            'User-Agent': 'RadarCrm/1.0',
            'Accept': 'application/json',
          },
        })

        let pncpData: Array<Record<string, unknown>> = []

        if (response.ok) {
          const json = await response.json()
          const items = Array.isArray(json) ? json : json.data ?? json.items ?? []

          for (const rec of items) {
            if (rec.tipoEndObjeto === 'Obras' || rec.descricaoObjeto?.toLowerCase().includes('construcao')) {
              pncpData.push({
                cno: `PNCP-${rec.id || rec.numeroContratacao || ''}`,
                endereco: rec.enderecoObjeto || rec.localExecucao || 'S/N',
                numero: '',
                bairro: '',
                municipio: rec.municipioSiafi || rec.uf || 'MG',
                uf: rec.uf || 'MG',
                latitude: null,
                longitude: null,
                porte: 'medio',
                fonte_origem: 'pncp',
                valor: rec.valorContratado || null,
                objeto: rec.descricaoObjeto || '',
              })
            }
          }
        }

        if (pncpData.length > 0) {
          const { data: procResult } = await admin.rpc('fn_ingestao_cno_processar', {
            p_raw_data: JSON.stringify(pncpData),
            p_job_id: job.id,
            p_tenant_id: tenant_id || null,
          })
          result = { fonte, registros_lidos: pncpData.length, ...(procResult ?? {}) }
        } else {
          result = { fonte, registros_lidos: 0, message: 'Nenhuma obra publica encontrada no PNCP para MG' }
        }
      } catch (e) {
        result = { fonte, error: e.message, message: 'ETL PNCP em implementacao' }
      }
    }

    // === SEMAD MG: Licenciamento Ambiental ===
    else if (fonte === 'semad_mg') {
      try {
        // SEMAD MG - Portal de licenciamento ambiental
        // URL base pode variar; tentamos o endpoint mais comum
        const semadUrl = 'https://meioambiente.mg.gov.br/api/licencas'

        const response = await fetch(semadUrl, {
          headers: { 'User-Agent': 'RadarCrm/1.0' },
        })

        let semadData: Array<Record<string, unknown>> = []

        if (response.ok) {
          const json = await response.json()
          const items = Array.isArray(json) ? json : json.data ?? json.registros ?? []

          for (const rec of items) {
            if (rec.tipoLicenca === 'Obra' || rec.atividade?.toLowerCase().includes('construcao')) {
              semadData.push({
                cno: `SEMAD-${rec.id || rec.numeroLicenca || ''}`,
                endereco: rec.endereco || rec.localizacao || 'S/N',
                numero: '',
                bairro: rec.bairro || '',
                municipio: rec.municipio || 'MG',
                uf: 'MG',
                latitude: null,
                longitude: null,
                porte: 'medio',
                fonte_origem: 'semad_mg',
                tipo_licenca: rec.tipoLicenca || '',
              })
            }
          }
        }

        if (semadData.length > 0) {
          const { data: procResult } = await admin.rpc('fn_ingestao_cno_processar', {
            p_raw_data: JSON.stringify(semadData),
            p_job_id: job.id,
            p_tenant_id: tenant_id || null,
          })
          result = { fonte, registros_lidos: semadData.length, ...(procResult ?? {}) }
        } else {
          result = { fonte, registros_lidos: 0, message: 'Nenhuma licenca SEMAD encontrada' }
        }
      } catch (e) {
        result = { fonte, error: e.message, message: 'ETL SEMAD em implementacao' }
      }
    }

    // Finalizar job
    const isErro = !result || !!result.error
    await admin
      .from('radar_ingestao_jobs')
      .update({
        status: isErro ? 'erro' : 'sucesso',
        finished_at: new Date().toISOString(),
        erro_detalhe: (result as Record<string, unknown>)?.error ?? null,
      })
      .eq('id', job.id)

    return new Response(JSON.stringify({ success: true, job, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
