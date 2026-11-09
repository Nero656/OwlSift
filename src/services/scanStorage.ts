import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import type { ScanMode } from '../types/documentScan';

const run = promisify(execFile);
const commandOptions = { timeout: 4000, windowsHide: true };
export const normalizeScanMode = (mode: unknown): ScanMode => mode === 'hdd' || mode === 'ssd' ? mode : 'auto';

type StorageProfile = { width: number; disk?: string };
const ssd: StorageProfile = { width: 8 };
const hdd: StorageProfile = { width: 1 };

async function detectStorage(folder: string): Promise<StorageProfile> {
    if (process.platform === 'win32') {
        const drive = path.parse(folder).root[0];
        if (!drive || !/^[a-z]$/i.test(drive) || folder[1] !== ':') return ssd;
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
    if (process.platform !== 'linux' || /microsoft/i.test(os.release())) return ssd;
    const { stdout } = await run('findmnt', ['-n', '-o', 'SOURCE', '--target', folder], commandOptions);
    const device = stdout.trim().split('[')[0];
    if (!device?.startsWith('/dev/')) return ssd;
    const topology = await run('lsblk', ['-s', '-n', '-r', '-o', 'TYPE,ROTA,KNAME', device], commandOptions);
    const disks = [...new Set(topology.stdout.trim().split('\n').filter(line => line.startsWith('disk ')))];
    return { width: disks.some(line => line.startsWith('disk 1 ')) ? 1 : 8,
        disk: disks.length === 1 ? disks[0]!.split(' ')[2] : undefined };
}

const recentProbes = new Map<string, { expires: number; profile: Promise<StorageProfile> }>();

/** Reuse recent probes across scans and pin the result for each volume for the life of a scan. */
export function createStorageStrategy(mode: ScanMode) {
    const cache = new Map<string, Promise<StorageProfile>>();
    const profileFor = (folder: string, device: number, probeTopology = false): Promise<StorageProfile> => {
        const override = mode === 'auto' ? undefined : mode === 'hdd' ? hdd : ssd;
        if (override && !probeTopology) return Promise.resolve(override);
        const key = process.platform === 'win32' ? path.parse(folder).root.toLowerCase() : String(device);
        let profile = cache.get(key);
        if (!profile) {
            const cached = recentProbes.get(key);
            if (cached && cached.expires > Date.now()) profile = cached.profile;
            else {
                profile = detectStorage(folder).catch(() => ssd);
                recentProbes.set(key, { expires: Date.now() + 5 * 60 * 1000, profile });
            }
            cache.set(key, profile);
        }
        return override ? profile.then(detected => ({ ...detected, width: override.width })) : profile;
    };
    return { profileFor, widthFor: async (folder: string, device: number) => (await profileFor(folder, device)).width };
}

export const yieldScan = () => new Promise<void>(resolve => setImmediate(resolve));
