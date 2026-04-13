/**
 * Pixel Art Football Character Generator v2
 * Chibi-style football players with jersey, shorts, socks, boots.
 * Grid: 24x24, each pixel = 5x5 in 120x120 SVG
 */

type Pixel = [number, number, string];

/* ── Palettes ────────────────────────────────────────────── */

const SKIN   = ["#FFDCB4", "#E8B88A", "#C68642", "#8D5524"];
const SKIN_S = ["#E6C49A", "#CC9E6E", "#A86E34", "#6B3F1A"]; // shadow
const SKIN_H = ["#FFE8CC", "#F0C89E", "#D8965A", "#A06830"]; // highlight

const HAIR_C = ["#1A1A2E", "#4A2810", "#C4A35A", "#D44A2E", "#8B5E3C", "#E8E0D0"];
const HAIR_D = ["#0F0F1A", "#321C0A", "#A08030", "#A83E1E", "#6B4528", "#C8C0B0"];

// [jersey, stripe/trim, dark shadow, collar]
const JERSEY: Record<string, [string, string, string, string]> = {
  openai:        ["#10A37F", "#FFFFFF", "#087A55", "#0D8A6A"],
  anthropic:     ["#D4A574", "#FFFFFF", "#A07040", "#C08850"],
  google:        ["#4285F4", "#FFFFFF", "#2858A8", "#3470D4"],
  meta:          ["#0668E1", "#FFFFFF", "#043890", "#0550B8"],
  mistral:       ["#FF7000", "#1A1A2E", "#C05000", "#E06000"],
  "open-source": ["#E11D48", "#FFFFFF", "#A01030", "#C01538"],
  independent:   ["#7C3AED", "#FFFFFF", "#5520A8", "#6B2DD0"],
};

const SHORTS: Record<string, string> = {
  openai: "#F0F0F0", anthropic: "#F0F0F0", google: "#1A1A2E",
  meta: "#F0F0F0", mistral: "#1A1A2E", "open-source": "#F0F0F0",
  independent: "#F0F0F0",
};

const SOCKS: Record<string, string> = {
  openai: "#10A37F", anthropic: "#D4A574", google: "#4285F4",
  meta: "#0668E1", mistral: "#FF7000", "open-source": "#E11D48",
  independent: "#7C3AED",
};

/* ── Helpers ──────────────────────────────────────────────── */

function row(y: number, x1: number, x2: number, c: string): Pixel[] {
  const p: Pixel[] = [];
  for (let x = x1; x <= x2; x++) p.push([x, y, c]);
  return p;
}
function px(x: number, y: number, c: string): Pixel { return [x, y, c]; }

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function pick(seed: number, shift: number, max: number): number {
  return ((seed >>> shift) ^ (seed >>> (shift + 7))) % max;
}

/* ── Background ──────────────────────────────────────────── */

function drawBg(rarity: string): Pixel[] {
  const p: Pixel[] = [];

  // Sky gradient
  const sky: Record<string, string[]> = {
    common:    ["#1a2840", "#1e3050", "#223858"],
    rare:      ["#0a2848", "#0e3258", "#123c68"],
    epic:      ["#281848", "#321e58", "#3c2468"],
    legendary: ["#382800", "#483200", "#583c00"],
  };
  const s = sky[rarity] || sky.common;

  for (let y = 0; y < 12; y++) {
    const c = y < 4 ? s[0] : y < 8 ? s[1] : s[2];
    p.push(...row(y, 0, 23, c));
  }

  // Stadium lights (bright spots top)
  if (rarity === "legendary") {
    p.push(px(4, 0, "#FFD70040"), px(5, 0, "#FFD70040"), px(19, 0, "#FFD70040"), px(18, 0, "#FFD70040"));
    p.push(px(4, 1, "#FFD70020"), px(5, 1, "#FFD70020"), px(19, 1, "#FFD70020"), px(18, 1, "#FFD70020"));
  } else if (rarity === "epic") {
    p.push(px(4, 0, "#a855f730"), px(19, 0, "#a855f730"));
  } else if (rarity === "rare") {
    p.push(px(4, 0, "#22d3ee20"), px(19, 0, "#22d3ee20"));
  }

  // Green pitch (bottom half)
  for (let y = 12; y < 24; y++) {
    const g = y < 16 ? "#1a4a1a" : y < 20 ? "#164016" : "#123812";
    p.push(...row(y, 0, 23, g));
  }

  // Pitch line
  p.push(...row(14, 0, 23, "#1e5a1e"));

  // Crowd hint (dots in upper area)
  const crowdColors = ["#3a3050", "#403848", "#383040", "#343040"];
  for (let y = 4; y < 10; y++) {
    for (let x = 0; x < 24; x += 2) {
      p.push(px(x, y, crowdColors[(x + y) % crowdColors.length]));
    }
  }

  return p;
}

/* ── Body (Jersey + Shorts + Socks + Boots) ──────────────── */

function drawBody(ts: string, pos: string, skin: string, skinS: string): Pixel[] {
  const p: Pixel[] = [];
  const [j1, j2, jd, jc] = JERSEY[ts] || JERSEY.independent;
  const sh = SHORTS[ts] || "#F0F0F0";
  const sk = SOCKS[ts] || j1;
  const isGK = pos === "GK";
  const isMGR = pos === "MGR";

  // Colors
  const jersey = isMGR ? "#2a2a30" : isGK ? "#FFD700" : j1;
  const trim   = isMGR ? "#3a3a40" : isGK ? "#1a1a2e" : j2;
  const dark   = isMGR ? "#1a1a20" : isGK ? "#B8960C" : jd;
  const collar = isMGR ? "#F0F0F0" : isGK ? "#1a1a2e" : jc;
  const short  = isMGR ? "#2a2a30" : isGK ? "#1a1a2e" : sh;
  const sock   = isMGR ? "#2a2a30" : isGK ? "#FFD700" : sk;

  // ── Neck
  p.push(px(11, 11, skin), px(12, 11, skin));

  // ── Collar (V-neck)
  p.push(...row(12, 9, 14, collar));
  p.push(px(10, 12, jersey), px(13, 12, jersey));

  // ── Jersey body
  p.push(...row(13, 8, 15, jersey));  // shoulders
  p.push(...row(14, 7, 16, jersey));  // chest
  p.push(...row(15, 7, 16, jersey));
  p.push(...row(16, 7, 16, jersey));  // belly
  p.push(...row(17, 8, 15, jersey));  // hem

  // ── Sleeve ends (skin = bare arms)
  p.push(px(6, 14, jersey), px(6, 15, jersey));  // left sleeve
  p.push(px(17, 14, jersey), px(17, 15, jersey)); // right sleeve
  // Arms (skin)
  p.push(px(6, 16, skin), px(6, 17, skin));
  p.push(px(17, 16, skin), px(17, 17, skin));
  // Hands
  p.push(px(6, 18, skinS), px(17, 18, skinS));

  // ── Jersey shadow (right side)
  p.push(px(15, 14, dark), px(16, 14, dark));
  p.push(px(15, 15, dark), px(16, 15, dark));
  p.push(px(15, 16, dark), px(16, 16, dark));

  // ── Jersey stripe / detail
  if (!isMGR) {
    // Horizontal chest stripe
    p.push(...row(14, 8, 15, trim));
    // Number on chest
    p.push(px(11, 15, trim), px(12, 15, trim));
    p.push(px(11, 16, trim), px(12, 16, trim));
  } else {
    // Tie
    p.push(px(11, 13, "#C04040"), px(12, 13, "#C04040"));
    p.push(px(11, 14, "#A03030"));
    p.push(px(11, 15, "#A03030"));
    p.push(px(11, 16, "#A03030"));
    // Suit lapels
    p.push(px(9, 13, "#1a1a20"), px(14, 13, "#1a1a20"));
    p.push(px(9, 14, "#1a1a20"), px(14, 14, "#1a1a20"));
  }

  // ── GK gloves
  if (isGK) {
    p.push(px(5, 17, "#FF6B00"), px(5, 18, "#FF6B00"), px(6, 18, "#FF6B00"));
    p.push(px(18, 17, "#FF6B00"), px(18, 18, "#FF6B00"), px(17, 18, "#FF6B00"));
  }

  // ── Shorts
  p.push(...row(18, 9, 14, short));
  p.push(px(9, 19, short), px(10, 19, short)); // left leg
  p.push(px(13, 19, short), px(14, 19, short)); // right leg
  // Short shadow
  p.push(px(13, 18, isMGR ? "#1a1a20" : (short === "#F0F0F0" ? "#D8D8D8" : "#0a0a18")));
  p.push(px(14, 18, isMGR ? "#1a1a20" : (short === "#F0F0F0" ? "#D8D8D8" : "#0a0a18")));

  // ── Socks
  p.push(px(9, 20, sock), px(10, 20, sock));
  p.push(px(13, 20, sock), px(14, 20, sock));
  p.push(px(9, 21, sock), px(10, 21, sock));
  p.push(px(13, 21, sock), px(14, 21, sock));
  // Sock band (white stripe)
  p.push(px(9, 20, "#FFFFFF"), px(10, 20, "#FFFFFF"));
  p.push(px(13, 20, "#FFFFFF"), px(14, 20, "#FFFFFF"));

  // ── Boots
  const boot = "#1a1a2e";
  p.push(px(8, 22, boot), px(9, 22, boot), px(10, 22, boot), px(11, 22, boot));
  p.push(px(12, 22, boot), px(13, 22, boot), px(14, 22, boot), px(15, 22, boot));
  // Studs
  p.push(px(9, 23, "#888"), px(10, 23, "#888"));
  p.push(px(13, 23, "#888"), px(14, 23, "#888"));

  return p;
}

/* ── Head ─────────────────────────────────────────────────── */

function drawHead(skin: string, skinS: string, skinH: string): Pixel[] {
  return [
    // Head shape
    ...row(3, 10, 13, skin),     // top
    ...row(4, 9, 14, skin),
    ...row(5, 8, 15, skin),      // full width
    ...row(6, 8, 15, skin),
    ...row(7, 8, 15, skin),      // eyes
    ...row(8, 8, 15, skin),      // nose
    ...row(9, 9, 14, skin),      // mouth
    ...row(10, 10, 13, skin),    // chin

    // Highlight (left cheek)
    px(9, 5, skinH), px(9, 6, skinH),

    // Shadow (right side)
    px(15, 5, skinS), px(15, 6, skinS), px(15, 7, skinS), px(15, 8, skinS),
    px(14, 9, skinS), px(13, 10, skinS),

    // Ears
    px(7, 6, skin), px(7, 7, skinS),
    px(16, 6, skin), px(16, 7, skinS),
  ];
}

/* ── Hair ─────────────────────────────────────────────────── */

function drawHair(style: number, c: string, d: string): Pixel[] {
  const p: Pixel[] = [];

  // Base coverage (all styles cover top of head)
  const base = () => {
    p.push(...row(2, 10, 13, c));
    p.push(...row(3, 9, 14, c));
    p.push(...row(4, 8, 15, c));
  };

  switch (style) {
    case 0: // Short spiky
      base();
      p.push(px(8, 5, c), px(15, 5, c));
      // Spikes
      p.push(px(10, 1, c), px(13, 1, c), px(11, 1, d));
      p.push(px(9, 2, d), px(14, 2, d));
      break;

    case 1: // Slick side part
      base();
      p.push(px(8, 5, c), px(9, 5, c), px(14, 5, c), px(15, 5, c));
      p.push(px(8, 6, c));
      // Part line
      p.push(px(10, 3, d), px(10, 4, d));
      // Swept volume right
      p.push(px(15, 5, c), px(16, 4, c), px(16, 5, c));
      break;

    case 2: // Mohawk
      p.push(...row(0, 11, 12, c));
      p.push(...row(1, 10, 13, c));
      p.push(...row(2, 10, 13, c));
      p.push(...row(3, 9, 14, c));
      p.push(...row(4, 8, 15, c));
      p.push(px(8, 5, c), px(15, 5, c));
      p.push(px(11, 0, d), px(12, 0, d));
      break;

    case 3: // Afro
      p.push(...row(0, 9, 14, c));
      p.push(...row(1, 8, 15, c));
      p.push(...row(2, 7, 16, c));
      p.push(...row(3, 7, 16, c));
      p.push(...row(4, 7, 16, c));
      p.push(px(7, 5, c), px(7, 6, c), px(7, 7, c));
      p.push(px(16, 5, c), px(16, 6, c), px(16, 7, c));
      p.push(px(9, 0, d), px(14, 0, d));
      break;

    case 4: // Buzzcut (very short)
      p.push(...row(3, 10, 13, c));
      p.push(...row(4, 9, 14, c));
      p.push(px(8, 5, c), px(15, 5, c));
      break;

    case 5: // Long flowing
      base();
      p.push(px(8, 5, c), px(15, 5, c));
      p.push(px(8, 6, c), px(15, 6, c));
      // Long sides
      p.push(px(7, 7, c), px(7, 8, c), px(7, 9, c), px(7, 10, c), px(7, 11, c));
      p.push(px(16, 7, c), px(16, 8, c), px(16, 9, c), px(16, 10, c), px(16, 11, c));
      p.push(px(6, 10, c), px(6, 11, c));
      p.push(px(17, 10, c), px(17, 11, c));
      break;

    case 6: // Curly top
      p.push(...row(1, 10, 13, c));
      p.push(...row(2, 9, 14, c));
      p.push(...row(3, 8, 15, c));
      p.push(...row(4, 8, 15, c));
      p.push(px(8, 5, c), px(15, 5, c));
      // Curly texture
      p.push(px(10, 1, d), px(12, 1, d), px(9, 2, d), px(13, 2, d));
      p.push(px(9, 3, d), px(11, 3, d), px(14, 3, d));
      break;

    case 7: // Headband
    default:
      p.push(...row(2, 10, 13, c));
      p.push(...row(3, 9, 14, c));
      p.push(px(8, 4, c), px(9, 4, c), px(14, 4, c), px(15, 4, c));
      // Headband (white)
      p.push(...row(4, 8, 15, "#F0F0F0"));
      p.push(px(7, 4, "#F0F0F0"), px(16, 4, "#F0F0F0"));
      p.push(px(8, 5, c), px(15, 5, c));
      break;
  }

  return p;
}

/* ── Eyes ─────────────────────────────────────────────────── */

function drawEyes(style: number): Pixel[] {
  const W = "#FFFFFF";
  const B = "#101020";

  switch (style) {
    case 0: // Normal
      return [
        px(9, 6, W), px(10, 6, W), px(10, 7, B), px(9, 7, W),
        px(13, 6, W), px(14, 6, W), px(13, 7, B), px(14, 7, W),
      ];
    case 1: // Determined (brow)
      return [
        px(9, 7, W), px(10, 7, B),
        px(13, 7, B), px(14, 7, W),
        px(9, 6, "#282028"), px(10, 6, "#282028"),
        px(13, 6, "#282028"), px(14, 6, "#282028"),
      ];
    case 2: // Wide open
      return [
        px(9, 6, W), px(10, 6, W),
        px(9, 7, W), px(10, 7, B),
        px(13, 6, W), px(14, 6, W),
        px(13, 7, W), px(14, 7, B),
        // Shine
        px(9, 6, "#F8F8FF"), px(13, 6, "#F8F8FF"),
      ];
    case 3: // Fierce
    default:
      return [
        px(9, 7, W), px(10, 7, B),
        px(13, 7, B), px(14, 7, W),
        // Angled brows
        px(8, 6, "#282028"), px(9, 6, "#282028"), px(10, 6, "#282028"),
        px(13, 6, "#282028"), px(14, 6, "#282028"), px(15, 6, "#282028"),
      ];
  }
}

/* ── Nose & Mouth ────────────────────────────────────────── */

function drawNose(skinS: string): Pixel[] {
  return [px(11, 8, skinS), px(12, 8, skinS)];
}

function drawMouth(style: number): Pixel[] {
  switch (style) {
    case 0: return [px(10, 9, "#C04848"), px(11, 9, "#C04848"), px(12, 9, "#C04848"), px(13, 9, "#C04848")];
    case 1: return [px(10, 9, "#C04848"), px(11, 9, "#D05858"), px(12, 9, "#D05858"), px(13, 9, "#C04848"), px(9, 9, "#903030"), px(14, 9, "#903030")];
    case 2:
    default: return [px(10, 9, "#903030"), px(11, 9, "#903030"), px(12, 9, "#903030"), px(13, 9, "#903030")];
  }
}

/* ── Facial Hair ─────────────────────────────────────────── */

function drawFacialHair(style: number, c: string): Pixel[] {
  switch (style) {
    case 1: // Mustache
      return [px(10, 9, c), px(11, 9, c), px(12, 9, c), px(13, 9, c), px(9, 9, c), px(14, 9, c)];
    case 2: // Goatee
      return [px(11, 9, c), px(12, 9, c), px(11, 10, c), px(12, 10, c)];
    case 3: // Full beard
      return [
        px(9, 9, c), px(10, 9, c), px(11, 9, c), px(12, 9, c), px(13, 9, c), px(14, 9, c),
        px(9, 10, c), px(10, 10, c), px(11, 10, c), px(12, 10, c), px(13, 10, c), px(14, 10, c),
        px(10, 11, c), px(11, 11, c), px(12, 11, c), px(13, 11, c),
      ];
    case 4: // Stubble
      return [px(9, 9, c), px(11, 9, c), px(13, 9, c), px(10, 10, c), px(12, 10, c)];
    default: return [];
  }
}

/* ── Accessories ─────────────────────────────────────────── */

function drawAccessory(type: number, rarity: string): Pixel[] {
  if (type === 0 && rarity === "legendary") {
    // Captain armband (gold)
    return [px(6, 15, "#FFD700"), px(6, 16, "#FFD700"), px(5, 15, "#E8C000"), px(5, 16, "#E8C000")];
  }
  if (type === 1 && (rarity === "epic" || rarity === "legendary")) {
    // Wristbands
    return [px(6, 17, "#FFFFFF"), px(17, 17, "#FFFFFF")];
  }
  if (type === 2 && rarity === "legendary") {
    // Golden boots
    return [
      px(8, 22, "#FFD700"), px(9, 22, "#FFD700"), px(10, 22, "#FFD700"), px(11, 22, "#FFD700"),
      px(12, 22, "#FFD700"), px(13, 22, "#FFD700"), px(14, 22, "#FFD700"), px(15, 22, "#FFD700"),
      px(9, 23, "#E8C000"), px(10, 23, "#E8C000"), px(13, 23, "#E8C000"), px(14, 23, "#E8C000"),
    ];
  }
  return [];
}

/* ── Outline (dark border around character) ──────────────── */

function buildOutline(charPixels: Set<string>): Pixel[] {
  const outline: Pixel[] = [];
  const added = new Set<string>();
  const O = "#08080C";

  for (const key of charPixels) {
    const [x, y] = key.split(",").map(Number);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx, ny = y + dy;
      const nk = `${nx},${ny}`;
      if (!charPixels.has(nk) && !added.has(nk) && nx >= 0 && nx < 24 && ny >= 0 && ny < 24) {
        outline.push(px(nx, ny, O));
        added.add(nk);
      }
    }
  }
  return outline;
}

/* ── Main Generator ──────────────────────────────────────── */

export function generatePixelCharacter(
  id: string, rarity: string, techStack: string, position: string
): string {
  const seed = hash(id);

  const skinIdx    = pick(seed, 0, SKIN.length);
  const hairStyle  = pick(seed, 3, 8);
  const hairIdx    = pick(seed, 6, HAIR_C.length);
  const eyeStyle   = pick(seed, 9, 4);
  const mouthStyle = pick(seed, 11, 3);
  const facialHair = pick(seed, 13, 5);
  const accessory  = pick(seed, 16, 3);

  const skin = SKIN[skinIdx], skinS = SKIN_S[skinIdx], skinH = SKIN_H[skinIdx];
  const hairColor = HAIR_C[hairIdx], hairDark = HAIR_D[hairIdx];

  // Layer order: bg → outline → body → head → hair → face → accessories
  const bg = drawBg(rarity);
  const body = drawBody(techStack, position, skin, skinS);
  const head = drawHead(skin, skinS, skinH);
  const hair = drawHair(hairStyle, hairColor, hairDark);
  const eyes = drawEyes(eyeStyle);
  const nose = drawNose(skinS);
  const mouth = drawMouth(mouthStyle);
  const facial = facialHair > 0 ? drawFacialHair(facialHair, hairDark) : [];
  const acc = drawAccessory(accessory, rarity);

  // Collect all character pixels for outline
  const charPixels = [...body, ...head, ...hair, ...eyes, ...nose, ...mouth, ...facial, ...acc];
  const charSet = new Set<string>();
  for (const [x, y] of charPixels) charSet.add(`${x},${y}`);
  const outline = buildOutline(charSet);

  // Final assembly (order matters: last wins)
  const all: Pixel[] = [...bg, ...outline, ...body, ...head, ...hair, ...eyes, ...nose, ...mouth, ...facial, ...acc];

  // Build grid (last write wins)
  const grid = new Map<string, string>();
  for (const [x, y, c] of all) grid.set(`${x},${y}`, c);

  // Render SVG
  const P = 5;
  const rects: string[] = [];
  for (const [key, color] of grid.entries()) {
    const [x, y] = key.split(",").map(Number);
    rects.push(`<rect x="${x*P}" y="${y*P}" width="${P}" height="${P}" fill="${color}"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" style="image-rendering:pixelated">${rects.join("")}</svg>`;
}
