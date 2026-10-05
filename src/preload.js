"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var electron_1 = require("electron");
var allowedSendChannels = [
    'app:minimize',
    'app:maximize',
    'app:close'
];
var allowedInvokeChannels = [
    'app:get-version'
];
var allowedOnChannels = [
    'app:message'
];
var electronAPI = {
    platform: process.platform,
    send: function (channel, data) {
        if (allowedSendChannels.includes(channel)) {
            electron_1.ipcRenderer.send(channel, data);
            return;
        }
        throw new Error("Channel \"".concat(channel, "\" is not allowed for send"));
    },
    invoke: function (channel, data) {
        if (allowedInvokeChannels.includes(channel)) {
            return electron_1.ipcRenderer.invoke(channel, data);
        }
        throw new Error("Channel \"".concat(channel, "\" is not allowed for invoke"));
    },
    on: function (channel, callback) {
        if (allowedOnChannels.includes(channel)) {
            var listener_1 = function (_, data) { return callback(data); };
            electron_1.ipcRenderer.on(channel, listener_1);
            return function () {
                electron_1.ipcRenderer.removeListener(channel, listener_1);
            };
        }
        throw new Error("Channel \"".concat(channel, "\" is not allowed for on"));
    }
};
electron_1.contextBridge.exposeInMainWorld('electron', electronAPI);
