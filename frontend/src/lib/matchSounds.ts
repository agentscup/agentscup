"use client";

/* ================================================================== */
/*  Match Sound Engine — Real Stadium Audio Files                      */
/*  Uses pre-loaded MP3 files for authentic football atmosphere        */
/* ================================================================== */

let isMuted = false;
let masterVolume = 0.7;
let ambientAudio: HTMLAudioElement | null = null;
let initialized = false;

/* ─── Sound file paths ────────��───────────────────────────��───────── */

const SOUNDS = {
  goal: "/sounds/goal.mp3",       // Stadium crowd eruption on goal
  boo: "/sounds/boo.mp3",         // Crowd booing / disappointment
  whistle: "/sounds/whistle.mp3", // Referee football whistle
  gasp: "/sounds/gasp.mp3",       // Crowd gasp with reverb
  ambient: "/sounds/ambient.mp3", // Stadium crowd ambience (1:34 loop)
  victory: "/sounds/victory.mp3", // Crowd cheering & clapping celebration
  chant: "/sounds/chant.mp3",     // Football stadium chanting & cheering
  shocked: "/sounds/shocked.mp3", // Crowd shocked reaction
} as const;

/* ─── Preload all sounds into browser cache ───────────────────────── */

function preloadAll() {
  if (initialized) return;
  Object.values(SOUNDS).forEach((src) => {
    const a = new Audio(src);
    a.preload = "auto";
    a.load();
  });
  initialized = true;
}

/* ─── Play a sound (new Audio instance for overlapping support) ───── */

function play(
  key: keyof typeof SOUNDS,
  volume = 1.0,
  opts?: { loop?: boolean; maxDuration?: number },
): HTMLAudioElement | null {
  if (isMuted) return null;

  const audio = new Audio(SOUNDS[key]);
  audio.volume = Math.min(1, volume * masterVolume);
  audio.loop = opts?.loop ?? false;

  audio.play().catch(() => {
    /* autoplay blocked — will work after user interaction */
  });

  // Auto-cleanup when finished
  if (!opts?.loop) {
    audio.addEventListener("ended", () => { audio.src = ""; });
  }

  // Optional max duration cutoff
  if (opts?.maxDuration) {
    setTimeout(() => {
      if (!audio.paused) {
        audio.pause();
        audio.src = "";
      }
    }, opts.maxDuration);
  }

  return audio;
}

/* ================================================================== */
/*  Public API — Mute / Volume                                         */
/* ================================================================== */

export function toggleMute(): boolean {
  isMuted = !isMuted;
  if (ambientAudio) {
    ambientAudio.volume = isMuted ? 0 : masterVolume * 0.3;
  }
  return isMuted;
}

export function getIsMuted(): boolean {
  return isMuted;
}

/* ================================================================== */
/*  Event Sounds                                                       */
/* ================================================================== */

/** Stadium eruption — crowd going wild on goal */
export function playGoalSound() {
  play("goal", 1.0);
}

/** Crowd booing / disappointment on missed shot */
export function playMissSound() {
  play("boo", 0.8, { maxDuration: 4000 });
}

/** Crowd gasp on goalkeeper save */
export function playSaveSound() {
  play("gasp", 0.9);
}

/** Referee whistle — short burst or full triple-blast */
export function playWhistleSound(short = false) {
  play("whistle", 0.7, short ? { maxDuration: 800 } : undefined);
}

/** Whistle + crowd shocked reaction for cards */
export function playCardSound() {
  play("whistle", 0.6, { maxDuration: 800 });
  setTimeout(() => play("shocked", 0.8), 300);
}

/** Quick crowd shock for tackles / fouls */
export function playTackleSound() {
  play("shocked", 0.5);
}

/** Victory celebration — crowd cheering & clapping */
export function playVictorySound() {
  play("victory", 1.0, { maxDuration: 8000 });
}

/** Muted disappointed crowd for defeat */
export function playDefeatSound() {
  play("boo", 0.6, { maxDuration: 5000 });
}

/** Casino coin jingle for SOL payout (synthesized — musical UI sound) */
export function playCoinSound() {
  if (isMuted) return;
  try {
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = masterVolume * 0.5;
    master.connect(ctx.destination);
    const now = ctx.currentTime;

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

    notes.forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = f;
      g.gain.setValueAtTime(0, now + t);
      g.gain.linearRampToValueAtTime(0.06, now + t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.2);
      osc.connect(g);
      g.connect(master);
      osc.start(now + t);
      osc.stop(now + t + 0.25);
    });

    setTimeout(() => ctx.close().catch(() => {}), 2000);
  } catch {
    /* Web Audio not available */
  }
}

/** Short stadium chant burst for buildup plays */
export function playChantPulse() {
  play("chant", 0.4, { maxDuration: 3000 });
}

/* ================================================================== */
/*  Ambient Crowd — Persistent stadium atmosphere loop                 */
/* ================================================================== */

export function startCrowdAmbient() {
  if (ambientAudio) return;

  preloadAll();

  ambientAudio = new Audio(SOUNDS.ambient);
  ambientAudio.loop = true;
  ambientAudio.volume = isMuted ? 0 : masterVolume * 0.3;
  ambientAudio.play().catch(() => {});
}

/** Scale ambient crowd volume by match intensity (0 = calm, 1 = intense) */
export function setCrowdIntensity(level: number) {
  if (ambientAudio && !isMuted) {
    // Range: 0.15 (quiet) → 0.60 (roaring)
    ambientAudio.volume = Math.min(1, masterVolume * (0.15 + Math.max(0, Math.min(1, level)) * 0.45));
  }
}

export function stopCrowdAmbient() {
  if (ambientAudio) {
    ambientAudio.pause();
    ambientAudio.src = "";
    ambientAudio = null;
  }
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
      // Occasional chant for buildup plays (30% chance)
      if (Math.random() > 0.7) playChantPulse();
      break;
  }
}
