/** Editorial visual direction: a birthplace or faction never silently chooses a scene. */
export type VisualTheme =
  | "originium"
  | "snow"
  | "abyss"
  | "rhine"
  | "halo"
  | "babel"
  | "radiant"
  | "ink";

export interface VisualProfile {
  theme: VisualTheme;
  label: string;
  accent: string;
  secondary: string;
  entries: { names: string[]; ids: string[] }[];
  references: { title: string; url: string }[];
}

export const visualProfiles: readonly VisualProfile[] = [
  {
    theme: "originium",
    label: "源石共振",
    accent: "#71d4e0",
    secondary: "#da755f",
    entries: [
      { names: ["阿米娅"], ids: ["operator-amiya"] },
      { names: ["至纯源石"], ids: ["item-originite-prime"] },
    ],
    references: [
      {
        title: "阿米娅精英化立绘",
        url: "https://prts.wiki/w/文件:立绘_阿米娅_2.png",
      },
      { title: "官方世界设定", url: "https://ak.hypergryph.com/" },
    ],
  },
  {
    theme: "snow",
    label: "雪境来信",
    accent: "#a4e4ef",
    secondary: "#c7d9ec",
    entries: [
      { names: ["银灰"], ids: ["operator-silverash"] },
      { names: ["耶拉冈德之石"], ids: ["item-jerag-stone"] },
    ],
    references: [
      {
        title: "银灰精英化立绘",
        url: "https://prts.wiki/w/文件:立绘_银灰_2.png",
      },
      { title: "谢拉格", url: "https://prts.wiki/w/泰拉大典:地理/谢拉格" },
    ],
  },
  {
    theme: "abyss",
    label: "深海回声",
    accent: "#79b6d8",
    secondary: "#d5dcd4",
    entries: [
      { names: ["归溟幽灵鲨"], ids: ["operator-specter-unchained"] },
      { names: ["首言者"], ids: ["enemy-first-to-talk"] },
    ],
    references: [
      {
        title: "归溟幽灵鲨精英化立绘",
        url: "https://prts.wiki/w/文件:立绘_归溟幽灵鲨_2.png",
      },
      { title: "首言者", url: "https://prts.wiki/w/首言者" },
    ],
  },
  {
    theme: "rhine",
    label: "群星之外",
    accent: "#abd5b5",
    secondary: "#edac77",
    entries: [
      { names: ["缪尔赛思"], ids: ["operator-muelsyse"] },
      { names: ["莱茵生命", "泰拉大典:组织/莱茵生命"], ids: ["rhine-lab"] },
    ],
    references: [
      {
        title: "官方四周年 · 孤星",
        url: "https://ak.hypergryph.com/special/4th-anniversary/index.html",
      },
      { title: "缪尔赛思", url: "https://prts.wiki/w/缪尔赛思" },
    ],
  },
  {
    theme: "halo",
    label: "光环协奏",
    accent: "#edddb0",
    secondary: "#f0bd7c",
    entries: [{ names: ["能天使"], ids: ["operator-exusiai"] }],
    references: [
      {
        title: "能天使精英化立绘",
        url: "https://prts.wiki/w/文件:立绘_能天使_2.png",
      },
    ],
  },
  {
    theme: "babel",
    label: "封存的理想",
    accent: "#d9a8ba",
    secondary: "#a397c1",
    entries: [
      {
        names: ["巴别塔", "SideStory「巴别塔」", "泰拉大典:组织/巴别塔"],
        ids: ["babel"],
      },
    ],
    references: [
      {
        title: "巴别塔官方宣传 PV",
        url: "https://www.bilibili.com/video/BV1Jp421y72e/",
      },
      { title: "巴别塔", url: "https://prts.wiki/w/巴别塔" },
    ],
  },
  {
    theme: "radiant",
    label: "划破长夜",
    accent: "#f0d095",
    secondary: "#f2aa61",
    entries: [{ names: ["耀骑士临光"], ids: ["operator-nearl-radiant"] }],
    references: [
      {
        title: "耀骑士临光精英化立绘",
        url: "https://prts.wiki/w/文件:立绘_耀骑士临光_2.png",
      },
    ],
  },
  {
    theme: "ink",
    label: "画境未尽",
    accent: "#8dc5b8",
    secondary: "#bb766e",
    entries: [{ names: ["夕"], ids: ["operator-dusk"] }],
    references: [
      { title: "夕精英化立绘", url: "https://prts.wiki/w/文件:立绘_夕_2.png" },
      {
        title: "画中人官方宣传 PV",
        url: "https://www.bilibili.com/video/BV1jv4y1f7jH/",
      },
    ],
  },
];

export interface VisualEntry {
  id?: string;
  name: string;
  source?: { title?: string };
}
const normalize = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase();
const byId = new Map(
  visualProfiles.flatMap((profile) =>
    profile.entries.flatMap((entry) =>
      entry.ids.map((id) => [id, profile] as const),
    ),
  ),
);
const byName = new Map(
  visualProfiles.flatMap((profile) =>
    profile.entries.flatMap((entry) =>
      entry.names.map((name) => [normalize(name), profile] as const),
    ),
  ),
);
export function visualProfileFor(
  entry: VisualEntry,
): VisualProfile | undefined {
  return (
    (entry.id ? byId.get(entry.id) : undefined) ??
    byName.get(normalize(entry.name)) ??
    (entry.source?.title
      ? byName.get(normalize(entry.source.title))
      : undefined)
  );
}
