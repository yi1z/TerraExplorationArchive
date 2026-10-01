import { entries, entryById } from "../data/archive";
import type { ArchiveEntry, EntryRelationship } from "../data/types";
import type { LibraryDetail, LibrarySummary } from "../data/library-types";
import { getLibrarySummary } from "./library";

export interface RelatedRecord {
  target: string;
  label: string;
  record: LibrarySummary;
}
type RelationshipDetail = Pick<
  LibraryDetail,
  "id" | "legacyId" | "relationships"
>;
function ownRelationships(entry: ArchiveEntry): EntryRelationship[] {
  return (
    entry.relationships ??
    entry.related.map((target) => ({ target, label: "关联档案" }))
  );
}

export function relatedRecords(
  entry: ArchiveEntry,
  spoilers: boolean,
  detail: RelationshipDetail | null = null,
  {
    incomingEntries = entries,
    resolve = getLibrarySummary,
  }: {
    incomingEntries?: ArchiveEntry[];
    resolve?: (id: string) => LibrarySummary | undefined;
  } = {},
): RelatedRecord[] {
  const sourceId = resolve(entry.id)?.id ?? entry.id;
  const relations = new Map<string, RelatedRecord & { spoiler?: boolean }>();
  const add = (relation: EntryRelationship, incoming = false) => {
    const record = resolve(relation.target);
    if (!record || record.id === sourceId) return;
    const previous = relations.get(record.id);
    if (incoming && previous) return;
    relations.set(record.id, {
      target: record.id,
      label: relation.label,
      record,
      // A duplicate public link must not reveal a relationship marked as story.
      spoiler: previous?.spoiler || relation.spoiler,
    });
  };
  ownRelationships(entry).forEach((relation) => add(relation));
  if (
    detail &&
    (detail.id === sourceId ||
      detail.id === entry.id ||
      detail.legacyId === entry.id)
  )
    detail.relationships.forEach((relation) => add(relation));
  for (const candidate of incomingEntries) {
    if (candidate.id === entry.id) continue;
    const relation = ownRelationships(candidate).find(
      (link) =>
        (link.target === entry.id || resolve(link.target)?.id === sourceId) &&
        (spoilers || !link.spoiler),
    );
    if (relation)
      add(
        {
          target: candidate.id,
          label:
            relation.label === "所属势力" ? "所属干员 / 关联记录" : "关联档案",
          spoiler: relation.spoiler,
        },
        true,
      );
  }
  return [...relations.values()].filter(
    (relation) => spoilers || !relation.spoiler,
  );
}

/** Only curated geography has a known map location. */
export function relatedMapTarget(record: LibrarySummary): string | null {
  const curated = entryById[record.id] ?? entryById[record.legacyId ?? ""];
  return curated && !["operator", "enemy", "item"].includes(curated.kind)
    ? curated.id
    : null;
}
