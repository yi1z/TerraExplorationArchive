import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  packResources,
  installResources,
  verifyResources,
  validateManifest,
} from "../scripts/assets/release.mjs";
import { tarHeader, safeRelativePath } from "../scripts/assets/archive.mjs";

let root, source, output, cache, destination, manifest;
const quiet = () => {};
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), "terra-assets-test-"));
  source = path.join(root, "source");
  output = path.join(root, "packs");
  cache = path.join(root, "cache");
  destination = path.join(root, "public/library");
  await fs.mkdir(path.join(source, "images"), { recursive: true });
  await fs.writeFile(path.join(source, "images/a.webp"), "original art a");
  await fs.writeFile(path.join(source, "images/b.webp"), "original art b");
  await fs.writeFile(path.join(source, "manifest.json"), '{"complete":true}\n');
  manifest = await packResources({
    source,
    output,
    manifestPath: path.join(root, "resource-manifest.json"),
    snapshot: "test-snapshot",
    tarLimit: 2200,
    log: quiet,
  });
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(
    path.join(destination, "previous.txt"),
    "keep the previous library",
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  const resolved = path.resolve(root);
  if (
    path.dirname(resolved) !== path.resolve(tmpdir()) ||
    !path.basename(resolved).startsWith("terra-assets-test-")
  )
    throw new Error("Unsafe test cleanup");
  await fs.rm(resolved, { recursive: true, force: true });
});
const preserve = async () =>
  expect(
    await fs.readFile(path.join(destination, "previous.txt"), "utf8"),
  ).toBe("keep the previous library");
async function seedParts() {
  await fs.mkdir(cache, { recursive: true });
  for (const part of manifest.parts)
    await fs.copyFile(
      path.join(output, part.file),
      path.join(cache, part.file),
    );
}
const install = (extra = {}) =>
  installResources({
    manifest,
    directory: destination,
    cache,
    offline: true,
    log: quiet,
    ...extra,
  });

describe("complete release resource installation", () => {
  it("packs bounded parts and verifies installed bytes; a repeated install skips networking", async () => {
    expect(manifest.parts.length).toBe(3);
    await seedParts();
    expect((await install()).status).toBe("installed");
    expect(
      (await verifyResources({ directory: destination, manifest })).valid,
    ).toBe(true);
    const fetchImpl = vi.fn(() => {
      throw new Error("must not fetch");
    });
    expect((await install({ offline: false, fetchImpl })).status).toBe(
      "already-installed",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(
      await fs.readFile(path.join(destination, "images/a.webp"), "utf8"),
    ).toBe("original art a");
  });
  it("rejects a corrupt cached package without replacing the old library", async () => {
    await seedParts();
    const file = path.join(cache, manifest.parts[0].file);
    const bytes = await fs.readFile(file);
    bytes[bytes.length - 1] ^= 1;
    await fs.writeFile(file, bytes);
    await expect(install()).rejects.toThrow(/Missing or corrupt cached part/);
    await preserve();
  });
  it("rejects a missing package before installation", async () => {
    await seedParts();
    await fs.unlink(path.join(cache, manifest.parts[1].file));
    await expect(install()).rejects.toThrow(/Missing or corrupt cached part/);
    await preserve();
  });
  it("leaves existing resources untouched after HTTP failure", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("unavailable", { status: 503 }),
    );
    await expect(install({ offline: false, fetchImpl })).rejects.toThrow(
      /HTTP 503/,
    );
    await preserve();
    expect(await fs.readdir(cache)).toEqual([]);
  });
  it("rejects a downloaded SHA-256 mismatch and removes temporary bytes", async () => {
    const sourceBytes = await fs.readFile(
      path.join(output, manifest.parts[0].file),
    );
    sourceBytes[sourceBytes.length - 1] ^= 1;
    await expect(
      install({
        offline: false,
        fetchImpl: async () => new Response(sourceBytes),
      }),
    ).rejects.toThrow(/SHA-256/);
    await preserve();
    expect(await fs.readdir(cache)).toEqual([]);
  });
  it("rejects traversal in an otherwise hash-valid archive", async () => {
    await seedParts();
    const header = tarHeader("images/a.webp", 14);
    header.fill(0, 0, 100);
    header.write("../escaped.txt");
    header.fill(32, 148, 156);
    header.write(
      header
        .reduce((sum, byte) => sum + byte, 0)
        .toString(8)
        .padStart(6, "0") + "\0 ",
      148,
      8,
      "ascii",
    );
    const bytes = gzipSync(
      Buffer.concat([
        header,
        Buffer.from("original art a"),
        Buffer.alloc(512 - 14),
        Buffer.alloc(1024),
      ]),
    );
    const part = manifest.parts[0];
    part.bytes = bytes.length;
    part.sha256 = createHash("sha256").update(bytes).digest("hex");
    await fs.writeFile(path.join(cache, part.file), bytes);
    await expect(install()).rejects.toThrow(/Unsafe archive path/);
    await preserve();
    await expect(fs.access(path.join(root, "escaped.txt"))).rejects.toThrow();
  });
  it("detects a file hash disagreement after extraction and preserves the prior installation", async () => {
    await seedParts();
    manifest.files[0].sha256 = "0".repeat(64);
    await expect(install()).rejects.toThrow(/Extracted file SHA-256 mismatch/);
    await preserve();
  });
  it("downloads genuine packed bytes, verifies and installs all parts", async () => {
    const fetchImpl = vi.fn(
      async (url) =>
        new Response(
          await fs.readFile(path.join(output, url.split("/").at(-1))),
        ),
    );
    expect((await install({ offline: false, fetchImpl })).status).toBe(
      "installed",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(
      (await verifyResources({ directory: destination, manifest })).valid,
    ).toBe(true);
  });
  it("preserves the installed library when a response body is interrupted", async () => {
    const fetchImpl = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([31, 139]));
            controller.error(new Error("connection interrupted"));
          },
        }),
      );
    await expect(install({ offline: false, fetchImpl })).rejects.toThrow(
      /interrupted/,
    );
    await preserve();
    expect(await fs.readdir(cache)).toEqual([]);
  });
  it("rolls back the prior directory when the final installation rename fails", async () => {
    await seedParts();
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (path.basename(from).startsWith("install-") && to === destination)
        throw new Error("simulated installation rename failure");
      return rename(from, to);
    });
    await expect(install()).rejects.toThrow(
      /simulated installation rename failure/,
    );
    await preserve();
    expect(
      (await fs.readdir(cache)).filter((name) =>
        /^(install|backup)-/.test(name),
      ),
    ).toEqual([]);
  });
  it.each(["1", "2"])(
    "rejects TAR link type %s even when package hashes are valid",
    async (type) => {
      await seedParts();
      const header = tarHeader("images/a.webp", 14);
      header[156] = type.charCodeAt(0);
      header.write("../../outside", 157);
      header.fill(32, 148, 156);
      header.write(
        header
          .reduce((sum, byte) => sum + byte, 0)
          .toString(8)
          .padStart(6, "0") + "\0 ",
        148,
        8,
        "ascii",
      );
      const bytes = gzipSync(
        Buffer.concat([
          header,
          Buffer.from("original art a"),
          Buffer.alloc(512 - 14),
          Buffer.alloc(1024),
        ]),
      );
      const part = manifest.parts[0];
      part.bytes = bytes.length;
      part.sha256 = createHash("sha256").update(bytes).digest("hex");
      await fs.writeFile(path.join(cache, part.file), bytes);
      await expect(install()).rejects.toThrow(
        /links and extensions are forbidden/,
      );
      await preserve();
    },
  );
  it("rejects cross-platform traversal and untrusted manifest destinations", () => {
    for (const name of [
      "/root/file",
      "../escape",
      "C:/file",
      "a/../b",
      "a\\b",
      "a//b",
      "CON.txt",
      "x/thing.",
    ])
      expect(() => safeRelativePath(name)).toThrow();
    manifest.files[0].path = "../escape";
    expect(() => validateManifest(manifest)).toThrow(/Unsafe archive path/);
  });
});
