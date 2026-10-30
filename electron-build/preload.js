"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const allowedSendChannels = [
    'app:minimize',
    'app:maximize',
    'app:close'
];
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
    'files:choose-and-index',
    'files:choose-and-index-file',
    'files:create-in-folder',
    'files:edit-content',
    'files:get-content',
    'files:get-bytes',
    'folders:remove-from-index'
];
const allowedOnChannels = [
    'app:message'
];
const electronAPI = {
    platform: process.platform,
    getPathForFile: (file) => electron_1.webUtils.getPathForFile(file),
    send(channel, data) {
        if (allowedSendChannels.includes(channel)) {
            electron_1.ipcRenderer.send(channel, data);
            return;
        }
        throw new Error(`Channel "${channel}" is not allowed for send`);
    },
    invoke(channel, data) {
        if (allowedInvokeChannels.includes(channel)) {
            return electron_1.ipcRenderer.invoke(channel, data);
        }
        throw new Error(`Channel "${channel}" is not allowed for invoke`);
    },
    on(channel, callback) {
        if (allowedOnChannels.includes(channel)) {
            const listener = (_, data) => callback(data);
            electron_1.ipcRenderer.on(channel, listener);
            return () => {
                electron_1.ipcRenderer.removeListener(channel, listener);
            };
        }
        throw new Error(`Channel "${channel}" is not allowed for on`);
    }
};
electron_1.contextBridge.exposeInMainWorld('electron', electronAPI);
