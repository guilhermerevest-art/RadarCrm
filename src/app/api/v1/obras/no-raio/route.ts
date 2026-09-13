// =============================================================================
// GET /api/v1/obras/no-raio - Busca obras dentro de um raio
// =============================================================================

import { NextRequest } from 'next/server'
import { withApiAuth, json, error, getQueryParams } from '../../_lib/base-handler'
import type { ApiContext } from '../../_lib/base-handler'

export const GET = withApiAuth(async (request: NextRequest, context: ApiContext) => {
  const { supabase, tenantId } = context
  const params = getQueryParams(request)

  // Parâmetros obrigatórios
  const lat = parseFloat(params.get('lat') || '')
  const lng = parseFloat(params.get('lng') || '')
  const raioKm = parseFloat(params.get('raio') || '10')

  if (isNaN(lat) || isNaN(lng)) {
    return error(
      'lat and lng parameters are required',
      'MISSING_COORDINATES',
      400
    )
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return error('Invalid coordinates', 'INVALID_COORDINATES', 400)
  }

  if (raioKm <= 0 || raioKm > 500) {
    return error('raio must be between 0 and 500 km', 'INVALID_RADIUS', 400)
  }

  // Parâmetros opcionais
  const fase = params.get('fase')
  const porte = params.get('porte')
  const limite = Math.min(100, Math.max(1, parseInt(params.get('limite') || '50')))

  // Converter raio de km para metros
  const raioMetros = raioKm * 1000

  // Query usando PostGIS para busca radial
  const { data, error: dbError } = await supabase
    .rpc('fn_radar_obras_no_raio', {
      p_lat: lat,
      p_lng: lng,
      p_raio_metros: raioMetros,
      p_tenant_id: tenantId,
      p_fase: fase,
      p_porte: porte,
      p_limite: limite,
    })

  if (dbError) {
    console.error('[API Obras Raio] Error:', dbError)

    // Fallback: query simples sem função RPC
    let query = supabase
      .from('radar_obras')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'ativa')
      .not('lat', 'is', null)
      .not('lng', 'is', null)

    if (fase) query = query.eq('fase_atual', fase)
    if (porte) query = query.eq('porte', porte)

    const { data: obras } = await query.limit(limite)

    // Filtrar por distância no código (menos preciso mas funciona)
    const obrasNoRaio = (obras || []).filter((obra: { lat?: number; lng?: number }) => {
      if (!obra.lat || !obra.lng) return false
      const dist = calcularDistancia(lat, lng, obra.lat, obra.lng)
      return dist <= raioKm
    })

    return json(obrasNoRaio.map((obra: { lat?: number; lng?: number; distancia_km?: number }) => ({
      ...obra,
      distancia_km: calcularDistancia(lat, lng, obra.lat!, obra.lng!),
    })), 200, {
      centro: { lat, lng },
      raio_km: raioKm,
      total: obrasNoRaio.length,
    })
  }

  return json(data, 200, {
    centro: { lat, lng },
    raio_km: raioKm,
    total: data?.length || 0,
  })
})

/**
 * Calcula distância entre dois pontos em km (Haversine)
 */
function calcularDistancia(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371 // Raio da Terra em km
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}
