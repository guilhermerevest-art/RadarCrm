-- =============================================================================
-- Funcao RPC para buscar obras dentro de um raio
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_radar_obras_no_raio(
  p_lat NUMERIC,
  p_lng NUMERIC,
  p_raio_metros INTEGER,
  p_tenant_id UUID,
  p_fase TEXT DEFAULT NULL,
  p_porte TEXT DEFAULT NULL,
  p_limite INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  fonte TEXT,
  endereco_logradouro TEXT,
  endereco_numero TEXT,
  endereco_bairro TEXT,
  endereco_cidade TEXT,
  endereco_uf TEXT,
  lat NUMERIC,
  lng NUMERIC,
  fase_atual TEXT,
  porte TEXT,
  status TEXT,
  distancia_km NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ro.id,
    ro.fonte,
    ro.endereco_logradouro,
    ro.endereco_numero,
    ro.endereco_bairro,
    ro.endereco_cidade,
    ro.endereco_uf,
    ro.lat,
    ro.lng,
    ro.fase_atual,
    ro.porte,
    ro.status,
    ST_Distance(
      ro.geo,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) / 1000 AS distancia_km
  FROM radar_obras ro
  WHERE ro.tenant_id = p_tenant_id
    AND ro.status = 'ativa'
    AND ro.geo IS NOT NULL
    AND ST_DWithin(
      ro.geo,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_raio_metros
    )
    AND (p_fase IS NULL OR ro.fase_atual = p_fase)
    AND (p_porte IS NULL OR ro.porte = p_porte)
  ORDER BY distancia_km ASC
  LIMIT p_limite;
END;
$$ LANGUAGE plpgsql STABLE;
