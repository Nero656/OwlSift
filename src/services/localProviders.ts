export type LocalProvider = 'ollama' | 'lmstudio';
export type RequestProvider = LocalProvider | 'global';
export interface LocalModelConfig { enabled: boolean; provider: LocalProvider; endpoint: string; model: string; systemPrompt: string; apiKey: string }
export const localProviderIds: LocalProvider[] = ['ollama', 'lmstudio'];
export function defaultLocalModels(): Record<LocalProvider, LocalModelConfig> {
    const base = { enabled: false, model: '', apiKey: '', systemPrompt: 'You are a helpful local assistant. Answer using the supplied file context when available.' };
    return { ollama: { ...base, provider: 'ollama', endpoint: 'http://localhost:11434' }, lmstudio: { ...base, provider: 'lmstudio', endpoint: 'http://127.0.0.1:1234/v1' } };
}
/** Migrate only the legacy provider, without leaking its host/model to another profile. */
export function restoreLocalModels(stored: { localModel?: Partial<LocalModelConfig>; localModels?: Partial<Record<LocalProvider, Partial<LocalModelConfig>>>; localProvider?: LocalProvider }) {
    const models = defaultLocalModels();
    const selected = stored.localProvider === 'ollama' || stored.localProvider === 'lmstudio' ? stored.localProvider : stored.localModel?.provider === 'ollama' ? 'ollama' : 'lmstudio';
    for (const id of localProviderIds) {
        const saved = stored.localModels?.[id] ?? (stored.localModel?.provider === id || (id === 'lmstudio' && stored.localModel && !stored.localModel.provider) ? stored.localModel : undefined);
        if (!saved || typeof saved !== 'object') continue;
        for (const key of ['endpoint', 'model', 'systemPrompt', 'apiKey'] as const) if (typeof saved[key] === 'string') models[id][key] = saved[key]!;
        models[id].enabled = saved.enabled === true;
    }
    return { localModels: models, localProvider: selected };
}
export interface ProviderConnection { status: 'idle' | 'ok' | 'error'; models: string[]; error: string; checking: boolean; fingerprint: string; revision: number }
export const emptyConnection = (): ProviderConnection => ({ status: 'idle', models: [], error: '', checking: false, fingerprint: '', revision: 0 });
export const connectionFingerprint = (config: { endpoint: string; apiKey?: string; enabled?: boolean; provider: string }) => JSON.stringify([config.provider, config.endpoint.trim(), config.apiKey ?? '', config.enabled !== false]);
export function invalidateConnection(state: ProviderConnection, config: Parameters<typeof connectionFingerprint>[0]) {
    const key = connectionFingerprint(config);
    if (state.fingerprint === key) return;
    Object.assign(state, emptyConnection(), { fingerprint: key, revision: state.revision + 1 });
}
export async function connectProfile(state: ProviderConnection, config: { model: string; endpoint: string; provider: string; apiKey?: string; enabled?: boolean }, discover: () => Promise<string[]>) {
    invalidateConnection(state, config);
    const revision = ++state.revision, fingerprint = connectionFingerprint(config);
    state.checking = true; state.error = '';
    try {
        const models = await discover();
        if (state.revision !== revision || connectionFingerprint(config) !== fingerprint) return models;
        state.models = models; state.status = 'ok';
        if (!config.model && models.length) config.model = models[0]!;
        return models;
    } catch (error) {
        if (state.revision === revision && connectionFingerprint(config) === fingerprint) { state.status = 'error'; state.error = error instanceof Error ? error.message : String(error); }
        throw error;
    } finally { if (state.revision === revision) state.checking = false; }
}

export function enabledRequestProviders(config: { globalModel: { enabled: boolean }; localModels: Record<LocalProvider, { enabled: boolean }> }): RequestProvider[] {
    return (['ollama', 'lmstudio', 'global'] as const).filter(id => id === 'global' ? config.globalModel.enabled : config.localModels[id].enabled);
}
export function restoreGlobalEnabled(stored: { modelProvider?: string; globalModel?: { enabled?: boolean; apiKey?: string; model?: string } }): boolean {
    if (typeof stored.globalModel?.enabled === 'boolean') return stored.globalModel.enabled;
    return Boolean(stored.globalModel && (stored.modelProvider === 'global' || stored.globalModel.apiKey?.trim() || stored.globalModel.model?.trim()));
}
