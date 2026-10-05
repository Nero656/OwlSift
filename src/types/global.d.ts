export interface IElectronAPI {
    platform: NodeJS.Platform;
    send: (channel: 'app:minimize' | 'app:maximize' | 'app:close', data?: unknown) => void;
    invoke: (channel: 'app:get-version', data?: unknown) => Promise<string>;
    on: (channel: 'app:message', callback: (data: unknown) => void) => () => void;
}

declare global {
    interface Window {
        electron: IElectronAPI;
    }
}