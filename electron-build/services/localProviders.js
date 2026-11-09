"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectionFingerprint = exports.emptyConnection = exports.localProviderIds = void 0;
exports.defaultLocalModels = defaultLocalModels;
exports.restoreLocalModels = restoreLocalModels;
exports.invalidateConnection = invalidateConnection;
exports.connectProfile = connectProfile;
exports.enabledRequestProviders = enabledRequestProviders;
exports.restoreGlobalEnabled = restoreGlobalEnabled;
exports.localProviderIds = ['ollama', 'lmstudio'];
function defaultLocalModels() {
    const base = { enabled: false, model: '', apiKey: '', systemPrompt: 'You are a helpful local assistant. Answer using the supplied file context when available.' };
    return { ollama: { ...base, provider: 'ollama', endpoint: 'http://localhost:11434' }, lmstudio: { ...base, provider: 'lmstudio', endpoint: 'http://127.0.0.1:1234/v1' } };
}
/** Migrate only the legacy provider, without leaking its host/model to another profile. */
function restoreLocalModels(stored) {
    const models = defaultLocalModels();
    const selected = stored.localProvider === 'ollama' || stored.localProvider === 'lmstudio' ? stored.localProvider : stored.localModel?.provider === 'ollama' ? 'ollama' : 'lmstudio';
    for (const id of exports.localProviderIds) {
        const saved = stored.localModels?.[id] ?? (stored.localModel?.provider === id || (id === 'lmstudio' && stored.localModel && !stored.localModel.provider) ? stored.localModel : undefined);
        if (!saved || typeof saved !== 'object')
            continue;
        for (const key of ['endpoint', 'model', 'systemPrompt', 'apiKey'])
            if (typeof saved[key] === 'string')
                models[id][key] = saved[key];
        models[id].enabled = saved.enabled === true;
    }
    return { localModels: models, localProvider: selected };
}
const emptyConnection = () => ({ status: 'idle', models: [], error: '', checking: false, fingerprint: '', revision: 0 });
exports.emptyConnection = emptyConnection;
const connectionFingerprint = (config) => JSON.stringify([config.provider, config.endpoint.trim(), config.apiKey ?? '', config.enabled !== false]);
exports.connectionFingerprint = connectionFingerprint;
function invalidateConnection(state, config) {
    const key = (0, exports.connectionFingerprint)(config);
    if (state.fingerprint === key)
        return;
    Object.assign(state, (0, exports.emptyConnection)(), { fingerprint: key, revision: state.revision + 1 });
}
async function connectProfile(state, config, discover) {
    invalidateConnection(state, config);
    const revision = ++state.revision, fingerprint = (0, exports.connectionFingerprint)(config);
    state.checking = true;
    state.error = '';
    try {
        const models = await discover();
        if (state.revision !== revision || (0, exports.connectionFingerprint)(config) !== fingerprint)
            return models;
        state.models = models;
        state.status = 'ok';
        if (!config.model && models.length)
            config.model = models[0];
        return models;
    }
    catch (error) {
        if (state.revision === revision && (0, exports.connectionFingerprint)(config) === fingerprint) {
            state.status = 'error';
            state.error = error instanceof Error ? error.message : String(error);
        }
        throw error;
    }
    finally {
        if (state.revision === revision)
            state.checking = false;
    }
}
function enabledRequestProviders(config) {
    return ['ollama', 'lmstudio', 'global'].filter(id => id === 'global' ? config.globalModel.enabled : config.localModels[id].enabled);
}
function restoreGlobalEnabled(stored) {
    if (typeof stored.globalModel?.enabled === 'boolean')
        return stored.globalModel.enabled;
    return Boolean(stored.globalModel && (stored.modelProvider === 'global' || stored.globalModel.apiKey?.trim() || stored.globalModel.model?.trim()));
}
