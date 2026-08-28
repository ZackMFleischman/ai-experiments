// @lex/dict — word lists compiled to a compact DAWG. This surface is frozen
// (IMPLEMENTATION.md §5); the sync node variant lives at '@lex/dict/node'
// so the browser surface stays exactly this.
export { DICTIONARIES, type DictionaryInfo } from './registry.js';
export { loadDictionary } from './loader.js';
export { lookupGloss, resetGlossCache } from './gloss-loader.js';
export { GLOSS_BASE_PATH, type GlossEntry } from './glossary.js';
