import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  Component,
} from "react";
import type { ReactNode, RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { regions, markers, regionById } from "../data/geography";
import { entryById, events } from "../data/archive";
import { tiles, mapPoint, mapRegionId } from "../lib/map";
import { useArchiveStore } from "../lib/state";
import { tone } from "../lib/audio";
import Map2D from "./Map2D";
import Emblem from "./Emblem";
import { SurveyTrace, SelectionBeacon } from "./MapMotion";
import {
  advanceMotion,
  terrainRise,
  flightSample,
  MOTION,
} from "../lib/motion";
import { useReducedMotion } from "../lib/useMotion";
import {
  captureMapCamera,
  mapCameraFit,
  restoreMapCamera,
  sameMapCameraContext,
} from "../lib/camera";
import type { MapCameraContext, MapCameraSnapshot } from "../lib/camera";

// Session-only view memory survives the lazy atlas being unmounted for a dossier.
let lastAtlasCamera: MapCameraSnapshot | null = null;

class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Map2D fallback /> : this.props.children;
  }
}
function HexTerrain() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { selected, layers, preferences, select, activeEvent } =
    useArchiveStore();
  const introPlaying = useArchiveStore((s) => s.introPlaying);
  const introSequence = useArchiveStore((s) => s.introSequence);
  const reduced = useReducedMotion();
  const elapsed = useRef(0);
  const colorTime = useRef(0.55);
  const palette = useMemo(
    () => ({
      from: new Float32Array(tiles.length * 3),
      to: new Float32Array(tiles.length * 3),
    }),
    [],
  );
  const object = useMemo(() => new THREE.Object3D(), []);
  const [hover, setHover] = useState<string | null>(null);
  const { invalidate, gl } = useThree();
  const regionId = mapRegionId(selected);
  const linked = useMemo(
    () =>
      activeEvent
        ? (events.find((e) => e.id === activeEvent)?.related.map(mapRegionId) ??
          [])
        : [],
    [activeEvent],
  );
  const placeTiles = (time: number) => {
    if (!mesh.current) return;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const rise = terrainRise(time, tile.x, tile.z);
      const height = 0.025 + (tile.height - 0.025) * rise;
      object.position.set(tile.x, height / 2 - (1 - rise) * 1.4, tile.z);
      object.scale.set(1, height, 1);
      object.updateMatrix();
      mesh.current.setMatrixAt(i, object.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  };
  useLayoutEffect(() => {
    elapsed.current = introPlaying && !reduced ? 0 : MOTION.intro;
    placeTiles(elapsed.current);
    if (mesh.current) {
      mesh.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.current.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 36);
    }
    invalidate();
  }, [introPlaying, introSequence, reduced, invalidate]);
  useFrame((_, delta) => {
    if (!introPlaying || reduced || document.hidden) return;
    elapsed.current = advanceMotion(elapsed.current, delta, MOTION.intro);
    placeTiles(elapsed.current);
    if (elapsed.current >= MOTION.intro)
      useArchiveStore.getState().finishIntro();
    else invalidate();
  });
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const color = new THREE.Color();
    const current = mesh.current.instanceColor;
    if (current) palette.from.set(current.array);
    tiles.forEach((tile, i) => {
      const highlighted =
        tile.region &&
        (tile.region === regionId || linked.includes(tile.region));
      if (highlighted) color.set("#d9e986");
      else if (hover && tile.region === hover) color.set("#e0e5b9");
      else if (!tile.region) color.set("#b9c9c8");
      else color.setHSL(0.44, 0.07, 0.83 + tile.tone * 0.085);
      color.toArray(palette.to, i * 3);
      if (!current || reduced) mesh.current!.setColorAt(i, color);
    });
    colorTime.current = !current || reduced ? 0.55 : 0;
    if (mesh.current.instanceColor)
      mesh.current.instanceColor.needsUpdate = true;
    invalidate();
  }, [regionId, hover, linked, reduced, invalidate, palette]);
  useFrame((_, delta) => {
    const colors = mesh.current?.instanceColor;
    if (!colors || colorTime.current >= 0.55 || document.hidden) return;
    colorTime.current = advanceMotion(colorTime.current, delta, 0.55);
    const t = flightSample(colorTime.current, 0.55).ease;
    for (let i = 0; i < palette.to.length; i++)
      colors.array[i] = palette.from[i] + (palette.to[i] - palette.from[i]) * t;
    colors.needsUpdate = true;
    if (colorTime.current < 0.55) invalidate();
  });
  useEffect(() => {
    gl.domElement.style.cursor = hover ? "pointer" : "grab";
    return () => {
      gl.domElement.style.cursor = "";
    };
  }, [hover, gl]);
  const pointer = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const region =
      e.instanceId === undefined ? null : (tiles[e.instanceId]?.region ?? null);
    setHover(region);
    if (region) useArchiveStore.getState().setPreviewEntry(region);
  };
  return (
    <group>
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, tiles.length]}
        castShadow
        receiveShadow
        onPointerMove={pointer}
        onPointerOut={() => setHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta > 5 || e.instanceId === undefined) return;
          const id = tiles[e.instanceId]?.region;
          if (id) {
            tone(preferences.sound);
            select(id);
          }
        }}
      >
        <cylinderGeometry args={[0.318, 0.318, 1, 6, 1, false]} />
        <meshStandardMaterial roughness={0.85} metalness={0.05} />
      </instancedMesh>
      {layers.countries &&
        !introPlaying &&
        regions
          .filter((r) => !r.special)
          .map((r) => (
            <Line
              key={r.id}
              points={[...r.polygon, r.polygon[0]].map(
                (p) =>
                  [p[0], r.elevation + 0.22, p[1]] as [number, number, number],
              )}
              color={regionId === r.id ? "#64763e" : "#718e91"}
              transparent
              opacity={regionId === r.id ? 0.22 : 0.27}
              lineWidth={regionId === r.id ? 1.6 : 0.6}
            />
          ))}
    </group>
  );
}
function MapDetails() {
  const { layers, selected, introPlaying, focusSequence } = useArchiveStore();
  const regionId = mapRegionId(selected);
  const region = regionId ? regionById[regionId] : null;
  return (
    <group visible={!introPlaying}>
      {layers.countries && region && !region.special && (
        <SurveyTrace
          key={region.id}
          trigger={focusSequence}
          points={[...region.polygon, region.polygon[0]].map((p) => [
            p[0],
            region.elevation + 0.25,
            p[1],
          ])}
        />
      )}
      {layers.cities &&
        markers.map((m) => (
          <group
            key={m.id}
            position={[
              m.point[0],
              regionById[m.regionId].elevation + 0.18,
              m.point[1],
            ]}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.12, 0.18, 24]} />
              <meshBasicMaterial
                color={selected === m.id ? "#7c9325" : "#69868a"}
              />
            </mesh>
            <Line
              points={[
                [0, 0, 0],
                [0, 0.7, 0],
              ]}
              color="#6d8588"
              lineWidth={1}
            />
          </group>
        ))}
      {layers.relations &&
        selected &&
        mapPoint(selected) &&
        entryById[selected]?.related.map((id) => {
          const start = mapPoint(selected)!,
            end = mapPoint(id);
          if (!end) return null;
          const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(start[0], 1.1, start[1]),
            new THREE.Vector3(
              (start[0] + end[0]) / 2,
              5,
              (start[1] + end[1]) / 2,
            ),
            new THREE.Vector3(end[0], 1.1, end[1]),
          );
          return (
            <SurveyTrace
              key={selected + id}
              trigger={focusSequence}
              points={curve.getPoints(32).map((p) => p.toArray())}
              color="#849b38"
              opacity={0.8}
            />
          );
        })}
      {selected && mapPoint(selected) && (
        <SelectionBeacon point={mapPoint(selected)!} trigger={focusSequence} />
      )}
    </group>
  );
}

type LabelRefs = RefObject<Record<string, HTMLDivElement | null>>;
function ProjectLabels({ elements }: { elements: LabelRefs }) {
  const { camera, size } = useThree();
  const anchors = useMemo(
    () => [
      ...regions.map((r) => ({
        id: r.id,
        position: new THREE.Vector3(
          r.center[0],
          r.elevation + 0.4,
          r.center[1],
        ),
      })),
      ...markers.map((m) => ({
        id: m.id,
        position: new THREE.Vector3(
          m.point[0],
          regionById[m.regionId].elevation + 1.05,
          m.point[1],
        ),
      })),
    ],
    [],
  );
  const projected = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    camera.updateMatrixWorld();
    for (const anchor of anchors) {
      const element = elements.current[anchor.id];
      if (!element) continue;
      projected.copy(anchor.position).project(camera);
      const x = ((projected.x + 1) * size.width) / 2,
        y = ((1 - projected.y) * size.height) / 2;
      element.style.transform =
        "translate3d(" + x + "px," + y + "px,0) translate(-50%,-50%)";
      element.style.visibility =
        projected.z < -1 ||
        projected.z > 1 ||
        x < -30 ||
        y < -15 ||
        x > size.width + 30 ||
        y > size.height + 15
          ? "hidden"
          : "visible";
    }
  });
  return null;
}
function AtlasLabels({ elements }: { elements: LabelRefs }) {
  const { layers, selected, select, preferences, introSequence } =
    useArchiveStore();
  const major = [
    "ursus",
    "yan",
    "sargon",
    "columbia",
    "victoria",
    "sami",
    "kazimierz",
  ];
  const pick = (id: string) => {
    tone(preferences.sound);
    select(id);
  };
  return (
    <div className="projected-labels" key={introSequence}>
      {layers.countries &&
        regions.map((r, i) => (
          <div
            className="projected-anchor"
            style={
              {
                "--reveal-delay": 0.65 + i * 0.045 + "s",
              } as React.CSSProperties
            }
            key={r.id}
            ref={(node) => {
              elements.current[r.id] = node;
            }}
          >
            <button
              className={
                "map-label " +
                (major.includes(r.id) ? "major " : "") +
                (mapRegionId(selected) === r.id ? "selected " : "") +
                (r.special ? "special" : "")
              }
              onPointerEnter={() =>
                useArchiveStore.getState().setPreviewEntry(r.id)
              }
              onFocus={() => useArchiveStore.getState().setPreviewEntry(r.id)}
              onClick={() => pick(r.id)}
              aria-label={"探索" + entryById[r.id].name}
              title={entryById[r.id].tagline}
            >
              <span className="map-mark">
                <Emblem id={r.id} />
              </span>
              <span className="label-dot" />
              <span className="label-en">{entryById[r.id].en}</span>
              <span className="label-cn">
                {entryById[r.id].name}
                {r.special ? " / 示意入口" : ""}
              </span>
            </button>
          </div>
        ))}
      {layers.cities &&
        markers.map((m) => (
          <div
            className="projected-anchor city-anchor"
            style={{ "--reveal-delay": "1.6s" } as React.CSSProperties}
            key={m.id}
            ref={(node) => {
              elements.current[m.id] = node;
            }}
          >
            <button
              className={"city-label " + (selected === m.id ? "selected" : "")}
              aria-label={"探索城市" + entryById[m.id].name}
              onPointerEnter={() =>
                useArchiveStore.getState().setPreviewEntry(m.id)
              }
              onFocus={() => useArchiveStore.getState().setPreviewEntry(m.id)}
              onClick={() => pick(m.id)}
            >
              <span />
              {entryById[m.id].name}
            </button>
          </div>
        ))}
    </div>
  );
}
type CameraAnimation = {
  elapsed: number;
  duration: number;
  lift: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  targetFrom: THREE.Vector3;
  targetTo: THREE.Vector3;
  zoomFrom: number;
  zoomTo: number;
};
function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size, invalidate } = useThree();
  const {
    view,
    selected,
    focusSequence,
    cameraCommand,
    cameraSequence,
    pauseTour,
    introSequence,
    introPlaying,
    finishIntro,
  } = useArchiveStore();
  const reduced = useReducedMotion();
  const animation = useRef<CameraAnimation | null>(null);
  const lastCameraCommand = useRef(cameraSequence);
  const fit = mapCameraFit(size.width, size.height) ?? 1;
  const currentFit = useRef(fit);
  const cameraContext = useRef<MapCameraContext | null>(null);
  const writingView = useRef(false);
  const ortho = camera as THREE.OrthographicCamera;
  const remember = (control = controls.current) => {
    if (
      !control ||
      !cameraContext.current ||
      animation.current ||
      writingView.current
    )
      return;
    const snapshot = captureMapCamera(
      cameraContext.current,
      camera.position.toArray(),
      control.target.toArray(),
      ortho.zoom,
      currentFit.current,
    );
    if (snapshot) lastAtlasCamera = snapshot;
  };
  const restore = (
    snapshot: NonNullable<ReturnType<typeof restoreMapCamera>>,
  ) => {
    if (!controls.current) return;
    camera.position.fromArray(snapshot.position);
    controls.current.target.fromArray(snapshot.target);
    ortho.zoom = snapshot.zoom;
    camera.updateProjectionMatrix();
    controls.current.update();
    remember();
    invalidate();
  };
  const settle = (a: CameraAnimation) => {
    if (!controls.current) return;
    camera.position.copy(a.to);
    controls.current.target.copy(a.targetTo);
    ortho.zoom = a.zoomTo;
    camera.updateProjectionMatrix();
    animation.current = null;
    controls.current.update();
    remember();
    invalidate();
  };
  const start = (
    point: number[] | null,
    reset = false,
    introduction = false,
  ) => {
    if (!controls.current) return;
    writingView.current = true;
    const target = new THREE.Vector3(point?.[0] ?? 0, 0, point?.[1] ?? 1);
    const offset = reset
      ? new THREE.Vector3(3, 30, 32)
      : animation.current
        ? animation.current.to.clone().sub(animation.current.targetTo)
        : camera.position.clone().sub(controls.current.target);
    const to = target.clone().add(offset);
    const zoom = fit * (point ? 1.65 : 1);
    if (introduction && !reduced) {
      camera.position.set(9, 38, 40);
      controls.current.target.set(-2, 0, 1);
      ortho.zoom = fit * 0.8;
      camera.updateProjectionMatrix();
      controls.current.update();
    }
    const next = {
      elapsed: 0,
      duration: introduction ? MOTION.intro : MOTION.focus,
      lift: introduction
        ? 0
        : Math.min(4, controls.current.target.distanceTo(target) * 0.16),
      from: camera.position.clone(),
      to,
      targetFrom: controls.current.target.clone(),
      targetTo: target,
      zoomFrom: ortho.zoom,
      zoomTo: zoom,
    };
    if (reduced) settle(next);
    else {
      animation.current = next;
      invalidate();
    }
    writingView.current = false;
    remember();
  };
  useLayoutEffect(() => {
    if (view !== "atlas" || !mapCameraFit(size.width, size.height)) return;
    const context = { selected, focusSequence, introSequence, cameraSequence };
    const previous = cameraContext.current;
    if (!previous) {
      cameraContext.current = context;
      currentFit.current = fit;
      const saved =
        !introPlaying && restoreMapCamera(lastAtlasCamera, context, fit);
      if (saved) {
        restore(saved);
        return;
      }
    } else if (sameMapCameraContext(previous, context) && !animation.current) {
      // Keep manual pan and orientation on resize, scaling only the viewport fit.
      remember();
      currentFit.current = fit;
      const saved = restoreMapCamera(lastAtlasCamera, context, fit);
      if (saved) {
        restore(saved);
        return;
      }
    } else {
      remember();
      cameraContext.current = context;
      currentFit.current = fit;
    }
    start(mapPoint(selected), !selected, introPlaying);
  }, [
    selected,
    focusSequence,
    size.width,
    size.height,
    reduced,
    introSequence,
  ]);
  useLayoutEffect(() => {
    const control = controls.current;
    return () => {
      remember(control);
    };
  }, [camera]);
  useEffect(() => {
    const current = animation.current;
    if (!introPlaying && current?.duration === MOTION.intro) settle(current);
  }, [introPlaying]);
  useEffect(() => {
    if (cameraSequence === lastCameraCommand.current) return;
    lastCameraCommand.current = cameraSequence;
    if (cameraContext.current)
      cameraContext.current.cameraSequence = cameraSequence;
    if (cameraCommand === "reset") start(null, true);
    else if (cameraCommand === "north") start(mapPoint(selected), true);
    else {
      animation.current = null;
      ortho.zoom = THREE.MathUtils.clamp(
        ortho.zoom * (cameraCommand === "in" ? 1.25 : 0.8),
        fit * 0.65,
        fit * 4.5,
      );
      camera.updateProjectionMatrix();
      remember();
      invalidate();
    }
  }, [cameraSequence]);
  useFrame((_, delta) => {
    const a = animation.current;
    if (!a || !controls.current || document.hidden) return;
    a.elapsed = advanceMotion(a.elapsed, delta, a.duration);
    const { progress, ease, lift } = flightSample(a.elapsed, a.duration);
    camera.position.lerpVectors(a.from, a.to, ease);
    camera.position.y += lift * a.lift;
    controls.current.target.lerpVectors(a.targetFrom, a.targetTo, ease);
    ortho.zoom =
      THREE.MathUtils.lerp(a.zoomFrom, a.zoomTo, ease) * (1 - lift * 0.045);
    camera.updateProjectionMatrix();
    controls.current.update();
    if (progress === 1) {
      animation.current = null;
      remember();
    } else invalidate();
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={!reduced}
      dampingFactor={0.13}
      enablePan
      minZoom={fit * 0.65}
      maxZoom={fit * 4.5}
      minPolarAngle={Math.PI * 0.12}
      maxPolarAngle={Math.PI * 0.43}
      onChange={() => remember()}
      onStart={() => {
        animation.current = null;
        finishIntro();
        pauseTour();
      }}
    />
  );
}
function SceneLifecycle({ onLost }: { onLost: () => void }) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    const lost = (e: Event) => {
      e.preventDefault();
      onLost();
    };
    const visibility = () => {
      if (!document.hidden) invalidate();
    };
    gl.domElement.addEventListener("webglcontextlost", lost);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      gl.domElement.removeEventListener("webglcontextlost", lost);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [gl, invalidate, onLost]);
  return null;
}
function Scene() {
  const [lost, setLost] = useState(false);
  const elements = useRef<Record<string, HTMLDivElement | null>>({});
  if (lost) return <Map2D fallback />;
  return (
    <div className="three-map">
      <Canvas
        orthographic
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ position: [3, 30, 33], zoom: 18, near: 0.1, far: 180 }}
        shadows={{ type: THREE.PCFShadowMap }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        fallback={null}
      >
        <ambientLight intensity={1.1} />
        <hemisphereLight args={["#eef3f5", "#637f8a", 0.8]} />
        <directionalLight
          position={[-12, 28, -8]}
          intensity={1.9}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-28}
          shadow-camera-right={28}
          shadow-camera-top={22}
          shadow-camera-bottom={-22}
          shadow-normalBias={0.04}
          shadow-bias={-0.0001}
        />
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.08, 0]}
          receiveShadow
        >
          <planeGeometry args={[200, 200]} />
          <shadowMaterial transparent opacity={0.19} />
        </mesh>
        <gridHelper args={[100, 50]} position={[0, -0.11, 0]}>
          <lineBasicMaterial color="#819ba0" transparent opacity={0.13} />
        </gridHelper>
        <HexTerrain />
        <MapDetails />
        <CameraRig />
        <ProjectLabels elements={elements} />
        <SceneLifecycle onLost={() => setLost(true)} />
      </Canvas>
      <AtlasLabels elements={elements} />
    </div>
  );
}
export default function TerraScene() {
  return (
    <SceneBoundary>
      <Scene />
    </SceneBoundary>
  );
}
