/** Parse revision-pinned PRTS outfit acquisition facts; no price guesses or live availability claims. */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseTemplates, rawContent, clean } from "../prts/wikitext.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const normalize = (value) =>
  String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
export const outfitAcquisitionKey = (operatorName, sequence) =>
  `${normalize(operatorName)}:${String(sequence).trim()}`;
const wiki = (title, anchor) =>
  `https://prts.wiki/w/${encodeURIComponent(title)}${anchor ? `#${encodeURIComponent(anchor.replaceAll(" ", "_"))}` : ""}`;

function readable(value = "") {
  let source = String(value);
  // Generic wikitext cleaning intentionally discards named popup fields; here their
  // regional redemption limits and bundle conditions are material acquisition facts.
  const popups = parseTemplates(source).filter((template) =>
    /^popup$/i.test(template.name),
  );
  for (const popup of popups.sort((a, b) => b.start - a.start)) {
    source =
      source.slice(0, popup.start) +
      `（${popup.params["内容"] || popup.params["1"] || ""}）` +
      source.slice(popup.end);
  }
  return clean(source).replace(/\s+/g, " ").trim();
}

function sourceFor(page, name) {
  const revision = page.revisions?.[0];
  return {
    title: page.title,
    url: wiki(page.title, name),
    pageId: page.pageid ?? page.pageId,
    revisionId: revision?.revid,
    timestamp: revision?.timestamp,
  };
}

function eventsIn(value = "") {
  const links = [...String(value).matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)];
  const seen = new Set();
  return links.flatMap((match) => {
    const [title, anchor] = match[1].split("#");
    if (/^(文件|File|Image|分类):/i.test(title)) return [];
    const url = wiki(title, anchor);
    if (seen.has(url)) return [];
    seen.add(url);
    return [{ title: title + (anchor ? `#${anchor}` : ""), url }];
  });
}

function datesIn(value) {
  const dates = [
    ...value.matchAll(
      /(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2}):(\d{2}))?/g,
    ),
  ].map(
    (match) =>
      `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}${match[4] ? ` ${match[4].padStart(2, "0")}:${match[5]}` : ""}`,
  );
  return {
    ...(dates[0] ? { start: dates[0] } : {}),
    ...(dates.length === 2 && /[~～—至]/.test(value) ? { end: dates[1] } : {}),
    ...(/以后|常驻/.test(value) ? { openEnded: true } : {}),
    dateBasis: "PRTS原文服务器本地日期；不推断当前是否开放",
  };
}

function priceValue(text, currency, currencyBasis) {
  const amountText = readable(text);
  return {
    amount: /^\d+(?:\.\d+)?$/.test(amountText) ? Number(amountText) : null,
    amountText,
    currency: amountText ? readable(currency) || null : null,
    currencyBasis: amountText ? currencyBasis : null,
    priceStatus: !amountText
      ? "not-stated"
      : /^\d+(?:\.\d+)?$/.test(amountText)
        ? "explicit"
        : "source-text",
  };
}

export function parseOutfitAcquisition(cache) {
  const entries = [],
    conflicts = [],
    missing = [];
  const templatePage = cache.pages.find(
    (page) => page.title === "模板:干员时装",
  );
  const template = rawContent(templatePage);
  const defaultVerified =
    template.includes("{{{价格单位|源石}}}") &&
    template.includes("{{{复刻价格单位{{#var:key}}|源石}}}");
  const templateSource = templatePage ? sourceFor(templatePage) : null;
  if (!defaultVerified)
    conflicts.push({
      reason: "template-currency-default-unverified",
      source: templateSource,
    });
  const known = new Map();
  for (const page of cache.pages.filter((page) =>
    page.title.startsWith("时装回廊/"),
  )) {
    for (const record of parseTemplates(rawContent(page)).filter(
      (record) => record.name === "干员时装",
    )) {
      const p = record.params;
      const operatorName = readable(p["干员名"]),
        sequence = readable(p["皮肤序号"]),
        name = readable(p["时装名"]);
      const source = sourceFor(page, name);
      if (!operatorName || !sequence || !name) {
        conflicts.push({
          reason: "missing-outfit-identity",
          source,
          params: p,
        });
        continue;
      }
      const key = outfitAcquisitionKey(operatorName, sequence);
      const entry = {
        key,
        operatorName,
        sequence,
        name,
        source,
        templateSource,
        acquisition: readable(p["获得途径"]),
        offers: [],
        restrictions: [],
        notes: readable(p["备注"]),
        sourceFields: Object.fromEntries(
          Object.entries(p).filter(([key]) =>
            /^(获得途径|价格|价格单位|限时时间|复刻|回顾|不可兑换|备注)/.test(
              key,
            ),
          ),
        ),
      };
      if (!entry.acquisition)
        missing.push({ key, name, reason: "acquisition-not-stated", source });
      if (p["不可兑换"])
        entry.restrictions.push({
          kind: "outfit-voucher-excluded",
          description: "本时装无法使用时装自选凭证兑换；仅可通过时装商店购买。",
          source: templateSource,
        });
      const definitions = [
        {
          kind: "initial",
          sequence: 0,
          timeKey: "限时时间",
          priceKey: "价格",
          unitKey: "价格单位",
        },
      ];
      for (const [prefix, kind] of [
        ["复刻", "rerun"],
        ["回顾", "review"],
      ]) {
        const numbers = [
          ...new Set(
            Object.keys(p).flatMap(
              (key) =>
                key.match(
                  new RegExp(`^${prefix}(?:时间|价格(?:单位)?)(\\d+)$`),
                )?.[1] || [],
            ),
          ),
        ]
          .map(Number)
          .sort((a, b) => a - b);
        for (const number of numbers)
          definitions.push({
            kind,
            sequence: number,
            timeKey: `${prefix}时间${number}`,
            priceKey: `${prefix}价格${number}`,
            unitKey: `${prefix}价格单位${number}`,
          });
      }
      for (const definition of definitions) {
        const rawTime = p[definition.timeKey] || "";
        const availability = readable(rawTime);
        const acquisition =
          definition.kind === "initial"
            ? entry.acquisition
            : definition.kind === "review"
              ? "罗德岛风尚回顾"
              : "复刻（获取条件见原文时限）";
        const base = {
          kind: definition.kind,
          sequence: definition.sequence,
          acquisition,
          availability,
          availabilityRaw: rawTime,
          ...datesIn(availability),
          events: eventsIn(
            definition.kind === "initial"
              ? `${p["获得途径"] || ""} ${rawTime}`
              : rawTime,
          ),
          notes: entry.notes,
          source,
          sourceFields: [
            definition.timeKey,
            definition.priceKey,
            definition.unitKey,
          ],
        };
        const inlinePrices = parseTemplates(rawTime).filter(
          (template) => template.name === "价格",
        );
        if (p[definition.priceKey]?.trim()) {
          const explicitCurrency = p[definition.unitKey];
          const currency =
            explicitCurrency || (defaultVerified ? "源石" : null);
          entry.offers.push({
            ...base,
            ...priceValue(
              p[definition.priceKey],
              currency,
              explicitCurrency ? "explicit-field" : "template-default",
            ),
            ...(!explicitCurrency ? { currencySource: templateSource } : {}),
          });
        } else if (inlinePrices.length) {
          const alternatives =
            inlinePrices.length === 2 &&
            /^\s*\/\s*$/.test(
              rawTime.slice(inlinePrices[0].end, inlinePrices[1].start),
            );
          for (const price of inlinePrices)
            entry.offers.push({
              ...base,
              ...priceValue(
                price.params["2"],
                price.params["1"],
                "inline-price-template",
              ),
              ...(alternatives
                ? {
                    alternativeGroup: `${key}:${definition.kind}:${definition.sequence}`,
                    priceRelation: "alternative",
                  }
                : {}),
            });
        } else entry.offers.push({ ...base, ...priceValue("", null, null) });
      }
      const previous = known.get(key);
      if (previous)
        conflicts.push({
          reason: "duplicate-outfit-identity",
          key,
          names: [previous.name, name],
          sources: [previous.source, source],
        });
      else {
        known.set(key, entry);
        entries.push(entry);
      }
    }
  }
  const offers = entries.flatMap((entry) => entry.offers);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    entries,
    conflicts,
    missing,
    stats: {
      seriesPages: cache.pages.filter((page) =>
        page.title.startsWith("时装回廊/"),
      ).length,
      entries: entries.length,
      offers: offers.length,
      explicitPrices: offers.filter((offer) => offer.priceStatus === "explicit")
        .length,
      sourceTextPrices: offers.filter(
        (offer) => offer.priceStatus === "source-text",
      ).length,
      pricesNotStated: offers.filter(
        (offer) => offer.priceStatus === "not-stated",
      ).length,
      conflicts: conflicts.length,
      missingAcquisition: missing.length,
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const cache = JSON.parse(
    await fs.readFile(
      path.join(root, "data/prts/support/outfit-sources.json"),
      "utf8",
    ),
  );
  const result = parseOutfitAcquisition(cache);
  await fs.writeFile(
    path.join(root, "data/prts/support/outfit-acquisition.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result.stats, null, 2));
  if (result.conflicts.length) process.exitCode = 1;
}
