import type Database from 'better-sqlite3';

export const foldFilename = (name: string) => name.normalize('NFC').toLowerCase();
export const filenameSearchTerms = (query: string) => foldFilename(query).trim().split(/\s+/).filter(Boolean).slice(0, 12);
export function searchTerms(text: string): string[] {
    if (!/[^\x00-\x7f]/.test(text)) return [...new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? [])];
    return [...new Set((text.normalize('NFC').replace(/\p{Script=Latin}/gu, char => char.normalize('NFD').replace(/\p{M}/gu, '')).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []))];
}
export function wordGrams(word: string): string[] {
    const padded = '^^' + word + '$$';
    return [...new Set(Array.from({ length: padded.length - 2 }, (_, i) => padded.slice(i, i + 3)))];
}
/** Bounded optimal-string-alignment distance, including adjacent transpositions. */
export function typoDistance(a: string, b: string, maximum = 2): number {
    if (Math.abs(a.length - b.length) > maximum) return maximum + 1;
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i), before = previous;
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        for (let j = 1; j <= b.length; j++) {
            row[j] = Math.min(row[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j]!, before[j - 2]! + 1);
        }
        before = previous; previous = row;
    }
    return previous[b.length]!;
}
const quote = (term: string) => '"' + term.replace(/"/g, '""') + '"';
export class FileSearch {
    constructor(private db: Database.Database) {}
    initialize() {
        const exists = this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='search_words'").get();
        this.db.function('owlsift_filename_fold', { deterministic: true }, foldFilename);
        this.db.function('owlsift_terms', { deterministic: true }, (text: string) => JSON.stringify(searchTerms(text).filter(w => w.length >= 3 && w.length <= 64)));
        this.db.function('owlsift_grams', { deterministic: true }, (word: string) => JSON.stringify(wordGrams(word)));
        this.db.transaction(() => {
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS search_words(word TEXT PRIMARY KEY, length INTEGER NOT NULL) WITHOUT ROWID;
                CREATE TABLE IF NOT EXISTS search_grams(gram TEXT NOT NULL, word TEXT NOT NULL, PRIMARY KEY(gram,word)) WITHOUT ROWID;
                CREATE VIRTUAL TABLE IF NOT EXISTS search_vocab USING fts5vocab(files_fts, 'row');
                CREATE TRIGGER IF NOT EXISTS search_word_insert AFTER INSERT ON search_words BEGIN
                  INSERT OR IGNORE INTO search_grams(gram,word) SELECT value,new.word FROM json_each(owlsift_grams(new.word));
                END;
                DROP TRIGGER IF EXISTS search_file_insert;
                DROP TRIGGER IF EXISTS search_file_update;
                CREATE TRIGGER search_file_insert AFTER INSERT ON files BEGIN
                  INSERT INTO search_words(word,length) SELECT value,length(value) FROM json_each(owlsift_terms(new.name || ' ' || new.content)) WHERE true ON CONFLICT(word) DO NOTHING;
                END;
                CREATE TRIGGER search_file_update AFTER UPDATE OF name,content ON files WHEN old.name != new.name OR old.content != new.content BEGIN
                  INSERT INTO search_words(word,length) SELECT value,length(value) FROM json_each(owlsift_terms(new.name || ' ' || new.content)) WHERE true ON CONFLICT(word) DO NOTHING;
                END;
            `);
            // One-time migration from the existing FTS vocabulary, never a per-query content scan.
            if (!exists) this.db.exec('INSERT OR IGNORE INTO search_words SELECT term,length(term) FROM search_vocab WHERE length(term) BETWEEN 3 AND 64');
        })();
    }
    suggestions(term: string): string[] {
        if (term.length < 3 || term.length > 64) return [];
        const grams = wordGrams(term), maximum = term.length >= 8 ? 2 : 1;
        const candidates = this.db.prepare(`SELECT w.word, count(*) AS overlap FROM search_grams g JOIN search_words w ON w.word=g.word
          WHERE g.gram IN (${grams.map(() => '?').join(',')}) AND w.length BETWEEN ? AND ? AND EXISTS(SELECT 1 FROM search_vocab v WHERE v.term=w.word)
          GROUP BY w.word ORDER BY overlap DESC, abs(w.length-?), w.word LIMIT 256`).all(...grams, term.length - maximum, term.length + maximum, term.length) as { word: string; overlap: number }[];
        return candidates.map(c => ({ ...c, distance: typoDistance(term, c.word, maximum) })).filter(c => c.distance > 0 && c.distance <= maximum)
            .sort((a,b) => a.distance-b.distance || b.overlap-a.overlap || a.word.localeCompare(b.word)).slice(0,5).map(c => c.word);
    }
    search(query: string, requestedLimit: number): any[] {
        const terms = searchTerms(query).filter(w => w.length <= 64).slice(0,12);
        const nameTerms = filenameSearchTerms(query);
        if (!nameTerms.length) return [];
        const limit = Math.max(1, Math.min(10000, Math.floor(requestedLimit) || 50));
        const run = (match: string, count: number) => this.db.prepare(`SELECT f.id,f.path,f.name,f.extension,f.size,f.mtime,
          snippet(files_fts, -1, '<mark>', '</mark>', '...', 20) AS snippet,
          snippet(files_fts, 1, char(1), char(2), '…', 20) AS contentMatch
          FROM files_fts JOIN files f ON f.id=files_fts.rowid
          WHERE files_fts MATCH ? AND f.is_deleted=0 AND owlsift_file_visible(f.path)=1
          ORDER BY bm25(files_fts,10.0,1.0),f.id LIMIT ?`).all(match,count) as { id:number }[];
        const exact = terms.map(quote).join(' AND ');
        const prefixes = terms.map(term => quote(term) + '*').join(' AND ');
        const matches = new Map<number, any>();
        const add = (rows: any[]) => { for (const row of rows) if (!matches.has(row.id) && matches.size < limit) matches.set(row.id,row); };
        // Full phrase, all exact words, then prefixes, always before fuzzy results.
        const phrase = quote(terms.join(' '));
        if (terms.length) {
            add(run(phrase, limit));
            if (terms.length > 1 && matches.size < limit) add(run('(' + exact + ') NOT ' + phrase, limit - matches.size));
            if (matches.size < limit) add(run('(' + prefixes + ') NOT (' + exact + ')', limit - matches.size));
        }
        if (matches.size < limit) {
            // Token search cannot find fragments inside a filename word or punctuation-only names.
            const conditions = nameTerms.map(() => 'instr(owlsift_filename_fold(f.name), ?) > 0').join(' AND ');
            add(this.db.prepare(`SELECT f.id,f.path,f.name,f.extension,f.size,f.mtime,substr(f.content,1,240) AS snippet
              FROM files f WHERE f.is_deleted=0 AND ${conditions} AND owlsift_file_visible(f.path)=1
              ORDER BY f.name COLLATE NOCASE, f.id LIMIT ?`).all(...nameTerms,limit));
        }
        if (terms.length && matches.size < limit) {
            const alternatives = terms.map(term => this.suggestions(term));
            if (alternatives.some(words => words.length)) {
                const expanded = terms.map((term, index) =>
                    '(' + [quote(term) + '*', ...alternatives[index]!.map(quote)].join(' OR ') + ')'
                ).join(' AND ');
                add(run(expanded, Math.min(limit, 500)));
            }
        }
        // Preserve the existing tag-search feature without interpreting FTS operators.
        if (terms.length && matches.size < limit) {
            const escape = (value: string) => value.replace(/[\\%_]/g, char => '\\' + char);
            add(this.db.prepare(`SELECT f.id,f.path,f.name,f.extension,f.size,f.mtime,substr(f.content,1,240) AS snippet FROM files f
              WHERE f.id IN (SELECT t.file_id FROM file_tags t WHERE ${terms.map(() => "LOWER(t.tag) LIKE ? ESCAPE '\\'").join(' OR ')})
              AND f.is_deleted=0 AND owlsift_file_visible(f.path)=1 ORDER BY f.name LIMIT ?`).all(...terms.map(t => '%'+escape(t)+'%'),limit));
        }
        return [...matches.values()].map(record => {
            if (!record.contentMatch?.includes('\u0001')) delete record.contentMatch;
            return record;
        });
    }
}
