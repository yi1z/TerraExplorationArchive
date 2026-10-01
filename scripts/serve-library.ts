import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Connect, Plugin } from "vite";

const under = (root: string, file: string) => {
  const path = relative(root, file);
  return (
    path !== ".." &&
    !path.startsWith("..\\") &&
    !path.startsWith("../") &&
    !isAbsolute(path)
  );
};

/** Read generated files on demand: Vite's watched public-file index may be stale. */
export function libraryPublicMiddleware(
  publicDirectory: string,
): Connect.NextHandleFunction {
  return (request, response, next) => {
    const rawPath = (request.url ?? "").split("?")[0];
    let pathname: string;
    try {
      pathname = decodeURIComponent(rawPath);
    } catch {
      if (!/^\/(?:data\/prts|assets\/library)(?:\/|$)/.test(rawPath))
        return next();
      response.writeHead(400).end();
      return;
    }
    const prefix = pathname.startsWith("/data/prts/")
      ? "data/prts"
      : pathname.startsWith("/assets/library/")
        ? "assets/library"
        : null;
    if (!prefix) return next();
    const segments = pathname.slice(1).split("/");
    if (
      segments.some(
        (segment) => !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(segment),
      ) ||
      (!pathname.endsWith(".json") &&
        !(prefix === "assets/library" && pathname.endsWith(".webp")))
    ) {
      response.writeHead(400).end();
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    void (async () => {
      const [publicRoot, file] = await Promise.all([
        realpath(publicDirectory),
        realpath(resolve(publicDirectory, ...segments)),
      ]);
      if (!under(resolve(publicRoot, prefix), file)) {
        response.writeHead(403).end();
        return;
      }
      const handle = await open(file, "r");
      let streaming = false;
      try {
        const stats = await handle.stat();
        if (!stats.isFile()) {
          response.writeHead(404).end();
          return;
        }
        response.setHeader(
          "Content-Type",
          pathname.endsWith(".json")
            ? "application/json; charset=utf-8"
            : "image/webp",
        );
        response.setHeader("Content-Length", stats.size);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader(
          "Cache-Control",
          /^\/assets\/library\/images\/[a-f0-9]{24}-\d+\.webp$/.test(pathname)
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        );
        if (request.method === "HEAD") {
          response.end();
          return;
        }
        const stream = handle.createReadStream({ autoClose: true });
        streaming = true;
        await pipeline(stream, response);
      } finally {
        if (!streaming) await handle.close();
      }
    })().catch((error: NodeJS.ErrnoException) => {
      if (response.headersSent) response.destroy();
      else {
        response.removeHeader("Content-Length");
        response
          .writeHead(
            error.code === "ENOENT" || error.code === "ENOTDIR" ? 404 : 500,
          )
          .end();
      }
    });
  };
}

export function serveGeneratedLibrary(): Plugin {
  return {
    name: "serve-generated-library",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(libraryPublicMiddleware(server.config.publicDir));
    },
  };
}
