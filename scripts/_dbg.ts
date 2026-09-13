import fs from 'fs'
import readline from 'readline'

async function main() {
  const stream = fs.createReadStream('cno.csv', { encoding: 'latin1', highWaterMark: 1024 })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  let n = 0
  for await (const line of rl) {
    console.log(`line ${n} bytes=${Buffer.byteLength(line, 'latin1')}`)
    if (n === 0) {
      const fields = line.split(';').map(f => f.trim())
      console.log('fields:', fields.map((f, i) => `${i}=${JSON.stringify(f)}`).slice(0, 5))
    }
    if (++n > 2) break
  }
}
main()
