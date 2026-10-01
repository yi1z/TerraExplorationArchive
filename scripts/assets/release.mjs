import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  safeRelativePath,
  tarBytesFor,
  writeArchive,
  extractArchive,
} from "./archive.mjs";

export const REPOSITORY = "yi1z/TerraExplorationArchive";
export const TAG = "library-assets-2026-09-30";
export const MAX_PART_BYTES = 900 * 1024 * 1024;
const DEFAULT_TAR_BYTES = 850 * 1024 * 1024;
const sha = (value) => /^[a-f0-9]{64}$/.test(value);
export const releaseUrl = (file) =>
  `https://github.com/${REPOSITORY}/releases/download/${TAG}/${file}`;

export async function fileHash(filename) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { bytes, sha256: hash.digest("hex") };
}

export async function listFiles(directory) {
  const entries = [];
  async function visit(relative = "") {
    for (const entry of await fs.readdir(path.join(directory, relative), {
      withFileTypes: true,
    })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      safeRelativePath(name);
      if (entry.isSymbolicLink())
        throw new Error(
          `Symbolic links are forbidden in resource directories: ${name}`,
        );
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile())
        entries.push({
          path: name,
          bytes: (await fs.stat(path.join(directory, name))).size,
        });
      else throw new Error(`Unsupported resource file: ${name}`);
    }
  }
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("Resource directory must be a real directory");
  await visit();
  return entries.sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
}

export function validateManifest(manifest) {
  if (
    manifest?.schemaVersion !== 1 ||
    manifest.repository !== REPOSITORY ||
    manifest.tag !== TAG ||
    manifest.version !== TAG ||
    !Array.isArray(manifest.parts) ||
    !Array.isArray(manifest.files) ||
    !manifest.parts.length ||
    !manifest.files.length
  )
    throw new Error("Invalid resource manifest identity or format");
  const parts = new Map();
  for (const part of manifest.parts) {
    if (
      !new RegExp(`^${TAG}-part-\\d{3}\\.tar\\.gz$`).test(part.file) ||
      parts.has(part.file) ||
      part.url !== releaseUrl(part.file) ||
      !Number.isSafeInteger(part.bytes) ||
      part.bytes <= 0 ||
      part.bytes > MAX_PART_BYTES ||
      !sha(part.sha256)
    )
      throw new Error("Invalid resource part declaration");
    parts.set(part.file, { part, files: 0, bytes: 0 });
  }
  const names = new Set();
  let bytes = 0;
  for (const file of manifest.files) {
    safeRelativePath(file.path);
    const name = file.path.toLocaleLowerCase("en-US");
    if (
      names.has(name) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      !sha(file.sha256) ||
      !parts.has(file.part)
    )
      throw new Error(`Invalid resource file declaration: ${file.path}`);
    names.add(name);
    bytes += file.bytes;
    parts.get(file.part).files++;
    parts.get(file.part).bytes += file.bytes;
  }
  if (manifest.fileCount !== names.size || manifest.totalBytes !== bytes)
    throw new Error("Resource manifest totals disagree");
  for (const { part, files, bytes } of parts.values())
    if (part.fileCount !== files || part.extractedBytes !== bytes || !files)
      throw new Error(`Resource part totals disagree: ${part.file}`);
  return manifest;
}

export async function packResources({
  source,
  output,
  manifestPath,
  snapshot,
  tarLimit = DEFAULT_TAR_BYTES,
  log = console.log,
}) {
  if (
    !Number.isSafeInteger(tarLimit) ||
    tarLimit <= 1024 ||
    tarLimit > DEFAULT_TAR_BYTES
  )
    throw new Error("Invalid TAR partition limit");
  const files = await listFiles(source);
  const groups = [];
  let group = [],
    groupBytes = 1024;
  for (const file of files) {
    const size = tarBytesFor(file.bytes);
    if (size + 1024 > tarLimit)
      throw new Error(`Single resource exceeds partition limit: ${file.path}`);
    if (group.length && groupBytes + size > tarLimit) {
      groups.push(group);
      group = [];
      groupBytes = 1024;
    }
    group.push(file);
    groupBytes += size;
  }
  if (group.length) groups.push(group);
  if (groups.length > 999 || !groups.length)
    throw new Error("Invalid resource partition count");
  await fs.mkdir(output, { recursive: true });
  const parts = [];
  for (const [index, entries] of groups.entries()) {
    const file = `${TAG}-part-${String(index + 1).padStart(3, "0")}.tar.gz`;
    const temporary = path.join(output, `${file}.${randomUUID()}.part`);
    log(`Packing ${file}: ${entries.length} files`);
    try {
      const packed = await writeArchive(source, entries, temporary);
      if (packed.bytes > MAX_PART_BYTES)
        throw new Error(`Compressed part exceeds 900 MiB: ${file}`);
      await fs.rename(temporary, path.join(output, file));
      for (const entry of entries) entry.part = file;
      parts.push({
        file,
        ...packed,
        url: releaseUrl(file),
        fileCount: entries.length,
        extractedBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
      });
      log(`Packed ${file}: ${packed.bytes} bytes; SHA-256 ${packed.sha256}`);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  const manifest = validateManifest({
    schemaVersion: 1,
    repository: REPOSITORY,
    tag: TAG,
    version: TAG,
    snapshot,
    sourcePath: "public/assets/library",
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    parts,
    files,
  });
  const serialized = JSON.stringify(manifest, null, 2) + "\n";
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath + ".part", serialized);
  await fs.rename(manifestPath + ".part", manifestPath);
  await fs.writeFile(
    path.join(output, "library-assets.manifest.json"),
    serialized,
  );
  return manifest;
}

export async function verifyResources({ directory, manifest, log = () => {} }) {
  validateManifest(manifest);
  const errors = [];
  let actual;
  try {
    actual = await listFiles(directory);
  } catch (error) {
    return { valid: false, files: 0, bytes: 0, errors: [error.message] };
  }
  const byName = new Map(actual.map((file) => [file.path, file]));
  const wanted = new Set(manifest.files.map((file) => file.path));
  for (const file of actual)
    if (!wanted.has(file.path))
      errors.push(`Unexpected resource file: ${file.path}`);
  let count = 0,
    bytes = 0;
  for (const file of manifest.files) {
    const found = byName.get(file.path);
    if (!found || found.bytes !== file.bytes) {
      errors.push(`Missing or wrong-size resource: ${file.path}`);
      continue;
    }
    const result = await fileHash(path.join(directory, file.path));
    if (result.sha256 !== file.sha256)
      errors.push(`Resource SHA-256 mismatch: ${file.path}`);
    count++;
    bytes += result.bytes;
    if (count % 10000 === 0)
      log(`Verified ${count}/${manifest.fileCount} files`);
  }
  return { valid: errors.length === 0, files: count, bytes, errors };
}

async function validPart(filename, part) {
  try {
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== part.bytes)
      return false;
    const actual = await fileHash(filename);
    return actual.sha256 === part.sha256;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function downloadPart(part, filename, fetchImpl, timeoutMs) {
  const temporary = filename + `.${randomUUID()}.part`;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("Resource download timed out")),
    timeoutMs,
  );
  try {
    const response = await fetchImpl(part.url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "TerraExplorationArchive-assets/1" },
    });
    if (!response.ok || !response.body)
      throw new Error(
        `Resource download failed: HTTP ${response.status} ${part.file}`,
      );
    let bytes = 0;
    const hash = createHash("sha256");
    const hashing = new Transform({
      transform(chunk, _encoding, done) {
        bytes += chunk.length;
        if (bytes > part.bytes)
          return done(
            new Error(`Downloaded part exceeds declared size: ${part.file}`),
          );
        hash.update(chunk);
        done(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body),
      hashing,
      createWriteStream(temporary, { flags: "wx" }),
      { signal: controller.signal },
    );
    if (bytes !== part.bytes || hash.digest("hex") !== part.sha256)
      throw new Error(`Downloaded part SHA-256 or size mismatch: ${part.file}`);
    await fs.rename(temporary, filename);
  } finally {
    clearTimeout(timer);
    await fs.rm(temporary, { force: true });
  }
}

async function removeWorkDirectory(directory, cache) {
  const resolved = path.resolve(directory),
    parent = path.resolve(cache);
  if (
    path.dirname(resolved) !== parent ||
    !/^(install|backup)-[a-f0-9-]{36}$/.test(path.basename(resolved))
  )
    throw new Error("Refusing to remove an unexpected asset work directory");
  await fs.rm(resolved, { recursive: true, force: true });
}

export async function installResources({
  manifest,
  directory,
  cache,
  offline = false,
  fetchImpl = fetch,
  timeoutMs = 30 * 60 * 1000,
  log = console.log,
}) {
  validateManifest(manifest);
  const existing = await verifyResources({ directory, manifest, log });
  if (existing.valid) {
    log(`Assets already installed and verified: ${existing.files} files`);
    return { status: "already-installed", ...existing };
  }
  await fs.mkdir(cache, { recursive: true });
  for (const part of manifest.parts) {
    const filename = path.join(cache, part.file);
    if (await validPart(filename, part)) {
      log(`Using verified cached part: ${part.file}`);
      continue;
    }
    if (offline)
      throw new Error(
        `Missing or corrupt cached part in offline mode: ${part.file}`,
      );
    log(`Downloading ${part.file}`);
    await downloadPart(part, filename, fetchImpl, timeoutMs);
  }
  const stage = path.join(cache, `install-${randomUUID()}`),
    backup = path.join(cache, `backup-${randomUUID()}`);
  await fs.mkdir(stage);
  let backedUp = false,
    installed = false;
  try {
    for (const part of manifest.parts) {
      log(`Extracting ${part.file}`);
      await extractArchive(
        path.join(cache, part.file),
        stage,
        manifest.files.filter((file) => file.part === part.file),
      );
    }
    const verified = await verifyResources({ directory: stage, manifest, log });
    if (!verified.valid)
      throw new Error(
        `Staged assets failed verification: ${verified.errors[0]}`,
      );
    await fs.mkdir(path.dirname(directory), { recursive: true });
    if (
      (await fs.stat(cache)).dev !==
      (await fs.stat(path.dirname(directory))).dev
    )
      throw new Error(
        "Asset cache and installation directory must be on the same filesystem for atomic installation",
      );
    try {
      await fs.lstat(directory);
      await fs.rename(directory, backup);
      backedUp = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      await fs.rename(stage, directory);
      installed = true;
    } catch (error) {
      if (backedUp) {
        await fs.rename(backup, directory);
        backedUp = false;
      }
      throw error;
    }
    log(
      `Installed and verified ${verified.files} files (${verified.bytes} bytes)`,
    );
    return { status: "installed", ...verified };
  } finally {
    await removeWorkDirectory(stage, cache);
    if (installed && backedUp) await removeWorkDirectory(backup, cache);
  }
}
