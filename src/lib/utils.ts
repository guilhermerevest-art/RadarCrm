import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function generateSlug(nome: string): string {
  const base = slugify(nome)
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base}-${suffix}`
}

export function getEstagioCor(estagio: string): string {
  const cores: Record<string, string> = {
    novo: '#A9B4BA',
    contato: '#2E6F8E',
    proposta: '#D97706',
    negociacao: '#7C3AED',
    fechamento: '#059669',
    ganho: '#16A34A',
    perdido: '#DC2626',
  }
  return cores[estagio] ?? '#A9B4BA'
}

export function getProbabilidadePadrao(estagio: string): number {
  const map: Record<string, number> = {
    novo: 10,
    contato: 25,
    proposta: 50,
    negociacao: 75,
    fechamento: 90,
    ganho: 100,
    perdido: 0,
  }
  return map[estagio] ?? 10
}
