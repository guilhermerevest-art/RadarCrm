// Lê só os primeiros bytes do CSV pra ver cabeçalho
const fs = require('fs')
const fd = fs.openSync('cno.csv', 'r')
const buf = Buffer.alloc(2000)
fs.readSync(fd, buf, 0, 2000, 0)
console.log(buf.toString('latin1'))
