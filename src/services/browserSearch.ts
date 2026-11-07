import { filenameSearchTerms, foldFilename, searchTerms, wordGrams, typoDistance } from './fuzzySearch';
interface SearchFile { id: number; name: string; content?: string; snippet?: string; note?: string; tags: string[] }
/** Rebuilt when project files change, never by scanning all document bodies per keystroke. */
export class BrowserSearch<T extends SearchFile> {
    private postings = new Map<string, Map<number, number>>();
    private grams = new Map<string, Set<string>>();
    private words: string[];
    private files = new Map<number,T>();
    private filenames = new Map<number, string>();
    constructor(files: T[]) {
        for (const file of files) {
            this.files.set(file.id,file);
            this.filenames.set(file.id, foldFilename(file.name));
            for (const [text,weight] of [[file.content || file.snippet || '',1],[file.note || '',1],[file.tags.join(' '),3],[file.name,10]] as const) {
                for (const term of searchTerms(text)) {
                    if (term.length > 64) continue;
                    if (!this.postings.has(term)) this.postings.set(term,new Map());
                    this.postings.get(term)!.set(file.id,Math.max(weight,this.postings.get(term)!.get(file.id) ?? 0));
                }
            }
        }
        this.words = [...this.postings.keys()].sort();
        for (const word of this.words) if (word.length >= 3) for (const gram of wordGrams(word)) { if (!this.grams.has(gram)) this.grams.set(gram,new Set()); this.grams.get(gram)!.add(word); }
    }
    search(query: string): T[] {
        const terms = searchTerms(query).filter(t=>t.length<=64).slice(0,12);
        const nameTerms = filenameSearchTerms(query);
        if (!nameTerms.length) return [];
        let scores: Map<number,{tier:number;distance:number;weight:number}> | undefined;
        for (const term of terms) {
            const alternatives = new Map<string,{tier:number;distance:number}>();
            alternatives.set(term,{tier:0,distance:0});
            let low=0,high=this.words.length;
            while (low<high) { const mid=(low+high)>>>1; if (this.words[mid]!<term) low=mid+1; else high=mid; }
            for (let i=low;i<this.words.length && i<low+256 && this.words[i]!.startsWith(term);i++) if(this.words[i]!==term) alternatives.set(this.words[i]!,{tier:1,distance:0});
            if (term.length>=3) {
                const counts=new Map<string,number>();
                for(const gram of wordGrams(term)) for(const word of this.grams.get(gram) ?? []) if(Math.abs(word.length-term.length)<=2)counts.set(word,(counts.get(word)??0)+1);
                const max=term.length>=8?2:1;
                const candidates=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,256).map(([word])=>({word,distance:typoDistance(term,word,max)})).filter(c=>c.distance>0 && c.distance<=max).sort((a,b)=>a.distance-b.distance).slice(0,5);
                for(const c of candidates) if(!alternatives.has(c.word))alternatives.set(c.word,{tier:2,distance:c.distance});
            }
            const hits=new Map<number,{tier:number;distance:number;weight:number}>();
            for(const [word,quality] of alternatives)for(const [id,weight]of this.postings.get(word)??[]){
                const old=hits.get(id),next={...quality,weight};
                if(!old||next.tier<old.tier||(next.tier===old.tier && (next.distance<old.distance || (next.distance===old.distance && weight>old.weight))))hits.set(id,next);
            }
            if(!scores)scores=hits;
            else for(const [id,score]of scores){const hit=hits.get(id);if(!hit)scores.delete(id);else scores.set(id,{tier:Math.max(score.tier,hit.tier),distance:score.distance+hit.distance,weight:score.weight+hit.weight});}
            if (!scores.size) break;
        }
        scores ??= new Map();
        for (const [id, name] of this.filenames) {
            if (nameTerms.every(term => name.includes(term)) && (scores.get(id)?.tier ?? Infinity) > 1) {
                scores.set(id, { tier: 1, distance: 0, weight: 10 });
            }
        }
        const phrase=terms.join(' ');
        return [...scores].sort(([a,x],[b,y])=>x.tier-y.tier||x.distance-y.distance||((searchTerms(this.files.get(b)!.name).join(' ').includes(phrase)?20:0)+y.weight)-((searchTerms(this.files.get(a)!.name).join(' ').includes(phrase)?20:0)+x.weight)||a-b).map(([id])=>this.files.get(id)!);
    }
}
