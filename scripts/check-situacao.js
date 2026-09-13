// Conta valores únicos da coluna Situação (índice 22)
const fs = require('fs')
const readline = require('readline')

function parseCSVLine(line) {
  const cols = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      cols.push(current); current = ''
    } else current += ch
  }
  cols.push(current)
  return cols
}

async function main() {
  const stream = fs.createReadStream('cno.csv', { encoding: 'latin1' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  let header = null
  const counts = {}
  let total = 0
  let totalMG = 0
  const MG_TRIANGULO = new Set(['uberlandia','uberaba','araguari','ituiutaba','patos de minas','patrocinio','araxa'])
  let totalTriangulo = 0
  const triCountBySituacao = {}

  for await (const line of rl) {
    if (!header) { header = parseCSVLine(line).map(h => h.trim().toLowerCase()); continue }
    const cols = parseCSVLine(line)
    total++
    const situacao = (cols[22] || '').trim()
    counts[situacao] = (counts[situacao] || 0) + 1

    const uf = (cols[17] || '').toUpperCase().trim()
    if (uf === 'MG') totalMG++

    const municipio = (cols[12] || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (uf === 'MG' && MG_TRIANGULO.has(municipio)) {
      totalTriangulo++
      triCountBySituacao[situacao] = (triCountBySituacao[situacao] || 0) + 1
    }

    if (total % 200000 === 0) console.log(`Lidas ${total}...`)
  }

  console.log('\n=== Total Brasil ===')
  console.log('Total:', total)
  console.log('Por Situação:', counts)
  console.log('\n=== MG ===')
  console.log('Total MG:', totalMG)
  console.log('\n=== Triângulo (sample Uberlândia, Uberaba, Araguari, Ituiutaba, Patos, Patrocínio, Araxá) ===')
  console.log('Total Triângulo (sample):', totalTriangulo)
  console.log('Por Situação (Triângulo):', triCountBySituacao)
}
main().catch(console.error)
