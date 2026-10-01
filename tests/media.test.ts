import { describe, expect, it } from "vitest";
import {
  artworkUrl,
  curatedAssetUrl,
  localAssetPath,
  remoteMediaUrl,
} from "../src/lib/media";

describe("versioned image sources", () => {
  it("uses a fixed revision for curated art and actual source thumbnails for archive art", () => {
    expect(curatedAssetUrl("assets/game/leithanien-landscape.png")).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/yi1z\/TerraExplorationArchive\/[a-f0-9]{40}\/public\/assets\/game\/leithanien-landscape.png$/,
    );
    const art = {
      id: "jessica",
      title: "初始立绘",
      role: "portrait",
      path: "assets/library/images/123-480.webp",
      sourceUrl: "https://media.prts.wiki/a/a1/portrait.png",
      remote: {
        preview:
          "https://media.prts.wiki/thumb/a/a1/portrait.png/480px-portrait.png",
      },
    };
    expect(artworkUrl(art, "preview")).toBe(art.remote.preview);
    expect(artworkUrl(art, "full")).toBe(art.sourceUrl);
  });
  it("keeps remote acceptance separate from strict local path checks", () => {
    for (const path of [
      "https://media.prts.wiki/a.png",
      "assets/../../secret",
      "assets/%2e%2e/secret",
      "//bad.test/a.png",
    ])
      expect(localAssetPath(path)).toBeUndefined();
    for (const url of [
      "http://media.prts.wiki/a.png",
      "https://media.prts.wiki.evil.test/a.png",
      "https://me@media.prts.wiki/a.png",
      "data:image/png;base64,abc",
    ])
      expect(remoteMediaUrl(url)).toBeUndefined();
    expect(
      curatedAssetUrl("assets/library/images/123-480.webp"),
    ).toBeUndefined();
  });
});
