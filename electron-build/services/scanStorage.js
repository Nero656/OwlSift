"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.yieldScan = exports.normalizeScanMode = void 0;
exports.createStorageStrategy = createStorageStrategy;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const run = (0, node_util_1.promisify)(node_child_process_1.execFile);
const commandOptions = { timeout: 4000, windowsHide: true };
const normalizeScanMode = (mode) => mode === 'hdd' || mode === 'ssd' ? mode : 'auto';
exports.normalizeScanMode = normalizeScanMode;
const ssd = { width: 8 };
const hdd = { width: 1 };
async function detectStorage(folder) {
    if (process.platform === 'win32') {
        const drive = node_path_1.default.parse(folder).root[0];
        if (!drive || !/^[a-z]$/i.test(drive) || folder[1] !== ':')
            return ssd;
        const script = "$ErrorActionPreference='Stop'; " +
            "$disk=Get-Partition -DriveLetter " + drive + " | Get-Disk; " +
            "$serial=([string]$disk.SerialNumber).Trim(); " +
            "$media=@(Get-PhysicalDisk | Where-Object { $serial -and ([string]$_.SerialNumber).Trim() -eq $serial }); " +
            "if ($null -ne $disk.Number) { [string]$disk.Number }; " +
            "if ($media.Count -eq 1) { [string]$media[0].MediaType }";
        const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], commandOptions);
        const [disk, media] = stdout.trim().split(/\r?\n/);
        return { width: media === 'HDD' ? 1 : 8, disk: disk && /^\d+$/.test(disk) ? disk : undefined };
    }
    if (process.platform !== 'linux' || /microsoft/i.test(node_os_1.default.release()))
        return ssd;
    const { stdout } = await run('findmnt', ['-n', '-o', 'SOURCE', '--target', folder], commandOptions);
    const device = stdout.trim().split('[')[0];
    if (!device?.startsWith('/dev/'))
        return ssd;
    const topology = await run('lsblk', ['-s', '-n', '-r', '-o', 'TYPE,ROTA,KNAME', device], commandOptions);
    const disks = [...new Set(topology.stdout.trim().split('\n').filter(line => line.startsWith('disk ')))];
    return { width: disks.some(line => line.startsWith('disk 1 ')) ? 1 : 8,
        disk: disks.length === 1 ? disks[0].split(' ')[2] : undefined };
}
const recentProbes = new Map();
/** Reuse recent probes across scans and pin the result for each volume for the life of a scan. */
function createStorageStrategy(mode) {
    const cache = new Map();
    const profileFor = (folder, device, probeTopology = false) => {
        const override = mode === 'auto' ? undefined : mode === 'hdd' ? hdd : ssd;
        if (override && !probeTopology)
            return Promise.resolve(override);
        const key = process.platform === 'win32' ? node_path_1.default.parse(folder).root.toLowerCase() : String(device);
        let profile = cache.get(key);
        if (!profile) {
            const cached = recentProbes.get(key);
            if (cached && cached.expires > Date.now())
                profile = cached.profile;
            else {
                profile = detectStorage(folder).catch(() => ssd);
                recentProbes.set(key, { expires: Date.now() + 5 * 60 * 1000, profile });
            }
            cache.set(key, profile);
        }
        return override ? profile.then(detected => ({ ...detected, width: override.width })) : profile;
    };
    return { profileFor, widthFor: async (folder, device) => (await profileFor(folder, device)).width };
}
const yieldScan = () => new Promise(resolve => setImmediate(resolve));
exports.yieldScan = yieldScan;
