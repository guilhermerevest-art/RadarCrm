import fs from 'fs'

async function main() {
  const stream = fs.createReadStream('cno.csv', { encoding: 'latin1', highWaterMark: 1024 })
  const chunks: string[] = []
  let total = 0
  stream.on('data', (chunk) => {
    total += chunk.length
    if (chunks.length === 0 && total > 2000) {
      chunks.push(chunk)
      stream.destroy()
    }
  })
  await new Promise<void>(r => stream.on('close', () => r()))
  const first = chunks[0]
  console.log('first 500 chars:', JSON.stringify(first.slice(0, 500)))
  const lines = first.split('\n')
  console.log('total lines:', lines.length)
  const header = lines[0]
  console.log('header bytes:', Buffer.from(header, 'latin1').slice(0, 300).toString('hex'))
  const fields = header.split(',').map(f => f.replace(/^"|"$/g, '').trim())
  console.log('first 12 fields:')
  fields.slice(0, 12).forEach((f, i) => console.log(`  ${i} = ${JSON.stringify(f)}`))
}
main()
