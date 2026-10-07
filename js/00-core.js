/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (C) 2026 Teo Monroy — Cuicuiltic
   Core: architecture notes, DOM lookup helper, default settings, global state
   Classic script: shares one global lexical scope with the other js/ files; load order matters (see index.html). */
"use strict";


/* Scripts load in numeric order and share a global scope (see index.html).
   State holds the palette settings and per-color adjustments. computePalette()
   calculates the colors; render() stores them in state.lastComputed for the
   visualizers and exports. */

// Cache fixed form controls. Rebuilt preset options are looked up separately.
const domCache = Object.create(null);
function $(id){ return domCache[id] || (domCache[id] = document.getElementById(id)); }

/* ---------- Default Settings & State ---------- */
const DEFAULT_PRESET = {
  count: 5, hueCount: 0, scheme: 'equidistant', spread: 60, randomness: 15,
  lightMin: 0.35, lightMax: 0.85, satMin: 0.08, satMax: 0.25,
  postHue: 0, postSat: 1, postLum: 0, postCon: 1
};

const VIEW_MODES = ['bars', 'circle', 'graphics', 'particles', 'automata', 'pixel'];
const state = {
  ...DEFAULT_PRESET,
  baseHue: Math.random() * 360,
  colors: [], paletteOrder: [], editingId: null, theme: 'dark', viewMode: 'bars',
  fogboatDualActive: false,
  customPoints: null, lastNonCustomScheme: 'equidistant', lastNonCustomSpread: 60
};

/* The 10 hand-picked colors the Pixel Art Landscape scene was originally
   designed around, in c1..c10 order (see fbBuildPaletteExact / fbIsExactOriginalPalette
   further down, which restore the scene's exact original color roles whenever
   the live palette matches this set). */
const FOGBOAT_ORIGINAL_HEXES = [
  '#0a121a', '#131e2b', '#203042', '#2d425c', '#526982',
  '#9eb3c7', '#e2edf8', '#143325', '#285c40', '#963d49'
];

/* The "day" counterpart of the above, in the same c1..c10 order: this is
   what the Foggy Pond preset's palette mutates towards when the theme
   toggle (D) requests the light/day form of the scene. */
const FOGBOAT_DAY_HEXES = [
  '#0d1317', '#14333b', '#26182b', '#1b4231', '#205c5c',
  '#522b42', '#478759', '#99434e', '#e37549', '#f2d0c2'
];
