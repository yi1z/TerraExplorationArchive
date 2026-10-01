import { clean, parseTemplates, rawContent } from "./wikitext.mjs";

function addRelation(record, target, label, spoiler) {
  if (
    !record.relationships.some(
      (relation) =>
        relation.target === target &&
        relation.label === label &&
        Boolean(relation.spoiler) === Boolean(spoiler),
    )
  )
    record.relationships.push({
      target,
      label,
      ...(spoiler ? { spoiler: true } : {}),
    });
}

function addSource(record, source) {
  const sources = (record.additionalSources ??= []);
  if (!sources.some((existing) => existing.url === source.url))
    sources.push(source);
}

/** Names alone are not identities: both the game ID and the stated use must agree. */
export function linkPotentialTokens(records) {
  const operators = new Map();
  for (const record of records) {
    if (record.kind !== "operator") continue;
    for (const id of record.aliases.filter((alias) => /^char_/.test(alias))) {
      const candidates = operators.get(id) ?? [];
      candidates.push(record);
      operators.set(id, candidates);
    }
  }
  const audit = { ordinary: 0, kernel: 0, matched: [], unresolved: [] };
  for (const record of records) {
    if (record.kind !== "item") continue;
    const params = record.templates.find((t) => t.name === "道具信息")?.params;
    const category = params?.分类 ?? record.fields.identity?.分类;
    if (!["信物", "中坚信物"].includes(category)) continue;
    const itemId = params?.itemId;
    const match = /^(class_)?p_(char_[A-Za-z0-9_]+)$/.exec(itemId ?? "");
    // Generic class tokens do not have an individual operator owner.
    if (!match) continue;
    const candidates = operators.get(match[2]) ?? [];
    const purpose = clean(params.用途 ?? "")
      .trim()
      .replace(/[。.]$/, "");
    const target = candidates.length === 1 ? candidates[0] : undefined;
    if (
      !target ||
      purpose !== `用于提升${target.name}的潜能` ||
      Boolean(match[1]) !== (category === "中坚信物") ||
      target.facets.type?.includes("召唤物")
    ) {
      audit.unresolved.push({
        id: record.id,
        itemId,
        reason: !target ? "游戏ID无唯一干员" : "用途或信物类别不一致",
      });
      continue;
    }
    addRelation(record, target.id, "潜能提升干员");
    addRelation(target, record.id, category);
    audit[match[1] ? "kernel" : "ordinary"]++;
    audit.matched.push({
      id: record.id,
      target: target.id,
      gameId: match[2],
      itemId,
      category,
      sourceRevision: record.source.revisionId,
      operatorRevision: target.source.revisionId,
    });
  }
  return audit;
}

/** The reverse label is an authoring field, never part of the public relation. */
export function applyAuthoredRelationships(records, amendments) {
  const byId = new Map(records.map((record) => [record.id, record]));
  let count = 0;
  for (const amendment of amendments) {
    const record = byId.get(amendment.id);
    if (!record) throw new Error(`Unknown relationship owner: ${amendment.id}`);
    for (const relation of amendment.relationships ?? []) {
      const target = byId.get(relation.target);
      if (!target || !relation.label || target === record)
        throw new Error(
          `Invalid relationship: ${amendment.id} -> ${relation.target}`,
        );
      addRelation(record, target.id, relation.label, relation.spoiler);
      if (relation.reverseLabel)
        addRelation(target, record.id, relation.reverseLabel, relation.spoiler);
      count++;
    }
  }
  return count;
}

/** Small reviewed corrections are published during import, not overlaid only in React. */
export function applyReviewedAmendments(records, evidence, rawById) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const audit = { potential: [], acquisition: [], relationships: 0 };
  for (const amendment of evidence.potential ?? []) {
    const record = byId.get(amendment.id);
    if (!record || !record.aliases.includes(amendment.characterId))
      throw new Error(`Potential identity mismatch: ${amendment.id}`);
    const changes = record.fields.attributes?.潜能提升;
    const change = changes?.[amendment.rank - 2];
    if (change?.属性 !== amendment.attribute)
      throw new Error(`Potential rank mismatch: ${amendment.id}`);
    if (
      amendment.gameEvidence.description !== `攻击力+${amendment.value}` ||
      amendment.gameEvidence.modifier.attributeType !== "ATK" ||
      amendment.gameEvidence.modifier.formulaItem !== "ADDITION" ||
      amendment.gameEvidence.modifier.value !== amendment.value
    )
      throw new Error(`Potential evidence mismatch: ${amendment.id}`);
    change.变化 = String(amendment.value);
    record.fields.潜能核验 = {
      潜能等级: amendment.rank,
      核验结果: `攻击力+${amendment.value}`,
      说明: amendment.note,
      游戏角色ID: amendment.characterId,
      数据版本: amendment.gameSource.commit,
    };
    addSource(record, amendment.source);
    addSource(record, {
      title: `国服游戏角色表 · ${amendment.characterId} 潜能核验`,
      url: amendment.gameSource.url,
      publisher: "游戏数据 / Kengxxiao 社区镜像",
    });
    const title = "潜能数值核验";
    record.sections = record.sections.filter(
      (section) => section.title !== title,
    );
    record.sections.push({
      title,
      body: amendment.note,
      sourceKind: "gameplay",
    });
    audit.potential.push({
      id: record.id,
      rank: amendment.rank,
      value: amendment.value,
    });
  }
  for (const amendment of evidence.acquisition ?? []) {
    const record = byId.get(amendment.id);
    const stage = byId.get(amendment.stageId);
    const raw = rawById.get(record?.source.pageId);
    const source = parseTemplates(rawContent(raw)).find(
      (template) => template.name === "干员获得方式",
    );
    const coverage = source?.params.覆盖 ?? "";
    const links = [...coverage.matchAll(/\[\[([^|\]#]+)(?:[^\]]*)\]\]/g)].map(
      (match) => match[1].replaceAll("_", " "),
    );
    const drop = stage?.fields.drops?.some(
      (entry) =>
        entry.类型 === "首次" &&
        entry.道具 === record?.name &&
        entry.条件 === "固定掉落",
    );
    if (!record || !stage || !links.includes(stage.source.title) || !drop)
      throw new Error(`Acquisition evidence mismatch: ${amendment.id}`);
    record.fields.acquisition = {
      ...record.fields.acquisition,
      具体获得方式: clean(coverage),
      主线首次奖励: `${stage.source.title}（首次通关固定获得）`,
    };
    record.facts = record.facts.filter((fact) => fact.label !== "主线获取");
    record.facts.push({
      label: "主线获取",
      value: `${stage.source.title}（首次通关）`,
    });
    addRelation(record, stage.id, "主线获取关卡");
    addRelation(stage, record.id, "首次通关干员奖励");
    for (const source of amendment.sources) addSource(record, source);
    audit.acquisition.push({ id: record.id, stageId: stage.id });
  }
  audit.relationships = applyAuthoredRelationships(
    records,
    evidence.relationships ?? [],
  );
  return audit;
}
