import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import {
  libraryKinds,
  libraryKindNames,
  type LibraryKind,
  type LibraryManifest,
} from "../data/library-types";
import { libraryUrl, matchesLibraryKind } from "../lib/library";

interface Coverage {
  generatedAt: string;
  counts: Partial<Record<LibraryKind, number>>;
  structure: {
    byKind: Partial<
      Record<
        LibraryKind,
        { complete: number; partial: number; notApplicable?: number }
      >
    >;
  };
  narrative: {
    byKind: Partial<
      Record<
        LibraryKind,
        { complete: number; pending: number; notApplicable?: number }
      >
    >;
  };
}
const number = (value: number) => value.toLocaleString("zh-CN");

export default function LibraryCoverage({
  manifest,
}: {
  manifest: LibraryManifest;
}) {
  const [coverage, setCoverage] = useState<Coverage>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setError(false);
    setCoverage(undefined);
    void fetch(libraryUrl(manifest.coverage.path), {
      signal: controller.signal,
      cache: "no-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Coverage unavailable");
        const data = (await response.json()) as Coverage;
        if (!data.counts || !data.structure?.byKind || !data.narrative?.byKind)
          throw new Error("Coverage invalid");
        if (active) setCoverage(data);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [manifest.coverage.path, manifest.generatedAt, attempt]);

  return (
    <details className="library-coverage">
      <summary>
        分类收录与整理进度<span>查看明细</span>
      </summary>
      <div>
        <p>
          条目收录、参数整理与叙事提要分别统计。尚待整理的资料会保留出处；社区考据与游戏事实在档案中注明。
        </p>
        {error ? (
          <button
            className="library-inline-retry"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RefreshCw size={14} />
            重新载入收录进度
          </button>
        ) : !coverage ? (
          <p role="status">正在读取收录进度…</p>
        ) : (
          <div className="library-coverage-rows">
            {libraryKinds.map((kind) => {
              const keys = (
                Object.keys(coverage.counts) as LibraryKind[]
              ).filter((key) => matchesLibraryKind({ kind: key }, kind));
              const count = keys.reduce(
                (sum, key) => sum + (coverage.counts[key] ?? 0),
                0,
              );
              const fields = keys
                .map((key) => coverage.structure.byKind[key])
                .filter((value) => !!value);
              const narratives = keys
                .map((key) => coverage.narrative.byKind[key])
                .filter((value) => !!value);
              const complete = fields.reduce(
                (sum, row) => sum + row.complete,
                0,
              );
              const partial = fields.reduce((sum, row) => sum + row.partial, 0);
              const written = narratives.reduce(
                (sum, row) => sum + row.complete,
                0,
              );
              const pending = narratives.reduce(
                (sum, row) => sum + row.pending,
                0,
              );
              const withoutStory = narratives.reduce(
                (sum, row) => sum + (row.notApplicable ?? 0),
                0,
              );
              return (
                <div className="library-coverage-row" key={kind}>
                  <span>
                    <strong>{libraryKindNames[kind]}</strong>
                    <b>{number(count)}</b>
                  </span>
                  <small>
                    {complete + partial > 0 ? (
                      <>
                        参数与索引：{number(complete)} 已整理
                        {partial > 0 && ` · ${number(partial)} 待补`}
                      </>
                    ) : (
                      "以设定与叙事资料为主"
                    )}
                  </small>
                  {narratives.length > 0 && (
                    <small>
                      叙事提要：{number(written)} 已整理
                      {pending > 0 && ` · ${number(pending)} 待补`}
                      {withoutStory > 0 &&
                        ` · ${number(withoutStory)} ${kind === "module" ? "仅认证说明" : "无独立故事"}`}
                    </small>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <a
          href={libraryUrl(manifest.coverage.path)}
          target="_blank"
          rel="noreferrer"
        >
          完整来源与缺失清单 <ArrowUpRight size={13} />
        </a>
      </div>
    </details>
  );
}
