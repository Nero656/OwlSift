# Independent providers, LAN access, and typo-tolerant search

## Provider profiles

Settings → AI models contains independent Ollama and LM Studio cards. Each has its own enable switch, server URL, API token, selected model, and system prompt. Connecting, editing, or disabling one profile does not reset the other. Both may be connected at the same time.

The default local provider is used for chats without an explicit selection. Use the **Use provider** selector in the full assistant or file assistant before submitting a request. It selects Ollama, LM Studio, or the configured global API for that chat. Requests capture their configuration before reading document context, so a later settings change cannot redirect a request already being prepared. New text replies record the provider that produced them.

Existing single-provider settings migrate into that provider's profile only; the other profile keeps its own defaults. Existing selected models are preserved across reconnects, including empty discovery replies. If a selected model no longer exists, choose one of the available models before sending. Connection status and discovered model lists are independent runtime states; verify connectivity again after restarting the application.

## Connecting another computer on the LAN

1. Start Ollama or LM Studio on the model computer and download/load the desired model.
2. Enable access from the LAN in that runtime. For Ollama, configure its listening interface through `OLLAMA_HOST`; for LM Studio, use its server's local-network settings.
3. Allow the chosen TCP port through that computer's firewall for the intended private network.
4. In OwlSift, use the model computer's LAN IP and actual port, for example:
   - Ollama: `http://192.168.1.20:11434`.
   - LM Studio: `http://192.168.1.30:1234/v1`.
5. If the server requires authentication, enter its bearer API token in the corresponding profile.
6. Enable the profile and test the connection, then select an available model.

Ollama discovers models through `/api/tags`; LM Studio uses `/v1/models`. Chat uses `/v1/chat/completions` for both. A trailing `/v1` is normalized correctly for either provider. HTTP(S), IPv4, hostnames, bracketed IPv6, custom ports, and reverse-proxy path prefixes are accepted. Do not include a full operation path, query string, or credentials in the server address.

Electron uses a cancellable main-process HTTP bridge with streamed responses, avoiding browser CORS restrictions. Browser mode attempts direct requests first and falls back to the Nuxt server only for network/CORS-style failures. Authentication and invalid API responses are not retried through another transport. API tokens travel in authorization headers for upstream calls, not in discovery query strings.

A static web deployment has no Nuxt API proxy: enable CORS for that site's origin or use the desktop application. Browsers do not reliably distinguish CORS from other network failures; the diagnostic lists both possibilities. An HTTPS page can also block an HTTP model server as mixed content. Containers/WSL need an address reachable from their own network rather than an unrelated `localhost`.

### Diagnostics

- Invalid address: enter a complete HTTP(S) server base URL with the correct port.
- Network failure: check IP, port, LAN listening, firewall, and browser CORS/mixed-content rules.
- Authentication failure (401/403): check the profile's token and its permissions.
- Invalid response: check that the URL reaches the model API, not an HTML editor, login page, or another service. Malformed JSON and invalid model-list shapes are errors, not zero models.
- Empty valid list: the server is reachable, but needs a downloaded/loaded model; check again afterward.
- Timeout: check reachability and whether a model is still loading. Discovery has a 10-second timeout; local chat transport allows up to 180 seconds.

## Typo-tolerant search

Desktop search ranks a complete phrase and exact words before prefix matches, then fuzzy matches. SQLite FTS5 ranks filename matches more strongly than indexed content. Search terms are escaped as literal text; punctuation or FTS operators cannot break the query.

A persistent word/trigram dictionary supplies bounded spelling suggestions. The dictionary is built once from an existing FTS index and updated by database triggers when files are added or their names/content change. Per-query work uses trigram lookups and FTS posting lists rather than scanning every file body. Soft-deleted and hidden files are filtered from results, and stale dictionary entries without live FTS terms are excluded from suggestions.

Browser projects use cached token postings and trigram candidates; the index is rebuilt when project files change. The Documents page preserves search relevance instead of replacing it with modification-date order.

### Bounds and limitations

- Up to 12 distinct query terms, 64 characters per term.
- One insertion, deletion, substitution, or adjacent transposition for words of 3–7 characters; up to two edits for words of 8–64 characters. Shorter words use exact/prefix matching.
- At most 256 dictionary candidates and five corrections per query term; at most 500 fuzzy result candidates on desktop. This favors responsiveness over exhaustive correction recall.
- English, Cyrillic, and accented Latin terms are covered. Transliteration, wrong-keyboard-layout conversion, OCR, embeddings, and semantic matching are not implemented.
- Only indexed content can be found. Existing document extraction and file-size limits still apply.
- The append-only suggestion dictionary can grow as documents are edited; search filters stale words, but no automatic dictionary compaction is included. First-run migration of a large existing vocabulary and browser index rebuilding have an initial cost.

## Validation

```bash
npm run test:providers
npm run test:search
npm run test:workspace
npm run test:scan
```

Focused tests cover legacy migration, concurrent connections, independent failures and invalidation, stale discovery responses, endpoint normalization, non-loopback HTTP discovery/chat, API tokens, malformed responses, diagnostics, streaming, and per-window cancellation. Search tests cover exact/fuzzy ranking, English/Cyrillic/accented text, phrases, edits/deletes, visibility, migration, browser search, and a 15,001-document fixture.

Additional integration checks used the running browser UI and actual Electron bridge against authenticated API-compatible test servers in a separate container's private network, with distinct custom ports. These fixtures verify transport and application behavior; they do not replace a deployment test against your physical LAN computer and installed Ollama/LM Studio versions. Search timings from an in-memory fixture are not a guarantee for every disk or corpus.

Official server references: [Ollama networking](https://docs.ollama.com/faq), [Ollama API](https://docs.ollama.com/api/tags), [LM Studio server](https://lmstudio.ai/docs/developer/core/server), and [LM Studio authentication](https://lmstudio.ai/docs/developer/core/authentication).
