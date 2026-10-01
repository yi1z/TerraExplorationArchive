import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { advanceMotion, easeOut, MOTION, traceVertices } from "../lib/motion";
import { useReducedMotion } from "../lib/useMotion";

export function SurveyTrace({
  points,
  color = "#7c913d",
  opacity = 0.8,
  trigger,
  duration = MOTION.trace,
  delay = 0,
}: {
  points: readonly (readonly number[])[];
  color?: string;
  opacity?: number;
  trigger: string | number;
  duration?: number;
  delay?: number;
}) {
  const geometry = useRef<THREE.BufferGeometry>(null);
  const elapsed = useRef(0);
  const reduced = useReducedMotion();
  const { invalidate } = useThree();
  const vertices = useMemo(() => traceVertices(points), [points]);
  const count = vertices.length / 3;
  useLayoutEffect(() => {
    elapsed.current = reduced ? duration + delay : 0;
    geometry.current?.setDrawRange(0, reduced ? count : 0);
    invalidate();
  }, [trigger, reduced, duration, delay, count, invalidate]);
  useFrame((_, delta) => {
    if (elapsed.current >= duration + delay || document.hidden) return;
    elapsed.current = advanceMotion(elapsed.current, delta, duration + delay);
    const progress = easeOut((elapsed.current - delay) / duration);
    geometry.current?.setDrawRange(0, Math.floor((count * progress) / 2) * 2);
    if (elapsed.current < duration + delay) invalidate();
  });
  return (
    <lineSegments frustumCulled={false}>
      <bufferGeometry ref={geometry}>
        <bufferAttribute attach="attributes-position" args={[vertices, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </lineSegments>
  );
}

export function SelectionBeacon({
  point,
  trigger,
}: {
  point: number[];
  trigger: string | number;
}) {
  const group = useRef<THREE.Group>(null);
  const elapsed = useRef(0);
  const reduced = useReducedMotion();
  const { invalidate } = useThree();
  useLayoutEffect(() => {
    elapsed.current = reduced ? MOTION.beacon : 0;
    invalidate();
  }, [trigger, reduced, invalidate]);
  useFrame((_, delta) => {
    if (!group.current) return;
    elapsed.current = advanceMotion(
      elapsed.current,
      delta,
      MOTION.beacon,
      document.hidden,
    );
    group.current.children.forEach((child, index) => {
      const mesh = child as THREE.Mesh<
        THREE.RingGeometry,
        THREE.MeshBasicMaterial
      >;
      const progress = (elapsed.current - index * 0.4) / 1.6;
      const visible = !reduced && progress > 0 && progress < 1;
      mesh.visible = visible;
      if (visible) {
        mesh.scale.setScalar(0.5 + easeOut(progress) * 3.8);
        mesh.material.opacity = (1 - progress) * 0.52;
      }
    });
    if (!document.hidden && elapsed.current < MOTION.beacon) invalidate();
  });
  return (
    <group ref={group} position={[point[0], 1.22, point[1]]}>
      {[0, 1].map((i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <ringGeometry args={[0.94, 1, 64]} />
          <meshBasicMaterial
            color="#7f962c"
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
