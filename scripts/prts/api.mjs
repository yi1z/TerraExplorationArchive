import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const exec = promisify(execFile);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const ROOT = path.resolve("data/prts");
export const PUBLIC = path.resolve("public/data/prts");
export async function json(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    throw error;
  }
}
export async function save(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  const isPublic = path.resolve(file).startsWith(PUBLIC + path.sep);
  await writeFile(
    temporary,
    JSON.stringify(value, null, isPublic ? undefined : 2) + "\n",
  );
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(temporary, file);
      break;
    } catch (error) {
      if (!["EPERM", "EBUSY"].includes(error.code) || attempt === 12)
        throw error;
      await pause(120 * (attempt + 1));
    }
  }
}
export function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
export const wiki = (title) =>
  `https://prts.wiki/w/${encodeURIComponent(title)}`;

export class Api {
  constructor({ offline = false, refresh = false } = {}) {
    this.offline = offline;
    this.refresh = refresh;
    this.requests = 0;
    this.cacheHits = 0;
    this.nextRequestAt = 0;
  }
  async get(parameters) {
    const params = {
      format: "json",
      formatversion: "2",
      maxlag: "5",
      ...parameters,
    };
    const query = new URLSearchParams(
      Object.entries(params).sort(([a], [b]) => a.localeCompare(b)),
    ).toString();
    const filename = path.join(ROOT, "cache", `${digest(query)}.json`);
    if (!this.refresh || this.offline) {
      const cached = await json(filename, null);
      if (cached) {
        this.cacheHits++;
        return cached.response;
      }
    }
    if (this.offline) throw new Error(`Offline cache miss: ${query}`);
    let last;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const wait = Math.max(0, this.nextRequestAt - Date.now());
        this.nextRequestAt = Date.now() + wait + 700;
        await pause(wait);
        const resolution = process.env.PRTS_API_IP
          ? ["--resolve", `prts.wiki:443:${process.env.PRTS_API_IP}`]
          : [];
        const { stdout } = await exec(
          "curl.exe",
          [
            "--ipv4",
            ...resolution,
            "--silent",
            "--show-error",
            "--fail",
            "--compressed",
            "--user-agent",
            "TerraExploration/1.0 (personal offline reference archive; MediaWiki API client)",
            "--connect-timeout",
            "15",
            "--max-time",
            "65",
            `https://prts.wiki/api.php?${query}`,
          ],
          { maxBuffer: 96 * 1024 * 1024, windowsHide: true },
        );
        this.requests++;
        const response = JSON.parse(stdout);
        if (response.error)
          throw new Error(`${response.error.code}: ${response.error.info}`);
        await save(filename, {
          fetchedAt: new Date().toISOString(),
          url: `https://prts.wiki/api.php?${query}`,
          response,
        });
        return response;
      } catch (error) {
        last = error;
        if (
          /invalidfield|badvalue|unknown_action|Permission|Permissiondenied/i.test(
            error.message,
          )
        )
          break;
        await pause(1200 * (attempt + 1));
      }
    }
    throw new Error(
      `PRTS request failed (${query.slice(0, 180)}): ${last.message}`,
    );
  }
  async cargo(table, fields) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const response = await this.get({
        action: "cargoquery",
        tables: table,
        fields,
        order_by: "_pageID",
        limit: "500",
        offset: String(offset),
      });
      const batch = (response.cargoquery ?? []).map((row) => row.title);
      rows.push(...batch);
      if (batch.length < 500) return rows;
    }
  }
  async continued(parameters, key) {
    let continuation = {};
    const rows = [];
    do {
      const response = await this.get({
        action: "query",
        ...parameters,
        ...continuation,
      });
      rows.push(...(response.query?.[key] ?? []));
      continuation = response.continue;
    } while (continuation);
    return rows;
  }
}

export async function pool(values, concurrency, action) {
  let cursor = 0;
  const results = new Array(values.length);
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        try {
          results[index] = {
            status: "fulfilled",
            value: await action(values[index], index),
          };
        } catch (reason) {
          results[index] = {
            status: "rejected",
            reason: String(reason.stack ?? reason),
          };
        }
      }
    }),
  );
  return results;
}
