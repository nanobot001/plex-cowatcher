# Block 3-2n-5E-C: Deferred Multi-File Layouts

> Status: Deferred planning block.
> Result: Not implemented.
> Notes: Evidence inventory for multi-file audiobook layouts that are intentionally excluded from 5E-A and 5E-B; split into bounded implementation blocks before changing code.

## Goal

Preserve a clear, source-honest path for the remaining multi-file audiobooks without forcing multipart, section, generic-title, or damaged metadata into the strict chapter model.

## Evidence Groups

- **Multipart chapter files:** Lord of Chaos, A Crown of Swords, and Crossroads of Twilight contain multiple physical files for one named Prologue or chapter. Knife of Dreams also has multipart evidence plus a track/title gap. Winter's Heart begins at track 2 and ends with anomalous metadata.
- **Named nonstandard sections:** The Gathering Storm includes a Foreword. Going Postal and Raising Steam use numbered narrative sections plus credits. AI at the Edge contains named but repeated/nonchapter sections.
- **Count or identity defects:** A Memory of Light has 51 files against a catalog count of 52. These mismatches require source repair or explicit unresolved handling before chapter activation.
- **Generic repeated titles:** The Light Fantastic has 78 files with one repeated generic book title and no trustworthy stored chapter labels.

## Current Deferred Inventory

- `MULTI_FILE_CHAPTER_TITLES_UNSUPPORTED`: Lord of Chaos, A Crown of Swords, Crossroads of Twilight, The Gathering Storm, Going Postal, AI at the Edge, and The Light Fantastic.
- `MULTI_FILE_TRACK_SEQUENCE_GAP`: Knife of Dreams, Winter's Heart, and the currently stored Raising Steam revision. Raising Steam also uses numbered-section/credit semantics, so ordering correction alone is not chapter proof.
- `MULTI_FILE_CHAPTER_COUNT_MISMATCH`: A Memory of Light.

## Required Planning Before Implementation

- Re-audit each evidence group read-only against current source data or a verified copy.
- Decide separately whether the truthful unit is a chapter, chapter part, named section, track/file, or unresolved item.
- Create child tickets only after that fresh audit, using these candidate lanes:
  1. metadata/count/sequence repair for objectively recoverable source defects;
  2. multipart chapter-part grouping and book-global playback projection;
  3. named sections, forewords, numbered sections, and credits;
  4. generic repeated-title fallback only if evidence supports a truthful unit model.
- Do not create a generic fallback implementation ticket merely to empty the deferred inventory; unknown evidence may remain unresolved.
- Define playback projection and UI naming without rewriting raw observations or inventing provider labels.
- Select positive and structurally different negative canaries for each eventual block.

## Out Of Scope

- Implementing any of these layouts in this planning block.
- Synthetic chapter names for generic files.
- Silently closing track/count gaps.
- Title, author, or series allowlists.
- Broad recurring multi-file rollout.

## Acceptance Criteria

- Every remaining current multi-file revision is assigned to an evidence group with its unresolved reason.
- Future implementation tickets have one truthful media-unit model, explicit non-goals, and rollback/canary gates.
- No production state or code changes occur until a child block is reviewed and selected.

## Verification

- Read-only current-database inventory.
- Ticket review for source honesty, scope, testability, reversibility, and overengineering risk.
