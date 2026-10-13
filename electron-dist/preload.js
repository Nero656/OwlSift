"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const allowedSendChannels = [
    'app:minimize',
    'app:maximize',
    'app:close'
];
const allowedInvokeChannels = [
    'app:get-version',
    'db:get-status',
    'files:list',
    'files:add-tag',
    'files:remove-tag',
    'files:set-note',
    'files:open',
    'files:show-in-folder',
    'files:delete',
    'files:delete-from-disk',
    'files:get-image-preview',
    'files:folders',
    'files:search',
    'files:choose-and-index',
    'folders:remove-from-index'
];
const allowedOnChannels = [
    'app:message'
];
const electronAPI = {
    platform: process.platform,
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
