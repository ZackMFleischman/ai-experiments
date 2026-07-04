// @lex/dict — word lists compiled to a compact DAWG (zero dependencies).
// The frozen surface (IMPLEMENTATION.md §5: DICTIONARIES, loadDictionary)
// lands with M2; this is the T0.1 placeholder type.

export interface DictionaryInfo {
  id: string;
  name: string;
  description: string;
  wordCount: number;
}
