"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sameFileVersion = void 0;
exports.placeWorkspaceFile = placeWorkspaceFile;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const sameFileVersion = (a, b) => a.isFile() && b.isFile() && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ino === b.ino && a.dev === b.dev;
exports.sameFileVersion = sameFileVersion;
/** Allocate without replacing an existing file. A move uses a hard link where possible. */
async function placeWorkspaceFile(source, folder, move, reserved) {
    const original = await node_fs_1.default.promises.lstat(source);
    if (!original.isFile() || original.isSymbolicLink())
        throw new Error('Only regular files can be transferred');
    const extension = node_path_1.default.extname(source), base = node_path_1.default.basename(source, extension);
    for (let suffix = 0; suffix < 10000; suffix++) {
        const destination = node_path_1.default.join(folder, base + (suffix ? ` (${suffix})` : '') + extension);
        if (reserved(destination))
            continue;
        try {
            let linked = false;
            if (move) {
                try {
                    await node_fs_1.default.promises.link(source, destination);
                    linked = true;
                }
                catch (error) {
                    if (!['EXDEV', 'EPERM', 'ENOTSUP', 'EOPNOTSUPP'].includes(error.code ?? ''))
                        throw error;
                }
            }
            if (!linked) {
                await node_fs_1.default.promises.copyFile(source, destination, node_fs_1.default.constants.COPYFILE_EXCL);
                try {
                    await node_fs_1.default.promises.utimes(destination, original.atime, original.mtime);
                }
                catch (error) {
                    await node_fs_1.default.promises.unlink(destination).catch(() => { });
                    throw error;
                }
            }
        }
        catch (error) {
            if (error.code === 'EEXIST')
                continue;
            throw error;
        }
        try {
            if (!(0, exports.sameFileVersion)(original, await node_fs_1.default.promises.lstat(source)))
                throw new Error('The source file changed during transfer');
            return { destination, original, stat: await node_fs_1.default.promises.stat(destination) };
        }
        catch (error) {
            await node_fs_1.default.promises.unlink(destination).catch(() => { });
            throw error;
        }
    }
    throw new Error('Could not find an available file name');
}
