import { describe, expect, it } from "vitest";
import { localAssetPath } from "../src/components/LibraryArtwork";

describe("published artwork paths", () => {
  it("keeps local artwork under the application's assets directory", () => {
    expect(localAssetPath("assets/library/portrait.webp")).toBe(
      "/assets/library/portrait.webp",
    );
    expect(localAssetPath("/assets/library/portrait.webp")).toBe(
      "/assets/library/portrait.webp",
    );
    expect(localAssetPath("public/assets/library/portrait.webp")).toBe(
      "/assets/library/portrait.webp",
    );
  });
  it.each([
    "https://example.com/image.png",
    "//example.com/image.png",
    "\\evil.example/image.png",
    "assets/../../private.png",
    "assets/library/%2e%2e/%2e%2e/private.png",
    "assets/library/%252e%252e/private.png",
    "assets/library/%5cimage.png",
    "assets/library/%00image.png",
    "data/private.png",
    "assets/image.png?token=secret",
  ])("rejects an untrusted path: %s", (path) => {
    expect(localAssetPath(path)).toBeUndefined();
  });
});
