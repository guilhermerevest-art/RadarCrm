'use client'

import dynamic from 'next/dynamic'

// Carrega o banner de cookies apenas no client-side
const CookieBanner = dynamic(
  () => import('./CookieBanner').then(mod => mod.CookieBanner),
  { ssr: false }
)

export function CookieBannerWrapper() {
  return <CookieBanner />
}
