import { assetFor, assetUrl } from "../data/assets";
import Emblem from "./Emblem";
export default function AssetCredits({ id }: { id: string }) {
  const mark = assetFor(id, "emblem"),
    landscape = assetFor(id, "landscape", true);
  if (!mark && !landscape) return null;
  return (
    <section className="asset-credits">
      <span className="eyebrow">VISUAL RECORD / 视觉资料</span>
      <div className="asset-credit-row">
        {mark && (
          <div className="asset-credit-mark">
            <Emblem id={id} />
          </div>
        )}
        <div>
          {[mark, landscape].filter(Boolean).map((asset) => (
            <a
              key={asset!.path}
              href={asset!.filePage}
              target="_blank"
              rel="noreferrer"
            >
              {asset!.name} ↗
            </a>
          ))}
        </div>
      </div>
      {mark && (
        <a
          className="asset-original"
          href={assetUrl(mark)}
          target="_blank"
          rel="noreferrer"
        >
          查看完整徽记 ↗
        </a>
      )}
      <p>
        游戏美术 © 鹰角网络及关联权利人 · PRTS
        托管。悬挂旗标为本站的徽记展示排版，不代表设定国旗。
      </p>
    </section>
  );
}
