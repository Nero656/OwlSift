import type { ComfyRequest, ComfyResponse } from '../services/comfyTransport';
import type { DatabaseStatus } from '../db/sqlite';
import type { IndexedFileRecord } from '../db/sqlite';

export interface IElectronAPI {
    platform: NodeJS.Platform;
    getPathForFile(file: File): string;
    invoke(channel: 'comfy:request', request: ComfyRequest): Promise<ComfyResponse>;
  invoke(channel: 'files:import-drop', data: { filePath: string; folderPath?: string; maxFiles: number }): Promise<string>;
    invoke(channel: 'app:open-external', href: string): Promise<void>;
    invoke(channel: 'app:open-ai-doc', id: string): Promise<void>;
    invoke(channel: 'app:open-donation'): Promise<void>;
    send: (channel: 'app:minimize' | 'app:maximize' | 'app:close', data?: unknown) => void;
    invoke(channel: 'app:get-version', data?: unknown): Promise<string>;
    invoke(channel: 'db:get-status', data?: unknown): Promise<DatabaseStatus>;
    invoke(channel: 'files:set-system-visibility', include: boolean): Promise<void>;
    invoke(channel: 'files:list', data?: unknown): Promise<IndexedFileRecord[]>;
    invoke(channel: 'files:add-tag', data: { fileId: number; tag: string }): Promise<string[]>;
    invoke(channel: 'files:remove-tag', data: { fileId: number; tag: string }): Promise<string[]>;
    invoke(channel: 'files:set-note', data: { fileId: number; note: string }): Promise<void>;
    invoke(channel: 'files:open', data: number): Promise<void>;
    invoke(channel: 'files:rename', data: { fileId: number; name: string }): Promise<{ path: string; name: string; extension: string; size: number; mtime: number }>;
    invoke(channel: 'files:show-in-folder', data: number): Promise<void>;
    invoke(channel: 'files:delete', data: { fileId: number }): Promise<void>;
    invoke(channel: 'files:delete-from-disk', data: { fileId: number; mode: 'trash' | 'permanent' }): Promise<void>;
    invoke(channel: 'files:get-image-preview', data: number): Promise<string | null>;
    invoke(channel: 'files:folders', data?: unknown): Promise<Array<{ name: string; path: string; count: number }>>;
    invoke(channel: 'files:search', data: string): Promise<IndexedFileRecord[]>;
    invoke(channel: 'files:search-documents', data: string): Promise<IndexedFileRecord[]>;
    invoke(channel: 'files:list-scan-drives'): Promise<Array<{ path: string; label: string }>>;
    invoke(channel: 'files:scan-os-documents', data: { drivePath: string; extensions: string[] }): Promise<{ indexedCount: number; skippedCount: number }>;
    invoke(channel: 'files:choose-and-index', data?: { maxFiles?: number }): Promise<{ folderPath: string; indexedCount: number; skippedCount: number; limit: number } | null>;
    invoke(channel: 'files:choose-and-index-file', data?: { folderPath?: string }): Promise<{ folderPath: string; indexedCount: number; skippedCount: number; limit: number } | null>;
    invoke(channel: 'files:edit-content', data: { fileId: number; content: string; bytes: number[]; expectedMtime: number }): Promise<void>;
  invoke(channel: 'files:create-in-folder', data: { folderPath: string; fileName: string; content: string; bytes?: number[] }): Promise<{ folderPath: string; indexedCount: number; skippedCount: number; limit: number }>;
    invoke(channel: 'files:get-bytes', data: number): Promise<number[]>;
    invoke(channel: 'files:get-content', data: number): Promise<string>;
    invoke(channel: 'folders:remove-from-index', data: string): Promise<void>;
    on: (channel: 'app:message', callback: (data: unknown) => void) => () => void;
}

declare global {
    interface Window {
        electron: IElectronAPI;
    }
}
