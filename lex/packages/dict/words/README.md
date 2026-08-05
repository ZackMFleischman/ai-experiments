# Vendored word lists — provenance & licenses (T2.1)

- `enable1.txt` — ENABLE (Enhanced North American Benchmark LExicon), compiled
  by Alan Beale and M. Cooper. **Public domain.** Vendored 2026-07-04 from the
  mirror `github.com/dolph/dictionary` (canonical distribution long offline).
  172,823 words, one per line, lowercase, LF.
  sha256 `3f16130220645692ed49c7134e24a18504c2ca55b3c012f7290e3e77c63b1a89`.
- `2of12inf.txt` — the 12dicts "2of12inf" inflected list by Alan Beale,
  v6.0.2, vendored 2026-07-04 from the official SourceForge package
  (`downloads.sourceforge.net/wordlist/12dicts-6.0.2.zip`, `American/`).
  Released to the public domain by the author; the list's dependency on AGID
  imposes AGID's terms — see the vendored `agid.txt`. Kept pristine: CRLF,
  81,883 lines, `%` marks plurals of uncountables and `!` marks neologisms;
  the DAWG build strips markers and keeps the words (all 81,883 survive,
  unique, `[a-z]{2,}`).
  sha256 `5fdcda90fd5193b4a98503e9d8eecbac3b1cc725f7f47aee082e06fa793c90e5`.
- `agid.txt` — AGID license/notice file from the same 12dicts package,
  governing `2of12inf.txt`.
- `nwl2023.txt` — the **NASPA Word List 2023** (NWL2023), the North American
  tournament word list. Vendored 2026-07-08 from `github.com/scrabblewords/
  scrabblewords` (`words/North-American/NWL2023.txt`). The source file carries a
  definition per line; the vendored list is its first column, one word per line,
  LF, source order preserved — reproduce with `cut -d' ' -f1 NWL2023.txt`.
  196,601 words, uppercase A–Z, length 2–15.
  sha256 `120cbfa8d596baa2c17328ceed75dec91e4c6863e356004b2306b4f5190c830c`.
  **Not public domain:** NWL2023 is copyrighted (© 2023 NASPA, derived from the
  Merriam-Webster Official Tournament and Club Word List). Included at the repo
  owner's direction (DESIGN §5.4); redistribution terms are NASPA's, not this
  project's.

## Definition sources (glossary, DESIGN §5.5)

- `wordnet-glosses.txt` — derived from **WordNet 3.0** (Princeton University),
  vendored 2026-08-05 from the `wordnet-db` npm package, which redistributes the
  `dict/data.*` files verbatim. The WordNet licence is permissive (use, copy,
  modify and distribute for any purpose without fee, provided the copyright
  notice and disclaimer travel with it) — its full text ships as `wordnet.txt`.
  Not vendored pristine: the upstream synset records are ~22 MB and encode far
  more than a gloss, so this is a **reproducible projection** of them —
  `word<TAB>pos<TAB>gloss`, one line per single-word lemma some list here can
  reach, first definition clause only, ≤160 chars, LF, sorted. Regenerate with
  `pnpm derive:glosses <wordnet-dict-dir>` (`src/derive-glosses.ts` documents
  each step); it rewrites this file in place and must produce it byte-for-byte.
  58,002 lemmas.
  sha256 `31735630c36cc00804bc0287b9cb965335071a88fff2d7a9523eacbe69b214cd`.
- `curated-glosses.txt` — **hand-authored**, and the one file here that is: it
  seeds every two-letter word playable in any list above (107 of them, the union
  of `enable1`/`2of12inf`/`nwl2023`), because WordNet has no entry for a third of
  them (JO, XU, ZA, QI…) and those are exactly the words players challenge.
  Same `word<TAB>pos<TAB>gloss` format; curated entries win over WordNet ones.
  `test/glossary.test.ts` fails if any two-letter word in any registry
  dictionary loses its definition.

Everything except `curated-glosses.txt` is data, never hand-edited; tests pin the
hashes and counts.
