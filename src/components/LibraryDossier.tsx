import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Images,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import type { LibraryDetail } from "../data/library-types";
import { libraryKindNames } from "../data/library-types";
import { getLibrarySummary, useLibraryEntry } from "../lib/library";
import { useArchiveStore } from "../lib/state";
import DossierFrame from "./DossierFrame";
import { sectionForRecord, type DossierSection } from "../lib/dossier";
import LibraryArtwork, {
  artworkUrl,
  useLibraryArtwork,
} from "./LibraryArtwork";

const labels: Record<string, string> = {
  identity: "基本资料",
  acquisition: "获得方式",
  cnOnlineTime: "国服上线时间",
  obtainMethod: "获得方式",
  baseSkills: "后勤技能",
  purchasePrices: "采购价格",
  variants: "不同条件下的资料",
  tables: "规则与数据表",
  headings: "资料主题",
  memoryOwner: "所属干员",
  "theme desc": "主题介绍",
  干员名jp: "日文名",
  干员外文名: "外文名",
  天赋列表3: "天赋详情",
  block: "阻挡数",
  atkspd: "攻击速度",
  time: "再部署时间变化",
  re_deploy: "再部署时间变化（秒）",
  lv: "解锁等级",
  type: "类型",
  traitadd: "特性追加",
  talent2: "二级天赋",
  talent3: "三级天赋",
  mat: "一级所需材料",
  mat2: "二级所需材料",
  mat3: "三级所需材料",
  mission1: "解锁任务一",
  mission2: "解锁任务二",
  mission2Operation: "任务关卡",
  cond: "一级条件",
  cond2: "二级条件",
  cond3: "三级条件",
  recipes: "加工配方",
  facility: "设施",
  initial: "初始技力",
  index: "编号",
  segment: "剧情时点",
  CharinfoV2: "干员履历",
  技能: "技能参数",
  技能3: "技能参数",
  "敌人信息/common2": "敌人基础资料",
  "敌人信息/levelcontent": "敌人属性版本",
  sp恢复速度: "技力恢复速度",
  chara: "干员信息",
  chara_data: "属性资料",
  chara_extra_info: "个人信息",
  char_mod: "模组",
  char_obtain: "获取途径",
  char_building_skill: "后勤技能",
  item: "物品资料",
  item_purchase_price: "采购价格",
  story: "剧情索引",
  char_memory: "干员密录",
  furniture_themes: "家具主题",
  name: "名称",
  title: "项目",
  rows: "数据行",
  appellation: "代号",
  profession: "职业",
  subProfession: "分支",
  rarity: "稀有度",
  position: "位置",
  description: "说明",
  trait: "特性",
  hp: "生命",
  atk: "攻击",
  def: "防御",
  res: "法术抗性",
  cost: "部署费用",
  maxHp: "生命上限",
  blockCnt: "阻挡数",
  respawnTime: "再部署时间",
  baseAttackTime: "攻击间隔",
  magicResistance: "法术抗性",
  moveSpeed: "移动速度",
  attackSpeed: "攻击速度",
  attackRange: "攻击范围",
  rank: "级别",
  level: "等级",
  category1: "一级分类",
  category2: "二级分类",
  category3: "三级分类",
  obtain_method: "获取途径",
  purpose: "用途",
  usage: "用途",
  brand: "品牌",
  illustrator: "画师",
  designer: "设计者",
  series: "系列",
  nation: "地区",
  group: "所属",
  team: "小队",
  race: "种族",
  height: "身高",
  gender: "性别",
  birthday: "生日",
  birthplace: "出身地",
  storyIntro: "记录简介",
  storySetName: "记录集",
  storyIndex: "顺序",
  storyType: "故事类别",
  storyGroup: "故事分组",
  startTime: "开始时间",
  endTime: "结束时间",
  duration: "持续时间",
  unlock: "解锁条件",
  price: "价格",
  quantity: "数量",
  count: "数量",
  material: "所需材料",
  materials: "所需材料",
  ingredients: "原料",
  phases: "精英阶段",
  skills: "技能",
  talents: "天赋",
  potential: "潜能",
  attributes: "属性",
  attributesKeyFrames: "属性成长",
  levels: "等级资料",
  properties: "资料属性",
  semantic: "资料属性",
  cargo: "游戏数据",
  enemies: "敌人",
  drops: "掉落",
  rewards: "奖励",
  unlockCondition: "解锁条件",
};
const internalKey =
  /^(?:_|id$|pageId$|page$|charId$|itemId$|iconId$|equipIcon$|typeIcon$|charModuleN$|sourceType$|color$|forceWikiFile$|theme icon$|theme preview$|prefab|portraitId|tokenKey|textPath$|storyTxt$|storyFile$|hiddenFaction$|隐藏势力$|干员id$|干员序号$|装置id$|锚点$|.*(?:Path|Url|URL|坐标[xy]|缩放|颜色)$)/;
export function readableValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value !== "string") return String(value);
  // Potential records store this attribute name as a value, not an object key.
  if (value === "re_deploy") return labels.re_deploy;
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/'''?/g, "")
    .trim();
}
export function recordLabel(key: string) {
  return (
    (Object.hasOwn(labels, key) ? labels[key] : undefined) ??
    key.replaceAll("_", " · ")
  );
}

function SourceTable({ data }: { data: Record<string, unknown> }) {
  const rows = (data.rows as unknown[][]).filter(Array.isArray);
  const headings = rows[0]?.every(
    (cell) => typeof cell === "string" && !/\d/.test(cell),
  );
  return (
    <div
      className="library-table-wrap"
      tabIndex={0}
      aria-label="可横向滚动的数据表"
    >
      <table className="library-source-table">
        <caption>{readableValue(data.title || "资料表")}</caption>
        {headings && (
          <thead>
            <tr>
              {rows[0].map((cell, i) => (
                <th key={i} scope="col">
                  {readableValue(cell)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.slice(headings ? 1 : 0).map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{readableValue(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DataFields({
  data,
  depth = 0,
}: {
  data: Record<string, unknown>;
  depth?: number;
}) {
  const fields = Object.entries(data).filter(
    ([key, value]) =>
      !internalKey.test(key) &&
      value !== "" &&
      value !== null &&
      value !== undefined,
  );
  const scalar = fields.filter(([, value]) => typeof value !== "object");
  const nested = fields.filter(([, value]) => typeof value === "object");
  return (
    <>
      {scalar.length > 0 && (
        <dl className="library-field-grid">
          {scalar.map(([key, value]) => (
            <div
              key={key}
              className={
                readableValue(value).length > 36 ||
                readableValue(value).includes("\n")
                  ? "library-field-prose"
                  : undefined
              }
            >
              <dt>{recordLabel(key)}</dt>
              <dd>{readableValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {nested.map(([key, value]) => (
        <details className="library-data-group" key={key} open={depth === 0}>
          <summary>
            {recordLabel(key)}
            <span>
              {Array.isArray(value) ? `${value.length} 条记录` : "详细记录"}
            </span>
          </summary>
          <div>
            {Array.isArray(value) ? (
              value.map((row, index) =>
                typeof row === "object" &&
                row !== null &&
                "rows" in row &&
                Array.isArray(row.rows) &&
                row.rows.every(Array.isArray) ? (
                  <SourceTable
                    key={index}
                    data={row as Record<string, unknown>}
                  />
                ) : typeof row === "object" && row !== null ? (
                  <section className="library-data-row" key={index}>
                    <DataFields
                      data={row as Record<string, unknown>}
                      depth={depth + 1}
                    />
                  </section>
                ) : (
                  <p key={index}>{readableValue(row)}</p>
                ),
              )
            ) : (
              <DataFields
                data={value as Record<string, unknown>}
                depth={depth + 1}
              />
            )}
          </div>
        </details>
      ))}
    </>
  );
}

type SkillLevel = {
  level: number | string;
  label?: string;
  description?: string;
  initial?: string;
  cost?: string;
  duration?: string;
};
type SkillRecord = {
  name: string;
  levels: SkillLevel[];
  recovery?: string;
  trigger?: string;
};

function SkillReader({ skill }: { skill: SkillRecord }) {
  const [selectedLevel, setSelectedLevel] = useState(0);
  const level = skill.levels[selectedLevel] ?? skill.levels[0];
  if (!level) return null;
  return (
    <section className="library-skill-reader">
      <div className="library-section-heading">
        <span className="terminal-kicker">SKILL RECORD</span>
        <h3>{skill.name}</h3>
        {[skill.recovery, skill.trigger].filter(Boolean).length > 0 && (
          <p>{[skill.recovery, skill.trigger].filter(Boolean).join(" · ")}</p>
        )}
      </div>
      <div
        className="library-skill-levels"
        role="group"
        aria-label={`${skill.name}技能等级`}
      >
        {skill.levels.map((row, index) => (
          <button
            key={index}
            aria-pressed={index === selectedLevel}
            onClick={() => setSelectedLevel(index)}
          >
            {row.label ||
              (Number(row.level) > 7
                ? `专精${Number(row.level) - 7}`
                : `Lv.${row.level}`)}
          </button>
        ))}
      </div>
      <p className="library-skill-description">
        {readableValue(level.description)}
      </p>
      <dl className="library-field-grid library-skill-stats">
        <div>
          <dt>初始技力</dt>
          <dd>{level.initial || "—"}</dd>
        </div>
        <div>
          <dt>技力消耗</dt>
          <dd>{level.cost || "—"}</dd>
        </div>
        <div>
          <dt>持续时间（秒）</dt>
          <dd>{level.duration || "—"}</dd>
        </div>
      </dl>
    </section>
  );
}

function LibraryCompleteness({ entry }: { entry: LibraryDetail }) {
  if (!entry.missingFacts?.length) return null;
  return (
    <aside className="library-completeness">
      <strong>资料整理进度</strong>
      <ul>
        {entry.missingFacts.map((message, index) => (
          <li key={index}>{message}</li>
        ))}
      </ul>
    </aside>
  );
}

function OperatorAttributes({
  attributes,
}: {
  attributes: Record<string, unknown>;
}) {
  const names = ["生命上限", "攻击", "防御", "法术抗性"];
  const stages = ["精英0_1级", "精英0_满级", "精英1_满级", "精英2_满级"].filter(
    (stage) =>
      names.some((name) => attributes[`${stage}_${name}`] !== undefined),
  );
  const [selected, setSelected] = useState(stages.at(-1) ?? "");
  const [trust, setTrust] = useState(false);
  const stage = stages.includes(selected) ? selected : stages[0];
  if (!stage) return <DataFields data={attributes} />;
  const extra = Object.fromEntries(
    Object.entries(attributes).filter(
      ([key]) => !/^精英\d_|^信赖加成/.test(key),
    ),
  );
  const trustFields = (
    typeof attributes["信赖加成"] === "object" ? attributes["信赖加成"] : {}
  ) as Record<string, unknown>;
  return (
    <section className="library-operator-attributes">
      <div className="library-section-heading">
        <span className="terminal-kicker">COMBAT PARAMETERS</span>
        <h3>作战面板</h3>
      </div>
      <div className="library-attribute-controls">
        <label>
          精英阶段
          <select
            aria-label="干员属性阶段"
            value={stage}
            onChange={(event) => setSelected(event.target.value)}
          >
            {stages.map((value) => (
              <option key={value} value={value}>
                {value.replace("_", " · ")}
                {value.endsWith("满级")
                  ? `（Lv.${attributes[value] ?? "—"}）`
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          className="library-trust-toggle"
          aria-pressed={trust}
          onClick={() => setTrust(!trust)}
        >
          {trust ? "含满信赖加成" : "阶段基础值"}
        </button>
      </div>
      <dl className="library-combat-stats">
        {names.map((name) => {
          const raw = attributes[`${stage}_${name}`];
          const base = raw === undefined || raw === "" ? NaN : Number(raw);
          const bonus = Number(
            trustFields[name] ?? attributes[`信赖加成_${name}`] ?? 0,
          );
          const value = Number.isFinite(base)
            ? base + (trust && Number.isFinite(bonus) ? bonus : 0)
            : null;
          const max =
            Math.max(
              1,
              ...stages.map(
                (item) => Number(attributes[`${item}_${name}`]) || 0,
              ),
            ) + (trust && Number.isFinite(bonus) ? bonus : 0);
          return (
            <div key={name}>
              <dt>{name}</dt>
              <dd>
                {value ?? "—"}
                {trust && bonus > 0 && <small> +{bonus} 信赖</small>}
              </dd>
              <span aria-hidden="true">
                <i
                  style={{
                    width: `${value === null ? 0 : Math.min(100, (value / max) * 100)}%`,
                  }}
                />
              </span>
            </div>
          );
        })}
      </dl>
      <details className="library-data-group">
        <summary>
          部署、潜能与模组<span>展开资料</span>
        </summary>
        <div>
          <DataFields data={extra} depth={1} />
        </div>
      </details>
    </section>
  );
}

export function LibraryTechnicalData({ entry }: { entry: LibraryDetail }) {
  const [levelId, setLevelId] = useState(entry.levels?.[0]?.id ?? "");
  const level =
    entry.levels?.find((row) => row.id === levelId) ?? entry.levels?.[0];
  const [templateIndex, setTemplateIndex] = useState(0);
  const templates = (entry.templates ?? []).filter(
    (template) =>
      !(
        entry.kind === "enemy" &&
        entry.levels?.length &&
        entry.fields.identity &&
        /^敌人信息\/(common2?|levelcontent)$/.test(template.name)
      ) &&
      !(
        entry.kind === "outfit" &&
        template.name === "时装回廊/半身像" &&
        Object.entries(template.params).every(
          ([key, value]) => entry.fields[key] === value,
        )
      ),
  );
  const template = templates[Math.min(templateIndex, templates.length - 1)];
  const skills = Array.isArray(entry.fields.skills)
    ? entry.fields.skills.filter(
        (row): row is SkillRecord =>
          row && typeof row.name === "string" && Array.isArray(row.levels),
      )
    : [];
  const attributes =
    entry.kind === "operator" &&
    typeof entry.fields.attributes === "object" &&
    entry.fields.attributes
      ? (entry.fields.attributes as Record<string, unknown>)
      : undefined;
  const fields = Object.fromEntries(
    Object.entries(entry.fields ?? {}).filter(
      ([key]) =>
        (key !== "skills" || skills.length === 0) &&
        (key !== "attributes" || !attributes),
    ),
  );
  return (
    <div className="library-technical">
      <LibraryCompleteness entry={entry} />
      {level && (
        <section className="library-levels">
          <label>
            {entry.kind === "module" ? "模组等级 · 属性增量" : "等级与阶段"}
            <select
              aria-label="资料等级与阶段"
              value={level.id}
              onChange={(event) => setLevelId(event.target.value)}
            >
              {entry.levels!.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.id.replace(/^LEVEL/i, "等级 ")}
                </option>
              ))}
            </select>
          </label>
          <DataFields
            data={Object.fromEntries(
              Object.entries(level.fields).filter(([key]) => key !== "index"),
            )}
          />
        </section>
      )}
      {attributes && (
        <OperatorAttributes key={entry.id} attributes={attributes} />
      )}
      {skills.map((skill, index) => (
        <SkillReader key={`${entry.id}-${index}`} skill={skill} />
      ))}
      {Object.keys(fields).length > 0 && <DataFields data={fields} />}
      {template && (
        <section className="library-template-records">
          <div className="library-section-heading">
            <span className="terminal-kicker">DETAILED RECORDS</span>
            <h3>分项资料</h3>
          </div>
          <label>
            选择记录
            <select
              aria-label="分项资料"
              value={Math.min(templateIndex, templates.length - 1)}
              onChange={(event) => setTemplateIndex(Number(event.target.value))}
            >
              {templates.map((row, index) => (
                <option key={index} value={index}>
                  {index + 1}. {recordLabel(row.name)}
                  {row.params["名称"] || row.params["技能名"]
                    ? ` · ${row.params["名称"] || row.params["技能名"]}`
                    : ""}
                </option>
              ))}
            </select>
          </label>
          <DataFields data={template.params} />
        </section>
      )}
      {!level &&
        !templates.length &&
        !Object.keys(entry.fields ?? {}).length && (
          <p className="record-note">
            此档案以叙事与关联记录为主，暂无数值资料。
          </p>
        )}
      <p className="record-note">
        {entry.kind === "module"
          ? "数值表示此级模组提供的属性加成，0 表示该属性没有变化。特性与天赋按所选等级列出。"
          : entry.kind === "outfit"
            ? "获取记录按来源中的历史时间与条件列出，不表示当前开放。未明示价格的记录保留原状。"
            : "资料按来源中的阶段、等级和适用条件分别列出。未列出的加成不计入基础数值。"}
      </p>
    </div>
  );
}

export function LibraryOverview({ entry }: { entry: LibraryDetail }) {
  const store = useArchiveStore();
  const visible = entry.sections.filter(
    (section) => store.preferences.spoilers || !section.spoiler,
  );
  return (
    <>
      {entry.summary && <p className="dossier-summary">{entry.summary}</p>}
      {entry.summaryStatus === "missing" && (
        <p className="record-note">
          此记录的叙事梗概尚待核验；已取得的资料和原始出处可在下方查看。
        </p>
      )}
      <dl className="identity-grid">
        {entry.facts.map((fact) => (
          <div key={fact.label}>
            <dt>{recordLabel(fact.label)}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      {visible
        .filter((section) => section.body && section.body !== entry.summary)
        .map((section, index) => (
          <section className="record-section" key={`${section.title}-${index}`}>
            <span className="terminal-kicker">
              RECORD {String(index + 1).padStart(2, "0")}
              {section.sourceKind === "community" ? " / 社区考据" : ""}
            </span>
            <h3>{section.title}</h3>
            <p>{readableValue(section.body)}</p>
          </section>
        ))}
      {entry.sections.some((section) => section.spoiler) && (
        <button
          className="record-locked"
          aria-pressed={store.preferences.spoilers}
          onClick={() => store.togglePreference("spoilers")}
        >
          {store.preferences.spoilers ? (
            <BookOpen size={19} />
          ) : (
            <LockKeyhole size={19} />
          )}
          <span>
            {store.preferences.spoilers ? "剧情记录已展开" : "剧情记录已折叠"}
            <small>
              {store.preferences.spoilers
                ? "关闭全站剧透"
                : "开启全站剧透后继续阅读"}
            </small>
          </span>
          <ArrowRight size={18} />
        </button>
      )}
    </>
  );
}

export function LibraryGallery({ id, name }: { id: string; name: string }) {
  const { artworks, status, retry } = useLibraryArtwork(id);
  const [selected, setSelected] = useState<string>();
  const art = artworks.find((row) => row.id === selected) ?? artworks[0];
  if (status === "loading")
    return (
      <p className="library-loading" role="status">
        正在接入视觉资料…
      </p>
    );
  if (!art)
    return (
      <div className="library-empty">
        <Images size={32} />
        <p>此记录暂无已收录的视觉资料。</p>
        {status === "error" && <button onClick={retry}>重新载入</button>}
      </div>
    );
  return (
    <div className="library-gallery">
      <figure>
        <img src={artworkUrl(art, "full")} alt={`${name} · ${art.title}`} />
        <figcaption>
          {art.title}
          <a
            href={art.filePage || art.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            图片出处 <ArrowUpRight size={13} />
          </a>
        </figcaption>
      </figure>
      <div className="library-gallery-thumbs" aria-label="图像版本">
        {artworks.map((image) => (
          <button
            key={image.id}
            aria-pressed={art.id === image.id}
            onClick={() => setSelected(image.id)}
          >
            <img src={artworkUrl(image, "thumbnail")} alt="" loading="lazy" />
            <span>{image.title}</span>
          </button>
        ))}
      </div>
      <p className="record-note">
        游戏美术 © 鹰角网络及关联权利人；PRTS
        托管。保留原始画面，背景效果为本站设计。
      </p>
    </div>
  );
}

function LibrarySource({ entry }: { entry: LibraryDetail }) {
  return (
    <>
      <span className="terminal-kicker">SOURCE / PROVENANCE</span>
      <h3 className="dossier-lead">每一份记录，都有来处。</h3>
      <a
        className="source-record"
        href={entry.source.url}
        target="_blank"
        rel="noreferrer"
      >
        <span>
          <strong>{entry.source.title}</strong>
          <small>PRTS Wiki / 游戏资料</small>
        </span>
        <ArrowUpRight size={18} />
      </a>
      {entry.source.revisionId && (
        <a
          className="source-record"
          href={`https://prts.wiki/index.php?oldid=${entry.source.revisionId}`}
          target="_blank"
          rel="noreferrer"
        >
          <span>
            <strong>资料快照对应的来源版本</strong>
            <small>
              {entry.source.timestamp?.slice(0, 10)} · #
              {entry.source.revisionId}
            </small>
          </span>
          <ArrowUpRight size={18} />
        </a>
      )}
      {entry.additionalSources?.map((source) => (
        <a
          className="source-record"
          key={`${source.pageId ?? source.url}-${source.revisionId ?? "current"}`}
          href={
            source.revisionId
              ? `https://prts.wiki/index.php?oldid=${source.revisionId}`
              : source.url
          }
          target="_blank"
          rel="noreferrer"
        >
          <span>
            <strong>{source.title}</strong>
            <small>
              补充数据来源 · {source.timestamp?.slice(0, 10)}
              {source.revisionId ? ` · #${source.revisionId}` : ""}
            </small>
          </span>
          <ArrowUpRight size={18} />
        </a>
      ))}
      {typeof entry.provenance?.editorialBasis === "string" && (
        <p className="record-note">
          整理依据：{readableValue(entry.provenance.editorialBasis)}
        </p>
      )}
      <p className="record-note">
        社区资料署名 PRTS Wiki 贡献者，按 CC BY-NC-SA 4.0
        提供；游戏美术、文本原文及商标归原权利人。外部来源可能包含完整剧情。
      </p>
    </>
  );
}

export function LibraryRelations({
  entry,
  onNavigate,
}: {
  entry: LibraryDetail;
  onNavigate?: () => void;
}) {
  const store = useArchiveStore();
  const relationships = entry.relationships.filter(
    (relation, index, all) =>
      (store.preferences.spoilers || !relation.spoiler) &&
      getLibrarySummary(relation.target) &&
      all.findIndex(
        (candidate) =>
          candidate.target === relation.target &&
          candidate.label === relation.label,
      ) === index,
  );
  return (
    <div className="related-records">
      {relationships.map((relation) => {
        const target = getLibrarySummary(relation.target)!;
        return (
          <button
            key={`${relation.target}-${relation.label}`}
            onClick={() => {
              store.openEntry(relation.target);
              onNavigate?.();
            }}
          >
            <div className={`related-art type-${target.kind}`}>
              <LibraryArtwork entry={target} thumbnail decorative />
            </div>
            <span>
              <small>{relation.label}</small>
              <strong>{target.name}</strong>
              <em>{libraryKindNames[target.kind]}</em>
            </span>
            <ArrowUpRight size={18} />
          </button>
        );
      })}
      {!relationships.length && (
        <p className="record-note">当前快照暂无已确认的关联记录。</p>
      )}
    </div>
  );
}

export function LibrarySupplement({
  id,
  onNavigate,
}: {
  id: string;
  onNavigate?: () => void;
}) {
  const { entry, status, error, retry } = useLibraryEntry(id);
  if (status === "loading" || status === "idle")
    return (
      <p className="library-loading" role="status">
        正在读取资料分片…
      </p>
    );
  if (!entry)
    return (
      <div className="library-empty">
        <BookOpen size={28} />
        <p>{error || "当前快照尚无此条目的扩展资料。"}</p>
        {status === "error" && (
          <button onClick={retry}>
            <RefreshCw size={15} /> 重新载入
          </button>
        )}
      </div>
    );
  return (
    <>
      {error && (
        <aside className="library-completeness">
          <strong>扩展资料暂未载入，当前显示精选资料。</strong>
          <p>{error}</p>
          <button onClick={retry}>
            <RefreshCw size={15} /> 重新载入
          </button>
        </aside>
      )}
      <LibraryTechnicalData entry={entry} />
      <LibraryOverview entry={entry} />
      <h3>关联记录</h3>
      <LibraryRelations entry={entry} onNavigate={onNavigate} />
      <LibrarySource entry={entry} />
    </>
  );
}

export default function LibraryDossier({
  entry,
  onClose,
  closing = false,
}: {
  entry: LibraryDetail;
  onClose: () => void;
  closing?: boolean;
}) {
  const section = useArchiveStore((state) => state.dossierSection);
  const tab = sectionForRecord(section, false);
  const tabs: [DossierSection, string][] = [
    ["overview", "档案概览"],
    ["data", "详细资料"],
    ["gallery", "视觉资料"],
    ["relations", "关联记录"],
    ["sources", "资料出处"],
  ];
  return (
    <DossierFrame
      name={entry.name}
      kind={libraryKindNames[entry.kind]}
      tabs={tabs}
      section={tab}
      onClose={onClose}
      closing={closing}
    >
      {tab === "overview" && <LibraryOverview entry={entry} />}
      {tab === "data" && <LibraryTechnicalData entry={entry} />}
      {tab === "gallery" && <LibraryGallery id={entry.id} name={entry.name} />}
      {tab === "relations" && (
        <LibraryRelations entry={entry} onNavigate={onClose} />
      )}
      {tab === "sources" && <LibrarySource entry={entry} />}
    </DossierFrame>
  );
}
