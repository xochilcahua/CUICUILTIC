/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (C) 2026 Teo Monroy — Cuicuiltic
   Canvas visualizer engine and data/graphics dashboard
   Classic script: shares one global lexical scope with the other js/ files; load order matters (see index.html). */
"use strict";

/* ---------- Canvas Visualizers Engine ---------- */
const vizCanvas = $('vizCanvas');
const ctx = vizCanvas.getContext('2d');
let animFrameId = null, animTime = 0;

/* Lets the Data UI Dashboard show the generated colors in a different
   arrangement across chart elements, without touching the palette itself
   (order, hues, presets, exports all stay untouched). */
let vizColorPermutation = [];
/** Keeps the color-to-chart-element permutation the same length as the palette. */
function ensureVizPermutation(count){
  if (vizColorPermutation.length !== count) vizColorPermutation = Array.from({ length: count }, (_, i) => i);
}
/** Returns the palette reordered by the current permutation (see Remix Chart Colors). */
function getRemappedColors(colors){
  ensureVizPermutation(colors.length);
  return vizColorPermutation.map(idx => colors[idx]);
}
/* For visualizers that rank colors by a property (e.g. lightness) rather
   than reading them positionally: ranks first, then applies the remix
   permutation to the ranked list. With the identity permutation this is
   identical to a plain rank-sort, so default visuals are unaffected;
   pressing the remix shortcut reassigns which color lands at which rank. */
function getRemappedRanked(colors, keyFn){
  const ranked = [...colors].sort((a, b) => keyFn(a) - keyFn(b));
  ensureVizPermutation(ranked.length);
  return vizColorPermutation.map(idx => ranked[idx]);
}
/** Reshuffles which palette color goes to which chart element, without changing the palette. */
function shuffleVizColors(){
  const count = (state.lastComputed || computePalette()).length;
  ensureVizPermutation(count);
  if (count > 1) {
    const before = vizColorPermutation.join(',');
    do {
      for (let i = vizColorPermutation.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [vizColorPermutation[i], vizColorPermutation[j]] = [vizColorPermutation[j], vizColorPermutation[i]];
      }
    } while (count > 2 && vizColorPermutation.join(',') === before);
  }
  render();
}


let boidsState = [], lastBoidsColorCount = -1;
const BOIDS_CELL_SIZE = 70;
let boidsGridCols = 1, boidsGridRows = 1;
let boidsGrid = [];

/** Creates the flock: position, velocity, size and color index for each boid. */
function initBoids(width, height, count){
  const BOIDS_COUNT = Math.min(2000, 150 + count * 250);
  boidsState = [];
  for(let i = 0; i < BOIDS_COUNT; i++){
    const radius = 1.5 + Math.random() * 3.5;
    boidsState.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      colorIdx: i % count,
      radius: radius,
      alpha: 0.6 + Math.random() * 0.4,
      isGlow: radius > 3.8,
      trail: []
    });
  }
}

/** Allocates the spatial hash grid used for fast neighbor lookups. */
function buildBoidsGrid(width, height){
  boidsGridCols = Math.max(1, Math.ceil(width / BOIDS_CELL_SIZE));
  boidsGridRows = Math.max(1, Math.ceil(height / BOIDS_CELL_SIZE));
  const cellCount = boidsGridCols * boidsGridRows;
  if (boidsGrid.length !== cellCount) boidsGrid = Array.from({length: cellCount}, () => []);
  else for (let i = 0; i < cellCount; i++) boidsGrid[i].length = 0;

  for (let i = 0; i < boidsState.length; i++) {
    const b = boidsState[i];
    const cx = Math.min(boidsGridCols - 1, Math.max(0, Math.floor(b.x / BOIDS_CELL_SIZE)));
    const cy = Math.min(boidsGridRows - 1, Math.max(0, Math.floor(b.y / BOIDS_CELL_SIZE)));
    boidsGrid[cy * boidsGridCols + cx].push(i);
  }
}

let rdW = 0, rdH = 0;
let rdA = null, rdB = null, rdNextA = null, rdNextB = null;
const CELL_SIZE = 5;
const rdOffscreen = document.createElement('canvas');
const rdOffCtx = rdOffscreen.getContext('2d', { willReadFrequently: true });
let rdImageData = null;

/** Allocates and seeds the two reaction-diffusion chemical fields (A and B) for the grid size. */
function initRD(width, height){
  rdW = Math.ceil(width / CELL_SIZE);
  rdH = Math.ceil(height / CELL_SIZE);
  const len = rdW * rdH;
  rdA = new Float32Array(len).fill(1.0);
  rdB = new Float32Array(len).fill(0.0);
  rdNextA = new Float32Array(len);
  rdNextB = new Float32Array(len);
  rdOffscreen.width = rdW; rdOffscreen.height = rdH;
  rdImageData = rdOffCtx.createImageData(rdW, rdH);

  const numSeeds = 25;
  for(let s = 0; s < numSeeds; s++) {
      const cx = Math.floor(Math.random() * rdW);
      const cy = Math.floor(Math.random() * rdH);
      const seedR = 4 + Math.floor(Math.random() * 4);
      for(let y = cy - seedR; y <= cy + seedR; y++) {
          for(let x = cx - seedR; x <= cx + seedR; x++) {
              if (x >= 0 && x < rdW && y >= 0 && y < rdH) {
                  if ((x - cx)*(x - cx) + (y - cy)*(y - cy) <= seedR * seedR) {
                      const idx = y * rdW + x;
                      rdA[idx] = 0.5 + (Math.random() - 0.5) * 0.1;
                      rdB[idx] = 0.25 + (Math.random() - 0.5) * 0.1;
                  }
              }
          }
      }
  }
}

/* ---------- Data & Graphics UI ---------- */
let _sampleCache = null, _sampleCacheN = -1;
/** Returns (and caches) the random sample data shared by the dashboard charts. */
function getSampleData(n){
  if (_sampleCache && _sampleCacheN === n) return _sampleCache;
  _sampleCacheN = n;
  const bars = Array.from({length: n}, () => 0.22 + Math.random() * 0.72);
  const lineLen = 12;
  const lines = Array.from({length: n}, () => {
    let v = 0.2 + Math.random() * 0.6;
    return Array.from({length: lineLen}, () => {
      v = Math.min(0.95, Math.max(0.05, v + (Math.random() - 0.5) * 0.3));
      return v;
    });
  });
  const scatter = Array.from({length: n * 6}, (_, i) => ({ x: Math.random(), y: Math.random(), ci: i % n, r: 2.5 + Math.random() * 4.5 }));
  const grid = Array.from({length: n * 4}, (_, i) => ({ val: 0.25 + Math.random() * 0.75, ci: i % n }));
  const donut = Array.from({length: n}, () => 0.35 + Math.random() * 0.85);

  const hexes = [];
  for(let q=-3; q<=3; q++){
    for(let r=-3; r<=3; r++){
      if(Math.abs(q+r) <= 3) hexes.push({q, r, ci: Math.floor(Math.random() * n)});
    }
  }
  _sampleCache = { bars, lines, scatter, grid, donut, hexes };
  return _sampleCache;
}

/** Draws the rounded dashboard card background, border and title. */
function drawCardFrame(x, y, w, h, title, theme){
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 12);
  ctx.fillStyle = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)'; ctx.fill();
  ctx.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = theme === 'dark' ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)';
  ctx.font = '600 11px ui-sans-serif, -apple-system, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, x + 16, y + 22);
}

/** Dashboard card: vertical bar chart. */
function drawBarChart(x, y, w, h, colors, t, s){
  drawCardFrame(x, y, w, h, 'BAR METRICS', t);
  ctx.save(); ctx.beginPath(); ctx.rect(x + 8, y + 32, w - 16, h - 40); ctx.clip();
  const top = y + 36, innerH = h - 52, innerW = w - 32;
  const n = colors.length, gap = Math.min(12, 40/n), bw = Math.max(2, (innerW - gap * (n - 1)) / n);
  colors.forEach((c, i) => {
    const bh = Math.max(4, innerH * s.bars[i]);
    ctx.fillStyle = c.hex; ctx.beginPath();
    ctx.roundRect(x + 16 + i * (bw + gap), top + innerH - bh, bw, bh, 3); ctx.fill();
  });
  ctx.restore();
}

/** Dashboard card: multi-series line chart. */
function drawLineChart(x, y, w, h, colors, t, s){
  drawCardFrame(x, y, w, h, 'LINE TRENDS', t);
  ctx.save(); ctx.beginPath(); ctx.rect(x + 8, y + 32, w - 16, h - 40); ctx.clip();
  const top = y + 36, innerH = h - 52, innerW = w - 32;
  colors.forEach((col, si) => {
    const pts = s.lines[si];
    ctx.strokeStyle = col.hex; ctx.lineWidth = 2; ctx.beginPath();
    pts.forEach((v, pi) => {
      const px = x + 16 + (pi / (pts.length - 1)) * innerW;
      pi === 0 ? ctx.moveTo(px, top + innerH - v * innerH) : ctx.lineTo(px, top + innerH - v * innerH);
    });
    ctx.stroke();
  });
  ctx.restore();
}

/** Dashboard card: donut distribution chart. */
function drawDonutChart(x, y, w, h, colors, t, s){
  drawCardFrame(x, y, w, h, 'DONUT DISTRIBUTION', t);
  ctx.save(); ctx.beginPath(); ctx.rect(x + 8, y + 32, w - 16, h - 40); ctx.clip();
  const cx = x + w / 2, cy = y + 36 + (h - 52) / 2, rOuter = Math.min(w - 32, h - 52) * 0.38, rInner = rOuter * 0.58;
  const total = s.donut.reduce((a, b) => a + b, 0); let angle = -Math.PI / 2;
  colors.forEach((c, i) => {
    const slice = (s.donut[i] / total) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(cx, cy, rOuter, angle, angle + slice); ctx.arc(cx, cy, rInner, angle + slice, angle, true);
    ctx.closePath(); ctx.fillStyle = c.hex; ctx.fill();
    ctx.strokeStyle = c.hex; ctx.lineWidth = 1.5; ctx.stroke();
    angle += slice;
  });
  ctx.restore();
}

/** Dashboard card: stacked area chart. */
function drawStackedArea(x, y, w, h, colors, t, s){
  drawCardFrame(x, y, w, h, 'STACKED AREA', t);
  ctx.save(); ctx.beginPath(); ctx.rect(x + 8, y + 32, w - 16, h - 40); ctx.clip();
  const top = y + 36, innerH = h - 52, innerW = w - 32, ptsCount = s.lines[0].length;
  const baseline = Array(ptsCount).fill(0);
  colors.forEach((c, si) => {
    const prevBaseline = [...baseline];
    const vals = s.lines[si];
    for(let pi=0; pi<ptsCount; pi++) baseline[pi] += (vals[pi] / colors.length) * 0.9;

    ctx.fillStyle = c.hex; ctx.globalAlpha = 1; ctx.beginPath();
    ctx.moveTo(x + 16, top + innerH - prevBaseline[0] * innerH);
    for(let pi=0; pi<ptsCount; pi++) ctx.lineTo(x + 16 + (pi / (ptsCount - 1)) * innerW, top + innerH - baseline[pi] * innerH);
    for(let pi=ptsCount-1; pi>=0; pi--) ctx.lineTo(x + 16 + (pi / (ptsCount - 1)) * innerW, top + innerH - prevBaseline[pi] * innerH);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = c.hex; ctx.lineWidth = 1.5; ctx.stroke();
  });
  ctx.globalAlpha = 1; ctx.restore();
}

/** Dashboard card: scatter plot. */
function drawScatterChart(x, y, w, h, colors, t, s){
  drawCardFrame(x, y, w, h, 'SCATTER PLOT', t);
  ctx.save(); ctx.beginPath(); ctx.rect(x + 8, y + 32, w - 16, h - 40); ctx.clip();
  const top = y + 36, innerH = h - 52, innerW = w - 32;
  s.scatter.forEach(p => {
    ctx.beginPath(); ctx.arc(x + 24 + p.x * (innerW - 16), top + 8 + p.y * (innerH - 16), p.r, 0, Math.PI * 2);
    ctx.fillStyle = colors[p.ci].hex; ctx.globalAlpha = 0.8; ctx.fill();
  });
  ctx.globalAlpha = 1; ctx.restore();
}

/** Dashboard card: matrix heatmap. */
function drawHeatmap(x, y, w, h, colors, t, s){
  drawCardFrame(x, y, w, h, 'MATRIX HEATMAP', t);
  ctx.save(); ctx.beginPath(); ctx.rect(x + 8, y + 32, w - 16, h - 40); ctx.clip();
  const gcols = colors.length, grows = 4, top = y + 36, innerW = w - 32, innerH = h - 52, cw = innerW / gcols, ch = innerH / grows;
  for (let r = 0; r < grows; r++) {
    for (let c = 0; c < gcols; c++) {
      const item = s.grid[(r * gcols + c) % s.grid.length];
      ctx.globalAlpha = item.val; ctx.fillStyle = colors[item.ci].hex;
      ctx.fillRect(x + 16 + c * cw, top + r * ch, cw - 2, ch - 2);
    }
  }
  ctx.globalAlpha = 1; ctx.restore();
}

/** Dashboard card: population pyramid. */
function drawPyramid(x, y, w, h, colors, t, s){
  drawCardFrame(x, y, w, h, 'POPULATION PYRAMID', t);
  ctx.save(); ctx.beginPath(); ctx.rect(x + 8, y + 32, w - 16, h - 40); ctx.clip();
  const top = y + 36, innerH = h - 52, cx = x + w / 2, maxW = (w - 48) / 2;
  const n = colors.length, rowH = innerH / n;

  colors.forEach((c, i) => {
    const tierFrac = (n - i) / n;
    const valL = Math.max(4, tierFrac * maxW * (0.55 + s.bars[i] * 0.45));
    const valR = Math.max(4, tierFrac * maxW * (0.55 + s.bars[(i + 1) % n] * 0.45));

    ctx.fillStyle = c.hex;
    ctx.fillRect(cx - valL - 1, top + i * rowH + rowH * 0.1, valL, rowH * 0.8);
    ctx.fillRect(cx + 1, top + i * rowH + rowH * 0.1, valR, rowH * 0.8);
  });

  ctx.strokeStyle = t === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, top + innerH); ctx.stroke();
  ctx.restore();
}

/** Dashboard card: treemap mosaic. */
function drawTreemap(x, y, w, h, colors, t, s){
  drawCardFrame(x, y, w, h, 'TREEMAP MOSAIC', t);
  ctx.save(); ctx.beginPath(); ctx.rect(x + 8, y + 32, w - 16, h - 40); ctx.clip();
  const top = y + 36, innerH = h - 52, innerW = w - 32;
  let cx = x + 16, cy = top, cw = innerW, ch = innerH;
  const total = s.donut.reduce((a, b) => a + b, 0);
  let remain = total;
  colors.forEach((c, i) => {
    const frac = s.donut[i] / remain;
    ctx.fillStyle = c.hex;
    if (cw > ch) {
      const step = cw * frac;
      ctx.fillRect(cx, cy, Math.max(1, step - 1), ch - 1);
      cx += step; cw -= step;
    } else {
      const step = ch * frac;
      ctx.fillRect(cx, cy, cw - 1, Math.max(1, step - 1));
      cy += step; ch -= step;
    }
    remain -= s.donut[i];
  });
  ctx.restore();
}

/** Dashboard card: choropleth-style hex map. */
function drawHexMap(x, y, w, h, colors, t, s){
  drawCardFrame(x, y, w, h, 'CHOROPLETH HEX MAP', t);
  ctx.save(); ctx.beginPath(); ctx.rect(x + 8, y + 32, w - 16, h - 40); ctx.clip();
  const top = y + 36, innerH = h - 52, innerW = w - 32;
  const cx = x + w / 2, cy = top + innerH / 2;
  const size = Math.min(innerW / 18, innerH / 14);
  const hexW = size * Math.sqrt(3), hexH = size * 2;

  s.hexes.forEach(h => {
    const px = cx + hexW * (h.q + h.r / 2), py = cy + hexH * 0.75 * h.r;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 180 * (60 * i - 30);
      const vx = px + size * Math.cos(angle), vy = py + size * Math.sin(angle);
      i === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fillStyle = colors[h.ci].hex; ctx.globalAlpha = 1; ctx.fill();
    ctx.strokeStyle = colors[h.ci].hex; ctx.lineWidth = 1; ctx.stroke();
  });
  ctx.globalAlpha = 1; ctx.restore();
}
