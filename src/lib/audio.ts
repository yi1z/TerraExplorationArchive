import {
  DEFAULT_SOUND_VOLUME,
  normalizeSoundVolume,
} from "./ui-sound-settings";

export type UiSoundKind = "confirm" | "enter" | "back" | "page";

// Battle UI recordings adapted to site actions; provenance is in assets/audio/sources.json.
const sounds: Record<UiSoundKind, { file: string; gain: number }> = {
  // Conservative per-file attenuation compensates for different PCM RMS levels.
  confirm: { file: "b_ui_getcast.wav", gain: 1 },
  enter: { file: "b_ui_mark.wav", gain: 0.06 },
  back: { file: "b_ui_whoosh.wav", gain: 0.11 },
  page: { file: "b_ui_whoosh1.wav", gain: 0.07 },
};
const REQUEST_INTERVAL = 120;
const MAX_LATENCY = 700;
const MAX_VOICES = 2;
let context: AudioContext | null = null;
let enabled = false;
let volume = DEFAULT_SOUND_VOLUME;
let lastRequest = -Infinity;
let generation = 0;
let pending = 0;
let listening = false;
const buffers = new Map<UiSoundKind, AudioBuffer>();
const loading = new Map<UiSoundKind, Promise<AudioBuffer | null>>();
const controllers = new Set<AbortController>();
interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  scale: number;
}
const voices = new Set<Voice>();
const foreground = () =>
  typeof document === "undefined" || document.visibilityState !== "hidden";
const hasGesture = () =>
  typeof navigator === "undefined" ||
  !navigator.userActivation ||
  navigator.userActivation.isActive;

function disposeVoice(voice: Voice, stop = false) {
  voices.delete(voice);
  try {
    if (stop) voice.source.stop();
    voice.source.disconnect();
    voice.gain.disconnect();
  } catch {
    // Closing a context can already have disconnected its nodes.
  }
}
function stopPlayback() {
  generation++;
  for (const voice of voices) disposeVoice(voice, true);
  for (const controller of controllers) controller.abort();
  loading.clear();
}
function suspendPlayback() {
  stopPlayback();
  if (context && context.state !== "closed")
    void context.suspend().catch(() => {});
}
function visibilityChanged() {
  if (!foreground()) suspendPlayback();
}
function installListeners() {
  if (listening) return;
  document.addEventListener("visibilitychange", visibilityChanged);
  window.addEventListener("pagehide", suspendPlayback);
  listening = true;
}
async function readyContext(): Promise<AudioContext | null> {
  if (!foreground()) return null;
  if (!context || context.state === "closed") {
    if (!hasGesture()) return null;
    const Audio =
      globalThis.AudioContext ??
      (
        globalThis as typeof globalThis & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!Audio) return null;
    context = new Audio();
    installListeners();
  }
  const current = context;
  if (current.state !== "running") {
    if (!hasGesture()) return null;
    // Call resume during the event handler, before waiting for assets.
    await current.resume();
  }
  return current.state === "running" ? current : null;
}
function bufferFor(
  kind: UiSoundKind,
  current: AudioContext,
): Promise<AudioBuffer | null> {
  const cached = buffers.get(kind);
  if (cached) return Promise.resolve(cached);
  const inFlight = loading.get(kind);
  if (inFlight) return inFlight;
  const controller = new AbortController();
  controllers.add(controller);
  const timeout = setTimeout(() => controller.abort(), 3000);
  let request: Promise<AudioBuffer | null>;
  request = Promise.resolve().then(async () => {
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}assets/audio/${sounds[kind].file}`,
        {
          signal: controller.signal,
        },
      );
      if (!response.ok) return null;
      const decoded = await current.decodeAudioData(
        await response.arrayBuffer(),
      );
      if (
        controller.signal.aborted ||
        !Number.isFinite(decoded.duration) ||
        decoded.duration <= 0 ||
        decoded.duration > 2
      )
        return null;
      buffers.set(kind, decoded);
      return decoded;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
      controllers.delete(controller);
      if (loading.get(kind) === request) loading.delete(kind);
    }
  });
  loading.set(kind, request);
  return request;
}
async function requestSound(
  kind: UiSoundKind,
  allowed: boolean,
  level: number,
) {
  if (!allowed || level <= 0 || !foreground() || pending >= MAX_VOICES) return;
  const requestedAt = performance.now();
  if (requestedAt - lastRequest < REQUEST_INTERVAL) return;
  lastRequest = requestedAt;
  const token = generation;
  pending++;
  try {
    const current = await readyContext();
    if (!current) return;
    // Four short local files are warmed only after an explicit sound gesture.
    for (const other of Object.keys(sounds) as UiSoundKind[])
      if (other !== kind) void bufferFor(other, current);
    const buffer = await bufferFor(kind, current);
    if (
      !buffer ||
      token !== generation ||
      current !== context ||
      !foreground() ||
      current.state !== "running" ||
      performance.now() - requestedAt > MAX_LATENCY
    )
      return;
    while (voices.size >= MAX_VOICES)
      disposeVoice(voices.values().next().value!, true);
    const source = current.createBufferSource();
    const gain = current.createGain();
    const scale = sounds[kind].gain;
    const start = current.currentTime;
    const end = start + buffer.duration;
    source.buffer = buffer;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level * scale, start + 0.004);
    gain.gain.setValueAtTime(
      level * scale,
      Math.max(start + 0.004, end - 0.015),
    );
    gain.gain.linearRampToValueAtTime(0, end);
    source.connect(gain);
    gain.connect(current.destination);
    const voice = { source, gain, scale };
    voices.add(voice);
    source.onended = () => disposeVoice(voice);
    source.start();
  } catch {
    // Sound is optional; blocked audio, decoding and network failures stay silent.
  } finally {
    pending--;
  }
}

/** Update preferences without creating or unlocking an AudioContext. */
export function configureUiSound(settings: {
  enabled: boolean;
  volume: number;
}) {
  const previous = enabled;
  enabled = settings.enabled;
  volume = normalizeSoundVolume(settings.volume);
  if ((previous && !enabled) || volume === 0) stopPlayback();
  else if (context) {
    for (const voice of voices) {
      voice.gain.gain.cancelScheduledValues(context.currentTime);
      voice.gain.gain.setTargetAtTime(
        volume * voice.scale,
        context.currentTime,
        0.01,
      );
    }
  }
}
export function playUiSound(
  kind: UiSoundKind,
  allowed = enabled,
): Promise<void> {
  return requestSound(kind, allowed, volume);
}
/** Explicit user preview does not change the saved enabled preference. */
export function previewUiSound(
  kind: UiSoundKind = "confirm",
  previewVolume = volume,
): Promise<void> {
  return requestSound(kind, true, normalizeSoundVolume(previewVolume));
}
export function tone(allowed: boolean) {
  void playUiSound("confirm", allowed);
}
export function closeAudio() {
  stopPlayback();
  if (listening) {
    document.removeEventListener("visibilitychange", visibilityChanged);
    window.removeEventListener("pagehide", suspendPlayback);
    listening = false;
  }
  const previous = context;
  context = null;
  lastRequest = -Infinity;
  buffers.clear();
  if (previous && previous.state !== "closed")
    void previous.close().catch(() => {});
}
