import type { DatabaseStatus } from '../db/sqlite';

export interface IElectronAPI {
    platform: NodeJS.Platform;
    send: (channel: 'app:minimize' | 'app:maximize' | 'app:close', data?: unknown) => void;
    invoke(channel: 'app:get-version', data?: unknown): Promise<string>;
    invoke(channel: 'db:get-status', data?: unknown): Promise<DatabaseStatus>;
    on: (channel: 'app:message', callback: (data: unknown) => void) => () => void;
}

declare global {
    interface Window {
        electron: IElectronAPI;
    }
}
