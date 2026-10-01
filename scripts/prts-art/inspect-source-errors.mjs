import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
const execute = promisify(execFile);
const url = new URL("https://prts.wiki/api.php");
url.search = new URLSearchParams({
  action: "query",
  format: "json",
  prop: "imageinfo",
  iilimit: "50",
  iiprop: "url|size|sha1|timestamp|mime",
  iiurlwidth: "1440",
  titles: "文件:中坚干员轮换卡池05.jpg|文件:模组_D32钢椅.png",
});
const { stdout } = await execute(
  "curl.exe",
  [
    "--ipv4",
    "--fail",
    "--silent",
    "--show-error",
    "--resolve",
    "prts.wiki:443:36.158.217.7",
    "--connect-timeout",
    "20",
    "--max-time",
    "60",
    url.href,
  ],
  { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
);
await fs.writeFile("data/prts-assets/source-error-history.json", stdout);
console.log(stdout);
for (const name of []) {
  const result = await execute(
    "curl.exe",
    [
      "--ipv4",
      "--silent",
      "--show-error",
      "--head",
      "--connect-timeout",
      "10",
      "--max-time",
      "20",
      `https://torappu.prts.wiki/assets/furniture/${name}`,
    ],
    { windowsHide: true },
  ).catch((error) => ({ stdout: error.message }));
  console.log(name, result.stdout);
}
