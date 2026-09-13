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

    const { obra_ids } = await req.json()

    let query = admin
      .from('radar_obras_globais')
      .select('id, endereco_logradouro, endereco_numero, endereco_cidade, endereco_uf')
      .is('lat', null)
      .limit(50)

    if (obra_ids?.length) {
      query = query.in('id', obra_ids)
    }

    const { data: obras, error } = await query

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results: Array<{ id: string; lat: number; lng: number; provider: string; precisao: string }> = []

    for (const obra of obras || []) {
      const endereco = [
        obra.endereco_logradouro,
        obra.endereco_numero,
        obra.endereco_cidade,
        obra.endereco_uf,
        'Brasil',
      ].filter(Boolean).join(', ')

      try {
        const { data: geocode } = await admin.rpc('fn_geocoding_resolver', { endereco })

        if (geocode && !geocode.error) {
          await admin
            .from('radar_obras_globais')
            .update({ lat: geocode.lat, lng: geocode.lng })
            .eq('id', obra.id)

          results.push({
            id: obra.id,
            lat: geocode.lat,
            lng: geocode.lng,
            provider: geocode.provider,
            precisao: geocode.precisao,
          })
        }
      } catch {
        // skip individual failures gracefully
      }
    }

    return new Response(JSON.stringify({
      processed: results.length,
      total_requested: obras?.length ?? 0,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
