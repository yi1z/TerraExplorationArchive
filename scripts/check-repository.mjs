/** Filesystem-only repository allowlist audit. This script never invokes Git. */
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const rootFiles = [
  ".gitattributes",
  ".gitignore",
  "README.md",
  "index.html",
  "qa.html",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
];
const sourceDirectories = ["src", "scripts", "tests", "docs"];
const onlineDirectories = ["resources/online"];
const curatedAssets = [
  "public/assets/catalogue",
  "public/assets/game",
  "public/assets/audio",
];
const editorials = [
  "editorial.json",
  "editorial-gameplay.json",
  "editorial-memories.json",
  "editorial-modules-a.json",
  "editorial-modules-b.json",
  "editorial-modules-c.json",
  "editorial-modules-d.json",
  "editorial-modules-e.json",
  "editorial-operators-a.json",
  "editorial-operators-b.json",
  "editorial-operators-supplement.json",
  "editorial-stories-a.json",
  "editorial-stories-b.json",
  "editorial-world-a.json",
  "editorial-world-b.json",
];
const fixedFiles = [
  ...rootFiles,
  "public/favicon.svg",
  "public/third-party-notices.txt",
  "public/data/prts/manifest.json",
  "public/data/prts/coverage.json",
  ...editorials.map((name) => `data/prts/${name}`),
  "data/prts/embedded-identities.json",
  "data/prts-assets/source-overrides.json",
  "data/prts-assets/source-error-history.json",
  "resources/library-assets.json",
  "resources/online-release.json",
  "resources/online-art-overrides.json",
];
const forbiddenNames =
  /(?:^|\/)(?:\.git|node_modules|dist|\.vite)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|p12|pfx|log|part|tsbuildinfo|local)$|(?:credentials|service-account)[^/]*\.json$/i;
const manifest = JSON.parse(
  await fs.readFile(path.join(root, "public/data/prts/manifest.json"), "utf8"),
);
const snapshotRoot = `public/data/prts/snapshots/${manifest.snapshotId}`;
if (!/^prts-[A-Za-z0-9TZ.-]+$/.test(manifest.snapshotId))
  throw new Error("Unsafe or unsupported snapshot ID");
const references = [
  ...manifest.indexShards,
  ...manifest.detailShards,
  ...manifest.searchShards,
  manifest.coverage,
].map((entry) => {
  const relative = `public/${entry.path}`;
  if (
    !relative.startsWith(`${snapshotRoot}/`) ||
    relative.includes("..") ||
    relative.includes("\\") ||
    !relative.endsWith(".json")
  )
    throw new Error(
      `Manifest reference is outside the active snapshot: ${entry.path}`,
    );
  return relative;
});
if (new Set(references).size !== references.length)
  throw new Error("Duplicate manifest references");
const explicitFiles = new Set([...fixedFiles, ...references]);
const directories = [
  ...sourceDirectories,
  ...curatedAssets,
  ...onlineDirectories,
];
const allowed = (relative) =>
  !forbiddenNames.test(relative) &&
  (explicitFiles.has(relative) ||
    directories.some((directory) => relative.startsWith(`${directory}/`)));
const errors = [],
  warnings = [];
const available = [];
async function inspectPath(relative, required = true) {
  if (forbiddenNames.test(relative)) return;
  const filename = path.join(root, relative);
  try {
    const status = await fs.lstat(filename);
    if (status.isSymbolicLink()) {
      errors.push({ path: relative, issue: "symbolic-link-not-allowed" });
      return;
    }
    if (status.isDirectory()) {
      for (const entry of await fs.readdir(filename, { withFileTypes: true }))
        await inspectPath(`${relative}/${entry.name}`, false);
    } else if (allowed(relative))
      available.push({ path: relative, bytes: status.size });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if (required)
      errors.push({ path: relative, issue: "required-file-missing" });
  }
}

{
  const lines = [
    "# Explicit commit allowlist. Generated from the active manifest.",
    "# Regenerate after a deliberate snapshot update:",
    "# node scripts/check-repository.mjs --write-ignore",
    "# These rules never delete local files. Audit forced additions separately.",
    "/*",
    ...rootFiles.map((file) => `!/${file}`),
    ...sourceDirectories.flatMap((directory) => [
      `!/${directory}/`,
      `!/${directory}/**`,
    ]),
    "!/public/",
    "/public/*",
    "!/public/favicon.svg",
    "!/public/third-party-notices.txt",
    "!/public/assets/",
    "/public/assets/*",
    ...curatedAssets.flatMap((directory) => [
      `!/${directory}/`,
      `!/${directory}/**`,
    ]),
    "!/public/data/",
    "/public/data/*",
    "!/public/data/prts/",
    "/public/data/prts/*",
    "!/public/data/prts/manifest.json",
    "!/public/data/prts/coverage.json",
    "!/public/data/prts/snapshots/",
    "/public/data/prts/snapshots/*",
    `!/${snapshotRoot}/`,
    `/${snapshotRoot}/*`,
    ...["index", "details", "search"].flatMap((directory) => [
      `!/${snapshotRoot}/${directory}/`,
      `/${snapshotRoot}/${directory}/*`,
    ]),
    ...references.map((file) => `!/${file}`),
    "!/data/",
    "/data/*",
    "!/data/prts/",
    "/data/prts/*",
    ...editorials.map((file) => `!/data/prts/${file}`),
    "!/data/prts/embedded-identities.json",
    "!/data/prts-assets/",
    "/data/prts-assets/*",
    "!/data/prts-assets/source-overrides.json",
    "!/data/prts-assets/source-error-history.json",
    "!/resources/",
    "/resources/*",
    "!/resources/library-assets.json",
    "!/resources/online-release.json",
    "!/resources/online-art-overrides.json",
    "!/resources/online/",
    "!/resources/online/**",
    "",
    "# Sensitive or machine-generated files stay excluded even inside source roots.",
    "**/.git/",
    "**/node_modules/",
    "**/dist/",
    "**/.vite/",
    "**/.env",
    "**/.env.*",
    "**/*.pem",
    "**/*.key",
    "**/*.p12",
    "**/*.pfx",
    "**/*.log",
    "**/*.part",
    "**/*.tsbuildinfo",
    "**/*.local",
    "**/*credentials*.json",
    "**/*service-account*.json",
    "**/.DS_Store",
    "**/Thumbs.db",
  ];
  const expectedIgnore = lines.join("\n") + "\n";
  if (args.includes("--write-ignore"))
    await fs.writeFile(path.join(root, ".gitignore"), expectedIgnore);
  else if (
    (await fs.readFile(path.join(root, ".gitignore"), "utf8")).replace(
      /\r\n/g,
      "\n",
    ) !== expectedIgnore
  )
    errors.push({
      path: ".gitignore",
      issue: "allowlist-drift-regenerate-with-write-ignore",
    });
}

for (const relative of explicitFiles) await inspectPath(relative);
for (const directory of directories) await inspectPath(directory);
const uniqueFiles = [
  ...new Map(available.map((file) => [file.path, file])).values(),
].sort((a, b) => a.path.localeCompare(b.path));
const inputArgument = args.find((arg) => arg.startsWith("--paths-file="));
let files = uniqueFiles;
if (inputArgument) {
  const input = await fs.readFile(
    path.resolve(root, inputArgument.slice("--paths-file=".length)),
    "utf8",
  );
  const normalizedInput = input.replace(/^\uFEFF/, "");
  const names = normalizedInput.includes("\0")
    ? normalizedInput.split("\0")
    : normalizedInput.split(/\r?\n/);
  const selected = new Set(
    names.filter(Boolean).map((name) => name.replace(/\\/g, "/")),
  );
  for (const name of selected) {
    if (
      name.startsWith("/") ||
      /^[A-Za-z]:/.test(name) ||
      name.split("/").includes("..") ||
      !allowed(name)
    )
      errors.push({ path: name, issue: "path-outside-commit-allowlist" });
    else if (!uniqueFiles.some((file) => file.path === name))
      errors.push({ path: name, issue: "selected-file-missing" });
  }
  files = uniqueFiles.filter((file) => selected.has(file.path));
}

const secretPatterns = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/g],
  [
    "github-token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  ],
  ["openai-token", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g],
  [
    "literal-secret-assignment",
    /(?:api[_-]?key|secret|password|access[_-]?token)\s*[=:]\s*["'][A-Za-z0-9_+\/=.-]{20,}["']/gi,
  ],
];
for (const file of files) {
  if (file.bytes > 100 * 1024 * 1024)
    errors.push({
      path: file.path,
      issue: "exceeds-100MiB",
      bytes: file.bytes,
    });
  else if (file.bytes > 50 * 1024 * 1024)
    warnings.push({
      path: file.path,
      issue: "exceeds-50MiB",
      bytes: file.bytes,
    });
  if (
    !/\.(?:[cm]?[jt]sx?|json|md|txt|html|css|svg|ya?ml|toml)$|(?:^|\/)\.gitignore$/.test(
      file.path,
    )
  )
    continue;
  const body = await fs.readFile(path.join(root, file.path), "utf8");
  for (const [label, expression] of secretPatterns)
    for (const match of body.matchAll(expression))
      errors.push({
        path: file.path,
        line: body.slice(0, match.index).split("\n").length,
        issue: label,
      });
  const localPath =
    /(?:[A-Za-z]:[\\/]+(?:Users|Creative)[\\/]+[^\s`"'<>]+|\/(?:Users|home)\/[^\s`"'<>]+)/g;
  for (const match of body.matchAll(localPath))
    warnings.push({
      path: file.path,
      line: body.slice(0, match.index).split("\n").length,
      issue: "machine-absolute-path",
    });
}
if (args.includes("--list"))
  process.stdout.write(files.map((file) => file.path).join("\n") + "\n");
else
  console.log(
    JSON.stringify(
      {
        snapshotId: manifest.snapshotId,
        activePublicJsonFiles: references.length + 2,
        editorialFiles: editorials.length,
        scope: inputArgument
          ? "Provided path names; contents read from the working files, not the Git index"
          : "Allowlisted working files; no Git access",
        auditedFiles: files.length,
        auditedBytes: files.reduce((sum, file) => sum + file.bytes, 0),
        errors,
        warnings,
      },
      null,
      2,
    ),
  );
if (errors.length) process.exitCode = 1;
