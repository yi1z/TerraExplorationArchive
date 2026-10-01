import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip, createGunzip } from "node:zlib";

export function safeRelativePath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    /[\\\x00-\x1f\x7f:]/.test(value) ||
    value.startsWith("/")
  )
    throw new Error(`Unsafe archive path: ${String(value)}`);
  const parts = value.split("/");
  if (
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        /[. ]$/.test(part) ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
    )
  )
    throw new Error(`Unsafe archive path: ${value}`);
  return value;
}

export const tarBytesFor = (bytes) => 512 + Math.ceil(bytes / 512) * 512;

export function tarHeader(relative, bytes) {
  safeRelativePath(relative);
  const header = Buffer.alloc(512);
  let name = relative,
    prefix = "";
  if (Buffer.byteLength(name) > 100) {
    const separators = [...relative.matchAll(/\//g)]
      .map((match) => match.index)
      .reverse();
    const separator = separators.find(
      (index) =>
        Buffer.byteLength(relative.slice(0, index)) <= 155 &&
        Buffer.byteLength(relative.slice(index + 1)) <= 100,
    );
    if (separator === undefined)
      throw new Error(`Path too long for USTAR: ${relative}`);
    prefix = relative.slice(0, separator);
    name = relative.slice(separator + 1);
  }
  header.write(name, 0, 100);
  const octal = (value, offset, width) => {
    const encoded = value.toString(8).padStart(width - 1, "0");
    if (encoded.length >= width)
      throw new Error("USTAR numeric field overflow");
    header.write(encoded + "\0", offset, width, "ascii");
  };
  octal(0o644, 100, 8);
  octal(0, 108, 8);
  octal(0, 116, 8);
  octal(bytes, 124, 12);
  octal(0, 136, 12);
  header.fill(32, 148, 156);
  header[156] = 48;
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  header.write(prefix, 345, 155);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return header;
}

export async function writeArchive(source, files, destination) {
  const archiveHash = createHash("sha256");
  let archiveBytes = 0;
  const counter = new Transform({
    transform(chunk, _encoding, done) {
      archiveBytes += chunk.length;
      archiveHash.update(chunk);
      done(null, chunk);
    },
  });
  async function* tar() {
    for (const file of files) {
      const filename = path.join(source, safeRelativePath(file.path));
      const stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.bytes)
        throw new Error(`Source changed during packing: ${file.path}`);
      yield tarHeader(file.path, file.bytes);
      const hash = createHash("sha256");
      let bytes = 0;
      for await (const chunk of createReadStream(filename)) {
        bytes += chunk.length;
        hash.update(chunk);
        yield chunk;
      }
      if (bytes !== file.bytes)
        throw new Error(`Source changed during packing: ${file.path}`);
      file.sha256 = hash.digest("hex");
      const padding = (512 - (bytes % 512)) % 512;
      if (padding) yield Buffer.alloc(padding);
    }
    yield Buffer.alloc(1024);
  }
  await pipeline(
    Readable.from(tar()),
    createGzip({ level: 6, mtime: 0 }),
    counter,
    createWriteStream(destination, { flags: "wx" }),
  );
  return { bytes: archiveBytes, sha256: archiveHash.digest("hex") };
}

class ByteReader {
  constructor(stream, maximum) {
    this.iterator = stream[Symbol.asyncIterator]();
    this.buffer = Buffer.alloc(0);
    this.total = 0;
    this.maximum = maximum;
  }
  async more() {
    if (this.buffer.length) return true;
    const next = await this.iterator.next();
    if (next.done) return false;
    this.buffer = next.value;
    this.total += this.buffer.length;
    if (this.total > this.maximum)
      throw new Error("Archive expands beyond the declared size");
    return true;
  }
  async *chunks(length) {
    let remaining = length;
    while (remaining) {
      if (!(await this.more())) throw new Error("Truncated TAR archive");
      const count = Math.min(remaining, this.buffer.length);
      const chunk = this.buffer.subarray(0, count);
      this.buffer = this.buffer.subarray(count);
      remaining -= count;
      yield chunk;
    }
  }
  async exact(length) {
    const chunks = [];
    for await (const chunk of this.chunks(length)) chunks.push(chunk);
    return Buffer.concat(chunks, length);
  }
}

function parseHeader(header) {
  const text = (start, length) =>
    header
      .subarray(start, start + length)
      .toString("utf8")
      .split("\0")[0];
  const numeric = (start, length) => {
    const value = text(start, length).trim();
    if (!/^[0-7]+$/.test(value)) throw new Error("Invalid USTAR numeric field");
    const number = Number.parseInt(value, 8);
    if (!Number.isSafeInteger(number)) throw new Error("USTAR size overflow");
    return number;
  };
  const checksum = numeric(148, 8);
  let actual = 0;
  for (let i = 0; i < 512; i++) actual += i >= 148 && i < 156 ? 32 : header[i];
  if (actual !== checksum) throw new Error("Invalid TAR header checksum");
  if (text(257, 6) !== "ustar" || (header[156] !== 48 && header[156] !== 0))
    throw new Error(
      "Only regular USTAR files are supported; links and extensions are forbidden",
    );
  const prefix = text(345, 155),
    name = text(0, 100);
  return {
    path: safeRelativePath(prefix ? `${prefix}/${name}` : name),
    bytes: numeric(124, 12),
  };
}

export async function extractArchive(archive, destination, expectedFiles) {
  const expected = new Map(expectedFiles.map((file) => [file.path, file]));
  const seen = new Set();
  const maximum = expectedFiles.reduce(
    (sum, file) => sum + tarBytesFor(file.bytes),
    1024,
  );
  const input = createReadStream(archive),
    gunzip = createGunzip();
  const pumping = pipeline(input, gunzip);
  pumping.catch(() => {});
  const reader = new ByteReader(gunzip, maximum);
  try {
    while (true) {
      const header = await reader.exact(512);
      if (header.every((byte) => byte === 0)) {
        if (
          !(await reader.exact(512)).every((byte) => byte === 0) ||
          (await reader.more())
        )
          throw new Error("Unexpected data after TAR end marker");
        break;
      }
      const file = parseHeader(header);
      const wanted = expected.get(file.path);
      if (!wanted || wanted.bytes !== file.bytes || seen.has(file.path))
        throw new Error(`Unexpected or duplicate archive member: ${file.path}`);
      const filename = path.resolve(destination, file.path);
      if (!filename.startsWith(path.resolve(destination) + path.sep))
        throw new Error(`Archive path escapes destination: ${file.path}`);
      await fs.mkdir(path.dirname(filename), { recursive: true });
      const hash = createHash("sha256");
      const hashing = new Transform({
        transform(chunk, _encoding, done) {
          hash.update(chunk);
          done(null, chunk);
        },
      });
      await pipeline(
        Readable.from(reader.chunks(file.bytes)),
        hashing,
        createWriteStream(filename, { flags: "wx", mode: 0o644 }),
      );
      if (hash.digest("hex") !== wanted.sha256)
        throw new Error(`Extracted file SHA-256 mismatch: ${file.path}`);
      const padding = (512 - (file.bytes % 512)) % 512;
      if (padding && !(await reader.exact(padding)).every((byte) => byte === 0))
        throw new Error("Invalid TAR padding");
      seen.add(file.path);
    }
    await pumping;
    if (seen.size !== expected.size)
      throw new Error("Archive is missing declared files");
  } finally {
    input.destroy();
    gunzip.destroy();
    await pumping.catch(() => {});
  }
}
