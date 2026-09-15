/**
 * CSV parser/serializer simples (sem deps).
 * Aceita separador `;` (padrão projeto), aspas escapadas com `""`, vírgulas dentro de aspas.
 */

export function parseCSV(text: string, sep: string = ';'): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const t = text.replace(/^﻿/, '')

  while (i < t.length) {
    const c = t[i]
    if (inQuotes) {
      if (c === '"' && t[i + 1] === '"') {
        field += '"'
        i += 2
        continue
      }
      if (c === '"') {
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === sep) {
      current.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\n' || c === '\r') {
      current.push(field)
      rows.push(current)
      current = []
      field = ''
      if (c === '\r' && t[i + 1] === '\n') i += 2
      else i++
      continue
    }
    field += c
    i++
  }
  if (field !== '' || current.length > 0) {
    current.push(field)
    rows.push(current)
  }
  return rows
}

export function escapeCSVField(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return `"${s.replace(/"/g, '""')}"`
}

export function rowsToCSV(rows: unknown[][], headers?: string[]): string {
  const lines: string[] = []
  if (headers) lines.push(headers.map(escapeCSVField).join(';'))
  for (const row of rows) lines.push(row.map(escapeCSVField).join(';'))
  return '﻿' + lines.join('\n')
}
