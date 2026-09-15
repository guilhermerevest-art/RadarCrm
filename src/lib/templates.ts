/**
 * Renderização de templates de mensagem WhatsApp.
 * Substitui {var} pelos valores. Preserva placeholder se var ausente.
 */

export type TemplateVars = Record<string, string | null | undefined>

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const v = vars[key]
    if (v === undefined || v === null || v === '') return `{${key}}`
    return v
  })
}

export function extractTemplateVars(template: string): string[] {
  const set = new Set<string>()
  const re = /\{(\w+)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(template)) !== null) set.add(m[1])
  return Array.from(set)
}

export const VARIAVEIS_CONHECIDAS = ['nome', 'empresa', 'obra', 'telefone', 'cidade'] as const
