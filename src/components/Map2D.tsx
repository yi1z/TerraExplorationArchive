import { useEffect } from "react";
import { MOTION } from "../lib/motion";
import { useReducedMotion } from "../lib/useMotion";
import { mainland, regions, markers } from "../data/geography";
import { entryById, events } from "../data/archive";
import { useArchiveStore } from "../lib/state";
import { mapPoint, mapRegionId } from "../lib/map";
import { tone } from "../lib/audio";
const points = (p: number[][]) => p.map((v) => v.join(",")).join(" ");
export default function Map2D({ fallback = false }: { fallback?: boolean }) {
  const { selected, layers, select, preferences, activeEvent } =
    useArchiveStore();
  const introPlaying = useArchiveStore((s) => s.introPlaying);
  const introSequence = useArchiveStore((s) => s.introSequence);
  const focusSequence = useArchiveStore((s) => s.focusSequence);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!introPlaying) return;
    if (reduced) {
      useArchiveStore.getState().finishIntro();
      return;
    }
    let remaining = MOTION.intro * 1000;
    let started = performance.now();
    let timer: number | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (!document.hidden) {
        started = performance.now();
        timer = window.setTimeout(
          () => useArchiveStore.getState().finishIntro(),
          remaining,
        );
      }
    };
    const visibility = () => {
      if (document.hidden) {
        remaining = Math.max(0, remaining - (performance.now() - started));
        clearTimeout(timer);
      } else schedule();
    };
    schedule();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [introPlaying, introSequence, reduced]);
  const selectedRegion = mapRegionId(selected);
  const eventRegions =
    events.find((e) => e.id === activeEvent)?.related.map(mapRegionId) ?? [];
  const pick = (id: string) => {
    tone(preferences.sound);
    select(id);
  };
  const activate = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(id);
    }
  };
  const origin = mapPoint(selected);
  return (
    <div className="flat-map">
      {fallback && (
        <div className="fallback-note" role="status">
          已启用轻量地图 · 所有档案仍可浏览
        </div>
      )}
      <svg
        key={introSequence}
        viewBox="-21 -13 43 29"
        aria-label="泰拉二维地图，使用地区索引也可浏览全部档案"
        className="flat-map-svg"
      >
        <defs>
          <pattern
            id="map-grid"
            width="2"
            height="2"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 2 0 L 0 0 0 2"
              fill="none"
              stroke="#718b91"
              strokeWidth=".015"
            />
          </pattern>
        </defs>
        <rect x="-21" y="-13" width="43" height="29" fill="url(#map-grid)" />
        <polygon
          points={points(mainland)}
          fill="#dfe7e4"
          stroke="#9aadae"
          strokeWidth=".1"
        />
        {regions
          .filter((r) => !r.special)
          .map((r, i) => (
            <g
              key={r.id}
              className="flat-region"
              style={
                { "--reveal-delay": i * 0.04 + "s" } as React.CSSProperties
              }
              role="button"
              tabIndex={0}
              aria-label={"探索" + entryById[r.id].name}
              onPointerEnter={() =>
                useArchiveStore.getState().setPreviewEntry(r.id)
              }
              onFocus={() => useArchiveStore.getState().setPreviewEntry(r.id)}
              onClick={() => pick(r.id)}
              onKeyDown={(e) => activate(e, r.id)}
            >
              <polygon
                points={points(r.polygon)}
                fill={
                  r.id === selectedRegion || eventRegions.includes(r.id)
                    ? "#d7e97a"
                    : "#f2f5ef"
                }
                stroke={r.id === selectedRegion ? "#637734" : "#bac8c6"}
                strokeWidth={
                  r.id === selectedRegion ? 0.14 : layers.countries ? 0.06 : 0
                }
              />
              {layers.countries && (
                <text
                  x={r.center[0]}
                  y={r.center[1]}
                  textAnchor="middle"
                  className="flat-map-label"
                >
                  {entryById[r.id].name}
                </text>
              )}
            </g>
          ))}
        {layers.countries &&
          regions
            .filter((r) => r.special)
            .map((r) => (
              <g
                key={r.id}
                role="button"
                tabIndex={0}
                aria-label={"探索" + entryById[r.id].name}
                onPointerEnter={() =>
                  useArchiveStore.getState().setPreviewEntry(r.id)
                }
                onFocus={() => useArchiveStore.getState().setPreviewEntry(r.id)}
                onClick={() => pick(r.id)}
                onKeyDown={(e) => activate(e, r.id)}
              >
                <circle
                  cx={r.center[0]}
                  cy={r.center[1]}
                  r=".28"
                  fill="#4f696d"
                />
                <text
                  x={r.center[0] + 0.55}
                  y={r.center[1] + 0.2}
                  className="flat-map-label"
                >
                  {entryById[r.id].name}
                </text>
              </g>
            ))}
        {layers.relations &&
          selected &&
          origin &&
          entryById[selected].related.map((id) => {
            const end = mapPoint(id);
            return end ? (
              <path
                key={selected + id}
                className="flat-relation"
                pathLength={1}
                d={
                  "M " +
                  origin.join(" ") +
                  " Q " +
                  (origin[0] + end[0]) / 2 +
                  " " +
                  (Math.min(origin[1], end[1]) - 2) +
                  " " +
                  end.join(" ")
                }
                fill="none"
                stroke="#839a39"
                strokeWidth=".12"
                strokeDasharray="1"
                pointerEvents="none"
              />
            ) : null;
          })}
        {origin && (
          <g
            key={focusSequence}
            className="flat-beacon"
            transform={"translate(" + origin.join(" ") + ")"}
            pointerEvents="none"
            aria-hidden="true"
          >
            <circle r="1" />
            <circle r="1" />
          </g>
        )}
        {layers.cities &&
          markers.map((m) => (
            <g
              key={m.id}
              role="button"
              tabIndex={0}
              aria-label={"探索城市" + entryById[m.id].name}
              onPointerEnter={() =>
                useArchiveStore.getState().setPreviewEntry(m.id)
              }
              onFocus={() => useArchiveStore.getState().setPreviewEntry(m.id)}
              onClick={() => pick(m.id)}
              onKeyDown={(e) => activate(e, m.id)}
            >
              <circle
                cx={m.point[0]}
                cy={m.point[1]}
                r={selected === m.id ? 0.36 : 0.24}
                fill={selected === m.id ? "#93ac25" : "#3d686f"}
                stroke="#edf4ec"
                strokeWidth=".07"
              />
              {selected === m.id && (
                <text
                  x={m.point[0]}
                  y={m.point[1] - 0.6}
                  textAnchor="middle"
                  className="flat-map-label selected-city"
                >
                  {entryById[m.id].name}
                </text>
              )}
            </g>
          ))}
      </svg>
    </div>
  );
}
