import type { DatabaseStatus } from '../db/sqlite';
import type { IndexedFileRecord } from '../db/sqlite';

export interface IElectronAPI {
    platform: NodeJS.Platform;
    send: (channel: 'app:minimize' | 'app:maximize' | 'app:close', data?: unknown) => void;
    invoke(channel: 'app:get-version', data?: unknown): Promise<string>;
    invoke(channel: 'db:get-status', data?: unknown): Promise<DatabaseStatus>;
    invoke(channel: 'files:list', data?: unknown): Promise<IndexedFileRecord[]>;
    invoke(channel: 'files:add-tag', data: { fileId: number; tag: string }): Promise<string[]>;
    invoke(channel: 'files:remove-tag', data: { fileId: number; tag: string }): Promise<string[]>;
    invoke(channel: 'files:set-note', data: { fileId: number; note: string }): Promise<void>;
    invoke(channel: 'files:open', data: number): Promise<void>;
    invoke(channel: 'files:show-in-folder', data: number): Promise<void>;
    invoke(channel: 'files:delete', data: { fileId: number }): Promise<void>;
    invoke(channel: 'files:get-image-preview', data: number): Promise<string | null>;
    invoke(channel: 'files:folders', data?: unknown): Promise<Array<{ name: string; path: string; count: number }>>;
    invoke(channel: 'files:search', data: string): Promise<IndexedFileRecord[]>;
    invoke(channel: 'files:choose-and-index', data?: { maxFiles?: number }): Promise<{ folderPath: string; indexedCount: number; skippedCount: number; limit: number } | null>;
    invoke(channel: 'folders:remove-from-index', data: string): Promise<void>;
    on: (channel: 'app:message', callback: (data: unknown) => void) => () => void;
}

declare global {
    interface Window {
        electron: IElectronAPI;
    }
}
