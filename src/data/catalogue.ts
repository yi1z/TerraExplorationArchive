import type {
  ArchiveEntry,
  EntryRelationship,
  OperatorEntry,
  EnemyEntry,
  ItemEntry,
  SourceRef,
} from "./types";

/** Curated on 2026-09-30 against each entry's PRTS page. This is a local snapshot. */
export const CATALOGUE_CHECKED_AT = "2026-09-30";
export const catalogueSources: Record<string, SourceRef> = {};
const wikiUrl = (name: string) =>
  `https://prts.wiki/w/${encodeURIComponent(name)}`;
const relation = (
  target: string,
  label: string,
  spoiler = false,
): EntryRelationship => ({ target, label, ...(spoiler ? { spoiler } : {}) });
function common(
  id: string,
  name: string,
  en: string,
  summary: string,
  tagline: string,
  relationships: EntryRelationship[],
  page = name,
) {
  const sourceId = `source-${id}`;
  catalogueSources[sourceId] = {
    id: sourceId,
    title: `${name} · PRTS 资料`,
    url: wikiUrl(page),
    publisher: "PRTS 玩家社区 / 游戏资料",
    checkedAt: CATALOGUE_CHECKED_AT,
    note: "基于条目正文与结构化资料整理。数值为本地核验快照，完整外部资料可能包含剧情。游戏文字与图像权利归鹰角网络及原作者。",
  };
  return {
    id,
    name,
    en,
    aliases: [
      ...new Set([
        en.toLowerCase(),
        id.replace(/^(operator|enemy|item)-/, ""),
        id.replace(/^(operator|enemy|item)-/, "").replaceAll("-", " "),
      ]),
    ],
    summary,
    tagline,
    relationships,
    related: relationships.map((r) => r.target),
    sources: [sourceId],
    checkedAt: CATALOGUE_CHECKED_AT,
  };
}

type OperatorInput = {
  slug: string;
  name: string;
  en: string;
  tagline: string;
  summary: string;
  rarity: number;
  profession: string;
  branch: string;
  race: string;
  birthplace: string;
  affiliation: string;
  trait: string;
  talents: string[];
  skills: [string, string][];
  stats: [number, number, number, number, number, number];
  relationships: EntryRelationship[];
  notes?: string;
  spoiler?: string;
};
function op(r: OperatorInput): OperatorEntry {
  const [hp, atk, def, res, block, cost] = r.stats;
  return {
    ...common(
      `operator-${r.slug}`,
      r.name,
      r.en,
      r.summary,
      r.tagline,
      r.relationships,
    ),
    kind: "operator",
    tags: [r.profession, r.branch, `${r.rarity}星`, r.affiliation, r.race],
    facts: [
      { label: "职业分支", value: `${r.profession} / ${r.branch}` },
      { label: "所属", value: r.affiliation },
      { label: "种族", value: r.race },
      { label: "出身地", value: r.birthplace },
    ],
    sections: [
      { title: "人物速写", body: r.summary },
      { title: "作战定位", body: `${r.trait} ${r.talents.join(" ")}` },
      {
        title: "档案口径",
        body:
          r.notes ??
          "技能为七级的核心效果摘要；潜能、信赖、模组与队伍加成分开计算，详情见原始条目。",
      },
      ...(r.spoiler
        ? [{ title: "故事追记", body: r.spoiler, spoiler: true }]
        : []),
    ],
    operator: {
      rarity: r.rarity,
      profession: r.profession,
      branch: r.branch,
      race: r.race,
      birthplace: r.birthplace,
      affiliation: r.affiliation,
      trait: r.trait,
      talents: r.talents,
      skills: r.skills.map(([name, summary]) => ({
        name,
        summary: `七级 · ${summary}`,
      })),
      stats: {
        hp,
        atk,
        def,
        res,
        block,
        cost,
        redeploy: 70,
        basis: `精英二 ${r.rarity === 5 ? 80 : 90}级 · 潜能一 · 无信赖 / 模组加成；基础面板，不计天赋与技能`,
      },
    },
  };
}

export const operators: OperatorEntry[] = [
  op({
    slug: "amiya",
    name: "阿米娅",
    en: "AMIYA",
    tagline: "将每一个人的愿望，带向明天",
    summary:
      "罗德岛的公开领导者。年轻的卡特斯以坚定而温和的态度参与救援与谈判，将感染者的处境放在行动的中心。她的旅途连接着博士、罗德岛与这片大地。",
    rarity: 5,
    profession: "术师",
    branch: "中坚术师",
    race: "卡特斯 / 奇美拉",
    birthplace: "雷姆必拓",
    affiliation: "罗德岛",
    trait: "以法术攻击单个目标，可对空。",
    talents: ["情绪吸收：造成伤害与击倒敌人可以额外获得技力。"],
    skills: [
      ["战术咏唱·γ型", "攻击速度增加60。"],
      ["精神爆发", "自动进入七连发，每发为攻击力45%；结束后自身晕眩10秒。"],
      [
        "奇美拉",
        "攻击增加160%、生命上限增加75%，扩大射程并造成真实伤害；结束时强制撤退。",
      ],
    ],
    stats: [1480, 612, 121, 20, 1, 20],
    relationships: [
      relation("rhodes-island", "所属势力"),
      relation("rim-billiton", "出身地"),
      relation("operator-kaltsit", "罗德岛同僚"),
      relation("infected", "关注议题"),
    ],
    notes:
      "本档案采用术师形态。近卫与医疗升变共享角色等级、潜能、信赖与七级以内技能等级，专精独立；其他形态请见 PRTS 原始资料。",
    spoiler:
      "阿米娅与巴别塔的联系，以及她继承的责任，会在主线与相关故事中逐步揭示。",
  }),
  op({
    slug: "kaltsit",
    name: "凯尔希",
    en: "KAL'TSIT",
    tagline: "在漫长岁月里，选择守护",
    summary:
      "罗德岛医疗部门的负责人，也是重要决策者之一。她拥有广泛的医学与源石研究知识，往往以冷静判断应对复杂的危机，身旁的Mon3tr提供了独特的战场支援。",
    rarity: 6,
    profession: "医疗",
    branch: "医师",
    race: "菲林",
    birthplace: "罗德岛",
    affiliation: "罗德岛",
    trait: "治疗友方单位，并能部署与治疗Mon3tr。",
    talents: [
      "Mon3tr：优先照顾自身与召唤物；召唤物离开其治疗范围时防御归零。",
      "不毁重构：Mon3tr被击倒时对周围造成真实伤害与晕眩。",
    ],
    skills: [
      ["指令：结构加固", "自身与Mon3tr防御增加120%，自身获得40%物理格挡。"],
      [
        "指令：战术协同",
        "自身攻速增加60，Mon3tr攻击增加50%，攻击所有阻挡目标。",
      ],
      [
        "指令：熔毁",
        "Mon3tr防御增加140%，以逐渐衰减的攻击增益造成真实伤害；未击杀时技能结束扣除其半数最大生命。",
      ],
    ],
    stats: [1633, 490, 215, 0, 1, 20],
    relationships: [
      relation("rhodes-island", "所属势力"),
      relation("operator-amiya", "罗德岛同僚"),
      relation("oripathy", "研究领域"),
    ],
    notes:
      "公开档案将出身地登记为罗德岛；这不表示她的完整生平已经公开。Mon3tr的属性独立于本页医疗干员基础面板。",
  }),
  op({
    slug: "rosmontis",
    name: "迷迭香",
    en: "ROSMONTIS",
    tagline: "记忆会模糊，陪伴不会",
    summary:
      "罗德岛的精英干员，来自哥伦比亚。她借助特殊感知控制沉重的战术装备，以笔记保存重要记忆；巨大的破坏能力与安静的日常构成了她鲜明的反差。",
    rarity: 6,
    profession: "狙击",
    branch: "投掷手",
    race: "菲林",
    birthplace: "哥伦比亚",
    affiliation: "罗德岛 / 精英干员",
    trait: "攻击地面小范围目标，并产生伤害较低的余震。",
    talents: [
      "歼灭战装备：攻击无视一定防御。",
      "感知稳定：与一名在场术师共享攻击加成。",
    ],
    skills: [
      ["思维膨大", "下次攻击附加一次攻击力120%的法术伤害。"],
      [
        "末梢阻断",
        "攻击增加30%并扩大溅射，附加两次余震；攻击和余震均有机会短暂晕眩目标。",
      ],
      [
        "“如你所愿”",
        "同时打击两名被阻挡敌人，部署两件战术装备，降低其阻挡目标的防御。",
      ],
    ],
    stats: [1944, 688, 245, 15, 1, 25],
    relationships: [
      relation("rhodes-island", "所属势力"),
      relation("columbia", "出身地"),
      relation("operator-amiya", "罗德岛同僚"),
    ],
  }),
  op({
    slug: "w",
    name: "W",
    en: "W",
    tagline: "倒数结束之前，保持警惕",
    summary:
      "来自卡兹戴尔的萨卡兹佣兵，擅长使用爆炸物。她以难以预测的行事方式和尖锐的言语面对伙伴与敌人，巴别塔时期的经历则赋予她另一层立场。",
    rarity: 6,
    profession: "狙击",
    branch: "炮手",
    race: "萨卡兹",
    birthplace: "卡兹戴尔",
    affiliation: "巴别塔",
    trait: "远距离炮击造成范围物理伤害。",
    talents: [
      "设伏：在场一段时间后获得物理、法术闪避并较少被敌人选中。",
      "落井下石：范围内晕眩敌人受到的物理伤害提高。",
    ],
    skills: [
      ["红桃K", "榴弹造成310%物理伤害，晕眩命中目标2.1秒。"],
      ["惊吓盒子", "在可用地块布雷，触发时造成250%物理伤害和1.8秒晕眩。"],
      [
        "D12",
        "给生命值最高的三个目标安置延时炸弹，分别造成280%范围物理伤害与4秒晕眩。",
      ],
    ],
    stats: [1605, 912, 133, 0, 1, 29],
    relationships: [
      relation("babel", "档案所属"),
      relation("kazdel", "出身地"),
      relation("rhodes-island", "合作组织"),
    ],
  }),
  op({
    slug: "chen",
    name: "陈",
    en: "CH'EN",
    tagline: "赤霄出鞘，守住这座城",
    summary:
      "龙门近卫局特别督察组的指挥官，做事严格而果断。她以精湛剑术处理一线任务，在城市秩序、个人信念与责任之间不断作出选择。",
    rarity: 6,
    profession: "近卫",
    branch: "剑豪",
    race: "龙",
    birthplace: "龙门",
    affiliation: "龙门近卫局",
    trait: "普通攻击连续造成两次伤害。",
    talents: [
      "呵斥：周期性帮助友方回复攻击或受击回复类技力。",
      "持刀格斗术：提高自身攻击、防御与物理闪避。",
    ],
    skills: [
      ["鞘击", "下次攻击以260%物理伤害打击目标，并晕眩1.5秒。"],
      ["赤霄·拔刀", "对前方最多六名敌人分别造成410%的物理与法术伤害。"],
      ["赤霄·绝影", "连续发动十次260%物理斩击，最后一击晕眩目标3秒。"],
    ],
    stats: [2880, 610, 352, 0, 2, 23],
    relationships: [
      relation("lungmen", "出身地 / 活动城市"),
      relation("operator-hoshiguma", "近卫局同僚"),
      relation("yan", "关联国家"),
    ],
  }),
  op({
    slug: "hoshiguma",
    name: "星熊",
    en: "HOSHIGUMA",
    tagline: "般若在前，便是防线",
    summary:
      "龙门近卫局的资深成员，出身东国。她持有巨大的三角盾“般若”，以力量和经验承担危险任务，也以坦率稳重的方式照顾身旁的同僚。",
    rarity: 6,
    profession: "重装",
    branch: "铁卫",
    race: "鬼",
    birthplace: "东国",
    affiliation: "龙门近卫局",
    trait: "可阻挡三个敌人，承受正面压力。",
    talents: [
      "战术装甲：概率抵挡受到的伤害。",
      "特种作战策略：提高在场重装干员的防御。",
    ],
    skills: [
      ["战意", "防御提高65%，攻击提高30%。"],
      ["荆棘", "常态防御增加21%，受攻击时向攻击者反击80%攻击力的物理伤害。"],
      ["力之锯", "攻击增加95%、防御增加60%，持续切割前方一格内敌人。"],
    ],
    stats: [3850, 430, 723, 0, 3, 23],
    relationships: [
      relation("lungmen", "活动城市"),
      relation("higashi", "出身地"),
      relation("operator-chen", "近卫局同僚"),
    ],
  }),
  op({
    slug: "texas",
    name: "德克萨斯",
    en: "TEXAS",
    tagline: "目的地，总会抵达",
    summary:
      "企鹅物流的运输员工，习惯以简短言语和可靠行动完成工作。她的剑术让普通送货也能应对意外。",
    rarity: 5,
    profession: "先锋",
    branch: "尖兵",
    race: "鲁珀",
    birthplace: "哥伦比亚",
    affiliation: "企鹅物流",
    trait: "能够同时阻挡两名敌人。",
    talents: ["战术快递：编队后额外获得初始部署费用。"],
    skills: [
      ["冲锋号令·γ型", "自动回复12点部署费用。"],
      ["剑雨", "获得11点费用，向周围发动两次135%法术伤害，并晕眩目标2秒。"],
    ],
    stats: [1950, 500, 343, 0, 2, 13],
    relationships: [
      relation("penguin-logistics", "所属势力"),
      relation("columbia", "出身地"),
      relation("lungmen", "活动城市"),
      relation("operator-exusiai", "物流搭档"),
      relation("operator-lappland", "相关人物"),
      relation("siracusa", "过往关联", true),
    ],
  }),
  op({
    slug: "exusiai",
    name: "能天使",
    en: "EXUSIAI",
    tagline: "派对开场，弹匣就位",
    summary:
      "来自拉特兰的萨科塔，也是企鹅物流活跃的一员。她擅长铳械，保持着乐观直率的态度，将快递任务和伙伴的日常都过得热闹而充满活力。",
    rarity: 6,
    profession: "狙击",
    branch: "速射手",
    race: "萨科塔",
    birthplace: "拉特兰",
    affiliation: "企鹅物流",
    trait: "优先攻击空中目标。",
    talents: [
      "快速弹匣：提高自身攻击速度。",
      "天使的祝福：提高自身与随机友方干员的攻击及生命上限。",
    ],
    skills: [
      ["冲锋模式", "下次攻击变为三连射，每发造成121%伤害。"],
      ["扫射模式", "攻击改为四连射，每发造成110%伤害。"],
      ["过载模式", "自动进入五连射模式，攻击间隔减少0.16秒。"],
    ],
    stats: [1673, 540, 161, 0, 1, 14],
    relationships: [
      relation("penguin-logistics", "所属势力"),
      relation("laterano", "出身地"),
      relation("lungmen", "活动城市"),
      relation("operator-texas", "物流搭档"),
    ],
  }),
  op({
    slug: "lappland",
    name: "拉普兰德",
    en: "LAPPLAND",
    tagline: "双刃之间，狼魂回响",
    summary:
      "来自叙拉古的鲁珀剑士。她以双剑和源石技艺展开攻击，行为难以预测；与德克萨斯之间的复杂联系，是理解其经历的一条线索。",
    rarity: 5,
    profession: "近卫",
    branch: "领主",
    race: "鲁珀",
    birthplace: "叙拉古",
    affiliation: "叙拉古",
    trait: "可进行攻击力有所降低的远程攻击。",
    talents: ["精神摧毁：攻击使可被沉默的目标失去特殊能力。"],
    skills: [
      ["日晷", "永久增加55%攻击，并提供30%物理闪避。"],
      [
        "狼魂",
        "自动增加90%攻击，攻击转为法术并增加一个目标；远程攻击不再受减伤限制。",
      ],
    ],
    stats: [2350, 685, 365, 15, 2, 19],
    relationships: [
      relation("siracusa", "出身地"),
      relation("operator-texas", "相关人物"),
    ],
  }),
  op({
    slug: "silverash",
    name: "银灰",
    en: "SILVERASH",
    tagline: "雪境之上，目光更远",
    summary:
      "喀兰贸易的掌舵人，出身谢拉格希瓦艾什家族。他将商业往来与雪境的未来紧密相连，擅长在长远布局中衡量风险，也以锋利剑术亲自参与战斗。",
    rarity: 6,
    profession: "近卫",
    branch: "领主",
    race: "菲林",
    birthplace: "谢拉格",
    affiliation: "喀兰贸易",
    trait: "近距离交战，也能进行远程攻击。",
    talents: [
      "领袖：提高自身攻击，缩短队伍的再部署等待。",
      "鹰眼视觉：使范围内敌人的隐匿失效。",
    ],
    skills: [
      ["强力击·γ型", "下次攻击提升至225%攻击力。"],
      ["雪境生存法则", "切换为近距离防守，防御增加65%，每秒恢复4%最大生命。"],
      ["真银斩", "防御降低70%，攻击增加140%，扩大范围并同时斩击最多五个目标。"],
    ],
    stats: [2560, 713, 397, 10, 2, 20],
    relationships: [
      relation("karlan", "所属势力"),
      relation("kjerag", "出身地"),
      relation("operator-pramanix", "家人"),
      relation("operator-gnosis", "合作伙伴"),
    ],
  }),
  op({
    slug: "pramanix",
    name: "初雪",
    en: "PRAMANIX",
    tagline: "铃声越过雪山",
    summary:
      "谢拉格的宗教人士，与希瓦艾什家族有着紧密联系。她所承担的职责与个人愿望并不总能重合；战斗中以铃声和术法削弱对手。",
    rarity: 5,
    profession: "辅助",
    branch: "削弱者",
    race: "菲林",
    birthplace: "谢拉格",
    affiliation: "谢拉格",
    trait: "以法术攻击敌人，技能侧重削弱。",
    talents: ["虚弱化：低生命敌人受到脆弱效果。", "双响：可同时攻击两个目标。"],
    skills: [
      ["传音回响", "同时攻击两个目标，使范围内敌人攻速降低50。"],
      ["自然震慑", "范围内敌人的防御降低45%，法术抗性降低26%。"],
    ],
    stats: [1605, 430, 102, 25, 1, 12],
    relationships: [
      relation("kjerag", "出身地"),
      relation("operator-silverash", "家人"),
      relation("item-jerag-stone", "地区文化"),
    ],
  }),
  op({
    slug: "gnosis",
    name: "灵知",
    en: "GNOSIS",
    tagline: "以冷静思考，触及未来",
    summary:
      "出身谢拉格的研究者，参与喀兰贸易的技术事务。他重视效率与科学方法，以冰冷的源石技艺控制战场，对雪境的发展有着自己的判断。",
    rarity: 6,
    profession: "辅助",
    branch: "削弱者",
    race: "黎博利",
    birthplace: "谢拉格",
    affiliation: "喀兰贸易",
    trait: "进行法术攻击，配合寒冷与冻结控制。",
    talents: [
      "坚冰：攻击施加寒冷，寒冷与冻结目标受到脆弱效果。",
      "殊途同归：在场一段时间后，使谢拉格干员获得抵抗。",
    ],
    skills: [
      ["高速思考", "下次进行两次150%法术攻击。"],
      ["零度爆发", "范围160%法术伤害并附带3秒寒冷；蓄力增加一层寒冷。"],
      [
        "失温症",
        "同时攻击两人并大幅增加攻速，冻结持续至技能结束，最后对冻结目标造成400%法术伤害。",
      ],
    ],
    stats: [2035, 455, 132, 25, 1, 13],
    relationships: [
      relation("karlan", "所属势力"),
      relation("kjerag", "出身地"),
      relation("operator-silverash", "合作伙伴"),
    ],
  }),
  op({
    slug: "saria",
    name: "塞雷娅",
    en: "SARIA",
    tagline: "用坚实的防线，承担责任",
    summary:
      "曾负责莱茵生命防卫工作的研究人员，来自哥伦比亚。她将钙质化源石技艺用于防御与治疗，理性严谨的外表下，也承担着无法轻易放下的责任。",
    rarity: 6,
    profession: "重装",
    branch: "守护者",
    race: "瓦伊凡",
    birthplace: "哥伦比亚",
    affiliation: "莱茵生命",
    trait: "可通过技能治疗友方单位。",
    talents: [
      "莱茵充能护服：随在场时间提升攻击与防御。",
      "精神回复：治疗友方时帮助目标回复技力。",
    ],
    skills: [
      ["急救", "为附近生命不高于一半的友方恢复150%攻击力的生命，可存两次。"],
      ["药物配置", "为附近全部友军恢复110%攻击力的生命。"],
      [
        "钙质化",
        "持续治疗附近友方；敌人受到的法术伤害增加40%，移动速度降低60%。",
      ],
    ],
    stats: [3150, 485, 595, 10, 3, 22],
    relationships: [
      relation("rhine-lab", "所属势力"),
      relation("columbia", "出身地"),
      relation("operator-ifrit", "相关人物"),
      relation("operator-ptilopsis", "科研同僚"),
    ],
  }),
  op({
    slug: "ifrit",
    name: "伊芙利特",
    en: "IFRIT",
    tagline: "火焰划过，留下一条直线",
    summary:
      "与莱茵生命相关的年轻感染者，目前在罗德岛接受治疗与照护。她使用特殊装备操纵猛烈火焰，直率急躁的表现之外，也在学习如何理解身边的人。",
    rarity: 6,
    profession: "术师",
    branch: "轰击术师",
    race: "萨卡兹",
    birthplace: "未公开",
    affiliation: "莱茵生命",
    trait: "对狭长直线范围的敌人造成群体法术伤害。",
    talents: [
      "精神融解：降低攻击范围内敌人的法术抗性。",
      "莱茵回路：周期性获得额外技力。",
    ],
    skills: [
      ["狂热", "攻击提高20%，攻击速度增加67。"],
      [
        "炎爆",
        "下次造成190%法术伤害并灼烧，命中目标防御降低200，持续3秒；可存三次。",
      ],
      [
        "灼地",
        "每秒对范围内地面敌人造成110%法术伤害并降低10法抗，自身持续损失生命。",
      ],
    ],
    stats: [1680, 870, 130, 20, 1, 34],
    relationships: [
      relation("rhine-lab", "档案所属"),
      relation("rhodes-island", "医疗照护"),
      relation("operator-saria", "相关人物"),
      relation("operator-ptilopsis", "相关人物"),
    ],
  }),
  op({
    slug: "ptilopsis",
    name: "白面鸮",
    en: "PTILOPSIS",
    tagline: "信息整理完毕，治疗继续",
    summary:
      "莱茵生命的数据维护人员，具备医疗与信息处理经验。她以近似系统提示的方式交流，仍然认真关心伙伴的状况，在罗德岛承担治疗与支援任务。",
    rarity: 5,
    profession: "医疗",
    branch: "群愈师",
    race: "黎博利",
    birthplace: "哥伦比亚",
    affiliation: "莱茵生命",
    trait: "同时治疗三个友方目标。",
    talents: ["技力光环：在场时提高友方技力自然回复速度，同类效果取最高。"],
    skills: [
      ["治疗强化·γ型", "攻击增加70%，提高治疗量。"],
      ["脑啡肽", "扩大治疗范围，攻击间隔缩短1.9秒。"],
    ],
    stats: [1610, 335, 150, 0, 1, 17],
    relationships: [
      relation("rhine-lab", "所属势力"),
      relation("columbia", "出身地"),
      relation("operator-saria", "科研同僚"),
    ],
  }),
  op({
    slug: "skadi",
    name: "斯卡蒂",
    en: "SKADI",
    tagline: "潮声来自遥远的故乡",
    summary:
      "独自行动的赏金猎人，与阿戈尔和深海猎人有关。她以沉重武器发挥惊人的近战力量，寡言的外表让人难以接近，却并非对伙伴的安危毫不在意。",
    rarity: 6,
    profession: "近卫",
    branch: "无畏者",
    race: "未公开",
    birthplace: "阿戈尔",
    affiliation: "深海猎人",
    trait: "阻挡一个敌人，以高攻击进行单体近战。",
    talents: [
      "深海掠食者：编入队伍时提高深海猎人的攻击。",
      "迅捷出击：精英二时再部署时间减少10秒。",
    ],
    skills: [
      ["迅捷打击·γ型", "攻击增加34%，攻速增加35。"],
      ["跃浪击", "部署后的25秒内攻击增加120%。"],
      ["涌潮悲歌", "攻击、防御和生命上限同时增加100%。"],
    ],
    stats: [3866, 1015, 263, 0, 1, 19],
    relationships: [
      relation("aegir", "出身地"),
      relation("operator-specter", "深海猎人"),
      relation("iberia", "活动地区"),
      relation("enemy-first-to-talk", "相关敌人"),
    ],
    notes:
      "此处为近卫斯卡蒂，不与浊心斯卡蒂的属性合并。基础再部署列为70秒；精英二天赋会另行减去10秒。",
  }),
  op({
    slug: "specter",
    name: "幽灵鲨",
    en: "SPECTER",
    tagline: "歌声与锯刃，一同回响",
    summary:
      "与深海猎人有关的阿戈尔来客，在罗德岛接受治疗。她身穿修女服，战斗中展现出强大的耐力和近战能力，时而流露的言语留下了许多等待厘清的经历。",
    rarity: 5,
    profession: "近卫",
    branch: "强攻手",
    race: "未公开",
    birthplace: "阿戈尔",
    affiliation: "深海猎人",
    trait: "同时攻击等同于阻挡数的敌人，精英二可阻挡三个。",
    talents: ["深海再生力：提高生命上限，并持续回复生命。"],
    skills: [
      ["攻击力强化·γ型", "攻击增加60%。"],
      ["肉斩骨断", "攻击增加100%，期间生命不低于1；结束后晕眩10秒。"],
    ],
    stats: [2630, 725, 355, 0, 3, 23],
    relationships: [
      relation("aegir", "出身地"),
      relation("operator-skadi", "深海猎人"),
      relation("operator-specter-unchained", "异格档案"),
    ],
  }),
  op({
    slug: "specter-unchained",
    name: "归溟幽灵鲨",
    en: "SPECTER THE UNCHAINED",
    tagline: "听清自己的声音",
    summary:
      "幽灵鲨的异格档案，以新的姿态延续深海猎人的战斗。她不再只是旁人记忆中的安静病人，更愿意表达自己的意志与审美，在本体与替身的交替中掌握节奏。",
    rarity: 6,
    profession: "特种",
    branch: "傀儡师",
    race: "阿戈尔",
    birthplace: "阿戈尔",
    affiliation: "深海猎人",
    trait: "遭受致命伤时转为不阻挡的替身，一段时间后恢复本体。",
    talents: [
      "拥抱自我：替身对周围敌人造成减速和持续法术伤害。",
      "阿戈尔的深邃：提高深海猎人的生命上限。",
    ],
    skills: [
      [
        "生存的技巧",
        "与范围内生命比例最低的其他干员交换生命比例，自身攻击增加120%。",
      ],
      ["生存的渴望", "攻击增加100%、攻速增加34，生命不低于1；结束后切换替身。"],
      [
        "生存的重压",
        "大幅提升攻击和生命，攻击所有阻挡目标；比较双方生命比例后追加伤害或损失自身生命。",
      ],
    ],
    stats: [2803, 737, 322, 0, 2, 16],
    relationships: [
      relation("operator-specter", "原型档案"),
      relation("aegir", "出身地"),
      relation("operator-skadi", "深海猎人"),
    ],
    notes:
      "异格与原型除信赖外各自培养，本档案为特种傀儡师形态；不把近卫技能及面板相加。",
  }),
  op({
    slug: "nearl",
    name: "临光",
    en: "NEARL",
    tagline: "骑士的光，照向身旁的人",
    summary:
      "来自卡西米尔的库兰塔骑士，作为使徒的一员与罗德岛同行。她将盾牌与治疗术法用于保护伙伴，身体力行地坚持骑士应当帮助他人的信念。",
    rarity: 5,
    profession: "重装",
    branch: "守护者",
    race: "库兰塔",
    birthplace: "卡西米尔",
    affiliation: "使徒",
    trait: "使用技能治疗附近友方。",
    talents: ["天马光环：在场时提高友方单位的医疗效果。"],
    skills: [
      [
        "急救",
        "治疗附近生命不高于一半的目标，回复150%攻击力的生命，可存两次。",
      ],
      [
        "急救模式",
        "攻击增加50%，停止攻击，改为治疗周围友方，治疗间隔相应延长。",
      ],
    ],
    stats: [2780, 462, 575, 10, 3, 21],
    relationships: [
      relation("kazimierz", "出身地"),
      relation("rhodes-island", "合作组织"),
      relation("operator-nearl-radiant", "异格档案"),
    ],
  }),
  op({
    slug: "nearl-radiant",
    name: "耀骑士临光",
    en: "NEARL THE RADIANT KNIGHT",
    tagline: "让骑士的光，越过竞技场",
    summary:
      "临光以耀骑士之名重返人们的视野。她手中的武器与战斗方式改变了，保护弱者的信念仍然清晰；这份档案连接卡西米尔的竞技场和骑士精神。",
    rarity: 6,
    profession: "近卫",
    branch: "无畏者",
    race: "库兰塔",
    birthplace: "卡西米尔",
    affiliation: "卡西米尔",
    trait: "阻挡一个目标，使用高威力近战攻击。",
    talents: [
      "不畏苦暗：部署时对周围敌人造成真实伤害与晕眩。",
      "破晓：攻击无视部分防御。",
    ],
    skills: [
      ["灿焰长刃", "扩大射程，攻击增加55%、攻速增加38，持续时间无限。"],
      [
        "逐夜烁光",
        "部署不占部署位，攻击增加120%并获得三层护盾；结束自动撤退，有条件调整再部署惩罚。",
      ],
      [
        "耀阳颔首",
        "召唤耀阳并扩大射程，提高攻防；攻击自身或耀阳阻挡的目标时造成真实伤害。",
      ],
    ],
    stats: [3550, 1064, 295, 0, 1, 19],
    relationships: [
      relation("operator-nearl", "原型档案"),
      relation("kazimierz", "出身地"),
      relation("kawalerielki", "活动城市"),
    ],
    notes:
      "本档案是近卫异格，原型重装临光单独收录。逐夜烁光的部署位与再部署规则属于技能效果。",
  }),
  op({
    slug: "siege",
    name: "推进之王",
    en: "SIEGE",
    tagline: "街巷之间，重锤开路",
    summary:
      "来自维多利亚的格拉斯哥帮领袖。她与伙伴一同来到罗德岛，以重锤和强健身手参与先锋任务；街头生活与她更久远的经历之间仍有未展开的部分。",
    rarity: 6,
    profession: "先锋",
    branch: "尖兵",
    race: "阿斯兰",
    birthplace: "维多利亚",
    affiliation: "格拉斯哥帮",
    trait: "同时阻挡两名敌人。",
    talents: [
      "万兽之王：提高在场先锋干员的攻击与防御。",
      "粉碎：附近敌人被击倒时获得技力。",
    ],
    skills: [
      ["冲锋号令·γ型", "自动获得12点部署费用。"],
      ["跃空锤", "下次对周围造成280%物理伤害，获得3点费用，可存三次。"],
      ["碎颅击", "攻击间隔延长，攻击提升至320%倍率，并概率晕眩目标。"],
    ],
    stats: [2251, 515, 384, 0, 2, 14],
    relationships: [
      relation("victoria", "出身地"),
      relation("londinium", "相关城市"),
      relation("rhodes-island", "合作组织"),
    ],
    spoiler: "维多利亚篇章会进一步揭开她的身份，以及她与伦蒂尼姆命运的联系。",
  }),
  op({
    slug: "reed",
    name: "苇草",
    en: "REED",
    tagline: "微弱的火光，也能照亮道路",
    summary:
      "在维多利亚获救后接受罗德岛治疗的感染者。她习惯安静地观察，以特殊火焰参与战斗；对自身力量的谨慎，也影响着她与他人建立联系的方式。",
    rarity: 5,
    profession: "先锋",
    branch: "冲锋手",
    race: "德拉克",
    birthplace: "维多利亚",
    affiliation: "维多利亚",
    trait: "击败敌人获得部署费用，撤退时返还初始部署费用。",
    talents: ["枯法之血：精英二时额外获得20点法术抗性。"],
    skills: [
      ["迅捷打击·γ型", "攻击增加34%，攻速增加35。"],
      [
        "生灵火花",
        "攻击增加60%，每击附加25%法术伤害，击杀时额外回复1点部署费用。",
      ],
    ],
    stats: [2215, 562, 364, 0, 1, 12],
    relationships: [
      relation("victoria", "出身地"),
      relation("rhodes-island", "医疗照护"),
    ],
    notes:
      "本页采用先锋苇草。基础法抗为0，精英二天赋另行增加20；焰影苇草为独立异格，不混合面板。",
  }),
  op({
    slug: "eyjafjalla",
    name: "艾雅法拉",
    en: "EYJAFJALLA",
    tagline: "循着火山，读懂大地",
    summary:
      "来自莱塔尼亚的火山学者，也是天灾信使。她忍受矿石病造成的身体负担，坚持记录地质变化并继续研究，在罗德岛提供灾害与源石方面的专业协助。",
    rarity: 6,
    profession: "术师",
    branch: "中坚术师",
    race: "卡普里尼",
    birthplace: "莱塔尼亚",
    affiliation: "莱塔尼亚",
    trait: "单体法术攻击，技能可提供范围火力。",
    talents: [
      "炎息：提高在场友方术师的攻击。",
      "乱火：部署时立即获得一定范围内的随机技力。",
    ],
    skills: [
      ["二重咏唱", "攻速增加45；第二次及以后施放另加45%攻击。"],
      [
        "点燃",
        "下次造成310%法术伤害并溅射，降低目标周围敌人的法抗；可存两次。",
      ],
      ["火山", "攻击增加85%，扩大范围并加快攻击，随机攻击最多五名敌人。"],
    ],
    stats: [1743, 645, 122, 20, 1, 21],
    relationships: [
      relation("leithanien", "出身地"),
      relation("catastrophes", "研究领域"),
      relation("siesta", "活动地区"),
      relation("item-siesta-obsidian", "地质线索"),
    ],
  }),
  op({
    slug: "suzuran",
    name: "铃兰",
    en: "SUZURAN",
    tagline: "把温柔，化为同行的力量",
    summary:
      "出身东国的沃尔珀，在罗德岛接受治疗与训练。她待人认真温和，用自己能够掌握的源石技艺帮助伙伴；有关叙拉古的家庭经历也构成了她的成长背景。",
    rarity: 6,
    profession: "辅助",
    branch: "凝滞师",
    race: "沃尔珀",
    birthplace: "东国",
    affiliation: "叙拉古",
    trait: "法术攻击对目标附加短暂停顿。",
    talents: [
      "技力光环·辅助：提高在场辅助干员的技力自然回复。",
      "画地为牢：攻击范围内停顿目标受到脆弱效果。",
    ],
    skills: [
      ["全力以赴", "自动提高60%攻击与15攻速。"],
      ["儿时的舞乐", "攻击增加30%，同时攻击两名目标，持续时间无限。"],
      [
        "狐火渺然",
        "停止攻击并扩大范围，持续停顿敌人、强化脆弱效果，同时为友方持续恢复生命。",
      ],
    ],
    stats: [1480, 521, 128, 25, 1, 16],
    relationships: [
      relation("higashi", "出身地"),
      relation("siracusa", "档案所属"),
      relation("rhodes-island", "医疗照护"),
      relation("wolumonde", "活动城市"),
    ],
  }),
];

type EnemyInput = {
  slug: string;
  name: string;
  en: string;
  code: string;
  rank: string;
  species?: string;
  movement?: string;
  attackType: string;
  summary: string;
  abilities: string[];
  stats: [number, number, number, number];
  relationships: EntryRelationship[];
  stages?: string[];
  representative: string;
  page?: string;
  spoiler?: string;
};
function foe(r: EnemyInput): EnemyEntry {
  const [hp, atk, def, res] = r.stats;
  return {
    ...common(
      `enemy-${r.slug}`,
      r.name,
      r.en,
      r.summary,
      `${r.code} / ${r.rank} · ${r.movement ?? "地面"}`,
      r.relationships,
      r.page,
    ),
    kind: "enemy",
    tags: [r.rank, r.species ?? "无种类", r.movement ?? "地面", r.attackType],
    facts: [
      { label: "图鉴编号", value: r.code },
      { label: "地位级别", value: r.rank },
      { label: "攻击方式", value: r.attackType },
      { label: "代表关卡", value: r.representative },
    ],
    sections: [
      { title: "目标识别", body: r.summary },
      {
        title: "遭遇记录",
        body: `代表关卡：${r.representative}。同名敌人可能按关卡采用不同级别或附加参数。`,
      },
      {
        title: "数值口径",
        body: "展示PRTS级别0的基础数据；天赋、关卡参数与阶段加成不并入基础面板。级别不同于战斗阶段。",
      },
      ...(r.spoiler
        ? [{ title: "故事追记", body: r.spoiler, spoiler: true }]
        : []),
    ],
    enemy: {
      code: r.code,
      rank: r.rank,
      species: r.species ?? "无种类",
      movement: r.movement ?? "地面",
      attackType: r.attackType,
      abilities: r.abilities,
      stages: r.stages,
      stats: {
        hp,
        atk,
        def,
        res,
        basis: "通常数据 · 级别0基础属性 · 不含天赋 / 阶段 / 关卡加成",
      },
    },
  };
}
export const enemies: EnemyEntry[] = [
  foe({
    slug: "originium-slug",
    name: "源石虫",
    en: "ORIGINIUM SLUG",
    code: "B1",
    rank: "普通",
    species: "感染生物",
    attackType: "近战 · 物理",
    summary:
      "在泰拉荒野活动的感染生物，智能较低。成群出现时会冲入设施，也可能被敌方术师利用，成为罗德岛早期行动中常见的威胁。",
    abilities: ["无特殊技能；以集群与数量形成压力。"],
    stats: [550, 130, 0, 0],
    representative: "0-1 坍塌",
    relationships: [
      relation("originium", "生态关联"),
      relation("oripathy", "感染现象"),
      relation("chernobog", "遭遇地区"),
    ],
  }),
  foe({
    slug: "hound",
    name: "猎狗",
    en: "HOUND",
    code: "O1",
    rank: "普通",
    species: "感染生物",
    attackType: "近战 · 物理",
    summary:
      "整合运动用于技术侦察的生物，携带监控装置。它移动迅速，容易在防线尚未形成时穿过空隙，需要及时部署能够阻挡的作战单位。",
    abilities: ["行进速度较快，通常没有额外主动技能。"],
    stats: [820, 190, 0, 20],
    representative: "0-5 腐化",
    relationships: [
      relation("reunion", "使用势力"),
      relation("chernobog", "遭遇地区"),
    ],
  }),
  foe({
    slug: "crossbowman",
    name: "弩手",
    en: "CROSSBOWMAN",
    code: "A1",
    rank: "普通",
    attackType: "远程 · 物理",
    summary:
      "整合运动的基础射击人员，使用缴获或通过其他渠道取得的装备。统一服装与面具遮掩了个人身份，远程火力会持续威胁防线后的干员。",
    abilities: ["在距离内进行物理射击；被阻挡时改为近距离攻击。"],
    stats: [1400, 240, 100, 0],
    representative: "乌萨斯 切尔诺伯格",
    relationships: [
      relation("reunion", "所属势力"),
      relation("chernobog", "遭遇地区"),
    ],
  }),
  foe({
    slug: "caster",
    name: "术师",
    en: "CASTER",
    code: "A3",
    rank: "普通",
    attackType: "远程 · 法术",
    summary:
      "整合运动的基础法术作战人员。相较于常规射击单位，其攻击依赖源石技艺，能对重视物理防护的防线造成不同形式的压力。",
    abilities: [
      "远距离法术攻击。",
      "通常级别0拥有较高法术抗性；避免仅凭外观判断弱点。",
    ],
    stats: [1600, 200, 50, 50],
    representative: "1-8 意志",
    relationships: [
      relation("reunion", "所属势力"),
      relation("arts", "攻击技术"),
    ],
  }),
  foe({
    slug: "monster",
    name: "妖怪",
    en: "MONSTER",
    code: "D1",
    rank: "普通",
    species: "无人机",
    movement: "飞行",
    attackType: "不攻击",
    summary:
      "由敌方人员控制的早期无人机型号。飞行路径使它能够越过地面阻挡；本型号不会进行普通攻击，需要具备对空能力的干员处理。",
    abilities: [
      "飞行单位，不能用普通地面阻挡拦截。",
      "不进行普通攻击；与配备武器的后续型号分开记录。",
    ],
    stats: [800, 0, 50, 0],
    representative: "TR-3 精确打击",
    relationships: [
      relation("arts", "驱动技术"),
      relation("enemy-crossbowman", "基础敌人"),
    ],
  }),
  foe({
    slug: "heavy-defender",
    name: "重装防御者",
    en: "HEAVY DEFENDER",
    code: "8",
    rank: "精英",
    attackType: "近战 · 物理",
    summary:
      "穿戴重型全套防具的整合运动战士，具备较强正面战斗能力。装甲使低攻击的物理火力难以奏效，是引导战术转向法术输出的典型敌人。",
    abilities: [
      "基础物理防御较高，移动速度相对缓慢。",
      "没有法术抗性加成的通常数据与高物理防御形成明显差异。",
    ],
    stats: [6000, 600, 800, 0],
    representative: "2-3 无罪推定",
    relationships: [
      relation("reunion", "所属势力"),
      relation("enemy-caster", "战场配合"),
    ],
  }),
  foe({
    slug: "sarkaz-caster",
    name: "萨卡兹术师",
    en: "SARKAZ CASTER",
    code: "S5",
    rank: "精英",
    species: "萨卡兹",
    attackType: "远程 · 法术",
    summary:
      "具备复杂法术能力的萨卡兹雇佣兵。除了常规远程攻击，还会用枷锁牵制单名干员，限制其行动并持续制造治疗压力。",
    abilities: [
      "枷锁持续控制一个目标并造成法术伤害，通常仅能施放一次。",
      "施法可被相应控制或沉默打断；法术抗性较高。",
    ],
    stats: [12000, 500, 200, 50],
    representative: "4-8 应激反应",
    relationships: [
      relation("kazdel", "文化背景"),
      relation("arts", "攻击技术"),
    ],
  }),
  foe({
    slug: "guerrilla-shieldguard",
    name: "游击队盾卫",
    en: "GUERRILLA SHIELDGUARD",
    code: "SP0",
    rank: "精英",
    attackType: "近战 · 物理",
    summary:
      "追随爱国者的精锐防卫战士，以厚重装甲与盾牌掩护同行者。吸引火力是他们的战术职责，强韧防护让后方敌人能够持续推进。",
    abilities: [
      "嘲讽等级提升，使我方攻击更容易选中其自身。",
      "高防御与高法术抗性并存；实际能力还会受到战场指挥效果影响。",
    ],
    stats: [15000, 700, 1300, 60],
    representative: "7-13 感染者之盾-1",
    relationships: [
      relation("reunion", "所属势力"),
      relation("enemy-patriot", "追随领袖"),
      relation("item-guerrilla-badge", "相关物件"),
      relation("chernobog", "行动地区"),
    ],
  }),
  foe({
    slug: "winterwisp-blood-shaman",
    name: "冬灵血巫",
    en: "WINTERWISP BLOOD SHAMAN",
    code: "L7",
    rank: "精英",
    attackType: "近战 · 法术",
    summary:
      "使用冬灵古老巫术的当地战斗人员，曾在沃伦姆德周边出现。它们的危险不仅来自正面攻击，也来自倒下时对附近法术设备和干员造成的冲击。",
    abilities: [
      "持续流失自身生命。",
      "死亡时造成范围法术爆炸，并夺取范围内留声机的控制权。",
    ],
    stats: [20000, 500, 300, 50],
    representative: "TW-4 复仇之魂",
    relationships: [
      relation("wolumonde", "遭遇地区"),
      relation("leithanien", "关联国家"),
      relation("item-wolumonde-warrant", "活动物件"),
    ],
  }),
  foe({
    slug: "mudrock",
    name: "泥岩（敌方）",
    en: "MUDROCK",
    page: "泥岩(敌方)",
    code: "MR",
    rank: "领袖",
    species: "萨卡兹",
    attackType: "近战 · 物理",
    summary:
      "带领感染者小队在莱塔尼亚荒野间流浪的战士，曾加入整合运动。敌方档案记录她在沃伦姆德事件中的战斗表现，与可招募干员的培养资料分开。",
    abilities: [
      "攻击逐渐叠加永久攻击增益，最多六层。",
      "法术屏障存在时提高生命上限与攻速，并定期刷新。",
      "能夺取最近的非敌方留声机。",
    ],
    stats: [45000, 800, 1000, 30],
    representative: "TW-8 月光沉沦",
    relationships: [
      relation("wolumonde", "遭遇地区"),
      relation("reunion", "过往组织"),
      relation("enemy-winterwisp-blood-shaman", "同活动敌人"),
    ],
  }),
  foe({
    slug: "crownslayer",
    name: "弑君者（敌方）",
    en: "CROWNSLAYER",
    page: "弑君者(敌方)",
    code: "CS",
    rank: "领袖",
    attackType: "近战 · 物理",
    summary:
      "负责潜入与突袭的整合运动干部，擅长避开拦截并绕到阵线后方。敌方资料着重记录其突破阻挡的机制，不能直接用于同名干员的属性比较。",
    abilities: [
      "被阻挡时可施放闪现，越过阻挡单位。",
      "突破能力有技能周期，需要多层阻挡或合适控制衔接。",
    ],
    stats: [6000, 400, 120, 50],
    representative: "1-8 意志",
    relationships: [
      relation("reunion", "所属势力"),
      relation("chernobog", "行动地区"),
    ],
  }),
  foe({
    slug: "skullshatterer",
    name: "碎骨",
    en: "SKULLSHATTERER",
    code: "SS",
    rank: "领袖",
    attackType: "近战 / 远程 · 物理",
    summary:
      "整合运动突击部队中的重火力干部，使用源石爆破物和发射器。远距离榴弹与近距离攻击都需要谨慎处理，龙门外围留下过其行动记录。",
    abilities: [
      "未被阻挡时发射榴弹，伤害目标及邻近单位并短暂降低防御。",
      "生命低于一半时攻击提高。",
    ],
    stats: [10500, 1000, 150, 30],
    representative: "2-10 病入膏肓",
    relationships: [
      relation("reunion", "所属势力"),
      relation("lungmen", "遭遇地区"),
    ],
    spoiler:
      "“碎骨”这一身份在早期主线中牵连不止一位人物，具体经过请在阅读第二、三章后展开原始故事资料。",
  }),
  foe({
    slug: "frostnova",
    name: "霜星",
    en: "FROSTNOVA",
    code: "FN",
    rank: "领袖",
    attackType: "远程 · 法术",
    summary:
      "整合运动的法术部队干部，与雪怪小队共同活动。她的冰冷术法既攻击干员，也改变可部署地形，使一场战斗的安全空间不断收缩。",
    abilities: [
      "冰环造成范围法术伤害，并降低受到影响者的攻击速度。",
      "冻结地块并使其无法再次部署。",
      "首次被击倒后恢复生命，重生后攻击提高。",
    ],
    stats: [25000, 420, 250, 50],
    stages: [
      "初始阶段：以冰环与冻结地块压缩防线。",
      "重生后：恢复生命，攻击获得额外提升；不等于切换PRTS级别。",
    ],
    representative: "4-10 灯火将熄",
    relationships: [
      relation("reunion", "所属势力"),
      relation("enemy-patriot", "相关人物"),
      relation("chernobog", "遭遇地区"),
    ],
    spoiler:
      "后续主线将进一步描写霜星与罗德岛、爱国者之间的关系。本档案不将另一敌人条目“霜星·冬痕”的参数混入。",
  }),
  foe({
    slug: "patriot",
    name: "爱国者",
    en: "PATRIOT",
    code: "PT",
    rank: "领袖",
    species: "萨卡兹",
    attackType: "近战 / 远程 · 物理",
    summary:
      "游击队的领袖，以重甲、巨盾和长戟屹立于战场。经历漫长战争的萨卡兹战士始终保护追随者，其战斗方式随行军与毁灭姿态显著改变。",
    abilities: [
      "在场时强化敌方攻击与防御。",
      "行军姿态具备高额防护与四连击。",
      "毁灭姿态可向远方高台单位投枪，并对周围持续造成真实伤害。",
    ],
    stats: [45000, 1600, 500, 45],
    stages: [
      "行军：额外提高攻击、防御、法术抗性和嘲讽。基础防御500不是该姿态的最终防御。",
      "重生：无法移动，持续对周围造成伤害，之后恢复生命。",
      "毁灭：获得多种控制免疫，使用投枪与持续范围伤害。",
    ],
    representative: "7-18 爱国者",
    relationships: [
      relation("reunion", "所属势力"),
      relation("enemy-guerrilla-shieldguard", "游击队战士"),
      relation("enemy-frostnova", "相关人物"),
      relation("chernobog", "遭遇地区"),
      relation("item-guerrilla-badge", "相关物件"),
    ],
  }),
  foe({
    slug: "first-to-talk",
    name: "首言者",
    en: "FIRST TO TALK",
    code: "FTT",
    rank: "精英",
    species: "海怪",
    attackType: "远程 · 物理",
    summary:
      "在伊比利亚海岸事件中出现的海嗣，能够以人类语言交流。它的交流方式与生物本能交织，战斗时会以液泡对周边目标造成神经损伤。",
    abilities: [
      "普通攻击附带神经损伤。",
      "侵蚀液泡连续攻击目标附近神经损伤积累较少的我方单位，造成物理伤害和神经损伤。",
    ],
    stats: [21000, 600, 500, 20],
    representative: "SV-8 亲族",
    relationships: [
      relation("iberia", "遭遇地区"),
      relation("aegir", "海洋关联"),
      relation("operator-skadi", "相关人物"),
      relation("enemy-quintus", "同活动敌人"),
    ],
  }),
  foe({
    slug: "quintus",
    name: "盐风主教昆图斯",
    en: "QUINTUS",
    code: "SVK",
    rank: "领袖",
    species: "海怪",
    attackType: "远程 · 物理 / 法术",
    summary:
      "在灾后伊比利亚活动的深海教会成员，追求自己理解的海洋与生命。其巨大形态影响整片战场，是《覆潮之下》中需要集中应对的领袖目标。",
    abilities: [
      "优先同时攻击防御最高的两名干员。",
      "大潮覆盖全场并造成神经损伤；崩坍针对多名目标。",
      "召唤子代控制干员，战斗拖延过久将触发失败机制。",
    ],
    stats: [100000, 380, 500, 50],
    stages: [
      "第一形态：使用全场压力与子代召唤。",
      "第二形态：随着生命损失或时间推进而转换，攻击提高。",
      "第三形态：进一步强化攻击与技能节奏，开始物种爆发倒计时。",
    ],
    representative: "SV-9 笃信者",
    relationships: [
      relation("iberia", "活动地区"),
      relation("enemy-first-to-talk", "同活动敌人"),
      relation("operator-specter", "相关故事人物"),
    ],
  }),
];

type ItemInput = {
  slug: string;
  name: string;
  en: string;
  tagline: string;
  summary: string;
  category: string;
  rarity: number;
  usage: string;
  acquisition: string[];
  relationships: EntryRelationship[];
  historical?: boolean;
  recipe?: {
    ingredients: [string, number, string?][];
    cost: number;
    level: number;
  };
};
function item(r: ItemInput): ItemEntry {
  const recipe: ItemEntry["item"]["recipe"] = r.recipe
    ? {
        quantity: 1,
        cost: r.recipe.cost,
        facility: `${r.recipe.level}级加工站`,
        ingredients: r.recipe.ingredients.map(([name, quantity, entryId]) => ({
          name,
          quantity,
          ...(entryId ? { entryId } : { url: wikiUrl(name) }),
        })),
      }
    : undefined;
  const relationships = [
    ...r.relationships,
    ...(recipe?.ingredients
      .filter((i) => i.entryId)
      .map((i) => relation(i.entryId!, "配方材料")) ?? []),
  ];
  return {
    ...common(
      `item-${r.slug}`,
      r.name,
      r.en,
      r.summary,
      r.tagline,
      relationships,
    ),
    kind: "item",
    tags: [r.category, `T${r.rarity}`, ...(r.historical ? ["历史活动"] : [])],
    facts: [
      { label: "物资分类", value: r.category },
      { label: "用途", value: r.usage },
      { label: "资料状态", value: r.historical ? "历史活动记录" : "常规物资" },
    ],
    sections: [
      { title: "物件观察", body: r.summary },
      { title: "用途", body: r.usage },
      { title: "获取途径", body: r.acquisition.join("；") },
      ...(r.historical
        ? [
            {
              title: "历史记录",
              body: "此为对应活动的历史道具资料。兑换、掉落和开放时期以原活动或复刻公告为准，不表示当前仍可获取或兑换。",
            },
          ]
        : []),
      ...(recipe
        ? [
            {
              title: "加工说明",
              body: `在${recipe.facility}中消耗所列原料与${recipe.cost}龙门币，保证产出1件。可能出现的副产物不计入保证产量。未收录原料可通过链接查阅PRTS。`,
            },
          ]
        : []),
    ],
    item: {
      category: r.category,
      rarity: r.rarity,
      usage: r.usage,
      acquisition: r.acquisition,
      recipe,
      historical: r.historical,
    },
  };
}
const materialSources = [
  "对应关卡掉落，具体可用关卡见原始条目",
  "采购中心或活动物资兑换（按开放规则）",
];
export const items: ItemEntry[] = [
  item({
    slug: "originite-prime",
    name: "至纯源石",
    en: "ORIGINITE PRIME",
    tagline: "能量，被切割成规则的形状",
    summary:
      "经过精加工的源石结晶，提取困难而用途广泛。它承载泰拉工业对能源的需求，也在游戏资源系统中用于时装、理智恢复和资源转换。",
    category: "基础道具",
    rarity: 6,
    usage: "购买指定时装、恢复理智或兑换合成玉等；1至纯源石可兑换180合成玉。",
    acquisition: ["首次通关指定关卡", "活动奖励与官方邮件", "采购中心"],
    relationships: [
      relation("originium", "设定关联"),
      relation("item-orundum", "转换产物"),
    ],
  }),
  item({
    slug: "orundum",
    name: "合成玉",
    en: "ORUNDUM",
    tagline: "把新的相遇，储存在晶体中",
    summary:
      "将源石加工并与其他矿物组合得到的合成材料。其早期用途与传导元件有关，如今在罗德岛的人事资源体系中，也成为寻访干员的重要物资。",
    category: "基础道具",
    rarity: 5,
    usage: "用于干员寻访。",
    acquisition: [
      "剿灭作战与悖论模拟",
      "每日、每周任务",
      "贸易站源石订单或至纯源石转换",
    ],
    relationships: [
      relation("item-originite-prime", "转换原料"),
      relation("rhodes-island", "使用组织"),
    ],
  }),
  item({
    slug: "lmd",
    name: "龙门币",
    en: "LMD",
    tagline: "一座城市，与大地流通的尺度",
    summary:
      "由龙门发行并广泛流通的货币，在地区贸易往来中发挥作用。在罗德岛，训练、精英化和加工等日常工作也需要持续投入龙门币。",
    category: "基础道具",
    rarity: 4,
    usage: "干员升级、精英化及加工等多种支出。",
    acquisition: ["货物运送及其他关卡", "贸易站贵金属订单", "任务、活动与商店"],
    relationships: [
      relation("lungmen", "发行城市"),
      relation("item-pure-gold", "贸易物资"),
    ],
  }),
  item({
    slug: "pure-gold",
    name: "赤金",
    en: "PURE GOLD",
    tagline: "工业流水线上，沉甸甸的价值",
    summary:
      "完成提纯与精炼的金条，是罗德岛基建生产链中的常见商品。制造站生产之后，通过贸易站提交贵金属订单，可以将它转化为运营资金。",
    category: "基础道具",
    rarity: 4,
    usage: "提交贸易站贵金属订单，换取龙门币。",
    acquisition: ["制造站生产", "部分关卡、任务或商店奖励"],
    relationships: [
      relation("item-lmd", "贸易产物"),
      relation("rhodes-island", "基建生产"),
    ],
  }),
  item({
    slug: "orirock",
    name: "源岩",
    en: "ORIROCK",
    tagline: "大地留下的第一层材料",
    summary:
      "一种可从地表取得的含有机物岩石，常在源石成分挥发后的地区出现。它既可直接用于基础强化，也构成源岩加工链最初的一环。",
    category: "材料",
    rarity: 1,
    usage: "基础强化；加工为固源岩。",
    acquisition: materialSources,
    relationships: [relation("originium", "地质关联")],
  }),
  item({
    slug: "orirock-cube",
    name: "固源岩",
    en: "ORIROCK CUBE",
    tagline: "细密孔隙，吸附看不见的痕迹",
    summary:
      "带有细密孔隙的源岩固块，适合吸附源石气体分解物，可用于防护结构的夹层。它比原始源岩更适合标准化加工，并能进一步压缩为固源岩组。",
    category: "材料",
    rarity: 2,
    usage: "干员强化及源岩加工链。",
    acquisition: ["加工站合成", ...materialSources],
    relationships: [],
    recipe: { ingredients: [["源岩", 3, "item-orirock"]], cost: 100, level: 1 },
  }),
  item({
    slug: "orirock-cluster",
    name: "固源岩组",
    en: "ORIROCK CLUSTER",
    tagline: "从散碎石块，到工业规格",
    summary:
      "由固源岩进一步压缩成型的材料，也可在自然环境中形成。石块仍然较为易碎，工业采集和分类能力的提高，使成组材料更容易进入加工流程。",
    category: "材料",
    rarity: 3,
    usage: "精英化、技能升级及合成提纯源岩。",
    acquisition: ["加工站合成", ...materialSources],
    relationships: [],
    recipe: {
      ingredients: [["固源岩", 5, "item-orirock-cube"]],
      cost: 200,
      level: 2,
    },
  }),
  item({
    slug: "orirock-concentration",
    name: "提纯源岩",
    en: "ORIROCK CONCENTRATION",
    tagline: "在切面之间，看见提纯的代价",
    summary:
      "高度提纯的源岩呈现出规则而鲜明的切面，也意味着更高的加工成本。它用于高阶强化，并参与聚合剂等进一步合成项目。",
    category: "材料",
    rarity: 4,
    usage: "高阶强化；可继续参与聚合剂配方。",
    acquisition: ["加工站合成", ...materialSources],
    relationships: [],
    recipe: {
      ingredients: [["固源岩组", 4, "item-orirock-cluster"]],
      cost: 300,
      level: 3,
    },
  }),
  item({
    slug: "oriron-cluster",
    name: "异铁组",
    en: "ORIRON CLUSTER",
    tagline: "纯度的提高，改变金属的性格",
    summary:
      "多块异铁在加工中形成的组合材料，相较原料具有更高纯度。其硬度与结构也随之改变，是罗德岛强化和工业合成中经常使用的物资。",
    category: "材料",
    rarity: 3,
    usage: "干员精英化、技能强化和进一步材料合成。",
    acquisition: ["加工站合成", ...materialSources],
    relationships: [],
    recipe: { ingredients: [["异铁", 4]], cost: 200, level: 2 },
  }),
  item({
    slug: "aketon",
    name: "酮凝集组",
    en: "AKETON",
    tagline: "每一次精确操作，都是材料的边界",
    summary:
      "经过进一步处理的工业酮制剂，对操作和储存环境有一定要求。与空气中其他成分发生反应会影响材料利用，因此加工过程需要准确控制。",
    category: "材料",
    rarity: 3,
    usage: "干员强化和工业材料合成。",
    acquisition: ["加工站合成", ...materialSources],
    relationships: [],
    recipe: { ingredients: [["酮凝集", 4]], cost: 200, level: 2 },
  }),
  item({
    slug: "integrated-device",
    name: "全新装置",
    en: "INTEGRATED DEVICE",
    tagline: "重新排列，释放更多可能",
    summary:
      "重构内部布局并重新装配的机械装置。主板空间得到改善，运转所需的能耗也随之上升；它既是强化物资，也为更高阶设备提供基础。",
    category: "材料",
    rarity: 3,
    usage: "精英化、技能升级和机械装置合成。",
    acquisition: ["加工站合成", ...materialSources],
    relationships: [],
    recipe: { ingredients: [["装置", 4]], cost: 200, level: 2 },
  }),
  item({
    slug: "polyester-pack",
    name: "聚酸酯组",
    en: "POLYESTER PACK",
    tagline: "标准化，让材料走向更多地方",
    summary:
      "经进一步加工并符合通用规格的聚酸酯材料，可满足多种工业需求。罗德岛将其用于干员强化，也把它作为更复杂材料的加工基础。",
    category: "材料",
    rarity: 3,
    usage: "干员强化与进一步工业合成。",
    acquisition: ["加工站合成", ...materialSources],
    relationships: [],
    recipe: { ingredients: [["聚酸酯", 4]], cost: 200, level: 2 },
  }),
  item({
    slug: "sugar-pack",
    name: "糖组",
    en: "SUGAR PACK",
    tagline: "甜味与工业用途，可以同时存在",
    summary:
      "通过机械化生产获得的糖块组合，能够提供可观能量，也能继续加工为化工原料。资料中的轻松描述，让这项普通物资留下了生产线日常的气息。",
    category: "材料",
    rarity: 3,
    usage: "强化与材料加工，也可合成为更高阶糖类材料。",
    acquisition: ["加工站合成", ...materialSources],
    relationships: [],
    recipe: { ingredients: [["糖", 4]], cost: 200, level: 2 },
  }),
  item({
    slug: "manganese-ore",
    name: "轻锰矿",
    en: "MANGANESE ORE",
    tagline: "矿物的价值，藏在反应之中",
    summary:
      "用于提炼工业催化剂的金属矿物，其后续加工过程较复杂。它连接矿石采集与精细工业，是多种强化和高阶材料所需的基础资源。",
    category: "材料",
    rarity: 3,
    usage: "干员强化；合成三水锰矿等材料。",
    acquisition: materialSources,
    relationships: [relation("item-d32-steel", "下游材料")],
  }),
  item({
    slug: "grindstone",
    name: "研磨石",
    en: "GRINDSTONE",
    tagline: "稳定的质地，磨出锋利的边缘",
    summary:
      "性质稳定的工具材料，适用于武器零件的加工工序。其耐用性使它在生产流程中占据重要位置，也被作为技能与精英化所需物资储备。",
    category: "材料",
    rarity: 3,
    usage: "干员强化；可进一步加工为五水研磨石。",
    acquisition: materialSources,
    relationships: [relation("item-d32-steel", "下游材料")],
  }),
  item({
    slug: "rma70-12",
    name: "RMA70-12",
    en: "RMA70-12",
    tagline: "复杂多面体，传导细微的能量",
    summary:
      "自然形态呈复杂多面体的敏感矿物，具备良好的传导性能。人们先认识了它在源石技艺中的价值，后来又将其纳入现代工业体系。",
    category: "材料",
    rarity: 3,
    usage: "强化与工业合成；可进一步加工为RMA70-24。",
    acquisition: materialSources,
    relationships: [
      relation("arts", "传导用途"),
      relation("item-d32-steel", "下游材料"),
    ],
  }),
  item({
    slug: "d32-steel",
    name: "D32钢",
    en: "D32 STEEL",
    tagline: "人造金属，重新定义武器材料",
    summary:
      "兼具高强度和源石技艺传导能力的人造金属。其制造依赖多种高阶材料，是高级强化中的关键资源，也体现了泰拉工业对性能的追求。",
    category: "材料",
    rarity: 5,
    usage: "高阶精英化、技能专精与部分模组培养。",
    acquisition: ["三级加工站合成", "活动奖励或指定兑换"],
    relationships: [relation("arts", "传导用途")],
    recipe: {
      ingredients: [
        ["三水锰矿", 1],
        ["五水研磨石", 1],
        ["RMA70-24", 1],
      ],
      cost: 400,
      level: 3,
    },
  }),
  item({
    slug: "module-data-block",
    name: "模组数据块",
    en: "MODULE DATA BLOCK",
    tagline: "工程部的日日夜夜，凝成一份记录",
    summary:
      "记录模组研发成果的数据载体，其中凝聚着工程人员的设计与调试工作。它是干员解锁模组系统时需要的专门材料，与普通强化素材分开储备。",
    category: "材料",
    rarity: 5,
    usage: "解锁干员模组，并参与相应模组培养流程。",
    acquisition: ["模组系统教学奖励", "任务与活动奖励", "采购中心兑换"],
    relationships: [relation("rhodes-island", "研发组织")],
  }),
  item({
    slug: "siesta-obsidian",
    name: "汐斯塔的黑曜石",
    en: "SIESTA OBSIDIAN",
    tagline: "火山与音乐节，共同留下的纪念",
    summary:
      "汐斯塔当地出产的黑曜石晶体，在《火蓝之心》活动中作为收集物资出现。海滨音乐节和火山地貌由此连接，一小块矿物也能成为阅读城市的入口。",
    category: "活动道具",
    rarity: 4,
    usage: "《火蓝之心》活动收集与报酬兑换。",
    acquisition: ["《火蓝之心》原活动及相应复刻规则下获取"],
    historical: true,
    relationships: [
      relation("siesta", "产出地区"),
      relation("operator-eyjafjalla", "相关研究者"),
    ],
  }),
  item({
    slug: "guerrilla-badge",
    name: "游击队员徽章",
    en: "GUERRILLA BADGE",
    tagline: "把这段行军，记在金属上",
    summary:
      "在切尔诺伯格核心城搜集到的游击队员徽章，曾作为一周年庆典活动物资使用。徽章将个人经历、游击队与遥远故土的记忆留在同一件物品之中。",
    category: "活动道具",
    rarity: 5,
    usage: "对应庆典活动中向指定对象提交以获得回报。",
    acquisition: ["一周年庆典的限时任务与活动日常"],
    historical: true,
    relationships: [
      relation("chernobog", "搜集地区"),
      relation("enemy-patriot", "游击队领袖"),
      relation("enemy-guerrilla-shieldguard", "相关战士"),
    ],
  }),
  item({
    slug: "wolumonde-warrant",
    name: "沃伦姆德搜查令",
    en: "WOLUMONDE SEARCH WARRANT",
    tagline: "一纸命令，走向失序的边缘",
    summary:
      "沃伦姆德宪兵队发出的行动凭证，允许持有人深入受动乱影响的地区。它所记录的不是普通采购流程，而是城市秩序遭到冲击时的调查与追捕。",
    category: "活动道具",
    rarity: 5,
    usage: "《沃伦姆德的薄暮》中特定区域的调查与行动。",
    acquisition: ["对应活动任务奖励"],
    historical: true,
    relationships: [
      relation("wolumonde", "签发城市"),
      relation("leithanien", "关联国家"),
      relation("enemy-winterwisp-blood-shaman", "同活动敌人"),
    ],
  }),
  item({
    slug: "mieszko-ticket",
    name: "梅什科竞技证券",
    en: "MIESZKO COMPETITION TICKET",
    tagline: "竞技的荣耀，也被印成价格",
    summary:
      "梅什科集团推出的竞技相关证券，在卡西米尔的商业体系中流转。它可用于购买活动纪念品，也让骑士竞技背后的资金、交易与观众参与变得可见。",
    category: "活动道具",
    rarity: 5,
    usage: "《玛莉娅·临光》的免税纪念商店兑换。",
    acquisition: ["对应活动期间关卡限时掉落"],
    historical: true,
    relationships: [
      relation("kazimierz", "使用地区"),
      relation("kawalerielki", "竞技城市"),
      relation("operator-nearl", "骑士关联"),
    ],
  }),
  item({
    slug: "jerag-stone",
    name: "耶拉冈德之石",
    en: "JERAG STONE",
    tagline: "雪山的祝福，握在掌心",
    summary:
      "经过蔓珠院修士祝福的圣石，承载谢拉格民众对平安的祈愿。在《风雪过境》活动中，它也成为与当地人交换物资的一种媒介。",
    category: "活动道具",
    rarity: 5,
    usage: "《风雪过境》活动物资交换。",
    acquisition: ["对应活动期间关卡限时掉落"],
    historical: true,
    relationships: [
      relation("kjerag", "文化来源"),
      relation("operator-pramanix", "宗教关联"),
      relation("operator-silverash", "相关故事人物"),
    ],
  }),
  item({
    slug: "etched-ammo",
    name: "蚀刻弹弹壳",
    en: "ETCHED AMMO CASING",
    tagline: "铳声之后，还有甜点与日常",
    summary:
      "在拉特兰居民间流行的收藏物，口径不同也会影响收藏价值。在《吾导先路》中，收集弹壳能向甜品店换取物资，呈现铳械文化与城市日常的联系。",
    category: "活动道具",
    rarity: 5,
    usage: "《吾导先路》活动中的甜品店物资交换。",
    acquisition: ["对应活动关卡掉落", "活动任务奖励"],
    historical: true,
    relationships: [
      relation("laterano", "使用地区"),
      relation("operator-exusiai", "文化关联"),
    ],
  }),
];

// Reverse local recipe edges make the processing chain explorable in both directions.
for (const product of items) {
  for (const ingredient of product.item.recipe?.ingredients ?? []) {
    const source =
      ingredient.entryId &&
      items.find((entry) => entry.id === ingredient.entryId);
    if (!source || source.related.includes(product.id)) continue;
    source.related.push(product.id);
    source.relationships!.push(relation(product.id, "加工产物"));
  }
}

export const catalogueEntries: ArchiveEntry[] = [
  ...operators,
  ...enemies,
  ...items,
];
