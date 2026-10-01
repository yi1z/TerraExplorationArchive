/** Parse balanced template parameters without splitting nested templates/links. */
export function splitTop(text, delimiter = "|") {
  let curly = 0,
    square = 0,
    start = 0,
    protectedTag = null;
  const result = [];
  for (let i = 0; i < text.length; i++) {
    if (protectedTag) {
      const closing =
        text[i] === "<" &&
        text.slice(i).match(new RegExp(`^<\\/${protectedTag}\\s*>`, "i"));
      if (closing) {
        i += closing[0].length - 1;
        protectedTag = null;
      }
      continue;
    }
    const protectedStart =
      text[i] === "<" &&
      text.slice(i).match(/^<(tabber|nowiki|pre|syntaxhighlight)\b[^>]*>/i);
    if (protectedStart && !protectedStart[0].endsWith("/>")) {
      protectedTag = protectedStart[1];
      i += protectedStart[0].length - 1;
      continue;
    }
    if (text.startsWith("{{", i)) {
      curly++;
      i++;
    } else if (text.startsWith("}}", i)) {
      curly--;
      i++;
    } else if (text.startsWith("[[", i)) {
      square++;
      i++;
    } else if (text.startsWith("]]", i)) {
      square--;
      i++;
    } else if (text.startsWith(delimiter, i) && curly === 0 && square === 0) {
      result.push(text.slice(start, i));
      start = i + delimiter.length;
      i += delimiter.length - 1;
    }
  }
  result.push(text.slice(start));
  return result;
}
export function parseTemplates(source) {
  const hide = (value) => value.replace(/[^\n]/g, " ");
  const text = source
    .replace(/<!--[\s\S]*?-->/g, hide)
    .replace(/<nowiki\b[^>]*>[\s\S]*?<\/nowiki>/gi, hide);
  const stack = [],
    result = [];
  for (let i = 0; i < text.length - 1; i++) {
    if (text.startsWith("{{{", i) && !text.startsWith("{{{!}}", i)) {
      stack.push({ start: i, width: 3 });
      i += 2;
    } else if (text.startsWith("{{", i)) {
      stack.push({ start: i, width: 2 });
      i++;
    } else if (text.startsWith("}}", i) && stack.length) {
      const top = stack.at(-1);
      if (top.width === 3 && !text.startsWith("}}}", i)) continue;
      stack.pop();
      if (top.width === 2) {
        const parts = splitTop(text.slice(top.start + 2, i));
        const name = parts.shift().trim();
        const params = Object.create(null);
        let positional = 1;
        for (const part of parts) {
          const equals = splitTop(part, "=");
          if (equals.length > 1)
            params[equals.shift().trim()] = equals.join("=").trim();
          else params[String(positional++)] = part.trim();
        }
        result.push({
          name,
          params,
          start: top.start,
          end: i + 2,
          depth: stack.length,
        });
      }
      i += top.width - 1;
    }
  }
  return result.sort((a, b) => a.start - b.start);
}
export function clean(text = "") {
  let value = String(text)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\x7f[^\x7f]*UNIQ[^\x7f]*\x7f/g, "");
  for (let i = 0; i < 6 && value.includes("{{"); i++) {
    value = value.replace(/\{\{([^{}]+)\}\}/g, (_, inside) => {
      const [name, ...args] = splitTop(inside);
      if (/^(color|color2|大小|nowrap|修正|黑幕)$/i.test(name.trim()))
        return args.find((x, j) => j > 0 && !x.includes("=")) ?? args[0] ?? "";
      if (/^(术语|异常效果)$/.test(name.trim()))
        return args[1] ?? args[0] ?? "";
      if (/^(fa|mdi)$/i.test(name.trim())) return "";
      if (/^[*+]$/.test(name.trim())) return args[1] ?? args[0] ?? "";
      if (name.trim() === "变动数值lite") return args[2] ?? "";
      if (name.trim() === "变动数值") return args[0] ?? "";
      if (/^(Font|字体)$/i.test(name.trim()))
        return args.find((x) => !x.includes("=")) ?? "";
      if (name.trim() === "材料消耗")
        return `${args[0] ?? ""}${args[1] ? ` × ${args[1]}` : ""}`;
      if (/^道具图标(?:\/.*)?$/.test(name.trim()))
        return `${args[0] ?? ""}${args[1] ? ` × ${args[1]}` : ""}`;
      if (name.trim() === "关卡报酬") {
        const positional = args.filter((arg) => !arg.includes("="));
        const quantity = args.find((arg) => /^n=/.test(arg))?.slice(2);
        return `${positional[0] ?? ""}${quantity ? ` × ${quantity}` : ""}${positional[1] ? `（${positional[1]}）` : ""}`;
      }
      if (/^(道具|家具|干员头像|敌人头像)$/.test(name.trim()))
        return args[0] ?? "";
      return args.filter((x) => !x.includes("=")).join(" ");
    });
  }
  return value
    .replace(
      /\[\[(?:文件|File|Image):([^\]]*)\]\]/gi,
      (_, params) => params.match(/(?:^|\|)link=([^|]+)/)?.[1] ?? "",
    )
    .replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_, target, label) => label ?? target,
    )
    .replace(/\[https?:\/\/[^\s\]]+(?:\s+([^\]]+))?\]/g, "$1")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/'{2,5}/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .trim();
}
export function artworkRefs(text) {
  return [
    ...new Set(
      [...String(text).matchAll(/\[\[(?:文件|File|Image):([^\]|]+)/gi)].map(
        (m) => m[1].trim(),
      ),
    ),
  ].map((title) => ({ title: `文件:${title}`, role: "source" }));
}
export function rawContent(page) {
  return (
    page?.revisions?.[0]?.slots?.main?.content ??
    page?.revisions?.[0]?.slots?.main?.["*"] ??
    ""
  );
}

export function tableCell(text) {
  const stamps = [
    ...String(text).matchAll(
      /\[\[(?:文件|File):任务[ _]印章\.png\b[^\]]*\]\]/gi,
    ),
  ].length;
  // Some numeric tables encode their stage/phase solely in an icon.
  const semantic = String(text)
    .replace(/\[\[(?:文件|File):精英[ _](\d)\.png\b[^\]]*\]\]/gi, "精英$1")
    .replace(
      /\[\[(?:文件|File):集成战略[_ ]\d+[_ ]层级[_ ](\d+)\.png\b[^\]]*\]\]/gi,
      "第$1层",
    );
  const result = clean(semantic);
  return stamps
    ? `${result}${result ? " · " : ""}任务印章 × ${stamps}`
    : result;
}

/** Retain table cells and nested tables without guessing values lost to rowspan/colspan. */
export function parseTables(source) {
  const tables = [];
  tables.warnings = [];
  let table,
    row = [],
    cell = "",
    depth = 0,
    heading = "",
    lineNumber = 0;
  const flushCell = () => {
    if (cell.trim()) row.push(cell.trim());
    cell = "";
  };
  const flushRow = () => {
    flushCell();
    if (row.length) table.rows.push(row);
    row = [];
  };
  for (const rawLine of String(source)
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")) {
    const line = rawLine.replace(/^\s*:+\s*(?=\{\||\|[}\-+]|[|!])/, "");
    lineNumber++;
    const title = line.match(/^={2,6}\s*([^=]+?)\s*={2,6}\s*$/);
    if (!depth && title) heading = clean(title[1]);
    if (/^\s*\{\|/.test(line)) {
      depth++;
      if (depth === 1) {
        table = { title: heading, rows: [] };
        row = [];
        cell = "";
      } else cell += "\n" + line;
      continue;
    }
    if (/^\s*\|\}/.test(line)) {
      if (!depth) {
        tables.warnings.push({
          line: lineNumber,
          reason: "依赖外层模板或缺少起始标记的表格结束符",
        });
        continue;
      }
      if (depth === 1) {
        flushRow();
        tables.push(table);
        table = null;
      } else cell += "\n" + line;
      depth--;
      continue;
    }
    if (!depth) continue;
    if (depth > 1) {
      cell += "\n" + line;
      continue;
    }
    if (/^\s*\|-/.test(line)) {
      flushRow();
      continue;
    }
    if (/^\s*\|\+/.test(line)) {
      table.title = clean(line.replace(/^\s*\|\+/, ""));
      continue;
    }
    const match = line.match(/^\s*([!|])(.*)$/);
    if (match) {
      flushCell();
      const delimiter = match[1] === "!" ? "!!" : "||";
      const pieces = splitTop(match[2], delimiter);
      for (let index = 0; index < pieces.length; index++) {
        if (index) flushCell();
        cell = pieces[index].replace(
          /^\s*(?:(?:style|class|width|height|align|valign|rowspan|colspan)\s*=[^|]*)\|/i,
          "",
        );
      }
    } else cell += "\n" + line;
  }
  if (depth)
    tables.warnings.push({
      line: lineNumber,
      reason: "未闭合的表格或依赖外层模板的表格片段",
    });
  return tables;
}
