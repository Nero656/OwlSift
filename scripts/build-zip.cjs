const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { build, Platform, Arch } = require('electron-builder')

const root = path.resolve(__dirname, '..')
const platforms = {
  '--win': { target: Platform.WINDOWS, key: 'win' },
  '--linux': { target: Platform.LINUX, key: 'linux' },
  '--mac': { target: Platform.MAC, key: 'mac' },
}
const requested = process.argv.slice(2).find(value => Object.hasOwn(platforms, value))
const platform = platforms[requested ?? (process.platform === 'win32' ? '--win' : process.platform === 'darwin' ? '--mac' : '--linux')]

function run(task) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', task], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${task} failed with exit code ${result.status}`)
}

async function main() {
  run('generate')
  run('build:electron')
  await build({
    projectDir: root,
    targets: platform.target.createTarget('zip', Arch.x64),
    publish: 'never',
    config: {
      [platform.key]: { artifactName: 'OwlSift-${version}-' + platform.key + '-${arch}.${ext}' },
    },
  })
}

main().catch(error => { console.error(error); process.exitCode = 1 })
