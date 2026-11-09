"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserSearch = void 0;
const fuzzySearch_1 = require("./fuzzySearch");
/** Rebuilt when project files change, never by scanning all document bodies per keystroke. */
class BrowserSearch {
    postings = new Map();
    grams = new Map();
    words;
    files = new Map();
    filenames = new Map();
    constructor(files) {
        for (const file of files) {
            this.files.set(file.id, file);
            this.filenames.set(file.id, (0, fuzzySearch_1.foldFilename)(file.name));
            for (const [text, weight] of [[file.content || file.snippet || '', 1], [file.note || '', 1], [file.tags.join(' '), 3], [file.name, 10]]) {
                for (const term of (0, fuzzySearch_1.searchTerms)(text)) {
                    if (term.length > 64)
                        continue;
                    if (!this.postings.has(term))
                        this.postings.set(term, new Map());
                    this.postings.get(term).set(file.id, Math.max(weight, this.postings.get(term).get(file.id) ?? 0));
                }
            }
        }
        this.words = [...this.postings.keys()].sort();
        for (const word of this.words)
            if (word.length >= 3)
                for (const gram of (0, fuzzySearch_1.wordGrams)(word)) {
                    if (!this.grams.has(gram))
                        this.grams.set(gram, new Set());
                    this.grams.get(gram).add(word);
                }
    }
    search(query) {
        const terms = (0, fuzzySearch_1.searchTerms)(query).filter(t => t.length <= 64).slice(0, 12);
        const nameTerms = (0, fuzzySearch_1.filenameSearchTerms)(query);
        if (!nameTerms.length)
            return [];
        let scores;
        for (const term of terms) {
            const alternatives = new Map();
            alternatives.set(term, { tier: 0, distance: 0 });
            let low = 0, high = this.words.length;
            while (low < high) {
                const mid = (low + high) >>> 1;
                if (this.words[mid] < term)
                    low = mid + 1;
                else
                    high = mid;
            }
            for (let i = low; i < this.words.length && i < low + 256 && this.words[i].startsWith(term); i++)
                if (this.words[i] !== term)
                    alternatives.set(this.words[i], { tier: 1, distance: 0 });
            if (term.length >= 3) {
                const counts = new Map();
                for (const gram of (0, fuzzySearch_1.wordGrams)(term))
                    for (const word of this.grams.get(gram) ?? [])
                        if (Math.abs(word.length - term.length) <= 2)
                            counts.set(word, (counts.get(word) ?? 0) + 1);
                const max = term.length >= 8 ? 2 : 1;
                const candidates = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 256).map(([word]) => ({ word, distance: (0, fuzzySearch_1.typoDistance)(term, word, max) })).filter(c => c.distance > 0 && c.distance <= max).sort((a, b) => a.distance - b.distance).slice(0, 5);
                for (const c of candidates)
                    if (!alternatives.has(c.word))
                        alternatives.set(c.word, { tier: 2, distance: c.distance });
            }
            const hits = new Map();
            for (const [word, quality] of alternatives)
                for (const [id, weight] of this.postings.get(word) ?? []) {
                    const old = hits.get(id), next = { ...quality, weight };
                    if (!old || next.tier < old.tier || (next.tier === old.tier && (next.distance < old.distance || (next.distance === old.distance && weight > old.weight))))
                        hits.set(id, next);
                }
            if (!scores)
                scores = hits;
            else
                for (const [id, score] of scores) {
                    const hit = hits.get(id);
                    if (!hit)
                        scores.delete(id);
                    else
                        scores.set(id, { tier: Math.max(score.tier, hit.tier), distance: score.distance + hit.distance, weight: score.weight + hit.weight });
                }
            if (!scores.size)
                break;
        }
        scores ??= new Map();
        for (const [id, name] of this.filenames) {
            if (nameTerms.every(term => name.includes(term)) && (scores.get(id)?.tier ?? Infinity) > 1) {
                scores.set(id, { tier: 1, distance: 0, weight: 10 });
            }
        }
        const phrase = terms.join(' ');
        return [...scores].sort(([a, x], [b, y]) => x.tier - y.tier || x.distance - y.distance || (((0, fuzzySearch_1.searchTerms)(this.files.get(b).name).join(' ').includes(phrase) ? 20 : 0) + y.weight) - (((0, fuzzySearch_1.searchTerms)(this.files.get(a).name).join(' ').includes(phrase) ? 20 : 0) + x.weight) || a - b).map(([id]) => this.files.get(id));
    }
}
exports.BrowserSearch = BrowserSearch;
