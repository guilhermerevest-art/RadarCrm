'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
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

  if (!mounted) {
    return (
      <div className="h-9 w-9 rounded-lg" />
    )
  }

  return (
    <button
      onClick={toggle}
      className={cn(
        'relative rounded-xl p-2.5 transition-all duration-200',
        'hover:bg-accent',
        theme === 'dark' ? 'text-amber-400' : 'text-muted-foreground hover:text-foreground'
      )}
      title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
    >
      <div className="relative h-5 w-5">
        <Sun className={cn(
          'absolute inset-0 h-5 w-5 transition-all duration-300',
          theme === 'dark' ? 'opacity-0 rotate-90 scale-0' : 'opacity-100 rotate-0 scale-100'
        )} />
        <Moon className={cn(
          'absolute inset-0 h-5 w-5 transition-all duration-300',
          theme === 'dark' ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-0'
        )} />
      </div>
    </button>
  )
}
