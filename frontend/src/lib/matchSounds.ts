"use client";

/* ================================================================== */
/*  Match Sound Engine — AudioContext + Pre-decoded Buffers             */
/*  Loads MP3 files once into memory, plays instantly on every trigger  */
/* ================================================================== */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let isMuted = false;
let masterVolume = 0.7;
let loadingPromise: Promise<void> | null = null;
let loaded = false;

/* Currently playing ambient source */
let ambientSource: AudioBufferSourceNode | null = null;
let ambientGain: GainNode | null = null;

/* Pre-decoded audio buffers */
const buffers: Record<string, AudioBuffer> = {};

/* ─── Sound file paths ────────────────────────────────────────────── */

const SOUNDS: Record<string, string> = {
  goal: "/sounds/goal.mp3",
  boo: "/sounds/boo.mp3",
  whistle: "/sounds/whistle.mp3",
  gasp: "/sounds/gasp.mp3",
  ambient: "/sounds/ambient.mp3",
  victory: "/sounds/victory.mp3",
  chant: "/sounds/chant.mp3",
  shocked: "/sounds/shocked.mp3",
};

/* ================================================================== */
/*  Initialisation — create AudioContext + load all buffers             */
/* ================================================================== */

function ensureCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = isMuted ? 0 : masterVolume;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

async function loadBuffer(key: string, url: string): Promise<void> {
  const c = ensureCtx();
  try {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    buffers[key] = await c.decodeAudioData(arr);
  } catch (err) {
    console.warn(`[SFX] Failed to load ${key}:`, err);
  }
}

/** Load all sound files into decoded AudioBuffers (call once) */
async function loadAll(): Promise<void> {
  if (loaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    ensureCtx();
    await Promise.all(
      Object.entries(SOUNDS).map(([key, url]) => loadBuffer(key, url)),
    );
    loaded = true;
  })();

  return loadingPromise;
}

/* ================================================================== */
/*  Core playback — instant from pre-decoded buffer                    */
/* ================================================================== */

function playBuf(
  key: string,
  volume = 1.0,
  opts?: { loop?: boolean; maxDuration?: number },
): AudioBufferSourceNode | null {
  if (isMuted || !ctx || !masterGain || !buffers[key]) return null;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();

  source.buffer = buffers[key];
  source.loop = opts?.loop ?? false;
  gain.gain.value = Math.min(1, volume * masterVolume);

  source.connect(gain);
  gain.connect(masterGain);
  source.start(0);

  // Optional max duration cutoff — fade out smoothly
  if (opts?.maxDuration && !opts.loop) {
    const fadeStart = opts.maxDuration / 1000;
    const fadeEnd = fadeStart + 0.3;
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime + fadeStart);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeEnd);
    source.stop(ctx.currentTime + fadeEnd + 0.05);
  }

  return source;
}

/* ================================================================== */
/*  Public API — Init / Mute / Volume                                  */
/* ================================================================== */

/**
 * Call on first user gesture (click/touch) to unlock AudioContext
 * and begin loading all sound files. Safe to call multiple times.
 */
export async function initSounds(): Promise<void> {
  ensureCtx();
  await loadAll();
}

export function toggleMute(): boolean {
  isMuted = !isMuted;
  if (masterGain) {
    masterGain.gain.value = isMuted ? 0 : masterVolume;
  }
  return isMuted;
}

export function getIsMuted(): boolean {
  return isMuted;
}

/* ================================================================== */
/*  Event Sounds                                                       */
/* ================================================================== */

export function playGoalSound() {
  playBuf("goal", 1.0);
}

export function playMissSound() {
  playBuf("boo", 0.8, { maxDuration: 4000 });
}

export function playSaveSound() {
  playBuf("gasp", 0.9);
}

export function playWhistleSound(short = false) {
  playBuf("whistle", 0.7, short ? { maxDuration: 800 } : undefined);
}

export function playCardSound() {
  playBuf("whistle", 0.6, { maxDuration: 800 });
  setTimeout(() => playBuf("shocked", 0.8), 300);
}

export function playTackleSound() {
  playBuf("shocked", 0.5);
}

export function playVictorySound() {
  playBuf("victory", 1.0, { maxDuration: 8000 });
}

export function playDefeatSound() {
  playBuf("boo", 0.6, { maxDuration: 5000 });
}

export function playCoinSound() {
  if (isMuted || !ctx || !masterGain) return;
  const c = ctx;
  const m = masterGain;
  const now = c.currentTime;

  const notes = [
    { f: 1318.5, t: 0 },
    { f: 1568, t: 0.08 },
    { f: 2093, t: 0.16 },
    { f: 2637, t: 0.24 },
    { f: 2093, t: 0.36 },
    { f: 2637, t: 0.44 },
    { f: 3135.9, t: 0.52 },
    { f: 3951, t: 0.64 },
  ];

  const coinGain = c.createGain();
  coinGain.gain.value = 0.5;
  coinGain.connect(m);

  notes.forEach(({ f, t }) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "square";
    osc.frequency.value = f;
    g.gain.setValueAtTime(0, now + t);
    g.gain.linearRampToValueAtTime(0.06, now + t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.2);
    osc.connect(g);
    g.connect(coinGain);
    osc.start(now + t);
    osc.stop(now + t + 0.25);
  });
}

export function playChantPulse() {
  playBuf("chant", 0.4, { maxDuration: 3000 });
}

/* ================================================================== */
/*  Ambient Crowd — Persistent stadium atmosphere loop                 */
/* ================================================================== */

export function startCrowdAmbient() {
  if (ambientSource) return;
  if (!ctx || !masterGain || !buffers.ambient) return;

  ambientGain = ctx.createGain();
  ambientGain.gain.value = 0.25;
  ambientGain.connect(masterGain);

  ambientSource = ctx.createBufferSource();
  ambientSource.buffer = buffers.ambient;
  ambientSource.loop = true;
  ambientSource.connect(ambientGain);
  ambientSource.start(0);
}

export function setCrowdIntensity(level: number) {
  if (!ambientGain || !ctx) return;
  const clamped = Math.max(0, Math.min(1, level));
  // Range: 0.12 (quiet) → 0.55 (roaring)
  const target = 0.12 + clamped * 0.43;
  ambientGain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.3);
}

export function stopCrowdAmbient() {
  try {
    ambientSource?.stop();
  } catch {
    /* already stopped */
  }
  ambientSource = null;
  ambientGain = null;
}

/* ================================================================== */
/*  Event-based sound dispatcher                                       */
/* ================================================================== */

export function playSoundForEvent(eventType: string) {
  switch (eventType) {
    case "goal":
      playGoalSound();
      break;
    case "shot_saved":
      playSaveSound();
      break;
    case "shot_missed":
      playMissSound();
      break;
    case "yellow_card":
    case "red_card":
      playCardSound();
      break;
    case "tackle":
    case "foul":
      playTackleSound();
      break;
    case "half_time":
      playWhistleSound(false);
      break;
    case "kick_off":
      playWhistleSound(true);
      break;
    case "full_time":
      playWhistleSound(false);
      break;
    case "pass":
    case "dribble":
      if (Math.random() > 0.7) playChantPulse();
      break;
  }
}
