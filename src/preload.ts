import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { IElectronAPI } from './types/global';

const allowedSendChannels = [
    'app:minimize',
    'app:maximize',
    'app:close'
] as const;

const allowedInvokeChannels = [
    'app:get-version'
] as const;

const allowedOnChannels = [
    'app:message'
] as const;

type SendChannel = typeof allowedSendChannels[number];
type InvokeChannel = typeof allowedInvokeChannels[number];
type OnChannel = typeof allowedOnChannels[number];

const electronAPI: IElectronAPI = {
    platform: process.platform,

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