/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (C) 2026 Teo Monroy — Cuicuiltic
   Harmony formulas and computePalette()
   Classic script: shares one global lexical scope with the other js/ files; load order matters (see index.html). */
"use strict";

/* ---------- Palette Generation (harmony math + computePalette) ---------- */
function freshSeed(){
  return { locked: false, randH: Math.random()*2-1, randL: Math.random()*2-1, randC: Math.random()*2-1, tweakL: 0, tweakC: 0, tweakH: 0 };
}

/** Grows or shrinks state.colors to match state.count and repairs the display order list. */
function syncColorSlots(){
  if (!state.paletteOrder) state.paletteOrder = [];
  while (state.colors.length < state.count) state.colors.push(freshSeed());
  while (state.colors.length > state.count) state.colors.pop();
  const newOrder = state.paletteOrder.filter(idx => idx < state.count);
  for(let i = 0; i < state.count; i++) if (!newOrder.includes(i)) newOrder.push(i);
  state.paletteOrder = newOrder.slice(0, state.count);
}

/* How many distinct hue "slots" get cycled through across the palette.
   Normally this is the Unique Hues (Tones) slider (or the full color
   count when it's "Auto"/0) — but Custom mode's entire point is that
   every swatch gets its own independently-placed point, so hueCount
   doesn't apply there: it's always forced to the full color count.
   Centralized here since computePalette, toggleLock, the wheel, and the
   Foggy Pond day/night mutation all need to agree on this number. */
function getActualHueCount(count){
  if (state.scheme === 'custom') return count;
  return state.hueCount > 0 ? Math.min(state.hueCount, count) : count;
}

/** Returns {H, L, C} for color i of `total` under the given harmony scheme, before jitter and constraints. */
function generateBaseHarmony(i, total, baseH, scheme, spreadDeg, hueIdx, hueTotal) {
  let H = baseH, L = 0.6, C = 0.15;
  const t1 = Math.max(1, total - 1);
  const T = total > 1 ? i / t1 : 0.5;

  switch(scheme) {
    case 'equidistant':   H = baseH + hueIdx * spreadDeg; L = state.lightMin + T * (state.lightMax - state.lightMin); C = state.satMax - T * (state.satMax - state.satMin) * 0.5; break;
    case 'split_complementary': { const offsets = [0, 150, 210]; H = baseH + offsets[hueIdx % 3] + Math.floor(hueIdx/3) * spreadDeg; L = state.lightMin + T * (state.lightMax - state.lightMin); break; }
    case 'compound': { const offsets = [0, 30, 150, 210]; H = baseH + offsets[hueIdx % 4]; L = state.lightMin + T * (state.lightMax - state.lightMin); C = state.satMax - T * (state.satMax - state.satMin) * 0.5; break; }
    case 'custom': {
      const points = state.customPoints || [];
      const p = points.length ? points[hueIdx % points.length] : { hueOffset: 0, chromaFrac: 1 };
      H = baseH + p.hueOffset;
      L = state.lightMin + T * (state.lightMax - state.lightMin);
      C = state.satMin + p.chromaFrac * (state.satMax - state.satMin);
      break;
    }
    case 'protanopia': {
      // Use Okabe–Ito reference hues with the selected chroma and lightness.
      const s = OKABE_ITO[hueIdx % OKABE_ITO.length];
      H = s.H; L = state.lightMin + T * (state.lightMax - state.lightMin); C = Math.min(state.satMax, s.C);
      break;
    }
    case 'deuteranopia': {
      // Same Okabe-Ito set: designed to hold up for both protanopia and deuteranopia.
      const s = OKABE_ITO[(hueIdx + 1) % OKABE_ITO.length];
      H = s.H; L = state.lightMin + T * (state.lightMax - state.lightMin); C = Math.min(state.satMax, s.C);
      break;
    }
    case 'tritanopia': {
      // Blue-yellow confusion axis: stay on the red/cyan side, away from blue<->yellow pairs.
      const tritanHues = [350, 15, 180, 160];
      H = tritanHues[hueIdx % tritanHues.length];
      L = state.lightMin + T * (state.lightMax - state.lightMin); C = state.satMax;
      break;
    }
    case 'viridis': { const s = sampleOklchStops(VIRIDIS_STOPS, T); H = s.H; L = s.L; C = s.C; break; }
    case 'cividis': { const s = sampleOklchStops(CIVIDIS_STOPS, T); H = s.H; L = s.L; C = s.C; break; }
    case 'lms': {
      // Alternates hues chosen to be maximally separated along both LMS cone-opponent
      // axes (L-M / red-green and S-(L+M) / blue-yellow), the basis of daltonization.
      const s = OKABE_ITO[[4, 5, 2, 6][hueIdx % 4]]; // blue, vermillion, bluish green, reddish purple
      H = s.H; L = 0.5 + 0.3 * Math.sin(T * Math.PI); C = Math.min(state.satMax, s.C);
      break;
    }
    case 'cielab_uniform': H = (baseH + hueIdx * (360 / hueTotal)) % 360; L = state.lightMin + T * (state.lightMax - state.lightMin); C = state.satMin + T * (state.satMax - state.satMin); break;
    case 'goethe': {
      H = ([50, 230, 20, 200, 140, 320][hueIdx % 6] + baseH) % 360;
      const frac = (i % 2 === 0) ? 0.82 : 0.32; // alternating light/dark "polarity", scaled into the actual range
      L = state.lightMin + frac * (state.lightMax - state.lightMin);
      C = state.satMin + T * (state.satMax - state.satMin);
      break;
    }
    case 'egypt': {
      H = [20, 160, 240, 70, 40, 200][hueIdx % 6];
      const lFrac = i === 4 ? 0.08 : (i === 5 ? 0.95 : 0.5); // dark accent, light accent, mid-tones
      const cFrac = i >= 4 ? 0.05 : 0.85; // accents desaturated, main hues vivid
      L = state.lightMin + lFrac * (state.lightMax - state.lightMin);
      C = state.satMin + cFrac * (state.satMax - state.satMin);
      break;
    }
    case 'maya': {
      H = [195, 15, 340, 55, 245][hueIdx % 5];
      const cFrac = (H === 195) ? 0.35 : 0.75; // the cool teal stays a bit more muted than the warm hues
      L = state.lightMin + ((i % 3) / 2) * (state.lightMax - state.lightMin);
      C = state.satMin + cFrac * (state.satMax - state.satMin);
      break;
    }
    case 'wuxing': {
      H = [145, 25, 75, 210, 255][hueIdx % 5];
      const lFrac = i === 3 ? 0.92 : (i === 4 ? 0.12 : 0.5); // Metal (near-white), Water (dark), the rest mid
      const cFrac = i === 3 ? 0.05 : 0.7; // Metal stays desaturated/near-neutral
      L = state.lightMin + lFrac * (state.lightMax - state.lightMin);
      C = state.satMin + cFrac * (state.satMax - state.satMin);
      break;
    }
    case 'kasane': {
      H = ([350, 15, 130, 90, 220][hueIdx % 5] + baseH * 0.2) % 360;
      L = state.lightMin + ((i % 4) / 3) * (state.lightMax - state.lightMin);
      C = state.satMin + ((i % 2 === 0) ? 0.25 : 0.85) * (state.satMax - state.satMin);
      break;
    }
    case 'munsell':       H = baseH; L = state.lightMin + T * (state.lightMax - state.lightMin); C = state.satMin + ((i % 2 === 0) ? 0.2 : 0.85) * (state.satMax - state.satMin); break;
    case 'chevreul':      { const baseComp = (baseH + 180) % 360; H = (hueIdx % 2 === 0) ? baseH + (hueIdx*10) : baseComp + 20 * (hueIdx % 3 === 1 ? 1 : -1); L = state.lightMin + T * (state.lightMax - state.lightMin); C = state.satMin + T * (state.satMax - state.satMin); break; }
    case 'random':
    default:              H = (state.colors[i].randH * 0.5 + 0.5) * 360; L = state.lightMin + (state.colors[i].randL * 0.5 + 0.5) * (state.lightMax - state.lightMin); C = state.satMin + (state.colors[i].randC * 0.5 + 0.5) * (state.satMax - state.satMin); break;
  }
  return { H: (H % 360 + 360) % 360, L, C };
}

/* Hue-only positions for the wheel preview: reuses generateBaseHarmony
   itself (with baseH=0, so the return value IS the pure offset) rather
   than duplicating each scheme's angle logic, so the wheel can never drift
   out of sync with what actually gets generated. */
function computeHarmonyHueOffsets(scheme, hueCount, spread){
  const n = Math.max(1, hueCount);
  const offsets = [];
  for (let hueIdx = 0; hueIdx < n; hueIdx++) {
    offsets.push(generateBaseHarmony(hueIdx, n, 0, scheme, spread, hueIdx, n).H);
  }
  return offsets;
}

/** Locks or unlocks a color slot; locking freezes its current computed value as the seed. */
function toggleLock(idx) {
  const slot = state.colors[idx];
  if (!slot) return;
  if (slot.locked) {
    const cache = slot.computedCache;
    if (cache) {
      const { finalH: targetFH, finalL: targetFL, finalC: targetFC } = cache;
      const actualHueCount = getActualHueCount(state.count);
      const hueIdx = idx % actualHueCount;
      const rNorm = state.randomness / 100;
      const baseHarm = generateBaseHarmony(idx, state.count, state.baseHue, state.scheme, state.spread, hueIdx, actualHueCount);

      const baseH = baseHarm.H + slot.randH * rNorm * 25;
      const baseL = Math.min(state.lightMax, Math.max(state.lightMin, baseHarm.L + slot.randL * rNorm * 0.2));
      const baseC = Math.min(state.satMax, Math.max(state.satMin, baseHarm.C + slot.randC * rNorm * 0.08));

      const postCon = state.postCon || 1;
      const postSat = state.postSat || 1;
      const targetL = 0.5 + (targetFL - 0.5) / postCon - state.postLum;
      const targetC = targetFC / postSat;
      const targetH = (targetFH - state.postHue + 360) % 360;

      slot.tweakL = targetL - baseL;
      slot.tweakC = targetC - baseC;
      let diffH = (targetH - baseH) % 360;
      if (diffH > 180) diffH -= 360;
      if (diffH < -180) diffH += 360;
      slot.tweakH = diffH;
    }
    slot.locked = false;
  } else {
    slot.locked = true;
  }
  render();
}

/** Turns the current settings into the final array of colors (hex, formats, OKLCH) and caches it in state.lastComputed. */
function computePalette(){
  syncColorSlots();
  const { count, scheme, spread, randomness, lightMin, lightMax, satMin, satMax, postHue, postSat, postLum, postCon, baseHue } = state;
  const rNorm = randomness / 100;
  const computedLogical = [];
  const actualHueCount = getActualHueCount(count);

  for(let i = 0; i < count; i++) {
    const slot = state.colors[i];
    let finalH, finalL, finalC;

    if (slot.locked && slot.computedCache) {
      ({ finalH, finalL, finalC } = slot.computedCache);
    } else {
      const hueIdx = i % actualHueCount;
      const baseHarm = generateBaseHarmony(i, count, baseHue, scheme, spread, hueIdx, actualHueCount);

      const baseH = baseHarm.H + slot.randH * rNorm * 25;
      let baseL = baseHarm.L + slot.randL * rNorm * 0.2;
      let baseC = baseHarm.C + slot.randC * rNorm * 0.08;

      baseL = Math.min(lightMax, Math.max(lightMin, baseL));
      baseC = Math.min(satMax, Math.max(satMin, baseC));

      const H = (baseH + slot.tweakH) % 360;
      const L = Math.min(0.99, Math.max(0.01, baseL + slot.tweakL));
      const C = Math.max(0, baseC + slot.tweakC);

      finalH = (H + postHue + 360) % 360;
      finalC = Math.max(0, C * postSat);
      finalL = Math.min(0.98, Math.max(0.02, 0.5 + (L + postLum - 0.5) * postCon));

      slot.computedCache = { finalH, finalL, finalC };
    }

    const colorFormats = getFullColorFormats(finalL, finalC, finalH);
    computedLogical.push({
      id: i, L: finalL, C: colorFormats.clampedC, H: finalH,
      formats: colorFormats, hex: colorFormats.hex, locked: slot.locked
    });
  }

  const computedVisual = [];
  for(let i = 0; i < count; i++) computedVisual.push(computedLogical[state.paletteOrder[i]]);
  return computedVisual;
}

/** Picks a new base hue and fresh random seeds for every unlocked color. */
function randomizeSeeds(){
  state.baseHue = Math.random() * 360;
  state.fogboatDualActive = false;
  // In Custom mode the per-point hue relationships are hand-placed — a
  // fresh randH jitter here would distort that shape. Rotation (baseHue,
  // above) and lightness/chroma jitter still apply normally either way.
  const isCustom = state.scheme === 'custom';
  for(let i = 0; i < state.colors.length; i++) {
    if(!state.colors[i].locked) {
      state.colors[i].randH = isCustom ? 0 : Math.random() * 2 - 1;
      state.colors[i].randL = Math.random() * 2 - 1;
      state.colors[i].randC = Math.random() * 2 - 1;
      state.colors[i].tweakL = 0; state.colors[i].tweakC = 0; state.colors[i].tweakH = 0;
      delete state.colors[i].computedCache;
    }
  }
  render();
}

/* Shrinks font size (down to minSize) until `text` fits within maxWidth at the given ctx. */
