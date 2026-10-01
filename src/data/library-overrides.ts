import { entryById, sources } from "./archive";
import type { LibraryDetail, LibrarySource } from "./library-types";

/** Reviewed amendments layered over versioned snapshots; never mutate downloaded data. */
export const libraryDetailOverrides: Record<
  string,
  {
    source: LibrarySource;
    relationships: LibraryDetail["relationships"];
    missingFacts?: string[];
  }
> = {
  "prts-operator-1719": {
    source: {
      title: "杰西卡 · 关联与潜能资料核对",
      pageId: 1719,
      revisionId: 392142,
      url: "https://prts.wiki/w/杰西卡?oldid=392142",
      publisher: "PRTS 玩家社区 / 游戏资料",
    },
    relationships: [
      { target: "prts-operator-58745", label: "异格干员", spoiler: true },
    ],
  },
  "prts-operator-58745": {
    source: {
      title: "涤火杰西卡 · 异格关联核对",
      pageId: 58745,
      revisionId: 429200,
      url: "https://prts.wiki/w/涤火杰西卡?oldid=429200",
      publisher: "PRTS 玩家社区 / 游戏资料",
    },
    relationships: [
      {
        target: "prts-operator-1719",
        label: "同一人物的早期干员档案",
        spoiler: true,
      },
    ],
  },
};

export function applyLibraryDetailOverrides(
  entry: LibraryDetail,
): LibraryDetail {
  let result = entry;
  if (entry.id === "leithanien" && entry.kind === "country") {
    const curated = entryById.leithanien;
    const source = sources["source-leithanien"];
    const facts = new Map(entry.facts.map((fact) => [fact.label, fact]));
    for (const fact of curated.facts) facts.set(fact.label, fact);
    const amendmentSource: LibrarySource = {
      title: source.title + " · 地理、制度与机构补订",
      url: source.url + "?oldid=337057",
      pageId: 21739,
      revisionId: 337057,
      publisher: "PRTS 社区考据",
    };
    const additionalSources = [...(entry.additionalSources ?? [])];
    if (
      !additionalSources.some(
        (existing) => existing.url === amendmentSource.url,
      )
    )
      additionalSources.push(amendmentSource);
    result = {
      ...entry,
      summary: curated.summary,
      summaryStatus: "curated",
      facts: [...facts.values()],
      sections: curated.sections.map((section) => ({
        ...section,
        sourceKind: "community",
      })),
      additionalSources,
    };
  }
  const override = Object.hasOwn(libraryDetailOverrides, entry.id)
    ? libraryDetailOverrides[entry.id]
    : undefined;
  if (!override) return result;
  const relations = [...result.relationships];
  for (const relation of override.relationships)
    if (
      !relations.some(
        (existing) =>
          existing.target === relation.target &&
          existing.label === relation.label,
      )
    )
      relations.push(relation);
  const additionalSources = [...(result.additionalSources ?? [])];
  if (!additionalSources.some((source) => source.url === override.source.url))
    additionalSources.push(override.source);
  return {
    ...result,
    relationships: relations,
    additionalSources,
    missingFacts: [
      ...new Set([
        ...(result.missingFacts ?? []),
        ...(override.missingFacts ?? []),
      ]),
    ],
  };
}
