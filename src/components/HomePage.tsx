import {
  ArrowDown,
  ArrowUpRight,
  Globe2,
  Package,
  Search,
  Shield,
  Users,
} from "lucide-react";
import { useArchiveStore } from "../lib/state";
import { playUiSound } from "../lib/audio";
import "../home.css";

const pathways = [
  { id: "operator", name: "干员档案", en: "OPERATORS", icon: Users },
  { id: "enemy", name: "敌人情报", en: "HOSTILES", icon: Shield },
  { id: "item", name: "物资记录", en: "RESOURCES", icon: Package },
  { id: "world", name: "泰拉纪事", en: "WORLD ARCHIVE", icon: Globe2 },
];
const features = [
  {
    id: "rhodes-island",
    number: "01",
    name: "罗德岛",
    en: "RHODES ISLAND",
    text: "以医疗为起点，连接这片大地上的人。",
    category: "组织 / 医疗与行动",
  },
  {
    id: "prts-operator-58745",
    number: "02",
    name: "涤火杰西卡",
    en: "JESSICA THE LIBERATED",
    text: "从一份干员档案，读懂选择与成长。",
    category: "干员 / 黑钢国际",
  },
  {
    id: "leithanien",
    number: "03",
    name: "莱塔尼亚",
    en: "LEITHANIEN",
    text: "高塔之间，音乐与源石技艺交织。",
    category: "地域 / 文明与历史",
  },
];

export default function HomePage() {
  const store = useArchiveStore();
  const confirm = () => playUiSound("confirm", store.preferences.sound);
  return (
    <main className="home-page" id="home-main" tabIndex={-1}>
      <section
        className="home-hero"
        aria-labelledby="home-title"
        data-reactive="tilt"
      >
        <div className="home-scene" aria-hidden="true">
          <img
            src={`${import.meta.env.BASE_URL}assets/home/rhodes-bridge.webp`}
            alt=""
            fetchPriority="high"
          />
        </div>
        <div className="home-scenery-credit" aria-hidden="true">
          <span>RHODES ISLAND</span>罗德岛 · 舰桥
        </div>
        <div className="home-emblem" aria-hidden="true">
          <img
            src={`${import.meta.env.BASE_URL}assets/home/rhodes-emblem.png`}
            alt=""
          />
          <span>
            RHODES ISLAND
            <br />
            PHARMACEUTICALS
          </span>
        </div>
        <div className="home-hero-content interface-part">
          <p className="home-eyebrow">
            <span /> TERRA EXPLORATION ARCHIVE <i> / </i> 罗德岛
          </p>
          <h1 id="home-title">
            RHODES
            <br />
            <span>ISLAND</span>
            <b>罗德岛</b>
          </h1>
          <p className="home-statement">在风暴之间，寻找明天。</p>
          <p className="home-introduction">
            从罗德岛出发，循着人物、地域与事件的记录，
            <br className="home-desktop-break" />
            重新认识这片大地。
          </p>
          <div className="home-actions">
            <button
              className="home-access"
              onClick={() => {
                confirm();
                store.openSearch("all");
              }}
            >
              <Search size={18} />
              <span>
                检索档案<small>ACCESS THE ARCHIVES</small>
              </span>
              <ArrowUpRight size={25} />
            </button>
            <button
              className="home-explore"
              onClick={() => {
                confirm();
                store.openAtlas();
              }}
            >
              <Globe2 size={19} />
              <span>探索泰拉</span>
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
        <div className="home-hero-bottom interface-part">
          <span>每个名字，都是一段故事。</span>
          <a
            href="#home-pathways"
            onClick={(event) => {
              event.preventDefault();
              document
                .getElementById("home-pathways")
                ?.scrollIntoView({
                  behavior:
                    store.preferences.reducedMotion ||
                    window.matchMedia("(prefers-reduced-motion: reduce)")
                      .matches
                      ? "instant"
                      : "smooth",
                });
            }}
          >
            继续探索 <ArrowDown size={14} />
          </a>
        </div>
      </section>
      <section
        className="home-pathways interface-part"
        id="home-pathways"
        aria-label="选择档案类别"
      >
        {pathways.map(({ id, name, en, icon: Icon }, index) => (
          <button
            key={id}
            onClick={() => {
              confirm();
              store.openSearch(id);
            }}
          >
            <span className="home-path-number">0{index + 1}</span>
            <Icon size={25} strokeWidth={1.2} />
            <span className="home-path-label">
              <strong>{name}</strong>
              <small>{en}</small>
            </span>
            <ArrowUpRight size={19} />
          </button>
        ))}
      </section>
      <section
        className="home-features interface-part"
        aria-labelledby="home-features-title"
      >
        <div className="home-section-heading">
          <div>
            <span>SELECTED RECORDS</span>
            <h2 id="home-features-title">从这里，开始阅读</h2>
          </div>
          <span>人物 · 组织 · 文明</span>
        </div>
        <div className="home-feature-grid">
          {features.map((feature) => (
            <button
              key={feature.id}
              onClick={() => {
                confirm();
                store.openEntry(feature.id);
              }}
            >
              <span className="home-feature-number">{feature.number}</span>
              <small>{feature.category}</small>
              <h3>{feature.name}</h3>
              <span className="home-feature-en">{feature.en}</span>
              <p>{feature.text}</p>
              <span className="home-feature-link">
                接入档案 <ArrowUpRight size={18} />
              </span>
            </button>
          ))}
        </div>
      </section>
      <footer className="home-footer interface-part">
        <span>TERRA EXPLORATION ARCHIVE</span>
        <p>
          非官方明日方舟资料库 · 资料参考 PRTS Wiki · 游戏素材 ©
          鹰角网络及关联权利人
        </p>
        <a href="https://prts.wiki/" target="_blank" rel="noreferrer">
          PRTS Wiki <ArrowUpRight size={12} />
        </a>
      </footer>
    </main>
  );
}
