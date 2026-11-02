import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron';
import type { IElectronAPI } from './types/global';

const allowedSendChannels = [
    'app:minimize',
    'app:maximize',
    'app:close'
] as const;

const allowedInvokeChannels = [
    'comfy:request',
    'app:open-donation',
    'app:open-ai-doc',
    'app:open-external',
    'files:import-drop',
    'app:get-version',
    'db:get-status',
    'files:list',
    'files:set-system-visibility',
    'files:add-tag',
    'files:remove-tag',
    'files:set-note',
    'files:open',
    'files:rename',
    'files:show-in-folder',
    'files:delete',
    'files:delete-from-disk',
    'files:get-image-preview',
    'files:folders',
    'files:search',
    'files:search-documents',
    'files:list-scan-drives',
    'files:scan-os-documents',
    'files:stop-document-scan',
    'files:document-scan-status',
    'files:choose-scan-folders',
    'files:choose-and-index',
    'files:choose-and-index-file',
    'files:create-in-folder',
    'files:edit-content',
    'files:get-content',
    'files:get-bytes',
    'folders:default-location',
    'folders:choose-parent',
    'folders:create',
    'files:transfer-workspace',
    'folders:remove-from-index'
] as const;

const allowedOnChannels = [
    'app:message'
] as const;

type SendChannel = typeof allowedSendChannels[number];
type InvokeChannel = typeof allowedInvokeChannels[number];
type OnChannel = typeof allowedOnChannels[number];

const electronAPI: IElectronAPI = {
    platform: process.platform,
    getPathForFile: (file: File) => webUtils.getPathForFile(file),

    send(channel: string, data?: unknown): void {
        if (allowedSendChannels.includes(channel as SendChannel)) {
            ipcRenderer.send(channel, data);
            return;
        }
        throw new Error(`Channel "${channel}" is not allowed for send`);
    },

    invoke(channel: string, data?: unknown): Promise<any> {
        if (allowedInvokeChannels.includes(channel as InvokeChannel)) {
            return ipcRenderer.invoke(channel, data);
        }
        throw new Error(`Channel "${channel}" is not allowed for invoke`);
    },

    on(channel: string, callback: (data: unknown) => void): () => void {
        if (allowedOnChannels.includes(channel as OnChannel)) {
            const listener = (_: IpcRendererEvent, data: unknown) => callback(data);
            ipcRenderer.on(channel, listener);

            return () => {
                ipcRenderer.removeListener(channel, listener);
            };
        }
        throw new Error(`Channel "${channel}" is not allowed for on`);
    }
};

contextBridge.exposeInMainWorld('electron', electronAPI);
