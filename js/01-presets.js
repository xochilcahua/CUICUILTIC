/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (C) 2026 Teo Monroy — Cuicuiltic
   Preset application and the Foggy Pond day/night palette
   Classic script: shares one global lexical scope with the other js/ files; load order matters (see index.html). */
"use strict";

/* ---------- Preset Application ---------- */
function applyPreset(preset) {
  if (!preset) return;
  state.fogboatDualActive = (preset === 'fogboat_original');

  const config = { ...DEFAULT_PRESET };

  if (preset.indexOf('custom:') === 0) {
    const id = preset.slice('custom:'.length);
    const saved = loadCustomPresets().find(p => p.id === id);
    if (!saved) return;
    Object.assign(config, saved.settings);
    Object.assign(state, config);
    applyCountConstraints();
    if (saved.colors) applyColorsSnapshot(saved.colors);
    syncUIFromState();
    $('presetSelect').value = preset;
    render();
    return;
  }

  switch(preset) {
    case 'default': break;
    case 'cyberpunk':
      // Was pointing at a scheme name ('triadic') that doesn't exist in
      // generateBaseHarmony — it silently fell through to the random
      // fallback, ignoring spread/hueCount entirely. Equidistant is the
      // real triad implementation; baseHue pins it to magenta/cyan/yellow
      // neons instead of whatever hue happened to be active before.
      config.scheme = 'equidistant'; config.baseHue = 300; config.spread = 120; config.hueCount = 3; config.satMin = 0.22; config.satMax = 0.35;
      config.lightMin = 0.30; config.lightMax = 0.85; config.postCon = 1.25; config.postSat = 1.2;
      break;
    case 'nordic_mist':
      config.scheme = 'cielab_uniform'; config.baseHue = 200; config.spread = 45; config.hueCount = 0; config.satMin = 0.02; config.satMax = 0.10;
      config.lightMin = 0.60; config.lightMax = 0.92; config.postCon = 0.9;
      break;
    case 'warm_earth':
      // Was using the 'egypt' scheme, whose hue set is hardcoded absolute
      // values (including a green and a blue) that ignore baseHue
      // entirely, and whose lightness is hardcoded too — so this preset's
      // own lightMin/lightMax/satMin/satMax below had no effect. Switched
      // to equidistant, which actually respects all of them.
      config.scheme = 'equidistant'; config.baseHue = 30; config.spread = 35; config.hueCount = 0; config.satMin = 0.12; config.satMax = 0.28;
      config.lightMin = 0.25; config.lightMax = 0.75; config.postLum = -0.02;
      break;
    case 'midnight_dusk':
      config.scheme = 'munsell'; config.baseHue = 250; config.spread = 90; config.hueCount = 0; config.satMin = 0.10; config.satMax = 0.30;
      config.lightMin = 0.08; config.lightMax = 0.45; config.postCon = 1.3;
      break;
    case 'duotone_pop':
      // Two hues on opposite sides of the wheel.
      config.scheme = 'equidistant'; config.spread = 180; config.hueCount = 2; config.satMin = 0.20; config.satMax = 0.35;
      config.lightMin = 0.20; config.lightMax = 0.85; config.postSat = 1.3;
      break;
    case 'golden_hour':
      // A warm base hue with a narrow spread.
      config.scheme = 'equidistant'; config.baseHue = 35; config.spread = 35; config.hueCount = 0; config.satMin = 0.15; config.satMax = 0.32;
      config.lightMin = 0.35; config.lightMax = 0.88;
      break;
    case 'monochromatic': config.scheme = 'equidistant'; config.spread = 0; config.hueCount = 1; break;
    case 'analogous':
      // Small adjacent hue steps (not a jump to unrelated hues) — a fan of neighboring colors.
      config.scheme = 'equidistant'; config.spread = 25; config.hueCount = 0; config.count = 5;
      break;
    case 'complementary':
      // Exactly 2 hues, 180deg apart — the textbook definition.
      config.scheme = 'equidistant'; config.spread = 180; config.hueCount = 2; config.count = 2;
      break;
    case 'triadic':
      // 3 hues, evenly spaced 120deg apart.
      config.scheme = 'equidistant'; config.spread = 120; config.hueCount = 3; config.count = 3;
      break;
    case 'tetradic':
      // 4 hues, evenly spaced 90deg apart (a "square" harmony).
      config.scheme = 'equidistant'; config.spread = 90; config.hueCount = 4; config.count = 4;
      break;
    case 'compound_preset':
      // Base + a near neighbor, plus the two hues flanking the complement —
      // a hybrid of analogous and split-complementary ("compound harmony").
      config.scheme = 'compound'; config.hueCount = 4; config.count = 4;
      break;
    case 'grayscale': config.scheme = 'cielab_uniform'; config.spread = 0; config.hueCount = 1; config.satMin = 0; config.satMax = 0; break;
    case 'high_contrast':
      config.scheme = 'protanopia'; config.spread = 180; config.hueCount = 2;
      config.lightMin = 0.05; config.lightMax = 0.95; config.postCon = 2;
      break;
    case 'fogboat_original':
      // Tuned to land in the same neighborhood as the Pixel Art Landscape's
      // original hand-picked palette: a dominant misty blue-teal family
      // (hueIdx 0), a muted lily-pad green (hueIdx 1, ~90deg away), and a
      // single warm crimson accent (hueIdx 2, ~214deg away) — reproduced
      // via harmony math rather than fixed/locked hex values.
      config.scheme = 'equidistant'; config.count = 10; config.hueCount = 3;
      config.baseHue = 250; config.spread = 124; config.randomness = 10;
      config.lightMin = 0.18; config.lightMax = 0.90;
      config.satMin = 0.02; config.satMax = 0.12;
      break;
  }

  Object.assign(state, config);
  applyCountConstraints();
  if (preset === 'fogboat_original') applyFogboatExactSeedTweaks();
  syncUIFromState();
  $('presetSelect').value = preset;
  render();
}

/* Blend the night and day palettes using per-color offsets. Apply the
   harmony settings first; locked colors keep their current values. */
function fbApplyPaletteMutation(t){
  syncColorSlots();
  const count = Math.min(FOGBOAT_ORIGINAL_HEXES.length, state.colors.length);
  const actualHueCount = getActualHueCount(state.count);
  for (let i = 0; i < count; i++) {
    const slot = state.colors[i];
    if (slot.locked) continue; // matches randomizeSeeds' convention: never touch locked slots
    const nightC = hexToOklch(FOGBOAT_ORIGINAL_HEXES[i]);
    const dayC = hexToOklch(FOGBOAT_DAY_HEXES[i]);
    let dH = dayC.H - nightC.H;
    dH = ((dH + 180) % 360 + 360) % 360 - 180;
    const targetL = lerp(nightC.L, dayC.L, t);
    const targetC = lerp(nightC.C, dayC.C, t);
    const targetH = (nightC.H + dH * t + 360) % 360;

    const hueIdx = i % actualHueCount;
    const harm = generateBaseHarmony(i, state.count, state.baseHue, state.scheme, state.spread, hueIdx, actualHueCount);
    slot.randH = 0; slot.randL = 0; slot.randC = 0;
    slot.tweakH = targetH - harm.H;
    slot.tweakL = targetL - harm.L;
    slot.tweakC = targetC - harm.C;
    delete slot.computedCache;
  }
}

/** Re-applies the Foggy Pond palette mutation for the current theme and resets the color order to the original sequence. */
function applyFogboatExactSeedTweaks(){
  fbApplyPaletteMutation(state.theme === 'light' ? 1 : 0);
  state.paletteOrder = FOGBOAT_ORIGINAL_HEXES.map((_, i) => i);
}
