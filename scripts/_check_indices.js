const fs = require('fs')
const readline = require('readline')
const alvos = ['117023720260', '010010092278', '010010119379', '010010144970']
const stream = fs.createReadStream('cno.csv', { encoding: 'latin1' })
const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
rl.on('line', line => {
  for (const alvo of alvos) {
    if (line.startsWith(alvo)) {
      const f = line.split(',').map(s => s.replace(/^"|"$/g, '').trim())
      console.log(`\n=== ${alvo} ===`)
      console.log(`  [7] CEP:      "${f[7]}"`)
      console.log(`  [8] NI?:      "${f[8] || '<VAZIO>'}"`)
      console.log(`  [9] Qualif?:  "${f[9]}"`)
      console.log(`  [10] Nome?:   "${f[10]}"`)
      console.log(`  [11] CodMun?: "${f[11]}"`)
      break
    }
  }
})
rl.on('close', () => process.exit(0))
