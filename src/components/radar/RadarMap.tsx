'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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

function createMarkerIcon(color: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);
      cursor:pointer;
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    className: '',
  })
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
  const containerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<L.Marker[]>([])
  const centerRef = useRef(center)

  // Inicializar mapa
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapRef.current = L.map(containerRef.current, {
      center: [centerRef.current.lat, centerRef.current.lng],
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapRef.current)

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // Reposicionar mapa quando center mudar
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView([center.lat, center.lng], 13, { animate: true })
    }
  }, [center.lat, center.lng])

  // Atualizar marcadores
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Remover marcadores antigos
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    // Adicionar marcador do usuario
    const userIcon = createUserIcon()
    const userMarker = L.marker([center.lat, center.lng], { icon: userIcon })
      .addTo(map)
      .bindPopup('Sua localizacao')

    // Raio visual
    L.circle([center.lat, center.lng], {
      radius: 2000,
      color: '#3B82F6',
      fillColor: '#3B82F6',
      fillOpacity: 0.05,
      weight: 1,
      dashArray: '5,5',
    }).addTo(map)

    // Marcadores de obras
    markers.forEach((obra) => {
      if (!obra.lat || !obra.lng) return

      const color = getMarkerColor(obra.score, obra.fase)
      const icon = createMarkerIcon(color)
      const marker = L.marker([obra.lat, obra.lng], { icon })
        .addTo(map)

      const popupText = `
        <div style="font-size:12px;min-width:150px">
          <strong>${obra.titulo}</strong><br/>
          <span style="color:#666">${obra.fase || 'Sem fase'}</span>
          ${obra.distancia_km ? `<br/><small>Dist: ${obra.distancia_km} km</small>` : ''}
          <br/><small>Score: ${obra.score}</small>
        </div>
      `
      marker.bindPopup(popupText)
      marker.on('click', () => onMarkerClick?.(obra.id))
      markersRef.current.push(marker)
    })
  }, [markers, center.lat, center.lng, onMarkerClick])

  return (
    <div ref={containerRef} className={className} style={{ borderRadius: '0.5rem', overflow: 'hidden' }} />
  )
}
