import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, request } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { libraryPublicMiddleware } from "../scripts/serve-library";

describe("generated public files in development", () => {
  let root: string;
  let port: number;
  const server = createServer((req, res) => {
    libraryPublicMiddleware(root)(req, res, () => res.end("app fallback"));
  });
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "terra-public-"));
    await mkdir(join(root, "data/prts/snapshots/new"), { recursive: true });
    await mkdir(join(root, "assets/library/images"), { recursive: true });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    port = (server.address() as { port: number }).port;
  });
  afterAll(async () => {
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
    const cleanup = resolve(root);
    if (
      dirname(cleanup) !== resolve(tmpdir()) ||
      !basename(cleanup).startsWith("terra-public-")
    )
      throw new Error("Refusing to remove an unexpected test directory");
    await rm(cleanup, { recursive: true, force: true });
  });
  const read = (path: string, method = "GET") =>
    new Promise<{
      status: number;
      headers: import("node:http").IncomingHttpHeaders;
      body: string;
    }>((done, reject) => {
      const req = request({ host: "127.0.0.1", port, path, method }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          done({ status: res.statusCode!, headers: res.headers, body }),
        );
      });
      req.on("error", reject);
      req.end();
    });

  it("serves a new snapshot created after startup and never substitutes HTML for missing JSON", async () => {
    const path = "/data/prts/snapshots/new/index.json";
    expect((await read(path)).status).toBe(404);
    await writeFile(join(root, path), '{"records":[]}');
    const result = await read(path + "?v=2");
    expect(result.status).toBe(200);
    expect(result.headers["content-type"]).toContain("application/json");
    expect(result.headers["cache-control"]).toBe("no-cache");
    expect(JSON.parse(result.body)).toEqual({ records: [] });
    const head = await read(path, "HEAD");
    expect(head.status).toBe(200);
    expect(head.body).toBe("");
    expect(head.headers["content-length"]).toBe(
      String(Buffer.byteLength(result.body)),
    );
  });
  it("rejects encoded traversal, private file extensions and write methods", async () => {
    for (const path of [
      "/data/prts/%2e%2e/%2e%2e/private.json",
      "/assets/library/%252e%252e/private.json",
      "/assets/library/%5cprivate.json",
      "/assets/library/%00private.json",
      "/data/prts/%zz.json",
      "/data/prts/manifest.json/",
      "/assets/library/private.ts",
    ])
      expect((await read(path)).status, path).toBe(400);
    expect((await read("/data/prts/manifest.json", "POST")).status).toBe(405);
    expect((await read("/unrelated")).body).toBe("app fallback");
  });
  it("streams hashed WebP files with immutable cache headers", async () => {
    const path = "/assets/library/images/0123456789abcdef01234567-160.webp";
    await writeFile(join(root, path), "RIFF-WEBP-fixture");
    const result = await read(path);
    expect(result.status).toBe(200);
    expect(result.headers["content-type"]).toBe("image/webp");
    expect(result.headers["cache-control"]).toContain("immutable");
    expect(result.body).toBe("RIFF-WEBP-fixture");
  });
});
