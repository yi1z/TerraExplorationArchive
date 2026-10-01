import type {
  ArchiveEntry,
  EntryKind,
  SourceRef,
  TimelineEvent,
  WorldEntry,
  Zone,
} from "./types";
import { catalogueEntries, catalogueSources } from "./catalogue";

export const zoneNames: Record<Zone, string> = {
  north: "北境",
  east: "东方",
  central: "核心圈",
  west: "西部",
  south: "南方",
  special: "深海 / 地下",
};
export const kindNames: Record<EntryKind, string> = {
  country: "国家与文明",
  city: "城市",
  faction: "势力",
  concept: "世界观",
  operator: "干员档案",
  enemy: "敌人档案",
  item: "道具资料",
};
export const sources: Record<string, SourceRef> = {
  ...catalogueSources,
  video: {
    id: "video",
    title: "初探泰拉 TERRA EXPLORATION",
    url: "https://www.bilibili.com/video/BV1Hy4y1r7k7/",
    publisher: "明日方舟官方",
    checkedAt: "2026-09-29",
  },
  world: {
    id: "world",
    title: "明日方舟 · 世界设定",
    url: "https://ak.hypergryph.com/",
    publisher: "鹰角网络",
    checkedAt: "2026-09-29",
  },
  geography: {
    id: "geography",
    title: "泰拉大典 · 地理一览",
    url: "https://prts.wiki/w/泰拉大典:地理",
    publisher: "PRTS 社区",
    checkedAt: "2026-09-29",
    note: "社区页面含考据和剧透，请区分游戏资料与作者推测。",
  },
};
function wiki(id: string, name: string, path = "泰拉大典:地理/" + name) {
  sources[id] = {
    id,
    title: name + " · 资料索引",
    url: "https://prts.wiki/w/" + encodeURI(path),
    publisher: "PRTS 社区",
    checkedAt: "2026-09-29",
    note: "外部完整条目可能包含剧透。本网站采用基础设定摘要，不照录剧情原文。",
  };
  return id;
}
interface CountryInput {
  id: string;
  name: string;
  en: string;
  zone: Zone;
  tagline: string;
  summary: string;
  terrain: string;
  culture: string;
  form: string;
  tags: string[];
  related: string[];
  spoiler?: string;
  sourcePath?: string;
  facts?: WorldEntry["facts"];
  sections?: WorldEntry["sections"];
  sourceNote?: string;
}
function country(r: CountryInput): WorldEntry {
  const sourceId = wiki("source-" + r.id, r.name, r.sourcePath);
  if (r.sourceNote) {
    sources[sourceId].note = r.sourceNote;
    sources[sourceId].checkedAt = "2026-10-01";
  }
  return {
    ...r,
    kind: "country",
    aliases: [],
    regionId: r.id,
    facts: [
      { label: "档案分区", value: zoneNames[r.zone] },
      { label: "文明特征", value: r.form },
      { label: "地理印象", value: r.tags[0] },
      ...(r.facts ?? []),
    ],
    sections: [
      { title: "大地与城市", body: r.terrain },
      { title: "人文观察", body: r.culture },
      ...(r.sections ?? []),
      ...(r.spoiler
        ? [{ title: "历史追记", body: r.spoiler, spoiler: true }]
        : []),
    ],
    sources: [sourceId, "geography"],
  };
}
const countries: WorldEntry[] = [
  country({
    id: "ursus",
    name: "乌萨斯",
    en: "URSUS",
    zone: "north",
    tagline: "漫长寒冬里的庞大帝国",
    form: "帝国 · 军事传统",
    tags: ["广袤冻原", "重工业", "北境"],
    summary:
      "泰拉北方的广阔国度。严酷的自然环境、庞大的军事体系与厚重的工业城市，共同构成了乌萨斯的轮廓。",
    terrain:
      "从寒冷的荒原到高耸的城市壁垒，长距离运输与生存物资始终是这里的重要议题。移动城市既是栖身之所，也是帝国力量的载体。",
    culture:
      "帝国荣耀与普通人的生活之间存在深刻张力。理解感染者的处境，是阅读乌萨斯相关故事的重要起点。",
    related: ["chernobog", "reunion", "infected", "sami"],
    spoiler:
      "切尔诺伯格事件使帝国边境的矛盾进入罗德岛的视野；乌萨斯学生自治团的经历，则留下了另一份来自普通人的记录。",
  }),
  country({
    id: "yan",
    name: "炎",
    en: "YAN",
    zone: "east",
    tagline: "山河之间，万象生长",
    form: "帝国 · 多元地域",
    tags: ["山川沃野", "移动城邦", "东方"],
    summary:
      "位于泰拉东方的古老国度。不同城市与地方传统交织，商贸、农耕、武术与源石技艺在辽阔山河间延续。",
    terrain:
      "炎的地域景观与城市生活差异鲜明。龙门、尚蜀、玉门等城市呈现出商贸枢纽、山城和边塞的不同面貌。",
    culture:
      "地方风物、饮食与诗文构成许多故事的入口。关于“岁”的记录另有复杂背景，应结合相关活动剧情逐步阅读。",
    related: ["lungmen", "arts", "nomadic-cities", "kjerag"],
  }),
  country({
    id: "leithanien",
    name: "莱塔尼亚",
    en: "LEITHANIEN",
    zone: "central",
    tagline: "当旋律成为施术的语言",
    form: "帝国 · 术法传统",
    tags: ["法术学府", "高塔与林地", "音乐"],
    summary:
      "位于泰拉中部、以崔林特尔梅为首都的帝国。九个大区共同构成其疆域，源石技艺与音乐贯穿教育和日常生活，高塔承载着贵族与学府的传统。",
    terrain:
      "山区之间分布着河谷与平原，北部冬灵山脉附近气候寒冷。国家由九个选帝侯区组成，各区设有自己的政府。首都崔林特尔梅与北方城镇沃伦姆德，呈现出不同规模的城市生活。",
    culture:
      "各区设有不同层级的教育机构，其中许多由贵族高塔发展而来。源石技艺进入义务教育，艺术课程也占有重要位置；更高层级的教育往往需要更高费用，家庭条件仍会影响求学机会。音乐与施术相连，是理解当地文化的入口。",
    facts: [
      { label: "首都", value: "崔林特尔梅（Zwillingstürme）" },
      { label: "行政分区", value: "九个选帝侯区，又称大区" },
      { label: "法定货币", value: "杜卡特" },
      { label: "基础教育", value: "源石技艺是义务教育的一部分" },
      { label: "政体", value: "选举君主制；各选帝侯区保有政府、法律与军队" },
      { label: "根本宪章", value: "《金律乐章》" },
    ],
    sections: [
      {
        title: "皇权与地方",
        body: "皇帝由选帝侯推选，拥有宪章以外法律的最终阐释权，但权力受到诸侯牵制。帝国宫廷负责辅助决策、传达旨意和护卫皇帝；各区则同时运行贵族封臣与文官两套体系。城镇议事厅由宪兵长官和居民代表参与，重要决策仍受高塔贵族制约。",
      },
      {
        title: "军事与法术",
        body: "各级贵族依照法定规模保有私兵，战时随自身所属的封臣关系接受指挥。术师在军队中地位突出，军事法术适应性测试中的优秀者会接受专门训练，组成选帝侯的金律法卫。帝国宫廷的禁卫直接听命于皇帝；双子女皇麾下的“女皇之声”同时担任御前乐师、谕使和护卫。",
      },
      {
        title: "法律与贵族",
        body: "《金律乐章》既是可以演奏的乐章，也是帝国的根本宪章，规定皇权、中央与地方的关系及共同的世俗准则。原典之外，九大区各自保存一份抄本，并在共同基础上制定地方性法律。知识、领地与政治权力集中于高塔贵族，层层分封形成相互负责的等级关系。",
      },
      {
        title: "经济与产业",
        body: "河谷农业借助源石技艺发展，艺术教育、乐器与施术用品制造构成特色产业。近代工业吸收邻国技术，许多产品兼顾机械操作与法术操作两种方式。战争和旧政权统治留下长期影响，经济重建也受到资源和技艺集中于贵族手中的制约。",
      },
      {
        title: "学府与专业机构",
        body: "威廉大学开展源石技艺及自然环境相关研究，舒曼艺术学院教授包括油画在内的艺术课程。莱塔尼亚法术协会负责法术道具生产的品质认证与监制。这些学府和行业机构呈现出教育、艺术与源石技艺彼此交织的社会结构。",
      },
      {
        title: "女皇庆典后的变化",
        body: "1100年女皇庆典期间，巫王残党引发危机，金律被毁，巫王高塔重新出现。双子女皇联手应对巫王后，赫琳玛特留在荒域建立阻挡邪魔的新塔，帝国对外宣称她“失声”。教育机构也经历更替：恩瓦德路德维格大学关停，新利奥波德大学于庆典后重建，次年开设政治与历史课程。",
        spoiler: true,
      },
    ],
    sourceNote:
      "通读缓存页面 21739、修订 337057 后，依据地理、政治、军事、法律、经济、教育与机构段落原创归纳；九大区和金律法卫段落分别引《大地巡旅》132、134页。来源为 PRTS 社区考据，未采用现实原型推测；后期剧情仅在剧透章节出现。",
    related: ["wolumonde", "arts", "siracusa", "originium"],
    spoiler:
      "巫王时代的遗产持续影响着后来的莱塔尼亚。双子女皇的统治与新旧秩序的冲突，是相关故事的重要背景。",
  }),
  country({
    id: "sargon",
    name: "萨尔贡",
    en: "SARGON",
    zone: "south",
    tagline: "沙海、雨林与古老王酋",
    form: "王酋领地",
    tags: ["沙漠与雨林", "地方领地", "古老文明"],
    summary:
      "一个难以用单一景色概括的辽阔国度。沙漠、绿洲与雨林之间，不同领地保留着各自的生活方式。",
    terrain:
      "从干旱地带到阿卡胡拉的热带雨林，自然条件塑造着迥异的聚落。地图上的一个国家名字，并不意味着相同的日常。",
    culture:
      "王酋与地方传统构成复杂的社会结构。探访这里的故事，可以从《密林悍将归来》与《理想城》所呈现的地方生活开始。",
    related: ["durin", "minos", "catastrophes", "originium"],
  }),
  country({
    id: "victoria",
    name: "维多利亚",
    en: "VICTORIA",
    zone: "central",
    tagline: "钢铁、蒸汽与王冠的余影",
    form: "帝国 · 公爵领",
    tags: ["工业城市", "蒸汽技术", "核心圈"],
    summary:
      "泰拉核心圈的重要工业强国。工厂、城市与贵族领地相互交织，伦蒂尼姆是理解这个国家的重要入口。",
    terrain:
      "庞大的工业与交通体系支撑着移动城市。地区领地间的差异，也使国家政治远比地图边界更复杂。",
    culture:
      "王权、贵族与城市民众之间的关系贯穿相关篇章。工业成就背后，同样存在劳动与生活条件的问题。",
    related: ["londinium", "columbia", "kazdel", "nomadic-cities"],
    spoiler:
      "伦蒂尼姆的危机将萨卡兹军事委员会、诸公爵与城市抵抗者卷入同一场冲突。主线后续章节逐步展开其后果。",
  }),
  country({
    id: "columbia",
    name: "哥伦比亚",
    en: "COLUMBIA",
    zone: "west",
    tagline: "在下一条地平线之前",
    form: "联邦 · 科研产业",
    tags: ["拓荒地带", "科技企业", "科研"],
    summary:
      "年轻而快速发展的联邦。拓荒、企业与科学研究不断改变城市的面貌，也为许多来到这里的人提供新的可能。",
    terrain:
      "繁华都市与开拓区并存。特里蒙的实验室只是其中一面，远离城市的拓荒生活则呈现出另一种现实。",
    culture:
      "机会与代价常常相伴。莱茵生命的故事围绕科学理想、企业利益与研究伦理展开。",
    related: ["trimounts", "rhine-lab", "victoria", "bolivar"],
    spoiler:
      "《孤星》中，克丽斯腾的计划使特里蒙成为一次向天空发问的中心。它的意义超出了单一研究机构的范围。",
  }),
  country({
    id: "kazimierz",
    name: "卡西米尔",
    en: "KAZIMIERZ",
    zone: "north",
    tagline: "骑士的荣光，霓虹的价格",
    form: "骑士传统 · 商业都市",
    tags: ["大骑士领", "竞技赛事", "骑士文化"],
    summary:
      "骑士传统与现代商业并存的国度。竞技场上的光芒与商业联合会的力量，共同塑造着城市生活。",
    terrain:
      "卡瓦莱利亚基由多座移动城市构成，承载着大型赛事与商业活动。城外仍有不同于霓虹都市的乡村生活。",
    culture:
      "“骑士”既是一种古老身份，也被纳入现代娱乐与商业体系。临光一家相关故事呈现了这两种价值的碰撞。",
    related: ["kawalerielki", "infected", "sami", "leithanien"],
  }),
  country({
    id: "kjerag",
    name: "谢拉格",
    en: "KJERAG",
    zone: "central",
    tagline: "雪山守望着通往外界的路",
    form: "雪境 · 信仰与贸易",
    tags: ["高山雪境", "喀兰贸易", "山地"],
    summary:
      "群山环抱的雪境。宗教传统与地方家族长期塑造这里的生活，而不断发展的对外贸易带来新的变化。",
    terrain:
      "严峻的高山环境影响交通与聚落。山峰、神庙与道路在当地人的生活中具有多重意义。",
    culture:
      "喀兰贸易将谢拉格与外界连接起来。围绕传统、信仰与发展的讨论，可以在《风雪过境》等故事中继续追索。",
    related: ["karlan", "yan", "rim-billiton", "nomadic-cities"],
  }),
  country({
    id: "siracusa",
    name: "叙拉古",
    en: "SIRACUSA",
    zone: "central",
    tagline: "家族、城市与未写完的秩序",
    form: "城市 · 家族秩序",
    tags: ["家族城市", "戏剧与美食", "核心圈"],
    summary:
      "各大家族与城市紧密相连的国度。戏剧、美食和街巷生活之外，一套复杂的家族规则影响着社会运行。",
    terrain:
      "山林与荒原构成不同的地方景色。理解城市间的联系，比仅仅记住一个国家轮廓更有意义。",
    culture:
      "《叙拉古人》将视线投向旧秩序中的个体选择。德克萨斯与拉普兰德等人的经历也与这里密切相关。",
    related: ["leithanien", "laterano", "penguin-logistics"],
    spoiler:
      "新沃尔西尼试图建立一种区别于旧家族体系的城市秩序。这座城市的诞生也是《叙拉古人》的重要转折。",
  }),
  country({
    id: "laterano",
    name: "拉特兰",
    en: "LATERANO",
    zone: "central",
    tagline: "钟声之下，守护誓言",
    form: "教宗国",
    tags: ["宗教城市", "守护铳", "萨科塔"],
    summary:
      "以萨科塔文化与宗教传统著称的国家。钟声、教堂和守护铳，是许多旅人对拉特兰的第一印象。",
    terrain:
      "城市空间同时承载信仰、公共生活和国家事务。拉特兰与其他地区的联系也经由使者和公证所人员展开。",
    culture:
      "萨科塔与萨卡兹之间的历史关系涉及深层设定。初次阅读时，可以先从《吾导先路》的城市生活与人物关系入手。",
    related: ["siracusa", "kazdel", "penguin-logistics", "arts"],
  }),
  country({
    id: "iberia",
    name: "伊比利亚",
    en: "IBERIA",
    zone: "south",
    tagline: "灯塔仍朝向沉默的海",
    form: "沿海国家",
    tags: ["海岸与灯塔", "航海传统", "南方"],
    summary:
      "与海洋有着深刻联系的国度。旧日的航海荣光与如今沉寂的海岸，让这里成为泰拉另一扇面向未知的窗。",
    terrain:
      "海港、灯塔与沿海聚落构成重要的地理线索。不同故事中的海岸经历，并不能被概括为一段简单的兴衰。",
    culture:
      "审判庭与当地居民对海洋的态度，折射出历史留下的影响。《覆潮之下》与《愚人号》提供了进一步的阅读入口。",
    related: ["aegir", "catastrophes", "rhodes-island"],
    spoiler:
      "大静谧改变了伊比利亚的命运。来自海洋的威胁，以及深海猎人的行动，揭开了往昔繁荣背后的另一层历史。",
  }),
  country({
    id: "bolivar",
    name: "玻利瓦尔",
    en: "BOLÍVAR",
    zone: "west",
    tagline: "纷争之间，城市各自生活",
    form: "多方势力并存",
    tags: ["多样地貌", "复杂局势", "西部"],
    summary:
      "长期受复杂政治局势影响的地区。不同势力与外部力量交错，各地的生活面貌也并不一致。",
    terrain:
      "多索雷斯提供了一个特别的观察窗口：在同一片大地上，娱乐都市与周边地区的生活可以相距甚远。",
    culture:
      "地方居民在冲突之外仍然延续着日常。《多索雷斯假日》以一座城市的赛事，展开了关于利益与选择的故事。",
    related: ["dossoles", "columbia", "sargon"],
    sourcePath: "泰拉大典:地理/玻利瓦尔",
  }),
  country({
    id: "higashi",
    name: "东",
    en: "HIGASHI",
    zone: "east",
    tagline: "在大地东端，循旧路而行",
    form: "南北政治格局",
    tags: ["东方诸城", "武家传统", "东方"],
    summary:
      "泰拉东方的国家。地方传统、城市生活与武家文化，共同构成了关于“东”的公开记录。",
    terrain:
      "南北政治格局影响着地区间的联系。地图仅给出示意范围，不将故事中的城市位置推算为真实坐标。",
    culture:
      "东出身的干员档案提供了分散的生活片段。阅读时应区分明确的游戏设定与现实文化原型的推测。",
    related: ["yan", "arts", "nomadic-cities"],
  }),
  country({
    id: "sami",
    name: "萨米",
    en: "SAMI",
    zone: "north",
    tagline: "林线尽头，风雪未止",
    form: "北境聚落",
    tags: ["寒林雪原", "北境传统", "探索"],
    summary: "北方寒冷地区的文明。聚落与传统知识维系着人们对大地的理解。",
    terrain: "北方环境严酷，远行需要谨慎。本图未勘区域不表示已被完整调查。",
    culture: "进一步的北境故事可从《探索者的银凇止境》阅读。",
    related: ["ursus", "kazimierz", "catastrophes"],
    sourcePath: "泰拉大典:地理/其他",
  }),
  country({
    id: "minos",
    name: "米诺斯",
    en: "MINOS",
    zone: "south",
    tagline: "英雄的故事仍被传唱",
    form: "英雄文化",
    tags: ["英雄传统", "神殿与城邦", "南方"],
    summary: "以英雄传统著称的国度，集体记忆与信仰紧密相连。",
    terrain: "地区与聚落的形貌应结合具体故事阅读。",
    culture: "十二英雄的传说是了解米诺斯文化的一条线索。",
    related: ["sargon", "laterano", "arts"],
    sourcePath: "泰拉大典:地理/其他",
  }),
  country({
    id: "rim-billiton",
    name: "雷姆必拓",
    en: "RIM BILLITON",
    zone: "south",
    tagline: "沿着矿脉，走向大地深处",
    form: "矿业文明",
    tags: ["矿区与工业", "源石开采", "南方"],
    summary: "矿业在社会生活中占据重要位置的地区。",
    terrain: "矿区、工业设施与运输网络构成鲜明的地理印象。",
    culture: "矿业生产也使源石与劳动者的生活密不可分。",
    related: ["originium", "oripathy", "kjerag"],
    sourcePath: "泰拉大典:地理/其他",
  }),
  country({
    id: "kazdel",
    name: "卡兹戴尔",
    en: "KAZDEL",
    zone: "central",
    tagline: "废墟之上，故乡仍有名字",
    form: "萨卡兹的故乡",
    tags: ["重建与战争", "萨卡兹", "核心圈"],
    summary: "与萨卡兹历史相连的故乡，重建与战争反复交织。",
    terrain: "城市与国家的命运常被战争改写。",
    culture: "“故乡”的含义贯穿许多萨卡兹人物的故事。",
    related: ["babel", "victoria", "infected"],
    sourcePath: "泰拉大典:地理/其他",
  }),
  country({
    id: "aegir",
    name: "阿戈尔",
    en: "ÆGIR",
    zone: "special",
    tagline: "陆地之外，另一片文明",
    form: "深海文明",
    tags: ["深海", "技术文明", "特殊入口"],
    summary: "海洋深处的文明，与陆地社会保持着距离。",
    terrain: "入口代表深海档案，不对应实际国界或海底坐标。",
    culture: "深海猎人相关故事提供了通向阿戈尔的阅读线索。",
    related: ["iberia", "arts"],
    sourcePath: "泰拉大典:地理/其他",
  }),
  country({
    id: "durin",
    name: "杜林",
    en: "DURIN",
    zone: "special",
    tagline: "脚下的大地，别有天地",
    form: "地下城邦",
    tags: ["地下城市", "工程技术", "特殊入口"],
    summary: "生活于地下的文明，拥有独特的城市与工程技术。",
    terrain: "地图只展示地下档案入口，不绘制推测疆域。",
    culture: "《理想城：长夏狂欢季》展现了一座杜林城市的生活。",
    related: ["sargon", "nomadic-cities"],
    sourcePath: "理想城：长夏狂欢季",
  }),
];
interface DetailInput {
  id: string;
  kind: "city" | "faction" | "concept";
  name: string;
  en: string;
  zone: Zone;
  regionId?: string;
  tagline: string;
  summary: string;
  body: string;
  related: string[];
  tags: string[];
  sourcePath?: string;
  spoiler?: string;
}
function detail(r: DetailInput): WorldEntry {
  return {
    ...r,
    aliases: [],
    facts: [
      { label: "档案分类", value: kindNames[r.kind] },
      {
        label: "关联地域",
        value: r.regionId
          ? countries.find((c) => c.id === r.regionId)?.name || "跨地区"
          : "跨地区",
      },
    ],
    sections: [
      {
        title:
          r.kind === "city"
            ? "城市观察"
            : r.kind === "faction"
              ? "组织观察"
              : "理解这片大地",
        body: r.body,
      },
      ...(r.spoiler
        ? [{ title: "后续记录", body: r.spoiler, spoiler: true }]
        : []),
    ],
    sources:
      r.kind === "concept" || r.id === "rhodes-island" || r.id === "reunion"
        ? ["world"]
        : [
            wiki(
              "source-" + r.id,
              r.name,
              r.sourcePath ||
                (r.kind === "city" ? "泰拉大典:地理/" : "泰拉大典:组织/") +
                  r.name,
            ),
          ],
  };
}
export const entries: ArchiveEntry[] = [
  ...countries,
  detail({
    id: "lungmen",
    kind: "city",
    name: "龙门",
    en: "LUNGMEN",
    zone: "east",
    regionId: "yan",
    tagline: "霓虹之下，万千生活",
    tags: ["移动城市", "商贸", "炎"],
    summary: "炎境内的重要移动城市，商业与贸易让来自不同地方的人在此相遇。",
    body: "高楼、街巷与往来货物组成龙门的多重面貌。近卫局维持城市秩序，企鹅物流等组织则从另一侧呈现这座城市的日常。图中城市标记仅用于资料导航。",
    related: ["yan", "penguin-logistics", "nomadic-cities", "rhodes-island"],
  }),
  detail({
    id: "chernobog",
    kind: "city",
    name: "切尔诺伯格",
    en: "CHERNOBOG",
    zone: "north",
    regionId: "ursus",
    tagline: "故事从这里启程",
    tags: ["移动城市", "乌萨斯", "主线"],
    summary: "乌萨斯的移动城市，也是明日方舟主线开篇的重要舞台。",
    body: "这座城市的档案与感染者、天灾及整合运动紧密相连。基础阅读可先了解移动城市的运作，再进入具体事件。",
    spoiler:
      "罗德岛的营救行动发生于城市动乱与天灾交织之时。后续的切城危机进一步影响到龙门。",
    related: ["ursus", "reunion", "catastrophes"],
    sourcePath: "主题曲",
  }),
  detail({
    id: "londinium",
    kind: "city",
    name: "伦蒂尼姆",
    en: "LONDINIUM",
    zone: "central",
    regionId: "victoria",
    tagline: "在帝国的心脏",
    tags: ["工业城市", "维多利亚", "主线"],
    summary: "维多利亚的核心城市。王权象征、工业体系和城市居民的生活汇聚于此。",
    body: "城墙与工厂之后，伦蒂尼姆仍由无数具体的人构成。阅读相关主线时，城市内部不同群体的立场是重要线索。",
    related: ["victoria", "kazdel", "rhodes-island"],
  }),
  detail({
    id: "wolumonde",
    kind: "city",
    name: "沃伦姆德",
    en: "WOLUMONDE",
    zone: "central",
    regionId: "leithanien",
    tagline: "暮色落在第八个月亮",
    tags: ["移动城市", "莱塔尼亚", "活动"],
    summary: "莱塔尼亚的城市，《沃伦姆德的薄暮》的主要舞台。",
    body: "资源分配、交通困境与居民关系使城市危机具有复杂的背景。这里的故事适合与感染者处境和天灾影响一同阅读。",
    related: ["leithanien", "infected", "catastrophes"],
  }),
  detail({
    id: "siesta",
    kind: "city",
    name: "汐斯塔",
    en: "SIESTA",
    zone: "west",
    tagline: "让海风把音乐带向远方",
    tags: ["独立城邦", "黑曜石节", "海滨"],
    summary:
      "以海滨风光与黑曜石节闻名的独立城邦。音乐与旅游构成它鲜明的城市记忆。",
    body: "《火蓝之心》所呈现的火山与海滨，是理解汐斯塔的重要起点。本图以旧城的海岸意象设置示意标记，不表示它隶属玻利瓦尔。",
    related: ["catastrophes", "nomadic-cities"],
    spoiler:
      "《火山旅梦》呈现了城市迁移后的新阶段。资料中的“汐斯塔”可能指向不同时间的城市状态。",
  }),
  detail({
    id: "dossoles",
    kind: "city",
    name: "多索雷斯",
    en: "DOSSOLES",
    zone: "west",
    regionId: "bolivar",
    tagline: "喧闹的海，在内陆发光",
    tags: ["玻利瓦尔", "娱乐都市", "赛事"],
    summary: "玻利瓦尔的娱乐与商业城市，以人工海景和大型赛事吸引旅人。",
    body: "明亮的旅游招牌背后，是城市对于贸易、资金与政治平衡的依赖。《多索雷斯假日》通过一场赛事展开这些关系。",
    related: ["bolivar", "columbia", "lungmen"],
  }),
  detail({
    id: "trimounts",
    kind: "city",
    name: "特里蒙",
    en: "TRIMOUNTS",
    zone: "west",
    regionId: "columbia",
    tagline: "科学家向天空投去目光",
    tags: ["哥伦比亚", "科研城市", "莱茵生命"],
    summary: "哥伦比亚的重要科研城市，与莱茵生命的活动密切相关。",
    body: "研究机构、企业和政治力量在这里交汇。《孤星》从特里蒙展开，描写科学理想与现实利益之间的复杂关系。",
    related: ["columbia", "rhine-lab", "originium"],
    sourcePath: "孤星",
  }),
  detail({
    id: "kawalerielki",
    kind: "city",
    name: "卡瓦莱利亚基",
    en: "KAWALERIELKI",
    zone: "north",
    regionId: "kazimierz",
    tagline: "聚光灯照亮大骑士领",
    tags: ["卡西米尔", "骑士竞技", "联合城市"],
    summary:
      "又称大骑士领，由多座移动城市构成，是骑士竞技与商业活动的重要中心。",
    body: "竞技场、广告和赞助体系让骑士成为公众人物。城市的繁荣与感染者竞技骑士的处境，构成值得并置阅读的两个侧面。",
    related: ["kazimierz", "infected", "nomadic-cities"],
    sourcePath: "泰拉大典:地理/卡西米尔",
  }),
  detail({
    id: "rhodes-island",
    kind: "faction",
    name: "罗德岛",
    en: "RHODES ISLAND",
    zone: "central",
    tagline: "在风暴之间，寻找明天",
    tags: ["医疗", "感染者", "跨地区"],
    summary: "致力于矿石病研究与感染者问题的组织，以陆行舰为活动基地。",
    body: "医疗救助、研究与行动任务共同组成罗德岛的工作。成员来自不同国家与背景，因而它也成为观察泰拉诸国的一条线索。",
    related: ["oripathy", "infected", "babel", "lungmen"],
  }),
  detail({
    id: "reunion",
    kind: "faction",
    name: "整合运动",
    en: "REUNION",
    zone: "north",
    regionId: "ursus",
    tagline: "从被忽视的声音中诞生",
    tags: ["感染者", "社会冲突", "主线"],
    summary: "与感染者处境紧密相关的组织，在主线开篇占有重要位置。",
    body: "理解整合运动需要同时阅读其成员经历、社会背景及不同阶段的行动，不能将所有个体的诉求等同起来。",
    related: ["infected", "chernobog", "ursus"],
  }),
  detail({
    id: "penguin-logistics",
    kind: "faction",
    name: "企鹅物流",
    en: "PENGUIN LOGISTICS",
    zone: "east",
    regionId: "yan",
    tagline: "包裹会抵达，故事也是",
    tags: ["物流", "龙门", "跨地区"],
    summary: "活跃于龙门等地的物流组织，以鲜明的成员个性为人所知。",
    body: "日常运输任务常将成员带入意想不到的事件。《喧闹法则》是了解其龙门生活的阅读入口，成员背景又把线索引向其他国家。",
    related: ["lungmen", "siracusa", "laterano"],
  }),
  detail({
    id: "rhine-lab",
    kind: "faction",
    name: "莱茵生命",
    en: "RHINE LAB",
    zone: "west",
    regionId: "columbia",
    tagline: "每个答案，都打开下一道门",
    tags: ["科研", "哥伦比亚", "实验伦理"],
    summary: "哥伦比亚的研究机构，研究领域广泛，多个科室承担不同方向的工作。",
    body: "机构内部的合作与分歧，以及研究活动的伦理边界，是相关漫画和剧情的重要主题。可由官方《莱茵生命》漫画进入，再阅读《绿野幻梦》与《孤星》。",
    related: ["columbia", "trimounts", "originium"],
    sourcePath: "泰拉大典:组织/莱茵生命",
  }),
  detail({
    id: "karlan",
    kind: "faction",
    name: "喀兰贸易",
    en: "KARLAN TRADE",
    zone: "central",
    regionId: "kjerag",
    tagline: "把雪境与外界连接",
    tags: ["贸易", "谢拉格", "交通"],
    summary: "与谢拉格发展和对外交流密切相关的企业。",
    body: "商品、技术与道路不仅改变经济，也影响人们对于未来的想象。喀兰贸易的行动应放在谢拉格的政治与社会背景中理解。",
    related: ["kjerag", "rim-billiton", "nomadic-cities"],
    sourcePath: "泰拉大典:组织/喀兰贸易",
  }),
  detail({
    id: "babel",
    kind: "faction",
    name: "巴别塔",
    en: "BABEL",
    zone: "central",
    regionId: "kazdel",
    tagline: "旧日的名字，未尽的理想",
    tags: ["卡兹戴尔", "历史", "组织"],
    summary: "与卡兹戴尔历史及罗德岛前史相关的组织。",
    body: "基础档案仅保留其关联入口。完整经历涉及重要剧情，适合在阅读《生于黑夜》及《巴别塔》后继续探索。",
    spoiler:
      "特蕾西娅及其追随者曾试图为萨卡兹寻找不同的未来；组织的分裂与终局深刻影响了后来的人物关系。",
    related: ["kazdel", "rhodes-island"],
    sourcePath: "泰拉大典:组织/巴别塔",
  }),
  detail({
    id: "originium",
    kind: "concept",
    name: "源石",
    en: "ORIGINIUM",
    zone: "central",
    tagline: "文明的动力，也是伤痕",
    tags: ["能源", "矿物", "技术"],
    summary:
      "泰拉广泛使用的重要资源，推动技术与工业发展的同时，也带来感染风险。",
    body: "源石与能源、工业及源石技艺密切相关。其价值与危险并存，是理解泰拉城市和社会问题的基础。",
    related: ["arts", "oripathy", "rim-billiton"],
    sourcePath: "世界观设定",
  }),
  detail({
    id: "oripathy",
    kind: "concept",
    name: "矿石病",
    en: "ORIPATHY",
    zone: "central",
    tagline: "病症之外，还有人的生活",
    tags: ["疾病", "感染者", "医疗"],
    summary: "与源石有关的疾病。患病者被称为感染者，医疗问题常与社会排斥交织。",
    body: "罗德岛对矿石病的研究与救助是核心工作之一。不同地区对感染者的制度和态度存在差异，不宜用单一规则概括所有国家。",
    related: ["infected", "originium", "rhodes-island"],
    sourcePath: "世界观设定",
  }),
  detail({
    id: "infected",
    kind: "concept",
    name: "感染者",
    en: "THE INFECTED",
    zone: "central",
    tagline: "标签背后，是一个个具体的人",
    tags: ["矿石病", "社会", "人群"],
    summary:
      "矿石病患者的统称。他们有不同的出身、职业和立场，并不是一个统一的组织。",
    body: "不同地区的排斥、限制或救助政策影响着感染者的日常。理解人物选择时，需要把疾病与社会环境放在一起观察。",
    related: ["oripathy", "reunion", "rhodes-island"],
    sourcePath: "世界观设定",
  }),
  detail({
    id: "catastrophes",
    kind: "concept",
    name: "天灾",
    en: "CATASTROPHES",
    zone: "central",
    tagline: "大地从不承诺平静",
    tags: ["自然灾害", "迁徙", "生存"],
    summary: "泰拉世界中多种大规模灾害的统称，深刻影响聚落与文明的生存方式。",
    body: "灾害预测、避险与迁徙构成城市生活的重要环节。本站没有实时灾害数据，地图中的任何扫描动效均为界面表现。",
    related: ["nomadic-cities", "originium", "chernobog"],
    sourcePath: "世界观设定",
  }),
  detail({
    id: "nomadic-cities",
    kind: "concept",
    name: "移动城市",
    en: "NOMADIC CITIES",
    zone: "central",
    tagline: "让城市成为一场漫长的航行",
    tags: ["工程", "迁徙", "城市"],
    summary: "通过大型移动平台承载城市空间的技术形态，帮助人们规避天灾等威胁。",
    body: "城市移动需要能源、维护和路线安排，不意味着随时可以自由行驶。城邦的位置可能随时间改变，本站的城市点位均为导航示意。",
    related: ["catastrophes", "lungmen", "victoria"],
    sourcePath: "世界观设定",
  }),
  detail({
    id: "arts",
    kind: "concept",
    name: "源石技艺",
    en: "ORIGINIUM ARTS",
    zone: "central",
    tagline: "将意志化作可见的力量",
    tags: ["技术", "施术", "源石"],
    summary: "泰拉利用源石实现的技术与能力体系，应用于战斗之外的许多领域。",
    body: "不同地区发展出不同的施术传统，个人的适应性与训练也影响表现。莱塔尼亚的音乐与法术文化提供了其中一个鲜明例子。",
    related: ["originium", "leithanien", "yan"],
    sourcePath: "世界观设定",
  }),
];
entries.find((e) => e.id === "yan")!.aliases = ["大炎", "炎国", "yen"];
entries.find((e) => e.id === "kawalerielki")!.aliases = ["大骑士领"];
entries.find((e) => e.id === "rhodes-island")!.aliases = [
  "rhodes",
  "罗德岛制药",
];
entries.find((e) => e.id === "karlan")!.aliases = ["喀兰"];
entries.find((e) => e.id === "aegir")!.aliases = ["aegir"];
entries.find((e) => e.id === "bolivar")!.aliases = ["bolivar"];
// Siesta is independent; a nearby map anchor is not administrative ownership.
entries.find((e) => e.id === "siesta")!.facts = [
  { label: "档案分类", value: "独立城邦" },
  { label: "关联地域", value: "旧城海岸意象 · 示意" },
];
entries.push(...catalogueEntries);
export const worldEntries = entries.filter(
  (e): e is WorldEntry =>
    e.kind === "country" ||
    e.kind === "city" ||
    e.kind === "faction" ||
    e.kind === "concept",
);
export const entryById: Record<string, ArchiveEntry> = Object.assign(
  Object.create(null),
  Object.fromEntries(entries.map((e) => [e.id, e])),
);
export const countryEntries = entries.filter((e) => e.kind === "country");
export const events: TimelineEvent[] = [
  {
    id: "columbian-independence",
    year: 1018,
    label: "1018",
    title: "哥伦比亚独立",
    summary: "一个新的政治实体走上泰拉的舞台，开拓与工业发展逐步改变西部地区。",
    related: ["columbia", "victoria"],
    source: "source-columbia",
    spoiler: false,
  },
  {
    id: "four-emperors",
    year: 1031,
    label: "1031",
    title: "四皇会战",
    summary:
      "这场战争重塑了核心圈的政治格局。阅读相关历史时，应区分战争发生与后续领土变化。",
    related: ["victoria", "leithanien", "ursus"],
    source: wiki("source-war", "四皇会战", "泰拉年表"),
    spoiler: false,
  },
  {
    id: "great-silence",
    year: 1038,
    label: "1038",
    title: "大静谧",
    summary:
      "伊比利亚的沿海命运发生转折，黄金时代留下的灯塔与舰船获得了另一重含义。",
    related: ["iberia", "aegir"],
    source: "source-iberia",
    spoiler: true,
  },
  {
    id: "chernobog-incident",
    year: 1096,
    label: "1096",
    title: "切尔诺伯格事件",
    summary: "营救、动乱与天灾交织，罗德岛与整合运动的故事在此展开。",
    related: ["chernobog", "ursus", "reunion"],
    source: "source-chernobog",
    spoiler: true,
  },
  {
    id: "obsidian-festival",
    year: 1097,
    label: "1097",
    title: "黑曜石节",
    summary:
      "音乐节将旅人汇聚到汐斯塔。《火蓝之心》从海滨假日切入这座城市的生活。",
    related: ["siesta", "catastrophes"],
    source: "source-siesta",
    spoiler: false,
  },
  {
    id: "knights-major",
    year: 1097,
    label: "1097",
    title: "卡西米尔骑士竞技",
    summary: "骑士精神与商业规则在大骑士领的竞技场上相遇。",
    related: ["kazimierz", "kawalerielki", "infected"],
    source: "source-kazimierz",
    spoiler: false,
  },
  {
    id: "new-volsinii",
    year: 1099,
    label: "1099",
    title: "新沃尔西尼",
    summary: "一座新城市成为改变旧家族秩序的尝试。《叙拉古人》记录了这个转折。",
    related: ["siracusa", "penguin-logistics"],
    source: "source-siracusa",
    spoiler: true,
  },
  {
    id: "lone-trail",
    year: 1099,
    label: "1099",
    title: "孤星",
    summary: "特里蒙的研究者将目光投向天空；科学理想、权力与个人选择在此汇聚。",
    related: ["trimounts", "rhine-lab", "columbia"],
    source: "source-trimounts",
    spoiler: true,
  },
];
export function visibleSections(entry: ArchiveEntry, spoilers: boolean) {
  return entry.sections.filter((s) => spoilers || !s.spoiler);
}
export function visibleEvents(spoilers: boolean) {
  return events.filter((e) => spoilers || !e.spoiler);
}
export function searchEntries(
  query: string,
  spoilers: boolean,
  kind: string = "all",
) {
  const q = query.normalize("NFKC").trim().toLocaleLowerCase().slice(0, 160);
  return entries.filter(
    (e) =>
      (kind === "all" ||
        e.kind === kind ||
        (kind === "world" &&
          (e.kind === "country" ||
            e.kind === "city" ||
            e.kind === "faction" ||
            e.kind === "concept"))) &&
      (!q ||
        [
          e.name,
          e.en,
          ...e.aliases,
          e.summary,
          ...e.tags,
          ...e.facts.flatMap((fact) => [fact.label, fact.value]),
          ...(e.kind === "operator"
            ? [
                e.operator.profession,
                e.operator.branch,
                e.operator.affiliation,
                e.operator.race,
                e.operator.birthplace,
                e.operator.trait,
                ...e.operator.talents,
                ...e.operator.skills.flatMap((skill) => [
                  skill.name,
                  skill.summary,
                ]),
              ]
            : e.kind === "enemy"
              ? [
                  e.enemy.code,
                  e.enemy.species,
                  e.enemy.rank,
                  e.enemy.movement,
                  e.enemy.attackType,
                  ...e.enemy.abilities,
                  ...(e.enemy.stages ?? []),
                ]
              : e.kind === "item"
                ? [
                    e.item.category,
                    e.item.usage,
                    ...e.item.acquisition,
                    ...(e.item.recipe?.ingredients.map(
                      (ingredient) => ingredient.name,
                    ) ?? []),
                  ]
                : []),
          ...visibleSections(e, spoilers).map((s) => s.body),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(q)),
  );
}
