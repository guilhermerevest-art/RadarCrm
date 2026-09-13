'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

type MarkerData = {
  id: string
  lat: number
  lng: number
  fase: string | null
  score: number
  titulo: string
  distancia_km?: number
}

const FASE_COLORS: Record<string, string> = {
  alvara: '#DC2626',
  fundacao: '#D97706',
  estrutura: '#EAB308',
  acabamento: '#16A34A',
  concluida: '#6B7280',
  nao_iniciou: '#94A3B8',
  default: '#2E6F8E',
}

function getMarkerColor(score: number, fase: string | null): string {
  if (fase && FASE_COLORS[fase]) return FASE_COLORS[fase]
  if (score > 80) return '#D9541F'
  if (score > 60) return '#D97706'
  return '#2E6F8E'
}

function createUserIcon(): L.DivIcon {
  return L.divIcon({
    html: `<div style="
      width:20px;height:20px;border-radius:50%;
      background:#3B82F6;border:3px solid white;box-shadow:0 2px 6px rgba(59,130,246,0.5);
      position:relative;
    ">
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
        width:8px;height:8px;border-radius:50%;background:white;"></div>
    </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    className: '',
  })
}

type Props = {
  markers: MarkerData[]
  center: { lat: number; lng: number }
  onMarkerClick?: (id: string) => void
  className?: string
}

export function RadarMap({ markers, center, onMarkerClick, className = 'h-64' }: Props) {
  const mapRef = useRef<L.Map | null>(null)
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userMarkerRef = useRef<L.Marker | null>(null)
  const circleRef = useRef<L.Circle | null>(null)

  // Inicializar mapa
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapRef.current = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: 12,
      zoomControl: true,
      attributionControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapRef.current)

    // Criar grupo de clusters
    clusterRef.current = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount()
        const size = count < 10 ? 'small' : count < 100 ? 'medium' : 'large'

        return L.divIcon({
          html: `<div style="
            background:#2E6F8E;color:white;border-radius:50%;
            width:${size === 'small' ? 30 : size === 'medium' ? 40 : 50}px;
            height:${size === 'small' ? 30 : size === 'medium' ? 40 : 50}px;
            display:flex;align-items:center;justify-content:center;
            font-weight:bold;font-size:${size === 'small' ? 10 : size === 'medium' ? 12 : 14}px;
            border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);
          ">${count}</div>`,
          className: 'marker-cluster',
          iconSize: L.point(size === 'small' ? 30 : size === 'medium' ? 40 : 50, size === 'small' ? 30 : size === 'medium' ? 40 : 50),
        })
      },
    })

    mapRef.current.addLayer(clusterRef.current)

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      clusterRef.current = null
    }
  }, [])

  // Reposicionar mapa quando center mudar
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView([center.lat, center.lng], 12, { animate: true })
    }
  }, [center.lat, center.lng])

  // Atualizar marcadores
  useEffect(() => {
    const map = mapRef.current
    const cluster = clusterRef.current
    if (!map || !cluster) return

    // Limpar clusters
    cluster.clearLayers()

    // Marcador do usuário
    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current)
    }
    if (circleRef.current) {
      map.removeLayer(circleRef.current)
    }

    const userIcon = createUserIcon()
    userMarkerRef.current = L.marker([center.lat, center.lng], { icon: userIcon })
      .addTo(map)
      .bindPopup('Uberlândia - Centro')

    // Raio visual
    circleRef.current = L.circle([center.lat, center.lng], {
      radius: 5000,
      color: '#3B82F6',
      fillColor: '#3B82F6',
      fillOpacity: 0.05,
      weight: 1,
      dashArray: '5,5',
    }).addTo(map)

    // Filtrar marcadores com coordenadas válidas
    const validMarkers = markers.filter((obra) => obra.lat && obra.lng && !isNaN(obra.lat) && !isNaN(obra.lng))

    // Calcular centro baseado nos marcadores ou usar centro padrão
    if (validMarkers.length > 0) {
      const lats = validMarkers.map((m) => m.lat)
      const lngs = validMarkers.map((m) => m.lng)
      const bounds = L.latLngBounds(lats.map((lat, i) => [lat, lngs[i]] as [number, number]))

      // Adicionar marcadores ao cluster
      validMarkers.forEach((obra) => {
        const color = getMarkerColor(obra.score, obra.fase)
        const icon = L.divIcon({
          html: `<div style="
            width:12px;height:12px;border-radius:50%;
            background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);
            cursor:pointer;
          "></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
          className: '',
        })

        const marker = L.marker([obra.lat, obra.lng], { icon })
        const popupText = `
          <div style="font-size:12px;min-width:150px;max-width:250px">
            <strong style="font-size:11px">${obra.titulo}</strong><br/>
            <span style="color:#666">${obra.fase || 'Sem fase'}</span>
            ${obra.distancia_km ? `<br/><small>Dist: ${obra.distancia_km?.toFixed(1)} km</small>` : ''}
            <br/><small>Score: ${obra.score}</small>
          </div>
        `
        marker.bindPopup(popupText)
        marker.on('click', () => onMarkerClick?.(obra.id))
        cluster.addLayer(marker)
      })

      // Ajustar visualização para mostrar todos os marcadores
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 })
    }
  }, [markers, center.lat, center.lng, onMarkerClick])

  return (
    <div ref={containerRef} className={className} style={{ borderRadius: '0.5rem', overflow: 'hidden' }} />
  )
}
