export type CameraCoordinates = readonly [number, number, number];

export interface MapCameraContext {
  selected: string | null;
  focusSequence: number;
  introSequence: number;
  cameraSequence: number;
}

export interface MapCameraSnapshot extends MapCameraContext {
  position: CameraCoordinates;
  target: CameraCoordinates;
  zoomRatio: number;
}

export function mapCameraFit(width: number, height: number) {
  return Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
    ? Math.min(width / 55, height / 33)
    : null;
}

export function sameMapCameraContext(a: MapCameraContext, b: MapCameraContext) {
  return (
    a.selected === b.selected &&
    a.focusSequence === b.focusSequence &&
    a.introSequence === b.introSequence &&
    a.cameraSequence === b.cameraSequence
  );
}

export function captureMapCamera(
  context: MapCameraContext,
  position: CameraCoordinates,
  target: CameraCoordinates,
  zoom: number,
  fit: number,
): MapCameraSnapshot | null {
  if (
    !Number.isFinite(fit) ||
    fit <= 0 ||
    !Number.isFinite(zoom) ||
    zoom <= 0 ||
    ![...position, ...target].every(Number.isFinite)
  )
    return null;
  return {
    ...context,
    position: [...position],
    target: [...target],
    zoomRatio: zoom / fit,
  };
}

export function restoreMapCamera(
  snapshot: MapCameraSnapshot | null,
  context: MapCameraContext,
  fit: number,
) {
  if (
    !snapshot ||
    !sameMapCameraContext(snapshot, context) ||
    !Number.isFinite(fit) ||
    fit <= 0 ||
    !Number.isFinite(snapshot.zoomRatio) ||
    snapshot.zoomRatio <= 0 ||
    ![...snapshot.position, ...snapshot.target].every(Number.isFinite)
  )
    return null;
  return {
    position: [...snapshot.position] as [number, number, number],
    target: [...snapshot.target] as [number, number, number],
    zoom: fit * Math.max(0.65, Math.min(4.5, snapshot.zoomRatio)),
  };
}
