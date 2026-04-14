"use client";

/* ================================================================== */
/*  Match Sound Engine — Realistic Stadium Crowd Synthesis             */
/*  Multi-layered formant noise for authentic football atmosphere       */
/* ================================================================== */

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let ambientNodes: AudioBufferSourceNode[] = [];
let ambientGains: GainNode[] = [];
let isMuted = false;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function getMaster(): GainNode {
  getCtx();
  return masterGain!;
}

export function toggleMute(): boolean {
  isMuted = !isMuted;
  if (masterGain) masterGain.gain.value = isMuted ? 0 : 0.5;
  return isMuted;
}

export function getIsMuted(): boolean {
  return isMuted;
}

/* ─── Noise helpers ─────────────────────────────────────────────── */

function makeNoise(ctx: AudioContext, dur: number): AudioBufferSourceNode {
  const len = ctx.sampleRate * dur;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

/** Bandpass-filtered noise layer — simulates a "voice band" of crowd */
function crowdLayer(
  ctx: AudioContext,
  dest: AudioNode,
  now: number,
  freq: number,
  q: number,
  dur: number,
  peakVol: number,
  attack: number,
  decay: number,
) {
  const noise = makeNoise(ctx, dur + 0.2);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(peakVol, now + attack);
  gain.gain.setValueAtTime(peakVol, now + dur - decay);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  noise.connect(bp);
  bp.connect(gain);
  gain.connect(dest);
  noise.start(now);
  noise.stop(now + dur + 0.1);
}

/* ================================================================== */
/*  GOAL — Massive stadium "GOOOOOL!" roar                             */
/*  Multiple crowd layers building to a peak, sustained then fading    */
/* ================================================================== */

export function playGoalSound() {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Compressor to glue the crowd together
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  comp.connect(master);

  // Layer 1: Deep stadium rumble (sub-bass crowd stomp)
  crowdLayer(ctx, comp, now, 120, 0.4, 4.0, 0.18, 0.1, 1.5);

  // Layer 2: Low male roar "OOOOO" formant ~300Hz
  crowdLayer(ctx, comp, now, 300, 1.2, 4.0, 0.22, 0.12, 1.2);

  // Layer 3: Mid crowd "AAAA" formant ~700Hz (the main "GOOOL" vowel)
  crowdLayer(ctx, comp, now, 700, 1.5, 3.8, 0.25, 0.08, 1.0);

  // Layer 4: Upper crowd energy ~1400Hz (excitement/shriek)
  crowdLayer(ctx, comp, now, 1400, 1.0, 3.5, 0.15, 0.15, 1.5);

  // Layer 5: High crowd chatter/claps ~3500Hz
  crowdLayer(ctx, comp, now, 3500, 0.8, 3.0, 0.08, 0.2, 1.8);

  // Layer 6: "GOL" voice simulation — resonant tones sweeping
  // Simulates thousands of people yelling in unison
  const voiceFreqs = [260, 310, 350, 520]; // Multiple "voices"
  voiceFreqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    const oscFilter = ctx.createBiquadFilter();
    osc.type = "sawtooth";
    // Pitch wobble — crowds aren't perfectly in tune
    osc.frequency.setValueAtTime(f + (Math.random() - 0.5) * 20, now);
    osc.frequency.linearRampToValueAtTime(f * 1.05, now + 0.3);
    osc.frequency.setValueAtTime(f, now + 0.5);
    osc.frequency.linearRampToValueAtTime(f * 0.97, now + 3.0);
    // Filter to shape vowel "O" → "A" → fade
    oscFilter.type = "bandpass";
    oscFilter.frequency.setValueAtTime(400, now); // "O"
    oscFilter.frequency.linearRampToValueAtTime(800, now + 0.8); // → "A"
    oscFilter.frequency.linearRampToValueAtTime(500, now + 2.5); // → back
    oscFilter.Q.value = 3;
    oscGain.gain.setValueAtTime(0.001, now + i * 0.02);
    oscGain.gain.linearRampToValueAtTime(0.04, now + 0.15 + i * 0.02);
    oscGain.gain.setValueAtTime(0.04, now + 2.0);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 3.8);
    osc.connect(oscFilter);
    oscFilter.connect(oscGain);
    oscGain.connect(comp);
    osc.start(now + i * 0.02);
    osc.stop(now + 4.0);
  });

  // Reverb-like tail: late arriving echoes
  crowdLayer(ctx, comp, now + 0.3, 600, 0.5, 4.5, 0.12, 0.5, 2.0);
}

/* ================================================================== */
/*  MISS — Crowd "YUUUUH" / disappointment groan                      */
/*  Descending pitch, lower energy, "oooh" formant                     */
/* ================================================================== */

export function playMissSound() {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Layer 1: Low disappointed groan "uuuuh"
  const noise1 = makeNoise(ctx, 2.0);
  const bp1 = ctx.createBiquadFilter();
  bp1.type = "bandpass";
  bp1.frequency.setValueAtTime(500, now);
  bp1.frequency.linearRampToValueAtTime(250, now + 1.5); // descending = disappointment
  bp1.Q.value = 2.0;
  const g1 = ctx.createGain();
  g1.gain.setValueAtTime(0.001, now);
  g1.gain.linearRampToValueAtTime(0.2, now + 0.1);
  g1.gain.setValueAtTime(0.2, now + 0.8);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
  noise1.connect(bp1);
  bp1.connect(g1);
  g1.connect(master);
  noise1.start(now);
  noise1.stop(now + 2.1);

  // Layer 2: Mid-range "aaaw" groan
  const noise2 = makeNoise(ctx, 1.8);
  const bp2 = ctx.createBiquadFilter();
  bp2.type = "bandpass";
  bp2.frequency.setValueAtTime(800, now);
  bp2.frequency.linearRampToValueAtTime(400, now + 1.2);
  bp2.Q.value = 1.5;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.001, now);
  g2.gain.linearRampToValueAtTime(0.12, now + 0.08);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
  noise2.connect(bp2);
  bp2.connect(g2);
  g2.connect(master);
  noise2.start(now);
  noise2.stop(now + 1.9);

  // Descending voice tones — "ooooh" going down
  [280, 320, 260].forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const flt = ctx.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f, now);
    osc.frequency.linearRampToValueAtTime(f * 0.7, now + 1.5); // pitch drops
    flt.type = "bandpass";
    flt.frequency.value = 350; // "oo" formant
    flt.Q.value = 4;
    gain.gain.setValueAtTime(0.001, now + i * 0.03);
    gain.gain.linearRampToValueAtTime(0.025, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
    osc.connect(flt);
    flt.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 1.7);
  });
}

/* ================================================================== */
/*  SAVE — Crowd gasp "OOOH!" then relief applause                    */
/* ================================================================== */

export function playSaveSound() {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Quick gasp — sharp intake
  crowdLayer(ctx, master, now, 900, 2.0, 0.8, 0.18, 0.04, 0.4);
  crowdLayer(ctx, master, now, 400, 1.5, 1.0, 0.14, 0.05, 0.5);

  // Then scattered applause (higher freq bursts)
  for (let i = 0; i < 6; i++) {
    const t = now + 0.4 + Math.random() * 0.6;
    crowdLayer(ctx, master, t, 4000 + Math.random() * 2000, 0.5, 0.3, 0.04, 0.02, 0.15);
  }

  // Relief "aah"
  crowdLayer(ctx, master, now + 0.5, 600, 1.2, 1.2, 0.08, 0.15, 0.8);
}

/* ================================================================== */
/*  WHISTLE — Realistic referee whistle                                */
/* ================================================================== */

export function playWhistleSound(short = false) {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  const patterns = short
    ? [{ start: 0, dur: 0.35 }]
    : [{ start: 0, dur: 0.4 }, { start: 0.5, dur: 0.4 }, { start: 1.0, dur: 0.7 }];

  patterns.forEach(({ start, dur }) => {
    const t = now + start;
    // Main tone
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(3100 + Math.random() * 100, t);
    osc.frequency.linearRampToValueAtTime(3400, t + dur * 0.3);
    osc.frequency.linearRampToValueAtTime(2900, t + dur);
    // Overtone
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(6200, t);
    osc2.frequency.linearRampToValueAtTime(5800, t + dur);
    // Air noise
    const air = makeNoise(ctx, dur + 0.1);
    const airFlt = ctx.createBiquadFilter();
    airFlt.type = "bandpass";
    airFlt.frequency.value = 4000;
    airFlt.Q.value = 1;
    const airG = ctx.createGain();
    airG.gain.setValueAtTime(0.03, t);
    airG.gain.exponentialRampToValueAtTime(0.001, t + dur);
    air.connect(airFlt);
    airFlt.connect(airG);
    airG.connect(master);
    air.start(t);
    air.stop(t + dur + 0.1);

    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0, t);
    g1.gain.linearRampToValueAtTime(0.1, t + 0.015);
    g1.gain.setValueAtTime(0.1, t + dur - 0.05);
    g1.gain.linearRampToValueAtTime(0, t + dur);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.03, t + 0.02);
    g2.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g1); g1.connect(master);
    osc2.connect(g2); g2.connect(master);
    osc.start(t); osc.stop(t + dur + 0.05);
    osc2.start(t); osc2.stop(t + dur + 0.05);
  });
}

/* ================================================================== */
/*  CARD — Crowd angry reaction "OOOH!"                                */
/* ================================================================== */

export function playCardSound() {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Sharp whistle first
  playWhistleSound(true);

  // Angry crowd reaction
  crowdLayer(ctx, master, now + 0.2, 500, 1.8, 1.5, 0.2, 0.08, 0.8);
  crowdLayer(ctx, master, now + 0.2, 250, 1.0, 1.5, 0.15, 0.1, 0.6);
  crowdLayer(ctx, master, now + 0.25, 1200, 1.2, 1.0, 0.08, 0.1, 0.5);

  // Some boos
  [180, 220, 160].forEach((f, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const flt = ctx.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.value = f + Math.random() * 20;
    flt.type = "bandpass";
    flt.frequency.value = 300;
    flt.Q.value = 3;
    g.gain.setValueAtTime(0.001, now + 0.3 + i * 0.05);
    g.gain.linearRampToValueAtTime(0.02, now + 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    osc.connect(flt); flt.connect(g); g.connect(master);
    osc.start(now + 0.3); osc.stop(now + 1.6);
  });
}

/* ================================================================== */
/*  TACKLE — Quick crowd flinch                                        */
/* ================================================================== */

export function playTackleSound() {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Impact thud
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
  g.gain.setValueAtTime(0.12, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc.connect(g); g.connect(master);
  osc.start(now); osc.stop(now + 0.2);

  // Quick crowd "ooh"
  crowdLayer(ctx, master, now + 0.05, 600, 2.0, 0.5, 0.08, 0.03, 0.3);
}

/* ================================================================== */
/*  COIN — Casino slot win jingle for SOL payout                       */
/* ================================================================== */

export function playCoinSound() {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  const notes = [
    { f: 1318.5, t: 0 }, { f: 1568, t: 0.08 }, { f: 2093, t: 0.16 },
    { f: 2637, t: 0.24 }, { f: 2093, t: 0.36 }, { f: 2637, t: 0.44 },
    { f: 3135.9, t: 0.52 }, { f: 3951, t: 0.64 },
  ];
  notes.forEach(({ f, t }) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = f;
    g.gain.setValueAtTime(0, now + t);
    g.gain.linearRampToValueAtTime(0.06, now + t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.2);
    osc.connect(g); g.connect(master);
    osc.start(now + t); osc.stop(now + t + 0.25);
  });

  // Coin shimmer noise
  const shimmer = makeNoise(ctx, 1.0);
  const shFlt = ctx.createBiquadFilter();
  shFlt.type = "bandpass";
  shFlt.frequency.value = 8000;
  shFlt.Q.value = 2;
  const shG = ctx.createGain();
  shG.gain.setValueAtTime(0, now);
  shG.gain.linearRampToValueAtTime(0.03, now + 0.1);
  shG.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
  shimmer.connect(shFlt); shFlt.connect(shG); shG.connect(master);
  shimmer.start(now); shimmer.stop(now + 1.0);
}

/* ================================================================== */
/*  VICTORY — Stadium celebration + fanfare                            */
/* ================================================================== */

export function playVictorySound() {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Big crowd celebration (sustained cheering)
  crowdLayer(ctx, master, now, 150, 0.5, 4.0, 0.15, 0.2, 1.5);
  crowdLayer(ctx, master, now, 400, 1.2, 4.0, 0.2, 0.15, 1.2);
  crowdLayer(ctx, master, now, 800, 1.0, 3.5, 0.18, 0.2, 1.5);
  crowdLayer(ctx, master, now, 2000, 0.8, 3.0, 0.08, 0.3, 2.0);

  // Triumphant horn fanfare
  const melody = [
    { f: 523.25, s: 0.2, d: 0.25 },
    { f: 659.25, s: 0.45, d: 0.25 },
    { f: 783.99, s: 0.7, d: 0.25 },
    { f: 1046.5, s: 0.95, d: 0.8 },
    { f: 783.99, s: 1.5, d: 0.15 },
    { f: 1046.5, s: 1.65, d: 1.0 },
  ];
  melody.forEach(({ f, s, d }) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = f;
    const t = now + s;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.02);
    g.gain.setValueAtTime(0.07, t + d - 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + d + 0.05);
  });
}

/* ================================================================== */
/*  DEFEAT — Stadium disappointed groan + sad tone                     */
/* ================================================================== */

export function playDefeatSound() {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Muted disappointed crowd
  crowdLayer(ctx, master, now, 250, 1.5, 2.5, 0.12, 0.1, 1.5);
  crowdLayer(ctx, master, now, 500, 1.0, 2.0, 0.08, 0.15, 1.2);

  // Descending sad brass
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(440, now + 0.3);
  osc.frequency.linearRampToValueAtTime(330, now + 1.0);
  osc.frequency.linearRampToValueAtTime(220, now + 2.0);
  g.gain.setValueAtTime(0, now + 0.3);
  g.gain.linearRampToValueAtTime(0.06, now + 0.4);
  g.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
  osc.connect(g); g.connect(master);
  osc.start(now + 0.3); osc.stop(now + 2.1);
}

/* ================================================================== */
/*  AMBIENT — Persistent multi-layered stadium atmosphere              */
/* ================================================================== */

export function startCrowdAmbient() {
  const ctx = getCtx();
  const master = getMaster();

  if (ambientNodes.length > 0) return;

  // Multiple frequency bands for a rich stadium feel
  const bands = [
    { freq: 200, q: 0.3, vol: 0.015 },  // Deep rumble
    { freq: 500, q: 0.4, vol: 0.012 },  // Mid murmur
    { freq: 1200, q: 0.3, vol: 0.006 }, // Upper chatter
    { freq: 3000, q: 0.5, vol: 0.003 }, // High ambience
  ];

  bands.forEach(({ freq, q, vol }) => {
    const noise = ctx.createBufferSource();
    const bufLen = ctx.sampleRate * 8;
    const buf = ctx.createBuffer(2, bufLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      // Brownian noise for more natural crowd feel
      let last = 0;
      for (let i = 0; i < bufLen; i++) {
        last += (Math.random() * 2 - 1) * 0.1;
        last = Math.max(-1, Math.min(1, last));
        d[i] = last * 0.7 + (Math.random() * 2 - 1) * 0.3;
      }
    }
    noise.buffer = buf;
    noise.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = q;

    const gain = ctx.createGain();
    gain.gain.value = vol;

    noise.connect(bp);
    bp.connect(gain);
    gain.connect(master);
    noise.start();

    ambientNodes.push(noise);
    ambientGains.push(gain);
  });
}

export function setCrowdIntensity(level: number) {
  const ctx = getCtx();
  const t = ctx.currentTime + 0.3;
  const baseVols = [0.015, 0.012, 0.006, 0.003];
  ambientGains.forEach((g, i) => {
    const base = baseVols[i] || 0.01;
    g.gain.linearRampToValueAtTime(base + level * base * 4, t);
  });
}

export function stopCrowdAmbient() {
  ambientNodes.forEach((n) => { try { n.stop(); } catch {} });
  ambientNodes = [];
  ambientGains = [];
}

/* ================================================================== */
/*  CROWD CHANT — Periodic "olé olé" style rhythmic pulse              */
/* ================================================================== */

export function playChantPulse() {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Rhythmic crowd pulse (like clapping / stomping)
  for (let i = 0; i < 4; i++) {
    const t = now + i * 0.35;
    crowdLayer(ctx, master, t, 400, 2.0, 0.15, 0.1, 0.02, 0.08);
    crowdLayer(ctx, master, t, 150, 0.8, 0.12, 0.06, 0.01, 0.06);
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
      // Subtle crowd murmur for buildup plays
      if (Math.random() > 0.6) playChantPulse();
      break;
  }
}
