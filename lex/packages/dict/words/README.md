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

These files are data, never hand-edited; tests pin the hashes and counts.
