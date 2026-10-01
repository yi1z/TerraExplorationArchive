# PRTS data import

The importer stores versioned source evidence locally and publishes only normalized gameplay fields, catalogue metadata and authored narrative overviews. It does not publish the full game scripts, character archives or module stories.

```powershell
# Discover all configured Cargo tables, categories, namespaces and topic prefixes.
node scripts/sync-prts.mjs --phase=discover

# Resume raw-page retrieval; existing source files are retained.
node scripts/sync-prts.mjs --phase=raw

# Compare revision IDs first. Fetch content only for changed or new pages.
node scripts/sync-prts.mjs --phase=raw --refresh

# Cache task-map rule components (also included in raw/all).
node scripts/sync-prts.mjs --phase=support

# Reproduce the public archive without network access.
node scripts/sync-prts.mjs --phase=build --offline
node scripts/prts/verify.mjs
```

`--phase=all` combines discovery, retrieval and publishing. `--refresh` refreshes API discovery requests and compares cached page revisions before downloading content. Removed source pages are reported, not deleted. A failed batch is retried on the next raw run because its missing files remain detectable.

If normal DNS repeatedly times out, `PRTS_API_IP` may specify an independently verified current public A record for `prts.wiki`; TLS still verifies the same hostname. No alternate mirror is used. The client identifies itself, observes `maxlag`, spaces requests at least 700 ms apart, retries at most four times, and retrieves raw content with at most two workers.

## Evidence and output

- `data/prts/discovery.json`: enumerated pages, source counts and exclusions.
- `data/prts/cargo/*.json`: all table schemas and paginated rows, including duplicate source rows.
- `data/prts/raw/pages/*.json`: source revision IDs, timestamps, categories and unmodified wikitext.
- `data/prts/incremental.json`: added, changed, unchanged and removed page reconciliation.
- `data/prts/editorial-pending.json` and `editorial-world-pending.json`: local narrative source material. These files are never published.
- `data/prts/operator-editorial-pending.json` and `module-editorial-pending.json`: fixed editorial assignment queues; `*-remaining.json` reports outstanding work after each build without changing assigned row numbers.
- `data/prts/editorial*.json`, excluding filenames containing `pending`: authored `entries` with `id` or `kind` + `sourceTitle`, sections and provenance. Story and community narratives are spoiler-gated. Existing 103 curated world routes retain their identity and content.
- `public/data/prts/manifest.json`: the currently published snapshot, atomically replaced after all shards exist.
- `public/data/prts/snapshots/<snapshotId>/{index,details,search}/*.json`: minified immutable snapshot shards.
- `public/data/prts/snapshots/<snapshotId>/coverage.json`: immutable source, structural and narrative coverage. The top-level `coverage.json` is a convenience mirror. Images are audited by the independent asset pipeline.
- `data/prts/support/gameplay-widgets.json`: versioned task-map components and their parent-page associations. Node rules are extracted as text; scripts are never executed. The graphical unlock links remain an explicit structural gap.

`complete` means that the required normalized schema for that entry passed its category-specific checks. It is not a claim that all prose, dynamic wiki widgets, community analyses or game mechanics have been independently verified. The manifest remains `partial` while required narrative or structural gaps remain. Community speculation and PRTS gacha simulations are explicitly distinguished from game data.

All 520 outfits are reconciled with the 25 series pages, preserving 1,499 initial, rerun and review acquisition records. Currency, original price text, numeric prices where unambiguous, date ranges and alternate payment methods remain separate; an unstated source price never implies free acquisition. The main `raw --refresh` / `support --refresh` checks series-page and currency-template revision IDs, fetching content only when changed. Activity metadata, gameplay tables and stage relations are published, while dynamic shops and missing reward structures remain partial. Furniture themes require both a furniture list and numerical tables to pass structural coverage. Certification-only modules are explicitly excluded from narrative coverage instead of being counted as missing stories.

## Stable identities

The original 103 IDs remain canonical. New page entities use `prts-<kind>-<pageId>`. Modules and outfits hash their source owner and stable local key. Embedded encyclopedia/NPC identities include the source section and portrait token or appearance record. The persisted `embedded-identities.json` registry preserves existing unambiguous routes; namesakes are never merged solely by name. Supporting citations do not establish identity: an old city record citing an event page remains a city, and the event has a distinct ID. Source-only implementation templates and demonstration values are explicitly excluded from game entities.

## Verification

`verify.mjs` checks balanced nested parameters, protected tabber pipes, comments, numerical formatting, poison-key handling, indented tables and semantic phase icons, index/detail ID parity, all relation targets, legacy IDs, embedded namesakes, public-data privacy, spoiler indexing, all inherited enemy LEVEL cases, all module level arrays, and Amiya's ordinary + mastery skill levels. It validates the published snapshot against cached source evidence without requesting the network.
