import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  DEFAULT_SOUND_VOLUME,
  normalizeSoundVolume,
} from "../src/lib/ui-sound-settings";

type AudioModule = typeof import("../src/lib/audio");
let audio: AudioModule;
let documentMock: EventTarget & { visibilityState: string };
let windowMock: EventTarget;
let activation: { isActive: boolean };
let clock: number;
class FakeSource {
  buffer: unknown;
  onended?: () => void;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class FakeGain {
  gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
  connect = vi.fn();
  disconnect = vi.fn();
}
class FakeContext {
  static instances: FakeContext[] = [];
  state = "suspended";
  currentTime = 0;
  destination = {};
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  constructor() {
    FakeContext.instances.push(this);
  }
  resume = vi.fn(async () => {
    this.state = "running";
  });
  suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  decodeAudioData = vi.fn(async (_data: ArrayBuffer) => ({ duration: 0.4 }));
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
}

beforeEach(async () => {
  vi.resetModules();
  FakeContext.instances = [];
  clock = 1000;
  documentMock = Object.assign(new EventTarget(), {
    visibilityState: "visible",
  });
  windowMock = new EventTarget();
  activation = { isActive: true };
  vi.stubGlobal("document", documentMock);
  vi.stubGlobal("window", windowMock);
  vi.stubGlobal("navigator", { userActivation: activation });
  vi.stubGlobal("performance", { now: () => clock });
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })),
  );
  audio = await import("../src/lib/audio");
});
afterEach(() => {
  audio.closeAudio();
  vi.unstubAllGlobals();
});

describe("optional local UI sounds", () => {
  it("stays off by default and configuring preferences never unlocks audio", async () => {
    await audio.playUiSound("confirm");
    audio.configureUiSound({ enabled: true, volume: 0.35 });
    expect(FakeContext.instances).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    await audio.playUiSound("confirm");
    expect(FakeContext.instances[0].resume).toHaveBeenCalledOnce();
    expect(FakeContext.instances[0].sources).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("requires an active user gesture to create or resume a context", async () => {
    activation.isActive = false;
    await audio.previewUiSound();
    expect(FakeContext.instances).toHaveLength(0);
    activation.isActive = true;
    clock += 200;
    await audio.previewUiSound();
    const context = FakeContext.instances[0];
    windowMock.dispatchEvent(new Event("pagehide"));
    activation.isActive = false;
    clock += 200;
    await audio.previewUiSound();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.sources).toHaveLength(1);
  });
  it("allows an explicit preview without enabling normal sounds", async () => {
    await audio.previewUiSound("enter", 0.5);
    const context = FakeContext.instances[0];
    expect(
      context.gains[0].gain.linearRampToValueAtTime.mock.calls[0][0],
    ).toBeCloseTo(0.03);
    clock += 200;
    await audio.playUiSound("page");
    expect(context.sources).toHaveLength(1);
  });
  it("throttles repeated actions and limits simultaneous voices to two", async () => {
    audio.configureUiSound({ enabled: true, volume: 0.35 });
    await audio.playUiSound("confirm");
    await audio.playUiSound("confirm");
    const context = FakeContext.instances[0];
    expect(context.sources).toHaveLength(1);
    clock += 200;
    await audio.playUiSound("back");
    clock += 200;
    await audio.playUiSound("page");
    expect(context.sources).toHaveLength(3);
    expect(context.sources[0].stop).toHaveBeenCalledOnce();
    expect(context.sources[1].stop).not.toHaveBeenCalled();
  });
  it("stops and suspends immediately when the page is hidden", async () => {
    await audio.previewUiSound();
    const context = FakeContext.instances[0];
    documentMock.visibilityState = "hidden";
    documentMock.dispatchEvent(new Event("visibilitychange"));
    expect(context.sources[0].stop).toHaveBeenCalledOnce();
    expect(context.suspend).toHaveBeenCalledOnce();
    clock += 200;
    await audio.previewUiSound();
    expect(context.sources).toHaveLength(1);
  });
  it("cancels pending decoding on mute and does not play it later", async () => {
    let finish!: (value: { duration: number }) => void;
    const deferred = new Promise<{ duration: number }>((resolve) => {
      finish = resolve;
    });
    audio.configureUiSound({ enabled: true, volume: 0.35 });
    const playback = audio.playUiSound("confirm");
    const context = FakeContext.instances[0];
    context.decodeAudioData.mockImplementation(() => deferred);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    audio.configureUiSound({ enabled: false, volume: 0.35 });
    finish({ duration: 0.4 });
    await playback;
    expect(context.sources).toHaveLength(0);
    expect(fetch).toHaveBeenCalled();
    for (const [, options] of vi.mocked(fetch).mock.calls)
      expect(options?.signal?.aborted).toBe(true);
  });
  it("drops late first loads instead of playing after navigation has finished", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        clock += 1000;
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
      }),
    );
    await audio.previewUiSound();
    expect(FakeContext.instances[0].sources).toHaveLength(0);
    clock += 200;
    await audio.previewUiSound();
    expect(FakeContext.instances[0].sources).toHaveLength(1);
  });
  it("keeps failed network or decoding requests silent and can retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("offline");
      }),
    );
    await expect(audio.previewUiSound()).resolves.toBeUndefined();
    expect(FakeContext.instances[0].sources).toHaveLength(0);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );
    clock += 200;
    await audio.previewUiSound();
    expect(FakeContext.instances[0].sources).toHaveLength(1);
  });
  it("supports legacy tone calls and cancels playback at zero volume", async () => {
    audio.tone(true);
    for (let i = 0; i < 12; i++) await Promise.resolve();
    const context = FakeContext.instances[0];
    expect(context.sources).toHaveLength(1);
    audio.configureUiSound({ enabled: true, volume: 0 });
    expect(context.sources[0].stop).toHaveBeenCalledOnce();
    clock += 200;
    await audio.playUiSound("confirm");
    expect(context.sources).toHaveLength(1);
  });
  it("clamps volume and gives old or malformed storage a quiet default", () => {
    expect(normalizeSoundVolume(undefined)).toBe(DEFAULT_SOUND_VOLUME);
    expect(normalizeSoundVolume("0.7")).toBe(DEFAULT_SOUND_VOLUME);
    expect(normalizeSoundVolume(Number.NaN)).toBe(DEFAULT_SOUND_VOLUME);
    expect(normalizeSoundVolume(Infinity)).toBe(DEFAULT_SOUND_VOLUME);
    expect(normalizeSoundVolume(-1)).toBe(0);
    expect(normalizeSoundVolume(2)).toBe(1);
    expect(normalizeSoundVolume(0.72)).toBe(0.72);
  });
  it("ships four short unchanged PCM recordings with pinned hashes and source attribution", () => {
    const source = JSON.parse(
      readFileSync("public/assets/audio/sources.json", "utf8"),
    );
    expect(source.sourceCommit).toMatch(/^[a-f0-9]{40}$/);
    expect(
      source.files.map((file: { role: string }) => file.role).sort(),
    ).toEqual(["back", "confirm", "enter", "page"]);
    let total = 0;
    for (const file of source.files) {
      const wav = readFileSync(`public/assets/audio/${file.file}`);
      total += wav.length;
      expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
      expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
      expect(file.format.codec).toBe(1);
      expect(wav.length).toBe(file.bytes);
      expect(createHash("sha256").update(wav).digest("hex")).toBe(file.sha256);
      expect(file.sourceUrl).toContain(
        `/blob/${source.sourceCommit}/battle/b_ui/`,
      );
      expect(file.durationSeconds).toBeGreaterThan(0);
      expect(file.durationSeconds).toBeLessThan(2);
      expect(file.modified).toBe(false);
    }
    expect(total).toBeLessThan(1_000_000);
  });
});
