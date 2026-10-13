const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const source = path.join(root, 'dist')
const target = path.join(root, 'electron-dist')

fs.rmSync(target, { recursive: true, force: true })
fs.cpSync(source, target, { recursive: true })

console.log(`Prepared Electron files in ${target}`)
