"use client";

/* ================================================================== */
/*  Match Sound Engine — Web Audio API based sound effects             */
/*  No external audio files needed — pure synthesis                    */
/* ================================================================== */

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let crowdNode: OscillatorNode | null = null;
let crowdGain: GainNode | null = null;
let isMuted = false;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.35;
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
  if (masterGain) masterGain.gain.value = isMuted ? 0 : 0.35;
  return isMuted;
}

export function getIsMuted(): boolean {
  return isMuted;
}

/* ─── Noise generator for crowd/whistle ─────────────────────────── */

function createNoise(ctx: AudioContext, duration: number): AudioBufferSourceNode {
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

/* ─── Sound Effects ─────────────────────────────────────────────── */

export function playGoalSound() {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Rising triumphant chord
  const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + i * 0.08);
    gain.gain.linearRampToValueAtTime(0.15, now + i * 0.08 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now + i * 0.08);
    osc.stop(now + 1.3);
  });

  // Crowd roar burst
  const noise = createNoise(ctx, 2);
  const noiseGain = ctx.createGain();
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 800;
  noiseFilter.Q.value = 0.5;
  noiseGain.gain.setValueAtTime(0, now);
  noiseGain.gain.linearRampToValueAtTime(0.25, now + 0.15);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 2);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(now);
  noise.stop(now + 2);
}

export function playWhistleSound(short = false) {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;
  const dur = short ? 0.3 : 0.8;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(2800, now);
  osc.frequency.linearRampToValueAtTime(3200, now + dur * 0.3);
  osc.frequency.linearRampToValueAtTime(2600, now + dur);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
  gain.gain.setValueAtTime(0.12, now + dur - 0.1);
  gain.gain.linearRampToValueAtTime(0, now + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.05);
}

export function playCardSound() {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Low menacing tone
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.linearRampToValueAtTime(150, now + 0.4);
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + 0.5);

  // Crowd "ooh"
  const noise = createNoise(ctx, 0.6);
  const nGain = ctx.createGain();
  const nFilter = ctx.createBiquadFilter();
  nFilter.type = "bandpass";
  nFilter.frequency.value = 500;
  nFilter.Q.value = 2;
  nGain.gain.setValueAtTime(0, now);
  nGain.gain.linearRampToValueAtTime(0.08, now + 0.05);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  noise.connect(nFilter);
  nFilter.connect(nGain);
  nGain.connect(master);
  noise.start(now);
  noise.stop(now + 0.7);
}

export function playSaveSound() {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Quick "thud" impact
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + 0.25);

  // Crowd reaction
  const noise = createNoise(ctx, 0.4);
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0, now + 0.05);
  nGain.gain.linearRampToValueAtTime(0.06, now + 0.1);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  noise.connect(nGain);
  nGain.connect(master);
  noise.start(now);
  noise.stop(now + 0.5);
}

export function playShotSound() {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Kick impact
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + 0.2);
}

export function playTackleSound() {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Sharp contact
  const noise = createNoise(ctx, 0.12);
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 2000;
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  noise.start(now);
  noise.stop(now + 0.15);
}

export function playCoinSound() {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Casino-style coin/win jingle
  const notes = [1318.5, 1568, 2093, 2637, 2093, 2637, 3135.9]; // E6 G6 C7 E7 C7 E7 G7
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    const t = now + i * 0.1;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}

export function playVictorySound() {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Triumphant fanfare
  const melody = [
    { freq: 523.25, start: 0, dur: 0.2 },     // C5
    { freq: 659.25, start: 0.2, dur: 0.2 },    // E5
    { freq: 783.99, start: 0.4, dur: 0.2 },    // G5
    { freq: 1046.5, start: 0.6, dur: 0.6 },    // C6 (hold)
    { freq: 783.99, start: 0.9, dur: 0.15 },   // G5
    { freq: 1046.5, start: 1.05, dur: 0.8 },   // C6 (long hold)
  ];

  melody.forEach(note => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = note.freq;
    const t = now + note.start;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.1, t + 0.02);
    gain.gain.setValueAtTime(0.1, t + note.dur - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + note.dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + note.dur + 0.05);
  });
}

export function playDefeatSound() {
  const ctx = getCtx();
  const master = getMaster();
  const now = ctx.currentTime;

  // Sad descending tone
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.linearRampToValueAtTime(220, now + 1.2);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + 1.3);
}

/* ─── Ambient crowd ─────────────────────────────────────────────── */

export function startCrowdAmbient() {
  const ctx = getCtx();
  const master = getMaster();

  if (crowdNode) return;

  // Low rumble crowd ambient
  const noise = ctx.createBufferSource();
  const bufferSize = ctx.sampleRate * 10;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noise.buffer = buffer;
  noise.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 400;
  filter.Q.value = 0.3;

  crowdGain = ctx.createGain();
  crowdGain.gain.value = 0.02;

  noise.connect(filter);
  filter.connect(crowdGain);
  crowdGain.connect(master);
  noise.start();

  crowdNode = noise as unknown as OscillatorNode;
}

export function setCrowdIntensity(level: number) {
  // level 0-1
  if (crowdGain) {
    const ctx = getCtx();
    crowdGain.gain.linearRampToValueAtTime(
      0.02 + level * 0.06,
      ctx.currentTime + 0.3
    );
  }
}

export function stopCrowdAmbient() {
  if (crowdNode) {
    try { (crowdNode as unknown as AudioBufferSourceNode).stop(); } catch {}
    crowdNode = null;
    crowdGain = null;
  }
}

/* ─── Event-based sound dispatcher ──────────────────────────────── */

export function playSoundForEvent(eventType: string) {
  switch (eventType) {
    case "goal":
      playGoalSound();
      break;
    case "shot_saved":
      playSaveSound();
      break;
    case "shot_missed":
      playShotSound();
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
  }
}
