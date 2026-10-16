"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHiddenPath = isHiddenPath;
const serviceNames = new Set([
    'zone.identifier', '__macosx', 'desktop.ini', 'thumbs.db', 'ehthumbs.db', 'ehthumbs_vista.db',
    '$recycle.bin', 'system volume information', '$windows.~bt', '$windows.~ws',
    'pagefile.sys', 'hiberfil.sys', 'swapfile.sys', 'ntuser.dat', 'ntuser.ini',
    'bootmgr', 'bootnxt', 'bootstat.dat', 'node_modules', '__pycache__', 'lost+found',
]);
const serviceSuffix = /(?:\.(?:tmp|temp|swp|swo|swn|orig|rej|part|crdownload|download|dmp|cache|lock|lck|bak|backup|owlsift-backup|pyc|pyo|o|obj|class|dll|sys|exe|msi|com|scr|lnk|db|sqlite|sqlite3|dylib)|\.so(?:\.\d+)*|(?:\.db|\.sqlite|\.sqlite3)-(?:wal|shm|journal)|~)$/i;
/** Hidden names, alternate data streams, system metadata, caches and binary service files. */
function isHiddenPath(value) {
    return value.replace(/\\/g, '/').split('/').filter(Boolean).some(name => {
        const lower = name.toLowerCase();
        return name.startsWith('.') || name.startsWith('~$') || serviceNames.has(lower)
            || /^(?:ntuser\.dat|usrclass\.dat)(?:[.{}-]|$)/i.test(name)
            || /^iconcache.*\.db$/i.test(name)
            || (name.includes(':') && !/^[a-z]:$/i.test(name))
            || serviceSuffix.test(name);
    });
}
