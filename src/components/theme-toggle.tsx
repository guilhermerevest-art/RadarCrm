'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'light' | 'dark' | null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const inicial = stored ?? (prefersDark ? 'dark' : 'light')
    setTheme(inicial)
    document.documentElement.classList.toggle('dark', inicial === 'dark')
  }, [])

  function toggle() {
    const novo = theme === 'light' ? 'dark' : 'light'
    setTheme(novo)
    document.documentElement.classList.toggle('dark', novo === 'dark')
    localStorage.setItem('theme', novo)
  }

  return (
    <button
      onClick={toggle}
      className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  )
}
