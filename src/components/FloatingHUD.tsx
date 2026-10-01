import {
  ArrowUpRight,
  Crosshair,
  Search,
  Radio,
  MoveUpRight,
} from "lucide-react";
import { entryById } from "../data/archive";
import { useArchiveStore } from "../lib/state";
import Emblem from "./Emblem";
import GameArtwork from "./GameArtwork";
const factions = [
  "rhodes-island",
  "reunion",
  "penguin-logistics",
  "rhine-lab",
  "karlan",
  "babel",
];
export default function FloatingHUD({ openIndex }: { openIndex: () => void }) {
  const { selected, previewEntry, select, setPreviewEntry } = useArchiveStore();
  const entry = entryById[previewEntry] ?? entryById.ursus;
  return (
    <>
      <div className="viewport-corners" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="observation-code" aria-hidden="true">
        <Radio size={12} />
        <span>TERRA / OBSERVATION SYSTEM</span>
        <b>ONLINE</b>
      </div>
      <button
        className="index-launch"
        onClick={openIndex}
        aria-label="展开悬浮档案索引"
      >
        <Search size={19} />
        <span>
          检索这片大地<small>OPEN ARCHIVE</small>
        </span>
        <kbd>/</kbd>
      </button>
      {!selected && (
        <>
          <div
            className="signal-card reactive-panel"
            data-reactive="tilt"
            aria-label="地区悬浮情报"
          >
            <div className="signal-cap">
              <span>
                <i /> REGION SIGNAL
              </span>
              <Crosshair size={13} />
            </div>
            <div className="signal-visual" key={entry.id}>
              <GameArtwork id={entry.id} />
              <div className="signal-visual-shade" />
              <div className="insignia-banner">
                <Emblem id={entry.id} />
                <span>ARCHIVE / {entry.en.split(" ")[0]}</span>
              </div>
              <span className="signal-serial">
                T /{" "}
                {String(Object.keys(entryById).indexOf(entry.id) + 1).padStart(
                  3,
                  "0",
                )}
              </span>
            </div>
            <div className="signal-copy" key={"copy-" + entry.id}>
              <span className="eyebrow">{entry.en}</span>
              <h2>
                {entry.name}
                <MoveUpRight size={21} />
              </h2>
              <p>{entry.tagline}</p>
              <button
                className="signal-open"
                onClick={() => select(entry.id)}
                aria-label={"接入" + entry.name + "档案"}
              >
                <span>接入档案</span>
                <ArrowUpRight size={19} />
              </button>
            </div>
            <span className="surface-glint" aria-hidden="true" />
          </div>
          <div className="faction-orbit" aria-label="势力快捷入口">
            <span>
              FACTION
              <br />
              <b>势力识别</b>
            </span>
            {factions.map((id) => (
              <button
                key={id}
                onClick={() => select(id)}
                onPointerEnter={() => setPreviewEntry(id)}
                onFocus={() => setPreviewEntry(id)}
                aria-label={"探索势力" + entryById[id].name}
              >
                <Emblem id={id} />
                <span>{entryById[id].name}</span>
              </button>
            ))}
          </div>
          <div className="interaction-legend">
            <span>01 / 悬停识别</span>
            <span>02 / 拖动环视</span>
            <span>03 / 点击接入</span>
          </div>
        </>
      )}
    </>
  );
}
