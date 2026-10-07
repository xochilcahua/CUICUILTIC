/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (C) 2026 Teo Monroy — Cuicuiltic
   Pixel art landscape and custom image quantizing
   Classic script: shares one global lexical scope with the other js/ files; load order matters (see index.html). */
"use strict";

/* ---------- Fog Boat Pixel Art Scene ----------
   Ported from a standalone piece and re-wired so its 10 named color roles
   (c1..c10 in the original) are sourced live from the app's generated
   palette instead of a fixed hex set. Simulation runs at a small fixed
   resolution (authentic pixel-art scale) and is blitted, unsmoothed, onto
   the full-size canvas with an object-fit:cover crop. */
const FB_W = 384, FB_H = 288, FB_HORIZON = 98;
const fbScene = document.createElement('canvas');
fbScene.width = FB_W; fbScene.height = FB_H;
const fbCtx = fbScene.getContext('2d');

let fbPal = null, fbPalSignature = '';
let fbPalNight = null, fbPalDay = null;
let fbBgSky = null, fbBgMid = null, fbBranch = null;
let fbLilyPads = [], fbRaindrops = [], fbRipples = [], fbKois = [];
let fbCloud = null, fbPetals = [];
let fbGeometryReady = false;
let fbMountainsMidH = null;

/* Day/night mutation: the scene has one shared implementation that morphs
   between a "night" arrangement (moon, rain, ripples) and a "day"
   arrangement (sun, drifting cloud, falling petals) driven by a single
   0..1 factor, eased toward whichever the theme toggle last requested.
   Nothing here is a second copy of the scene — every draw call below
   reads blended colors/positions/alphas from this one factor. */
let fbDayFactor = 0, fbDayFactorTarget = 0, fbDayFactorInited = false;
let fbLastBlendSignature = '';

/** Linear interpolation between a and b by t (0-1). */
function lerp(a, b, t){ return a + (b - a) * t; }
/** Interpolates between two #rrggbb colors by t and returns a #rrggbb string. */
function lerpHexColor(hexA, hexB, t){
  const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
  const ar = (a>>16)&255, ag=(a>>8)&255, ab=a&255;
  const br = (b>>16)&255, bg=(b>>8)&255, bb=b&255;
  const clamp8 = v => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp8(lerp(ar,br,t)), g = clamp8(lerp(ag,bg,t)), bl = clamp8(lerp(ab,bb,t));
  return '#' + [r,g,bl].map(v => v.toString(16).padStart(2,'0')).join('');
}
/** Blends the night and day scene palettes key by key by t (0 = night, 1 = day). */
function fbBlendPal(night, day, t){
  const out = {};
  for (const key in night) out[key] = lerpHexColor(night[key], day[key], t);
  return out;
}

/** Creates an offscreen canvas and returns { canvas, ctx }. */
function fbCreateOffscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { canvas: c, ctx: c.getContext('2d') };
}

/** Fills a polygon (array of [x, y] points) on the target context without anti-aliasing. */
function fbFillPoly(targetCtx, pts, color) {
  targetCtx.fillStyle = color;
  let minX = FB_W, maxX = 0, minY = FB_H, maxY = 0;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i][0] < minX) minX = pts[i][0];
    if (pts[i][0] > maxX) maxX = pts[i][0];
    if (pts[i][1] < minY) minY = pts[i][1];
    if (pts[i][1] > maxY) maxY = pts[i][1];
  }
  minX = Math.max(0, Math.floor(minX)); maxX = Math.min(FB_W - 1, Math.ceil(maxX));
  minY = Math.max(0, Math.floor(minY)); maxY = Math.min(FB_H - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
      }
      if (inside) targetCtx.fillRect(x, y, 1, 1);
    }
  }
}

/* If the live palette is exactly the 10 original hand-picked colors (e.g.
   a manually imported/locked palette matching the source art), restore the
   scene's exact original role mapping instead of the generic rank-based
   approximation below — guarantees a pixel-perfect match to the source art. */
function fbIsExactOriginalPalette(colors){
  if (colors.length !== FOGBOAT_ORIGINAL_HEXES.length) return false;
  const have = new Set(colors.map(c => c.hex.toLowerCase()));
  return FOGBOAT_ORIGINAL_HEXES.every(hex => have.has(hex));
}
/* Applies the shared remix permutation (the same one Bars/Particles/Graphics
   use) to a plain hex array, so pressing V still reassigns which of the 10
   original colors lands on which scene role — even in the exact-match path,
   which otherwise bypasses the rank-based remap entirely. */
function fbPermuteHexes(hexes){
  ensureVizPermutation(hexes.length);
  return vizColorPermutation.map(idx => hexes[idx]);
}
/** Builds the night palette for the scene from the current color order. */
function fbBuildPaletteExact(){
  const [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10] = fbPermuteHexes(FOGBOAT_ORIGINAL_HEXES);
  if (!fbPalNight) fbPalNight = {};
  Object.assign(fbPalNight, {
    skyTop: c1, skyUpper: c2, skyMid: c3, skyLow: c4, skyHorizon: c5,
    moon: c7, moonHalo: c5, moonReflect: c6,
    mountainsFar: c3, mountainsMid: c2, mountainShadow: c3,
    waterTop: c4, waterMidHigh: c3, waterMid: c2, waterBot: c1,
    rain: c6, ripple: c5,
    padShadow: c1, padDark: c8, padMid: c8, padLight: c9, padHighlight: c9,
    flowerPink: c10, flowerLight: c6, flowerCenter: c7,
    boatDark: c4, boatMid: c5, boatLight: c6, boatBright: c7, boatShadow: c1,
    bark: c1, barkHighlight: c3, leafMid: c8, petal: c6,
    koiOrange: c10, koiWhite: c6, koiShadow: c1
  });
}

/* The "day" counterpart of fbBuildPaletteExact — same role structure, but
   following the sunset scene's actual (different, warmer) role mapping:
   sky comes from its later/warmer hues rather than the darkest ones, and
   there's no moon halo or rain (roles kept for shape compatibility, but
   their day alpha fades to 0 — see fbRender). Uses the SAME permutation as
   the night version above, so night/day role correspondence stays
   consistent through a remix, not just within one of the two forms. */
function fbBuildPaletteExactDay(){
  const [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10] = fbPermuteHexes(FOGBOAT_DAY_HEXES);
  if (!fbPalDay) fbPalDay = {};
  Object.assign(fbPalDay, {
    skyTop: c3, skyUpper: c6, skyMid: c8, skyLow: c9, skyHorizon: c10,
    moon: c10, moonHalo: c10, moonReflect: c9,
    mountainsFar: c3, mountainsMid: c1, mountainShadow: c1,
    waterTop: c2, waterMidHigh: c2, waterMid: c5, waterBot: c2,
    rain: c10, ripple: c9,
    padShadow: c1, padDark: c4, padMid: c4, padLight: c7, padHighlight: c7,
    flowerPink: c8, flowerLight: c10, flowerCenter: c9,
    boatDark: c6, boatMid: c8, boatLight: c10, boatBright: c10, boatShadow: c1,
    bark: c1, barkHighlight: c3, leafMid: c4, petal: c10,
    koiOrange: c9, koiWhite: c10, koiShadow: c1
  });
}

/* Maps the app's generated palette onto the scene's 10 color roles: the
   sky/water/moon family follows the lightness ramp (dark -> light), and
   the foliage/flower/koi accents follow the chroma ranking (most vivid
   colors), mirroring how the original hand-picked palette was structured. */
function fbBuildPalette(byL, byC) {
  const nL = byL.length;
  const pickL = (t) => byL[Math.min(nL - 1, Math.round(t * (nL - 1)))].hex;
  const pickC = (i) => byC[Math.min(byC.length - 1, i)].hex;

  if (!fbPalNight) fbPalNight = {};
  const c1 = pickL(0), c2 = pickL(1/6), c3 = pickL(2/6), c4 = pickL(3/6),
        c5 = pickL(4/6), c6 = pickL(5/6), c7 = pickL(1);
  const accent = pickC(0), foliageMid = pickC(1), foliageDark = pickC(2);

  Object.assign(fbPalNight, {
    skyTop: c1, skyUpper: c2, skyMid: c3, skyLow: c4, skyHorizon: c5,
    moon: c7, moonHalo: c5, moonReflect: c6,
    mountainsFar: c3, mountainsMid: c2, mountainShadow: c3,
    waterTop: c4, waterMidHigh: c3, waterMid: c2, waterBot: c1,
    rain: c6, ripple: c5,
    padShadow: c1, padDark: foliageDark, padMid: foliageDark, padLight: foliageMid, padHighlight: foliageMid,
    flowerPink: accent, flowerLight: c6, flowerCenter: c7,
    boatDark: c4, boatMid: c5, boatLight: c6, boatBright: c7, boatShadow: c1,
    bark: c1, barkHighlight: c3, leafMid: foliageDark, petal: c6,
    koiOrange: accent, koiWhite: c6, koiShadow: c1
  });
}

/* Generic "day" analog of fbBuildPalette for arbitrary (non-Foggy-Pond)
   palettes: same byL/byC ranking already computed for the night mapping,
   just biased toward the sunset scene's warmer/brighter structure (sky
   from the bright end, mountains/shadows from the dark end, water cooler
   mid-tones) so any palette gets a sensible day form, not only this one. */
function fbBuildPaletteDay(byL, byC) {
  const nL = byL.length;
  const pickL = (t) => byL[Math.min(nL - 1, Math.round(t * (nL - 1)))].hex;
  const pickC = (i) => byC[Math.min(byC.length - 1, i)].hex;

  if (!fbPalDay) fbPalDay = {};
  const accent = pickC(0), foliageMid = pickC(1), foliageDark = pickC(2);

  Object.assign(fbPalDay, {
    skyTop: pickL(0.35), skyUpper: pickL(0.55), skyMid: pickL(0.7), skyLow: pickL(0.85), skyHorizon: pickL(1),
    moon: pickL(1), moonHalo: pickL(1), moonReflect: pickL(0.85),
    mountainsFar: pickL(0.35), mountainsMid: pickL(0), mountainShadow: pickL(0),
    waterTop: pickL(0.15), waterMidHigh: pickL(0.15), waterMid: pickL(0.4), waterBot: pickL(0.15),
    rain: pickL(1), ripple: pickL(0.85),
    padShadow: pickL(0), padDark: foliageDark, padMid: foliageDark, padLight: foliageMid, padHighlight: foliageMid,
    flowerPink: accent, flowerLight: pickL(1), flowerCenter: pickL(0.85),
    boatDark: pickL(0.55), boatMid: pickL(0.7), boatLight: pickL(1), boatBright: pickL(1), boatShadow: pickL(0),
    bark: pickL(0), barkHighlight: pickL(0.35), leafMid: foliageDark, petal: pickL(1),
    koiOrange: accent, koiWhite: pickL(1), koiShadow: pickL(0)
  });
}

/** Draws the hand-built tree branch (with leaves) onto the given context. */
function fbDrawOrganicBranch(bctx) {
  const mainBranch = [
    {x:-10,y:20,w:9}, {x:15,y:37,w:7}, {x:45,y:51,w:5}, {x:80,y:61,w:4},
    {x:120,y:69,w:3}, {x:155,y:81,w:2}, {x:180,y:93,w:1}
  ];
  for (let i = 0; i < mainBranch.length - 1; i++) {
    const p1 = mainBranch[i], p2 = mainBranch[i+1], steps = 20;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = p1.x + (p2.x - p1.x) * t, cy = p1.y + (p2.y - p1.y) * t, wd = p1.w + (p2.w - p1.w) * t;
      bctx.fillStyle = fbPal.bark;
      bctx.fillRect(Math.round(cx - wd/2), Math.round(cy - wd/2), Math.ceil(wd), Math.ceil(wd));
      bctx.fillStyle = fbPal.barkHighlight;
      bctx.fillRect(Math.round(cx - wd/2), Math.round(cy - wd/2), Math.ceil(wd), 1);
    }
  }
  const subBranches = [
    [{x:30,y:44,w:3},{x:42,y:33,w:1.5},{x:52,y:27,w:1}],
    [{x:60,y:56,w:3},{x:72,y:70,w:2},{x:82,y:79,w:1}],
    [{x:105,y:66,w:2.5},{x:122,y:57,w:1.5},{x:135,y:53,w:1}],
    [{x:140,y:76,w:2},{x:152,y:89,w:1}]
  ];
  subBranches.forEach(branch => {
    for (let i = 0; i < branch.length - 1; i++) {
      const p1 = branch[i], p2 = branch[i+1], steps = 12;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const cx = p1.x + (p2.x - p1.x) * t, cy = p1.y + (p2.y - p1.y) * t, wd = p1.w + (p2.w - p1.w) * t;
        bctx.fillStyle = fbPal.bark;
        bctx.fillRect(Math.round(cx - wd/2), Math.round(cy - wd/2), Math.ceil(wd), Math.ceil(wd));
      }
    }
  });
  const foliageNodes = [[52,27],[55,29],[42,33],[82,79],[85,82],[135,53],[139,51],[152,89],[180,93],[184,95]];
  foliageNodes.forEach(node => {
    bctx.fillStyle = fbPal.leafMid;
    bctx.fillRect(node[0]-2, node[1]-1, 4, 3);
    bctx.fillStyle = fbPal.petal;
    bctx.fillRect(node[0], node[1], 2, 2);
  });
}

/* Rebuilds every color-dependent static layer (sky/water/mountains/branch)
   using the current fbPal. Geometry (mountain silhouette, branch shape) is
   deterministic, so this is safe to re-run whenever the palette or the
   day/night blend factor changes. */
function fbInitStatics() {
  if (!fbBgSky) fbBgSky = fbCreateOffscreen(FB_W, FB_H);
  if (!fbBgMid) fbBgMid = fbCreateOffscreen(FB_W, FB_H);
  if (!fbBranch) fbBranch = fbCreateOffscreen(FB_W, FB_H);
  fbBgSky.ctx.clearRect(0, 0, FB_W, FB_H);
  fbBgMid.ctx.clearRect(0, 0, FB_W, FB_H);
  fbBranch.ctx.clearRect(0, 0, FB_W, FB_H);

  const t = fbDayFactor;
  for (let y = 0; y < FB_HORIZON; y++) {
    const r = y / FB_HORIZON;
    fbBgSky.ctx.fillStyle = r < 0.22 ? fbPal.skyTop : r < 0.48 ? fbPal.skyUpper : r < 0.72 ? fbPal.skyMid : r < 0.88 ? fbPal.skyLow : fbPal.skyHorizon;
    fbBgSky.ctx.fillRect(0, y, FB_W, 1);
  }

  // Moon (night, haloed, small) <-> sun (day, bare, larger) — same body, blended.
  const moonX = lerp(300, 310, t), moonY = lerp(48, FB_HORIZON - 12, t), moonR = lerp(14, 20, t);
  const haloAlpha = 1 - t; // the day sun has no soft halo
  fbBgSky.ctx.fillStyle = fbPal.moonHalo;
  fbBgSky.ctx.beginPath(); fbBgSky.ctx.arc(moonX, moonY, moonR + 14, 0, Math.PI * 2);
  fbBgSky.ctx.globalAlpha = 0.12 * haloAlpha; fbBgSky.ctx.fill();
  fbBgSky.ctx.beginPath(); fbBgSky.ctx.arc(moonX, moonY, moonR + 6, 0, Math.PI * 2);
  fbBgSky.ctx.globalAlpha = 0.2 * haloAlpha; fbBgSky.ctx.fill();
  fbBgSky.ctx.globalAlpha = 1.0;
  fbBgSky.ctx.fillStyle = fbPal.moon;
  fbBgSky.ctx.beginPath(); fbBgSky.ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2); fbBgSky.ctx.fill();
  fbBgSky.ctx.fillStyle = fbPal.moonHalo; fbBgSky.ctx.globalAlpha = 0.35 * haloAlpha;
  fbBgSky.ctx.fillRect(moonX-5, moonY-3, 4, 3); fbBgSky.ctx.fillRect(moonX+2, moonY+2, 3, 4); fbBgSky.ctx.fillRect(moonX-2, moonY+5, 5, 2);
  fbBgSky.ctx.globalAlpha = 1.0;

  if (!fbMountainsMidH) fbMountainsMidH = new Int32Array(FB_W);
  // Far mountain silhouette: night's amplitude/frequency blended toward day's flatter, closer range.
  const farFreq1 = lerp(0.01, 0.015, t), farAmp1 = lerp(16, 12, t), farFreq2 = lerp(0.035, 0.04, t), farAmp2 = lerp(8, 5, t), farBase = lerp(32, 22, t);
  fbBgMid.ctx.fillStyle = fbPal.mountainsFar;
  for (let x = 0; x < FB_W; x++) {
    const hgt = Math.floor(Math.sin((x+40)*farFreq1)*farAmp1 + Math.sin((x+20)*farFreq2)*farAmp2 + farBase);
    fbBgMid.ctx.fillRect(x, FB_HORIZON - hgt, 1, hgt);
  }
  const midFreq1 = lerp(0.015, 0.025, t), midAmp1 = lerp(12, 8, t), midPhase = lerp(0, 1.2, t), midFreq2 = lerp(0.04, 0.05, t), midAmp2 = lerp(6, 3, t), midBase = lerp(18, 12, t);
  fbBgMid.ctx.fillStyle = fbPal.mountainsMid;
  for (let x = 0; x < FB_W; x++) {
    const hgt = Math.floor(Math.sin((x+30)*midFreq1 + midPhase)*midAmp1 + Math.sin(x*midFreq2)*midAmp2 + midBase);
    fbMountainsMidH[x] = hgt;
    fbBgMid.ctx.fillRect(x, FB_HORIZON - hgt, 1, hgt);
  }
  for (let y = FB_HORIZON; y < FB_H; y++) {
    const depth = (y - FB_HORIZON) / (FB_H - FB_HORIZON);
    fbBgMid.ctx.fillStyle = depth < 0.15 ? fbPal.waterTop : depth < 0.40 ? fbPal.waterMidHigh : depth < 0.75 ? fbPal.waterMid : fbPal.waterBot;
    fbBgMid.ctx.fillRect(0, y, FB_W, 1);
  }
  fbBgMid.ctx.fillStyle = fbPal.mountainShadow;
  for (let x = 0; x < FB_W; x++) {
    const shadowH = Math.min(6, Math.floor(fbMountainsMidH[x] * 0.5));
    fbBgMid.ctx.fillRect(x, FB_HORIZON + 1, 1, shadowH);
  }

  fbDrawOrganicBranch(fbBranch.ctx);
}

/** Pre-renders one lily pad (optionally with a flower) to a small canvas. */
function fbCreatePadCanvas(rx, ry, notch, hasFlower) {
  const c = document.createElement('canvas');
  const cx = Math.ceil(rx), cy = Math.ceil(ry);
  c.width = cx * 2 + 1; c.height = cy * 2 + 5;
  const pctx = c.getContext('2d');

  pctx.fillStyle = fbPal.padShadow;
  for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
    if ((dx*dx)/(rx*rx) + (dy*dy)/(ry*ry) <= 1.0) pctx.fillRect(cx+dx, cy+dy+2, 1, 1);
  }
  for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
    const dist = (dx*dx)/(rx*rx) + (dy*dy)/(ry*ry);
    if (dist <= 1.0) {
      const ang = Math.atan2(dy, dx);
      let diff = Math.abs(ang - notch);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < 0.28) continue;
      let col = fbPal.padMid;
      if (dy === -ry || (dist > 0.7 && dy < 0)) col = fbPal.padHighlight;
      else if (dist > 0.85 || dy > ry * 0.4) col = fbPal.padDark;
      pctx.fillStyle = col;
      pctx.fillRect(cx+dx, cy+dy, 1, 1);
    }
  }
  if (hasFlower) {
    const fx = cx, fy = cy - 2;
    pctx.fillStyle = fbPal.flowerPink; pctx.fillRect(fx-3, fy-2, 6, 4);
    pctx.fillStyle = fbPal.flowerLight; pctx.fillRect(fx-2, fy-3, 4, 3);
    pctx.fillStyle = fbPal.flowerCenter; pctx.fillRect(fx-1, fy-1, 2, 2);
  }
  return { canvas: c, cx, cy };
}

class FbKoi {
  constructor(x, y, isOrange) {
    this.segments = Array.from({ length: 8 }, () => ({ x, y }));
    this.angle = Math.random() * Math.PI * 2;
    this.speed = 0.08; this.t = Math.random() * 1000; this.isOrange = isOrange;
  }
  update() {
    this.t += 0.0015;
    this.angle += Math.sin(this.t * 0.3) * 0.008;
    const head = this.segments[0];
    head.x += Math.cos(this.angle) * this.speed;
    head.y += Math.sin(this.angle) * this.speed * 0.45;
    if (head.x < 40) this.angle = 0;
    if (head.x > FB_W - 40) this.angle = Math.PI;
    if (head.y < FB_HORIZON + 30) this.angle = Math.PI * 0.5;
    if (head.y > FB_H - 35) this.angle = -Math.PI * 0.5;
    for (let i = 1; i < this.segments.length; i++) {
      const prev = this.segments[i-1], curr = this.segments[i];
      const dx = prev.x - curr.x, dy = prev.y - curr.y, dist = Math.hypot(dx, dy), targetDist = 2.2;
      if (dist > targetDist) { curr.x = prev.x - (dx/dist)*targetDist; curr.y = prev.y - (dy/dist)*targetDist; }
    }
  }
  draw(targetCtx) {
    for (let i = 0; i < this.segments.length; i++) {
      const s = this.segments[i], r = i === 0 ? 2.5 : Math.max(1, 3.2 - i * 0.35);
      targetCtx.fillStyle = fbPal.koiShadow;
      targetCtx.fillRect(Math.round(s.x-r), Math.round(s.y+3), Math.round(r*2), Math.round(r*1.1));
    }
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const s = this.segments[i], r = i === 0 ? 2.5 : Math.max(1, 3.5 - i * 0.35);
      const mainCol = this.isOrange ? fbPal.koiOrange : fbPal.koiWhite;
      const patternCol = this.isOrange ? fbPal.koiWhite : fbPal.koiOrange;
      targetCtx.fillStyle = (i >= 2 && i <= 4) ? patternCol : mainCol;
      targetCtx.fillRect(Math.round(s.x-r), Math.round(s.y-r*0.5), Math.round(r*2), Math.round(r*1.1));
    }
  }
}

/* One-time (non-color) scene geometry: lily pad placement, raindrops, koi.
   Colors for lily pads are baked into their bitmaps separately, so
   palette changes don't need to re-run this placement logic. */
function fbInitGeometry() {
  fbLilyPads = [];
  let attempts = 0;
  while (fbLilyPads.length < 20 && attempts < 4500) {
    attempts++;
    const ry = Math.random();
    const y = FB_HORIZON + 24 + ry * (FB_H - FB_HORIZON - 48);
    const x = 30 + Math.random() * (FB_W - 60);
    const depth = (y - FB_HORIZON) / (FB_H - FB_HORIZON);
    const rx = Math.floor(7 + depth * 15);
    const padRy = Math.max(3, Math.floor(rx * 0.36));

    let overlap = false;
    const dxBoat = x - 130, dyBoat = y - 210;
    if (dxBoat*dxBoat + dyBoat*dyBoat < 4500) overlap = true;
    if (!overlap) {
      for (const p of fbLilyPads) {
        const dx = (x - p.x) / (rx + p.rx), dy = (y - p.y) / (padRy + p.ry);
        if (dx*dx + dy*dy < 2.5) { overlap = true; break; }
      }
    }
    if (!overlap) {
      fbLilyPads.push({
        x, y, rx, ry: padRy, phase: Math.random() * Math.PI * 2,
        notch: Math.random() * Math.PI * 2, hasFlower: Math.random() < 0.22,
        canvas: null, ox: 0, oy: 0
      });
    }
  }
  fbLilyPads.sort((a, b) => a.y - b.y);

  fbRaindrops = [];
  for (let i = 0; i < 40; i++) {
    fbRaindrops.push({
      x: Math.random() * (FB_W + 60) - 30, y: Math.random() * FB_H,
      len: Math.floor(3 + Math.random() * 4),
      speedY: 0.9 + Math.random() * 0.7, speedX: -0.1 - Math.random() * 0.1
    });
  }
  fbRipples = [];
  fbKois = [ new FbKoi(110, 240, true), new FbKoi(270, 215, false) ];

  fbCloud = { x: -40, y: 42, speed: 0.035 };
  fbPetals = [];
  for (let i = 0; i < 10; i++) {
    fbPetals.push({
      x: Math.random() * FB_W, y: Math.random() * FB_H,
      speedY: 0.04 + Math.random() * 0.05, speedX: -0.02 - Math.random() * 0.03,
      phase: Math.random() * Math.PI * 2
    });
  }
}

/** Regenerates every lily pad bitmap, needed after the palette changes. */
function fbRebuildPadBitmaps() {
  fbLilyPads.forEach(pad => {
    const built = fbCreatePadCanvas(pad.rx, pad.ry, pad.notch, pad.hasFlower);
    pad.canvas = built.canvas; pad.ox = built.cx; pad.oy = built.cy;
  });
}

/** Adds a water ripple at (x, y), keeping at most 20 active. */
function fbAddRipple(x, y) {
  if (fbRipples.length < 20) fbRipples.push({ x: Math.floor(x), y: Math.floor(y), r: 1, age: 0 });
}

/** Draws one frame of the pixel scene (sky, water, pads, ripples, boat) into the scene canvas. */
function fbRender(time) {
  fbCtx.drawImage(fbBgSky.canvas, 0, 0);

  // Day-only drifting cloud, faded in with the day factor.
  if (fbDayFactor > 0.01 && fbCloud) {
    fbCloud.x += fbCloud.speed;
    if (fbCloud.x > FB_W + 50) { fbCloud.x = -60; fbCloud.y = 38 + Math.random() * 12; fbCloud.speed = 0.025 + Math.random() * 0.02; }
    const cx = Math.floor(fbCloud.x), cy = Math.floor(fbCloud.y);
    fbCtx.fillStyle = fbPal.moonHalo;
    fbCtx.globalAlpha = fbDayFactor;
    fbCtx.fillRect(cx, cy + 4, 40, 7); fbCtx.fillRect(cx + 5, cy + 1, 30, 10); fbCtx.fillRect(cx + 10, cy - 2, 16, 12);
    fbCtx.globalAlpha = 1.0;
  }

  fbCtx.drawImage(fbBgMid.canvas, 0, 0);

  const t = fbDayFactor;
  const moonX = lerp(300, 310, t);
  const reflShiftFreq = lerp(0.3, 0.4, t), reflLenFreq = lerp(0.6, 0.8, t), reflXFreq = lerp(0.25, 0.3, t);
  for (let y = FB_HORIZON + 2; y < FB_H - 15; y += 2) {
    const depth = (y - FB_HORIZON) / (FB_H - FB_HORIZON);
    const spread = Math.floor(8 + depth * 32);
    const shift = Math.floor(Math.sin(y * 0.08 + time * reflShiftFreq) * 1.5);
    fbCtx.fillStyle = fbPal.moonReflect;
    const refLen = Math.floor((Math.sin(y*13.0 + time*reflLenFreq)*0.5+0.5) * spread * 0.45) + 2;
    const rx = moonX + shift - Math.floor(spread/2) + Math.floor((Math.cos(y*7.0 + time*reflXFreq)*0.5+0.5) * spread);
    fbCtx.globalAlpha = Math.max(0.2, 1.0 - depth*0.8);
    fbCtx.fillRect(rx, y, refLen, 1);
  }
  fbCtx.globalAlpha = 1.0;

  fbKois.forEach(k => { k.update(); k.draw(fbCtx); });

  for (let i = 0; i < fbLilyPads.length; i++) {
    const pad = fbLilyPads[i];
    const bob = Math.sin(time * 0.3 + pad.phase) * 0.2;
    fbCtx.drawImage(pad.canvas, Math.floor(pad.x) - pad.ox, Math.floor(pad.y + bob) - pad.oy);
  }

  const bx = Math.floor(lerp(130, 180, t) + Math.cos(time * 0.12) * 3);
  const by = Math.floor(lerp(210, 172, t) + Math.sin(time * 0.2) * 1.5);

  fbCtx.fillStyle = fbPal.boatShadow;
  for (let ry = 0; ry < 9; ry++) {
    const shift = Math.floor(Math.sin(ry*0.5 + time*0.5) * 1.2);
    const refW = Math.floor((9-ry) * 1.8);
    const py = by + 5 + ry;
    if (py < FB_H) fbCtx.fillRect(bx + shift - Math.floor(refW/2), py, refW, 1);
  }
  fbFillPoly(fbCtx, [[bx,by-16],[bx-10,by-4],[bx,by-4]], fbPal.boatDark);
  fbFillPoly(fbCtx, [[bx,by-16],[bx,by-4],[bx+10,by-4]], fbPal.boatMid);
  fbFillPoly(fbCtx, [[bx-18,by-4],[bx-8,by-4],[bx-6,by+4],[bx-14,by+1]], fbPal.boatDark);
  fbFillPoly(fbCtx, [[bx-8,by-4],[bx,by-4],[bx,by+4],[bx-6,by+4]], fbPal.boatMid);
  fbFillPoly(fbCtx, [[bx,by-4],[bx+8,by-4],[bx+6,by+4],[bx,by+4]], fbPal.boatLight);
  fbFillPoly(fbCtx, [[bx+8,by-4],[bx+18,by-4],[bx+14,by+1],[bx+6,by+4]], fbPal.boatBright);
  fbFillPoly(fbCtx, [[bx-18,by-4],[bx+18,by-4],[bx+18,by-3],[bx-18,by-3]], fbPal.boatBright);

  fbCtx.drawImage(fbBranch.canvas, 0, 0);

  // Night rain + ripples fade out; day falling petals fade in — same frame, cross-faded by t.
  if (t < 0.99) {
    const rainAlpha = 0.25 * (1 - t);
    fbCtx.fillStyle = fbPal.rain;
    fbCtx.globalAlpha = rainAlpha;
    for (let i = 0; i < fbRaindrops.length; i++) {
      const r = fbRaindrops[i];
      r.y += r.speedY; r.x += r.speedX;
      const rx = Math.floor(r.x), ry = Math.floor(r.y);
      if (rainAlpha > 0.01) fbCtx.fillRect(rx, ry, 1, r.len);
      if (r.y >= FB_HORIZON + 10 && Math.random() < 0.03) fbAddRipple(r.x, r.y);
      if (r.y > FB_H) { r.y = -10; r.x = Math.random() * (FB_W + 60) - 30; }
    }
    fbCtx.globalAlpha = 1.0;

    fbCtx.strokeStyle = fbPal.ripple; fbCtx.lineWidth = 1;
    for (let i = fbRipples.length - 1; i >= 0; i--) {
      const rip = fbRipples[i];
      rip.r += 0.08; rip.age += 0.02;
      fbCtx.globalAlpha = Math.max(0, 1 - rip.age) * (1 - t);
      fbCtx.beginPath();
      fbCtx.ellipse(rip.x, rip.y, rip.r * 2.2, rip.r * 0.6, 0, 0, Math.PI * 2);
      fbCtx.stroke();
      if (rip.age >= 1.0) fbRipples.splice(i, 1);
    }
    fbCtx.globalAlpha = 1.0;
  }

  if (t > 0.01 && fbPetals.length) {
    fbCtx.fillStyle = fbPal.petal;
    fbCtx.globalAlpha = t;
    for (const p of fbPetals) {
      p.y += p.speedY;
      p.x += Math.sin(time * 0.4 + p.phase) * 0.2 + p.speedX;
      if (p.y > FB_H || p.x < 0) { p.y = -5; p.x = Math.random() * (FB_W + 40); }
      fbCtx.fillRect(Math.floor(p.x), Math.floor(p.y), 2, 2);
    }
    fbCtx.globalAlpha = 1.0;
  }
}

/* Entry point called from renderCanvasVisualizer: rebuilds palette-dependent
   layers only when the app's palette actually changed, then draws one frame
   and blits it (unsmoothed, object-fit:cover) onto the main canvas. */
function fbBlitCover(sourceCanvas, srcW, srcH, w, h){
  const scale = Math.max(w / srcW, h / srcH);
  const dw = srcW * scale, dh = srcH * scale;
  const dx = (w - dw) / 2, dy = (h - dh) / 2;
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, dx, dy, dw, dh);
  ctx.imageSmoothingEnabled = prevSmoothing;
}

/* Object-fit: contain — keeps the uploaded image's own proportions intact
   (no cropping, no distortion), letterboxing any leftover space with the
   app's normal canvas-mode background so the whole image stays visible. */
function fbBlitContain(sourceCanvas, srcW, srcH, w, h){
  ctx.fillStyle = state.theme === 'dark' ? '#121212' : '#EDEAE3';
  ctx.fillRect(0, 0, w, h);
  const scale = Math.min(w / srcW, h / srcH);
  const dw = srcW * scale, dh = srcH * scale;
  const dx = (w - dw) / 2, dy = (h - dh) / 2;
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, dx, dy, dw, dh);
  ctx.imageSmoothingEnabled = prevSmoothing;
}

/* ---------- Custom uploaded image for the Pixel Art visualizer ----------
   The user's photo/pixel-art is downscaled once (if needed) and its raw
   pixels are kept around in fbCustomSourceImageData. Whenever the app's
   palette changes, every pixel is remapped to its nearest color (by OKLab
   distance) among the CURRENT generated colors — a direct quantization
   to the live palette, re-run on demand rather than baked in once.

   Nearest-color assignment (fbCustomClusterIndices) and final painting are
   kept separate: which palette color is CLOSEST to a given pixel only
   depends on the set of colors, not their order, so remixing (V) can't
   change it — but which literal color gets PAINTED for a given cluster is
   exactly what V should control. Splitting them lets remix repaint
   instantly (a cheap lookup) without re-running nearest-neighbor search. */
let fbCustomSourceImageData = null, fbCustomW = 0, fbCustomH = 0;
let fbCustomCanvas = null;
let fbCustomClusterIndices = null, fbCustomClusterSignature = '';
let fbCustomPaintSignature = '';

/** Downscales a user image and quantizes it to the current palette for the Pixel view. */
function loadCustomPixelImage(img){
  const maxDim = 220; // keeps a chunky pixel-art look and quantization fast
  let iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  if (Math.max(iw, ih) > maxDim) {
    const scale = maxDim / Math.max(iw, ih);
    iw = Math.max(1, Math.round(iw * scale));
    ih = Math.max(1, Math.round(ih * scale));
  }
  const tmp = document.createElement('canvas');
  tmp.width = iw; tmp.height = ih;
  const tctx = tmp.getContext('2d');
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(img, 0, 0, iw, ih);

  fbCustomSourceImageData = tctx.getImageData(0, 0, iw, ih);
  fbCustomW = iw; fbCustomH = ih;
  fbCustomCanvas = document.createElement('canvas');
  fbCustomCanvas.width = iw; fbCustomCanvas.height = ih;
  fbCustomClusterIndices = null; fbCustomClusterSignature = ''; fbCustomPaintSignature = '';

  const clearBtn = $('clearPixelImgBtn');
  if (clearBtn) clearBtn.style.display = '';
  if (state.viewMode !== 'pixel') state.viewMode = 'pixel';
  render();
}

/** Discards the custom image and returns the Pixel view to the built-in scene. */
function clearCustomPixelImage(){
  fbCustomSourceImageData = null; fbCustomCanvas = null;
  fbCustomClusterIndices = null; fbCustomClusterSignature = ''; fbCustomPaintSignature = '';
  const clearBtn = $('clearPixelImgBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  render();
}

/* Expensive step: nearest-palette-color index per pixel. Order-independent
   (a permutation of the same colors can't change which one is closest), so
   this only needs to re-run when the color SET actually changes. */
function fbComputeCustomClusters(colors){
  const paletteLab = colors.map(c => {
    const hr = c.H * Math.PI / 180;
    return { L: c.L, a: c.C * Math.cos(hr), b: c.C * Math.sin(hr) };
  });
  const src = fbCustomSourceImageData;
  const srcData = src.data;
  const pixelCount = fbCustomW * fbCustomH;
  fbCustomClusterIndices = new Uint8Array(pixelCount);

  for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
    const lab = srgbToOklab(srcData[i] / 255, srcData[i+1] / 255, srcData[i+2] / 255);
    let best = 0, bestDist = Infinity;
    for (let k = 0; k < paletteLab.length; k++) {
      const dl = lab.L - paletteLab[k].L, da = lab.a - paletteLab[k].a, db = lab.b - paletteLab[k].b;
      const dist = dl*dl + da*da + db*db;
      if (dist < bestDist) { bestDist = dist; best = k; }
    }
    fbCustomClusterIndices[p] = best;
  }
}

/* Cheap step: paints each pixel's already-assigned cluster with whatever
   color the current remix permutation says that cluster should be —
   this is what re-runs when V is pressed. */
function fbPaintCustomImage(colors){
  const vizColors = getRemappedColors(colors);
  const paletteRGB = vizColors.map(c => {
    const hex = c.hex.replace('#', '');
    return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
  });
  const srcData = fbCustomSourceImageData.data;
  const out = fbCustomCanvas.getContext('2d').createImageData(fbCustomW, fbCustomH);
  const outData = out.data;

  for (let p = 0, i = 0; p < fbCustomClusterIndices.length; p++, i += 4) {
    const rgb = paletteRGB[fbCustomClusterIndices[p]];
    outData[i] = rgb[0]; outData[i+1] = rgb[1]; outData[i+2] = rgb[2]; outData[i+3] = srcData[i+3];
  }
  fbCustomCanvas.getContext('2d').putImageData(out, 0, 0);
}
