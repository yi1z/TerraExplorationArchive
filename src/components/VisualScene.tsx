import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { visualProfileFor } from "../data/visual-profiles";
import type { VisualEntry, VisualTheme } from "../data/visual-profiles";
import "../visual-scenes.css";

function SceneGeometry({ theme }: { theme: VisualTheme }) {
  if (theme === "originium")
    return (
      <>
        <g className="visual-crystals">
          {[0, 1, 2, 3, 4].map((n) => (
            <g
              key={n}
              transform={`translate(${390 + n * 113},${420 - (n % 3) * 58}) rotate(${n * 9 - 19})`}
            >
              <path d="M0-190 34-126 27 90 0 139-24 60-29-130Z" />
              <path
                d="M0-190 1 139M-29-130 34-126M-24 60 27 90"
                className="visual-hairline"
              />
            </g>
          ))}
        </g>
        <path className="visual-scan" d="M290 240H1110M330 245H1020" />
        <g className="visual-measure">
          <path d="M950 120V630M942 140h16m-16 50h16m-16 50h16m-16 50h16m-16 50h16m-16 50h16m-16 50h16m-16 50h16m-16 50h16" />
          <circle cx="705" cy="370" r="238" strokeDasharray="2 19" />
        </g>
      </>
    );
  if (theme === "snow")
    return (
      <>
        <g className="visual-mountains">
          <path d="M280 675 445 380 536 513 709 238 860 492 974 329 1160 675" />
          <path d="m709 238-42 134 51-35 45 61-54-160m265 91-42 112 33-19 46 39" />
          <path d="m280 700 260-180 101 54 159-207 181 233 179-60" />
        </g>
        <g className="visual-snowflakes">
          {Array.from({ length: 22 }, (_, n) => (
            <circle
              key={n}
              cx={330 + ((n * 157) % 825)}
              cy={55 + ((n * 113) % 570)}
              r={n % 3 === 0 ? 2 : 1}
              style={{ animationDelay: `${n * 19}ms` }}
            />
          ))}
        </g>
        <g className="visual-crest" transform="translate(862 215)">
          <path d="M0-65V65M-56-32 56 32M-56 32 56-32M0-45-13-57m13 12 13-12M-38-22-49-12m11-10-1-16M38-22l1-16m-1 16 11 10M0 45-13 57m13-12 13 12M-38 22-49 12m11 10-1 16M38 22l1 16m-1-16 11-10" />
        </g>
      </>
    );
  if (theme === "abyss")
    return (
      <>
        <g className="visual-tides">
          {[0, 1, 2, 3, 4].map((n) => (
            <path
              key={n}
              d={`M${240 + n * 25} ${590 + n * 20}C${390 + n * 12} ${220 + n * 30},${740 + n * 50} ${795 - n * 12},${1150 + n * 5} ${340 + n * 35}`}
            />
          ))}
        </g>
        <g className="visual-sonar">
          <ellipse cx="785" cy="410" rx="252" ry="190" />
          <ellipse cx="785" cy="410" rx="312" ry="235" strokeDasharray="2 13" />
          <path d="M475 410h62m496 0h62M785 175v43m0 384v43" />
        </g>
        <g className="visual-deep-dust">
          {Array.from({ length: 18 }, (_, n) => (
            <circle
              key={n}
              cx={420 + n * 43}
              cy={100 + ((n * 79) % 540)}
              r={n % 4 === 0 ? 2.2 : 0.8}
            />
          ))}
        </g>
      </>
    );
  if (theme === "rhine")
    return (
      <>
        <g className="visual-orbits">
          <ellipse
            cx="800"
            cy="355"
            rx="275"
            ry="136"
            transform="rotate(-35 800 355)"
          />
          <ellipse
            cx="800"
            cy="355"
            rx="275"
            ry="136"
            transform="rotate(35 800 355)"
          />
          <circle cx="800" cy="355" r="207" strokeDasharray="5 9" />
          <circle cx="980" cy="251" r="7" />
        </g>
        <g className="visual-lab">
          <path d="M372 205V117h125m470 0h151v96M372 528v94h125m470 0h151v-96M390 610h160m-160-7h37m-37-12h94M1050 141h45m-45 8h26" />
          <path d="M470 478h70v-60h67v-130h63M941 520v-86h99v-68h38" />
          <circle cx="670" cy="288" r="5" />
        </g>
      </>
    );
  if (theme === "halo")
    return (
      <>
        <g className="visual-halo">
          <circle cx="785" cy="335" r="225" />
          <circle cx="785" cy="335" r="239" strokeDasharray="1 13" />
          <circle cx="785" cy="335" r="197" />
          <path d="M552 335h466M785 103v464" className="visual-hairline" />
        </g>
        <g className="visual-feathers">
          {[-1, 1].map((side) => (
            <g key={side} transform={`translate(785 355) scale(${side} 1)`}>
              {[0, 1, 2, 3].map((n) => (
                <path
                  key={n}
                  d={`M${95 + n * 24} ${100 - n * 24}Q${165 + n * 26} ${-125 + n * 21} ${280 + n * 13} ${-155 + n * 26}Q${205 + n * 25} ${-42 + n * 15} ${95 + n * 24} ${100 - n * 24}Z`}
                />
              ))}
            </g>
          ))}
        </g>
      </>
    );
  if (theme === "babel")
    return (
      <>
        <g className="visual-tower">
          <path d="M660 640V263l51-33v-83l58-37 57 37v83l52 33v377M610 640h320M735 230v-76m68 76v-76M685 346h52v294m67-294h50v294" />
          <path
            d="m614 524 77-55 30 15 74-93 17-89 51-28 61-12"
            className="visual-fracture"
          />
        </g>
        <g className="visual-memory">
          <path d="M435 155h156m17 0h17m65 0h282M417 563h143m10 0h22m24 0h291m24 0h185M486 126v469M1034 126v469" />
          <rect x="463" y="132" width="588" height="469" />
          <rect x="484" y="155" width="550" height="410" />
        </g>
      </>
    );
  if (theme === "radiant")
    return (
      <>
        <g className="visual-rays">
          {Array.from({ length: 11 }, (_, n) => (
            <path
              key={n}
              d="M785 390V69"
              transform={`rotate(${n * 32.73} 785 390)`}
            />
          ))}
        </g>
        <g className="visual-radiance">
          <path d="m785 100 34 194 97 99-97 34-34 194-34-194-97-34 97-99Z" />
          <circle cx="785" cy="390" r="251" strokeDasharray="125 22 3 22" />
          <path d="m608 565 354-350M535 576l448-348" className="visual-lance" />
        </g>
      </>
    );
  return (
    <>
      <g className="visual-ink-mountains">
        <path d="M345 618q82-204 117-166 62-233 114-223 55-160 84-54 53 319 130 225 76-125 116-83 83-46 168 303Z" />
        <path d="M319 653q177-90 284-73t495-7" />
        <path d="M536 612q29-289 126-437M773 620q71-225 140-303" />
      </g>
      <g className="visual-brush">
        <path d="M1070 190q-357-120-525 129t102 269q320 4 332-266" />
        <path d="M1040 197q-328-100-480 125t95 250" />
      </g>
      <g className="visual-seal">
        <rect x="1017" y="491" width="43" height="56" />
        <path d="M1025 501h26m-24 10h24m-20-10v32m12-32v32m-16-12h20m-20 12h20" />
      </g>
    </>
  );
}

export default function VisualScene({
  entry,
  reading = false,
  reducedMotion = false,
}: {
  entry: VisualEntry;
  reading?: boolean;
  reducedMotion?: boolean;
}) {
  const profile = visualProfileFor(entry);
  const ref = useRef<HTMLDivElement>(null);
  const [staticMode, setStaticMode] = useState(true);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(
      "(max-width: 899px), (pointer: coarse), (prefers-reduced-motion: reduce)",
    );
    const update = () => {
      setStaticMode(media.matches);
      setHidden(document.hidden);
    };
    update();
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const paused = reading || reducedMotion || staticMode || hidden;
  useEffect(() => {
    const node = ref.current;
    const surface = node?.parentElement;
    if (!node || !surface || paused || !profile) return;
    let frame = 0;
    let px = 0;
    let py = 0;
    const update = () => {
      frame = 0;
      node.style.setProperty("--visual-x", px.toFixed(3));
      node.style.setProperty("--visual-y", py.toFixed(3));
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.buttons) return;
      const rect = surface.getBoundingClientRect();
      px = Math.max(
        -1,
        Math.min(
          1,
          ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        ),
      );
      py = Math.max(
        -1,
        Math.min(
          1,
          ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1,
        ),
      );
      if (!frame) frame = requestAnimationFrame(update);
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      node.style.removeProperty("--visual-x");
      node.style.removeProperty("--visual-y");
    };
    surface.addEventListener("pointermove", move, { passive: true });
    surface.addEventListener("pointerleave", reset);
    return () => {
      reset();
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerleave", reset);
    };
  }, [paused, profile, entry.id, entry.name]);
  if (!profile) return null;
  const style = {
    "--visual-accent": profile.accent,
    "--visual-secondary": profile.secondary,
  } as CSSProperties;
  return (
    <div
      ref={ref}
      key={`${profile.theme}-${entry.id ?? entry.name}`}
      className={`visual-scene visual-${profile.theme}${paused ? " is-static" : " is-active"}${reading ? " is-reading" : ""}`}
      style={style}
      aria-hidden="true"
      data-visual-theme={profile.theme}
    >
      <div className="visual-atmosphere" />
      <div className="visual-horizon" />
      <svg
        className="visual-geometry"
        viewBox="0 0 1200 760"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <SceneGeometry theme={profile.theme} />
      </svg>
      <span className="visual-scene-caption">
        {profile.label}
        <i />
        FIELD IMPRESSION
      </span>
    </div>
  );
}
