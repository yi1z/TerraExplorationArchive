import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const lock = JSON.parse(
  fs.readFileSync(path.join(root, "package-lock.json"), "utf8"),
);
const sections = [
  "TERRA EXPLORATION — Third-party software notices",
  "Generated from the installed package-lock.json. The notices below apply to their respective packages.",
  "This inventory covers production dependencies including transitive dependencies. Development tools are listed separately in docs/THIRD_PARTY.md.",
];
const missing = [];
for (const [key, meta] of Object.entries(lock.packages)) {
  if (!key.startsWith("node_modules/") || meta.dev) continue;
  const dir = path.join(root, key);
  if (!fs.existsSync(dir)) continue;
  const pkg = JSON.parse(
    fs.readFileSync(path.join(dir, "package.json"), "utf8"),
  );
  const files = fs
    .readdirSync(dir)
    .filter(
      (name) =>
        /^(licen[cs]e|notice|ofl|copying)([.-]|$)/i.test(name) &&
        fs.statSync(path.join(dir, name)).isFile(),
    );
  const repo =
    typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  sections.push(
    "\n" +
      "=".repeat(72) +
      "\n" +
      pkg.name +
      " @ " +
      pkg.version +
      "\nDeclared license: " +
      (typeof pkg.license === "string"
        ? pkg.license
        : JSON.stringify(pkg.license)) +
      "\nSource: " +
      (pkg.homepage || repo || "https://www.npmjs.com/package/" + pkg.name),
  );
  if (!files.length) {
    missing.push(pkg.name);
    sections.push(
      "No standalone license file was included in this npm package. See the upstream source above.",
    );
  }
  for (const file of files)
    sections.push(
      "\n--- " +
        file +
        " ---\n" +
        fs.readFileSync(path.join(dir, file), "utf8"),
    );
}
fs.writeFileSync(
  path.join(root, "public", "third-party-notices.txt"),
  sections.join("\n\n"),
);
console.log(
  "Created public/third-party-notices.txt from installed production dependencies.",
);
if (missing.length)
  console.log(
    "Packages without a standalone license file: " + missing.join(", "),
  );

const upstream = {
  "@react-three/fiber": "react-three-fiber",
  maath: "maath",
  draco3d: "draco3d",
  "@mediapipe/tasks-vision": "mediapipe",
};
for (const [pkg, file] of Object.entries(upstream)) {
  const textPath = path.join(root, "docs", "licenses", file + ".txt");
  if (fs.existsSync(textPath))
    sections.push(
      "\n" +
        pkg +
        " — supplemental upstream notice, retrieved 2026-09-29\n" +
        fs.readFileSync(textPath, "utf8"),
    );
}
sections.push(
  "\nstats-gl declares MIT in its package metadata and upstream README. Author: Renaud Rohlinger. The installed package includes no separate license/copyright notice. It is an unused transitive helper; this site does not initialize stats-gl, MediaPipe, or Draco.",
);
fs.writeFileSync(
  path.join(root, "public", "third-party-notices.txt"),
  sections.join("\n\n"),
);
