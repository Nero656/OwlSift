import fs from 'node:fs'
import path from 'node:path'

export const sameFileVersion = (a: fs.Stats, b: fs.Stats) =>
  a.isFile() && b.isFile() && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ino === b.ino && a.dev === b.dev

/** Allocate without replacing an existing file. A move uses a hard link where possible. */
export async function placeWorkspaceFile(source: string, folder: string, move: boolean, reserved: (candidate: string) => boolean) {
  const original = await fs.promises.lstat(source)
  if (!original.isFile() || original.isSymbolicLink()) throw new Error('Only regular files can be transferred')
  const extension = path.extname(source), base = path.basename(source, extension)
  for (let suffix = 0; suffix < 10000; suffix++) {
    const destination = path.join(folder, base + (suffix ? ` (${suffix})` : '') + extension)
    if (reserved(destination)) continue
    try {
      let linked = false
      if (move) {
        try { await fs.promises.link(source, destination); linked = true }
        catch (error) {
          if (!['EXDEV','EPERM','ENOTSUP','EOPNOTSUPP'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
        }
      }
      if (!linked) {
        await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_EXCL)
        try { await fs.promises.utimes(destination, original.atime, original.mtime) }
        catch (error) { await fs.promises.unlink(destination).catch(() => {}); throw error }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
      throw error
    }
    try {
      if (!sameFileVersion(original, await fs.promises.lstat(source))) throw new Error('The source file changed during transfer')
      return { destination, original, stat: await fs.promises.stat(destination) }
    } catch (error) { await fs.promises.unlink(destination).catch(() => {}); throw error }
  }
  throw new Error('Could not find an available file name')
}
