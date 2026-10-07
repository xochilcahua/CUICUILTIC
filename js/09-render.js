/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (C) 2026 Teo Monroy — Cuicuiltic
   Visualizer dispatch, DOM rendering, hue/saturation wheel
   Classic script: shares one global lexical scope with the other js/ files; load order matters (see index.html). */
"use strict";

/* ---------- Canvas Visualizer Dispatch & Animation Loop ----------
   Everything above this point (Canvas Visualizers Engine, Data & Graphics
   UI, Fog Boat Pixel Art Scene) is the individual view-mode renderers.
   From here down is the dispatch layer that decides which one actually
   runs each frame (renderCanvasVisualizer) and the requestAnimationFrame
   loop that drives it (startCanvasLoop/stopCanvasLoop, further below). */

/* When the Foggy Pond preset's exact palette is active (state.fogboatDualActive),
   the day/night toggle also mutates the app's actual generated palette —
   not just the scene's internal colors. Thin wrapper around
   fbApplyPaletteMutation, re-run every frame at the live blend factor. */
function fbUpdatePaletteMutation(t){
  if (!state.fogboatDualActive) return;
  fbApplyPaletteMutation(t);
}

/** Advances the day/night transition and draws the scene scaled to the full canvas. */
function fbRenderFrame(colors, w, h, time) {
  if (!fbDayFactorInited) {
    fbDayFactorTarget = state.theme === 'light' ? 1 : 0;
    fbDayFactor = fbDayFactorTarget;
    fbDayFactorInited = true;
  }
  if (Math.abs(fbDayFactor - fbDayFactorTarget) > 0.0005) {
    fbDayFactor += (fbDayFactorTarget - fbDayFactor) * 0.06;
  } else {
    fbDayFactor = fbDayFactorTarget;
  }

  if (state.fogboatDualActive) fbUpdatePaletteMutation(fbDayFactor);

  if (fbCustomSourceImageData) {
    const clusterSig = colors.map(c => c.hex).sort().join('|'); // order-independent: color SET only
    if (clusterSig !== fbCustomClusterSignature) {
      fbCustomClusterSignature = clusterSig;
      fbComputeCustomClusters(colors);
      fbCustomPaintSignature = ''; // force a repaint too, since clusters moved
    }
    const paintSig = clusterSig + '::' + vizColorPermutation.join(',');
    if (paintSig !== fbCustomPaintSignature) {
      fbCustomPaintSignature = paintSig;
      fbPaintCustomImage(colors);
    }
    fbBlitContain(fbCustomCanvas, fbCustomW, fbCustomH, w, h);
    return;
  }

  if (!fbGeometryReady) { fbInitGeometry(); fbGeometryReady = true; }

  const isExact = fbIsExactOriginalPalette(colors);
  const paletteSig = (isExact ? 'exact::' + vizColorPermutation.join(',') : colors.map(c => c.hex).join('|') + '::' + vizColorPermutation.join(','));
  if (paletteSig !== fbPalSignature) {
    fbPalSignature = paletteSig;
    if (isExact) {
      fbBuildPaletteExact();
      fbBuildPaletteExactDay();
    } else {
      const byL = getRemappedRanked(colors, c => c.L);
      const byC = getRemappedRanked(colors, c => -c.C);
      fbBuildPalette(byL, byC);
      fbBuildPaletteDay(byL, byC);
    }
  }

  const blendSig = paletteSig + '|' + fbDayFactor.toFixed(4);
  if (blendSig !== fbLastBlendSignature) {
    fbLastBlendSignature = blendSig;
    fbPal = fbBlendPal(fbPalNight, fbPalDay, fbDayFactor);
    fbInitStatics();
    fbRebuildPadBitmaps();
  }

  fbRender(time);
  fbBlitCover(fbScene, FB_W, FB_H, w, h);
}

/** Draws one frame of the active canvas view (pixel, dashboard, boids or reaction-diffusion). */
function renderCanvasVisualizer(colors){
  const w = window.innerWidth, h = window.innerHeight;
  const dimsChanged = vizCanvas.width !== w || vizCanvas.height !== h;
  const n = colors.length;
  const mode = state.viewMode;

  if (dimsChanged) {
    vizCanvas.width = w; vizCanvas.height = h;
    if (mode === 'automata') initRD(w, h);
  }

  if (mode === 'particles' && (dimsChanged || boidsState.length === 0 || n !== lastBoidsColorCount)) {
    initBoids(w, h, n);
    lastBoidsColorCount = n;
  } else if (mode === 'automata' && (!rdA || rdW !== Math.ceil(w / CELL_SIZE))) {
    initRD(w, h);
  }

  if (mode === 'pixel') {
    fbRenderFrame(colors, w, h, animTime);
  }
  else if (mode === 'graphics') {
    ctx.fillStyle = state.theme === 'dark' ? '#141414' : '#EBE8DF'; ctx.fillRect(0, 0, w, h);
    const sample = getSampleData(n);
    const vizColors = getRemappedColors(colors);
    const margin = Math.min(30, w * 0.03), gap = 16, topY = 64;
    const gridCols = w > 1100 ? 3 : (w > 720 ? 2 : 1);
    const gridRows = Math.ceil(9 / gridCols);

    const cardW = (w - margin * 2 - gap * (gridCols - 1)) / gridCols;
    const cardH = (h - topY - margin - gap * (gridRows - 1)) / gridRows;

    const cards = [drawBarChart, drawLineChart, drawDonutChart, drawStackedArea, drawScatterChart, drawHeatmap, drawPyramid, drawTreemap, drawHexMap];
    cards.forEach((fn, i) => {
      const col = i % gridCols, row = Math.floor(i / gridCols);
      fn(margin + col * (cardW + gap), topY + row * (cardH + gap), cardW, cardH, vizColors, state.theme, sample);
    });
  }
  else if (mode === 'particles') {
    ctx.fillStyle = state.theme === 'dark' ? '#121212' : '#EDEAE3';
    ctx.fillRect(0, 0, w, h);
    const vizColors = getRemappedColors(colors);

    const maxSpeed = 3.8, minSpeed = 1.4;
    const visualRange = 55, visualRangeSq = visualRange * visualRange;
    const separationDist = 16, separationDistSq = separationDist * separationDist;
    const centeringFactor = 0.0018, alignFactor = 0.06, avoidFactor = 0.05;

    buildBoidsGrid(w, h);

    for (let i = 0; i < boidsState.length; i++) {
      const b = boidsState[i];

      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 7) b.trail.shift();

      let cx = 0, cy = 0, cCount = 0;
      let vx = 0, vy = 0, vCount = 0;
      let sepX = 0, sepY = 0;

      const gcx = Math.min(boidsGridCols - 1, Math.max(0, Math.floor(b.x / BOIDS_CELL_SIZE)));
      const gcy = Math.min(boidsGridRows - 1, Math.max(0, Math.floor(b.y / BOIDS_CELL_SIZE)));

      for (let gy = Math.max(0, gcy - 1); gy <= Math.min(boidsGridRows - 1, gcy + 1); gy++) {
        for (let gx = Math.max(0, gcx - 1); gx <= Math.min(boidsGridCols - 1, gcx + 1); gx++) {
          const bucket = boidsGrid[gy * boidsGridCols + gx];
          for (let k = 0; k < bucket.length; k++) {
            const j = bucket[k];
            if (j === i) continue;
            const other = boidsState[j];
            const dx = other.x - b.x, dy = other.y - b.y;
            const distSq = dx*dx + dy*dy;

            if (distSq < visualRangeSq) {
              cx += other.x; cy += other.y; cCount++;
              vx += other.vx; vy += other.vy; vCount++;
            }
            if (distSq < separationDistSq) {
              sepX -= dx; sepY -= dy;
            }
          }
        }
      }

      if (cCount > 0) { b.vx += ((cx / cCount) - b.x) * centeringFactor; b.vy += ((cy / cCount) - b.y) * centeringFactor; }
      if (vCount > 0) { b.vx += ((vx / vCount) - b.vx) * alignFactor; b.vy += ((vy / vCount) - b.vy) * alignFactor; }
      b.vx += sepX * avoidFactor; b.vy += sepY * avoidFactor;

      const speedSq = b.vx*b.vx + b.vy*b.vy;
      if (speedSq > maxSpeed*maxSpeed) {
        const speed = Math.sqrt(speedSq); b.vx = (b.vx / speed) * maxSpeed; b.vy = (b.vy / speed) * maxSpeed;
      } else if (speedSq < minSpeed*minSpeed && speedSq > 0.01) {
        const speed = Math.sqrt(speedSq); b.vx = (b.vx / speed) * minSpeed; b.vy = (b.vy / speed) * minSpeed;
      }

      b.x += b.vx; b.y += b.vy;

      let wrapped = false;
      if (b.x < 0) { b.x += w; wrapped = true; }
      else if (b.x >= w) { b.x -= w; wrapped = true; }
      if (b.y < 0) { b.y += h; wrapped = true; }
      else if (b.y >= h) { b.y -= h; wrapped = true; }
      if (wrapped) b.trail = [];

      const colorHex = vizColors[b.colorIdx % n].hex;

      const tLen = b.trail.length;
      for (let t = 0; t < tLen; t++) {
        const pt = b.trail[t];
        const trailAlpha = (t / tLen) * 0.35 * b.alpha;
        const trailR = b.radius * (0.2 + 0.8 * (t / tLen));
        ctx.fillStyle = colorHex;
        ctx.globalAlpha = trailAlpha;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, trailR, 0, Math.PI * 2);
        ctx.fill();
      }

      if (b.isGlow) {
        ctx.fillStyle = colorHex;
        ctx.globalAlpha = b.alpha * 0.25;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = colorHex;
      ctx.globalAlpha = b.alpha;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  }
  else if (mode === 'automata') {
    const cellCount = rdW * rdH;
    const passes = cellCount > 150000 ? 3 : (cellCount > 70000 ? 5 : 8);
    const Da = 0.20, Db = 0.10;

    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < rdH; y++) {
        const yN = (y - 1 + rdH) % rdH, yS = (y + 1) % rdH;
        const rowN = yN * rdW, rowC = y * rdW, rowS = yS * rdW;
        for (let x = 0; x < rdW; x++) {
          const i = rowC + x;
          const a = rdA[i], b = rdB[i];

          const xW = x === 0 ? rdW - 1 : x - 1;
          const xE = x === rdW - 1 ? 0 : x + 1;

          const lapA = a * -1 +
            (rdA[rowN + x] + rdA[rowS + x] + rdA[rowC + xW] + rdA[rowC + xE]) * 0.2 +
            (rdA[rowN + xW] + rdA[rowN + xE] + rdA[rowS + xW] + rdA[rowS + xE]) * 0.05;

          const lapB = b * -1 +
            (rdB[rowN + x] + rdB[rowS + x] + rdB[rowC + xW] + rdB[rowC + xE]) * 0.2 +
            (rdB[rowN + xW] + rdB[rowN + xE] + rdB[rowS + xW] + rdB[rowS + xE]) * 0.05;

          const f = 0.010 + 0.004 * (x / rdW);
          const k = 0.047 + 0.006 * (y / rdH);
          const abb = a * b * b;

          const newA = a + (Da * lapA - abb + f * (1 - a));
          const newB = b + (Db * lapB + abb - (k + f) * b);

          rdNextA[i] = newA < 0 ? 0 : (newA > 1 ? 1 : newA);
          rdNextB[i] = newB < 0 ? 0 : (newB > 1 ? 1 : newB);
        }
      }
      const tempA = rdA; rdA = rdNextA; rdNextA = tempA;
      const tempB = rdB; rdB = rdNextB; rdNextB = tempB;
    }

    const sortedByLum = getRemappedRanked(colors, c => c.L);
    const palRGB = sortedByLum.map(c => {
      return c.formats.rgb.split(',').map(v => parseInt(v, 10));
    });
    const data = rdImageData.data;
    for (let y = 0; y < rdH; y++) {
      for (let x = 0; x < rdW; x++) {
        const cellIdx = y * rdW + x;
        const b = rdB[cellIdx];
        const norm = Math.min(1, Math.max(0, b * 3.0));
        let idx = Math.floor(norm * n);
        if (idx >= n) idx = n - 1;
        const rgb = palRGB[idx];
        const px = cellIdx * 4;
        data[px] = rgb[0]; data[px + 1] = rgb[1]; data[px + 2] = rgb[2]; data[px + 3] = 255;
      }
    }
    rdOffCtx.putImageData(rdImageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(rdOffscreen, 0, 0, rdW, rdH, 0, 0, w, h);
  }
}

/** Starts the requestAnimationFrame loop that redraws the active canvas view. */
function startCanvasLoop(){
  stopCanvasLoop();
  function loop(){
    animTime += 0.016;
    renderCanvasVisualizer(state.lastComputed || computePalette());
    animFrameId = requestAnimationFrame(loop);
  }
  loop();
}

/** Cancels the animation loop if one is running. */
function stopCanvasLoop(){
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
}

/* ---------- DOM & UI Rendering ---------- */
const paletteEl = $('palette');
const LOCK_OPEN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="1.5"/><path d="M7 11V7a5 5 0 0 1 9-3"/></svg>';
const LOCK_CLOSED = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="1.5"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const DRAG_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="18" r="1.8"/><circle cx="15" cy="18" r="1.8"/></svg>';
const SUN_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
const MOON_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

/** Creates the DOM element for one color swatch (drag handle, lock, copy, hex label, tweak panel). */
function buildSwatchEl(){
  const div = document.createElement('div');
  div.className = 'swatch';
  div.innerHTML = `
    <div class="drag-handle" draggable="true" title="Drag to reorder color">${DRAG_ICON}</div>
    <div class="swatch-bottom">
      <button class="swatch-btn lock-btn" type="button" title="Lock color"></button>
      <div class="labels">
        <div class="hexlabel" title="Copy hex code"></div>
      </div>
    </div>
    <div class="swatch-tweak-panel" style="display:none;">
      <div class="panel-title">
        <span>Adjust this color</span>
        <button type="button" class="close-panel-btn" aria-label="Close color controls">✕</button>
      </div>
      <div class="color-codes-grid">
        <div class="code-row"><span>HEX</span><span class="val-hex"></span></div>
        <div class="code-row"><span>RGB</span><span class="val-rgb"></span></div>
        <div class="code-row"><span>HSL</span><span class="val-hsl"></span></div>
        <div class="code-row"><span>CMYK</span><span class="val-cmyk"></span></div>
        <div class="code-row"><span>OKLab</span><span class="val-oklab"></span></div>
      </div>
      <div class="slider-group">
        <div><label><span>Lightness</span><span class="val-tw-l"></span></label>
        <input type="range" class="tw-l" min="-1" max="1" step="0.01" value="0"></div>
        <div><label><span>Chroma</span><span class="val-tw-c"></span></label>
        <input type="range" class="tw-c" min="-0.5" max="0.5" step="0.01" value="0"></div>
        <div><label><span>Hue Shift</span><span class="val-tw-h"></span></label>
        <input type="range" class="tw-h" min="-180" max="180" step="1" value="0"></div>
      </div>
      <div class="lock-hint" style="display:none; font-size:10px; color:rgba(255,255,255,0.45); text-align:center;">Unlock this color to adjust it.</div>
    </div>
  `;

  const getVisualIdx = () => Array.from(paletteEl.querySelectorAll('.swatch')).indexOf(div);
  const getLogicalIdx = () => parseInt(div.dataset.logicalId, 10);

  div.addEventListener('click', (e) => {
    if (e.target.closest('.lock-btn') || e.target.closest('.drag-handle') || e.target.closest('.swatch-tweak-panel')) return;
    if (e.target.closest('.hexlabel')) { copyHex(div.dataset.hex, div); return; }
    const logicalIdx = getLogicalIdx();
    state.editingId = (state.editingId === logicalIdx) ? null : logicalIdx;
    render();
  });

  div.querySelector('.lock-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const logicalIdx = getLogicalIdx();
    toggleLock(logicalIdx);
  });

  const dragHandle = div.querySelector('.drag-handle');
  dragHandle.addEventListener('dragstart', (e) => {
    e.stopPropagation(); e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', getVisualIdx().toString());
  });
  div.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; div.classList.add('drag-over'); });
  div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
  div.addEventListener('drop', (e) => {
    e.preventDefault(); div.classList.remove('drag-over');
    const fromVisualIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const toVisualIdx = getVisualIdx();
    if (!isNaN(fromVisualIdx) && fromVisualIdx !== toVisualIdx) {
      const temp = state.paletteOrder[fromVisualIdx];
      state.paletteOrder[fromVisualIdx] = state.paletteOrder[toVisualIdx];
      state.paletteOrder[toVisualIdx] = temp;
      render();
    }
  });

  div.querySelector('.close-panel-btn').addEventListener('click', (e) => {
    e.stopPropagation(); state.editingId = null; render();
  });

  div.querySelector('.tw-l').addEventListener('input', (e) => {
    const idx = getLogicalIdx(); if (state.colors[idx].locked) return;
    clearPresetSelection();
    state.colors[idx].tweakL = parseFloat(e.target.value);
    render();
  });
  div.querySelector('.tw-c').addEventListener('input', (e) => {
    const idx = getLogicalIdx(); if (state.colors[idx].locked) return;
    clearPresetSelection();
    state.colors[idx].tweakC = parseFloat(e.target.value);
    render();
  });
  div.querySelector('.tw-h').addEventListener('input', (e) => {
    const idx = getLogicalIdx(); if (state.colors[idx].locked) return;
    clearPresetSelection();
    state.colors[idx].tweakH = parseFloat(e.target.value);
    render();
  });

  return div;
}

/** Draws or updates the SVG ring that connects the swatches in the radial view. */
function renderSVGConnectingRing(colors){
  let svg = paletteEl.querySelector('.circle-ring-svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'circle-ring-svg');
    paletteEl.appendChild(svg);
  }
  svg.innerHTML = '';
  if (state.viewMode !== 'circle') return;

  const total = colors.length, center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const radius = Math.min(window.innerWidth, window.innerHeight) * 0.28;

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', center.x); circle.setAttribute('cy', center.y); circle.setAttribute('r', radius);
  circle.setAttribute('fill', 'none'); circle.setAttribute('stroke', state.theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)');
  circle.setAttribute('stroke-width', '2'); circle.setAttribute('stroke-dasharray', '6 6');
  svg.appendChild(circle);

  colors.forEach((c, i) => {
    const angle = (i / total) * 2 * Math.PI - Math.PI / 2;
    const x = center.x + Math.cos(angle) * radius, y = center.y + Math.sin(angle) * radius;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', center.x); line.setAttribute('y1', center.y);
    line.setAttribute('x2', x); line.setAttribute('y2', y);
    line.setAttribute('stroke', c.hex); line.setAttribute('stroke-width', '1.5'); line.setAttribute('opacity', '0.4');
    svg.appendChild(line);
  });
}

/** Recomputes the palette and redraws the whole UI for the current view mode. */
function render(){
  const colors = computePalette();
  const isCanvasMode = ['pixel', 'graphics', 'particles', 'automata'].includes(state.viewMode);

  paletteEl.className = isCanvasMode ? 'canvas-active' : (state.viewMode === 'circle' ? 'view-circle' : 'view-bars');
  $('pixelArtControls').classList.toggle('visible', state.viewMode === 'pixel');
  const viewSelect = $('viewSelect');
  if (viewSelect.value !== state.viewMode) viewSelect.value = state.viewMode;

  if (isCanvasMode) {
    if (state.viewMode === 'graphics') { stopCanvasLoop(); renderCanvasVisualizer(colors); }
    else { startCanvasLoop(); }
  } else {
    stopCanvasLoop();
  }

  const swatches = Array.from(paletteEl.querySelectorAll('.swatch'));
  colors.forEach((c, i) => {
    let swatch = swatches[i];
    if (!swatch) {
      swatch = buildSwatchEl();
      paletteEl.appendChild(swatch);
    }
    swatch.dataset.logicalId = c.id;
    swatch.dataset.hex = c.hex;
    swatch.style.backgroundColor = c.hex;

    const luma = c.L;
    const labelColor = luma > 0.6 ? '#000' : '#fff';
    swatch.style.setProperty('--label-color', labelColor);
    swatch.style.setProperty('--bg-color', c.hex);

    swatch.querySelector('.hexlabel').textContent = c.hex.toUpperCase();
    const isEditing = state.editingId === c.id;
    swatch.querySelector('.swatch-tweak-panel').style.display = isEditing ? 'flex' : 'none';
    if (isEditing) {
      swatch.querySelector('.val-hex').textContent = c.formats.hex.toUpperCase();
      swatch.querySelector('.val-rgb').textContent = c.formats.rgb;
      swatch.querySelector('.val-hsl').textContent = c.formats.hsl;
      swatch.querySelector('.val-cmyk').textContent = c.formats.cmyk;
      swatch.querySelector('.val-oklab').textContent = c.formats.oklab;
      const slot = state.colors[c.id];
      swatch.querySelector('.tw-l').value = slot.tweakL;
      swatch.querySelector('.tw-c').value = slot.tweakC;
      swatch.querySelector('.tw-h').value = slot.tweakH;
      swatch.querySelector('.val-tw-l').textContent = (slot.tweakL > 0 ? '+' : '') + slot.tweakL.toFixed(2);
      swatch.querySelector('.val-tw-c').textContent = (slot.tweakC > 0 ? '+' : '') + slot.tweakC.toFixed(2);
      swatch.querySelector('.val-tw-h').textContent = (slot.tweakH > 0 ? '+' : '') + slot.tweakH.toFixed(1) + '°';

      const lockHint = swatch.querySelector('.lock-hint');
      const sliders = swatch.querySelectorAll('input[type=range]');
      if(slot.locked) {
          lockHint.style.display = 'block';
          sliders.forEach(s => s.disabled = true);
      } else {
          lockHint.style.display = 'none';
          sliders.forEach(s => s.disabled = false);
      }
    }

    const lockBtn = swatch.querySelector('.lock-btn');
    lockBtn.innerHTML = c.locked ? LOCK_CLOSED : LOCK_OPEN;
    lockBtn.title = c.locked ? 'Unlock color' : 'Lock color';
    lockBtn.setAttribute('aria-label', lockBtn.title);
    lockBtn.setAttribute('aria-pressed', String(c.locked));
    if(c.locked) lockBtn.classList.add('active');
    else lockBtn.classList.remove('active');
  });

  while (swatches.length > colors.length) {
    const s = swatches.pop();
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  if (state.viewMode === 'circle') {
    renderSVGConnectingRing(colors);
    const circleRadius = Math.min(window.innerWidth, window.innerHeight) * 0.28;
    const currentSwatches = Array.from(paletteEl.querySelectorAll('.swatch'));
    currentSwatches.forEach((s, i) => {
      const angle = (i / colors.length) * 2 * Math.PI - Math.PI / 2;
      const x = Math.cos(angle) * circleRadius;
      const y = Math.sin(angle) * circleRadius;
      s.style.transform = `translate(${x}px, ${y}px)`;
    });
  } else {
    const currentSwatches = Array.from(paletteEl.querySelectorAll('.swatch'));
    currentSwatches.forEach((s) => s.style.transform = 'none');
  }

  state.lastComputed = colors;
  updateHueWheel();
}

/* ---------- Hue & Saturation Wheel ---------- */
/* Shared geometry for the wheel's 200x200 SVG viewBox, so the drawing code
   and the pointer-interaction code can never disagree about where the
   dots actually are. */
const WHEEL_CX = 100, WHEEL_CY = 100, WHEEL_MAX_R = 82, WHEEL_MIN_R = 8;

/* Screen-space positions (in that same viewBox) of the last-drawn dots,
   kept around so pointer events can hit-test "did they grab a specific
   point" in Custom mode. */
let lastWheelDotPositions = [];

/** Redraws the hue wheel: harmony points, connecting lines and the current base-hue marker. */
function updateHueWheel(){
  const svg = $('hueWheelSvg');
  const wrap = $('hueWheelWrap');
  if (!svg || !wrap) return;
  const isCustom = state.scheme === 'custom';
  const n = Math.min(getActualHueCount(state.count), 10);
  const cx = WHEEL_CX, cy = WHEEL_CY, maxR = WHEEL_MAX_R, minR = WHEEL_MIN_R;

  // Lightness range gives the wheel a rough visual echo of how light/dark
  // the generated palette will be — brighter wheel + brighter dots for a
  // higher lightness range, dimmer for a lower one.
  const avgL = Math.max(0, Math.min(1, (state.lightMin + state.lightMax) / 2));
  wrap.style.setProperty('--wheel-bright', (0.55 + avgL * 0.9).toFixed(2));
  const dotLightnessPct = Math.round(25 + avgL * 55);

  const hueToPoint = (hueDeg, r) => {
    const rad = hueDeg * Math.PI / 180;
    return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
  };

  let hueDegs, radiusFracs;
  if (isCustom) {
    ensureCustomPoints(n);
    hueDegs = state.customPoints.map(p => ((state.baseHue + p.hueOffset) % 360 + 360) % 360);
    radiusFracs = state.customPoints.map(p => p.chromaFrac);
  } else {
    const offsets = computeHarmonyHueOffsets(state.scheme, n, state.spread);
    const satFrac = Math.max(0, Math.min(1, state.satMax / 0.35));
    hueDegs = offsets.map(h => ((state.baseHue + h) % 360 + 360) % 360);
    radiusFracs = offsets.map(() => satFrac);
  }
  const points = hueDegs.map((h, i) => hueToPoint(h, minR + radiusFracs[i] * (maxR - minR)));

  let svgContent = '';
  if (points.length >= 2) {
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      svgContent += `<line class="hw-line" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>`;
    }
  }
  points.forEach((p, i) => {
    const cls = isCustom ? 'hw-dot hw-dot-custom' : 'hw-dot';
    svgContent += `<circle class="${cls}" data-idx="${i}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" fill="hsl(${hueDegs[i].toFixed(0)},85%,${dotLightnessPct}%)"/>`;
  });

  svg.innerHTML = svgContent;
  lastWheelDotPositions = points.map((p, i) => ({ x: p.x, y: p.y, idx: i }));

  const baseHueNorm = ((state.baseHue % 360) + 360) % 360;
  const avgSatFrac = radiusFracs.length ? radiusFracs.reduce((a,b)=>a+b,0) / radiusFracs.length : 0;
  const readout = $('wheelReadout');
  if (readout) readout.textContent = `${Math.round(baseHueNorm)}° · ${Math.round(avgSatFrac * 100)}%`;

  // Unique Hues doesn't apply in Custom mode (every swatch gets its own
  // point by definition), so disable it there rather than leave a control
  // that looks active but silently does nothing.
  const hueCountInput = $('hueCount');
  const hueCountVal = $('hueCountVal');
  if (hueCountInput) hueCountInput.disabled = isCustom;
  if (hueCountVal) setLabelText(hueCountVal, isCustom ? 'N/A' : (state.hueCount === 0 ? 'Auto' : state.hueCount));
}

/* Lazily (re)builds state.customPoints to match the requested point count.
   A fresh (null) customPoints seeds entirely from whatever the previous
   non-custom shape looked like. An existing array is grown/shrunk in place
   instead of being wiped, so bumping the color count while in Custom mode
   doesn't discard a shape you've already hand-arranged. */
function ensureCustomPoints(n){
  if (!Array.isArray(state.customPoints) || state.customPoints.length === 0) {
    const seedScheme = state.lastNonCustomScheme || 'equidistant';
    const seedSpread = (typeof state.lastNonCustomSpread === 'number') ? state.lastNonCustomSpread : state.spread;
    const offsets = computeHarmonyHueOffsets(seedScheme, n, seedSpread);
    const satFrac = Math.max(0, Math.min(1, state.satMax / 0.35));
    state.customPoints = offsets.map(h => ({ hueOffset: h, chromaFrac: satFrac }));
    return;
  }
  while (state.customPoints.length < n) {
    // New points start near the last one rather than snapping somewhere
    // unrelated, so growing the count feels like an extension, not a reset.
    const last = state.customPoints[state.customPoints.length - 1];
    state.customPoints.push({ hueOffset: last.hueOffset + 20, chromaFrac: last.chromaFrac });
  }
  while (state.customPoints.length > n) state.customPoints.pop();
}

/* Converts a pointer position into polar coordinates around the wheel's
   center (angle in the same 0deg=top,clockwise convention as the dots
   above) plus the raw pixel position translated into the SVG's 200x200
   viewBox, for hit-testing individual dots in Custom mode. */
function wheelPointToPolar(clientX, clientY, wrapEl){
  const rect = wrapEl.getBoundingClientRect();
  const relX = clientX - rect.left, relY = clientY - rect.top;
  const vx = (relX / rect.width) * 200, vy = (relY / rect.height) * 200;
  const dx = vx - WHEEL_CX, dy = vy - WHEEL_CY;
  const radius = Math.sqrt(dx*dx + dy*dy);
  const angle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  return { angle, radius, vx, vy };
}

/** Wires pointer dragging on the hue wheel to rotate the base hue or move custom points. */
function setupHueWheelEvents(){
  const wrap = $('hueWheelWrap');
  if (!wrap) return;
  const HIT_RADIUS = 16;

  let mode = null; // 'shape' | 'point'
  let pointIdx = -1;
  let dragStartAngle = 0;
  let dragStartBaseHue = 0, dragStartSatMin = 0, dragStartSatMax = 0;

  const shortestAngleDelta = (from, to) => {
    const d = to - from;
    return ((d + 180) % 360 + 360) % 360 - 180;
  };

  wrap.addEventListener('pointerdown', (e) => {
    const { angle, vx, vy } = wheelPointToPolar(e.clientX, e.clientY, wrap);
    clearPresetSelection();
    wrap.setPointerCapture(e.pointerId);

    // In Custom mode, grabbing near an existing dot repositions just that
    // point; anywhere else (or in any other mode) grabs the whole shape.
    let hitIdx = -1;
    if (state.scheme === 'custom') {
      let bestDist = HIT_RADIUS;
      lastWheelDotPositions.forEach(p => {
        const d = Math.hypot(vx - p.x, vy - p.y);
        if (d < bestDist) { bestDist = d; hitIdx = p.idx; }
      });
    }

    if (hitIdx >= 0) {
      mode = 'point';
      pointIdx = hitIdx;
    } else {
      mode = 'shape';
      dragStartAngle = angle;
      dragStartBaseHue = state.baseHue;
      dragStartSatMin = state.satMin;
      dragStartSatMax = state.satMax;
    }
  });

  wrap.addEventListener('pointermove', (e) => {
    if (!mode) return;
    const { angle, radius } = wheelPointToPolar(e.clientX, e.clientY, wrap);
    const radiusFrac = Math.max(0, Math.min(1, (radius - WHEEL_MIN_R) / (WHEEL_MAX_R - WHEEL_MIN_R)));

    if (mode === 'point') {
      ensureCustomPoints(state.customPoints ? state.customPoints.length : 1);
      const p = state.customPoints[pointIdx];
      if (p) {
        p.hueOffset = angle - state.baseHue;
        p.chromaFrac = radiusFrac;
      }
    } else {
      // Rotate the whole shape (delta angle -> baseHue). Scale maps the
      // wheel radius directly to satMax (not a ratio from the drag start),
      // so it still works even starting from satMax=0 (e.g. after the
      // Grayscale preset) — a multiplicative ratio would stay stuck at
      // zero forever in that case. satMin keeps its original spread
      // relative to satMax as the shape grows or shrinks.
      const deltaAngle = shortestAngleDelta(dragStartAngle, angle);
      state.baseHue = (dragStartBaseHue + deltaAngle + 360) % 360;
      const spreadRatio = dragStartSatMax > 0 ? dragStartSatMin / dragStartSatMax : 0;
      state.satMax = Math.max(0, Math.min(0.35, Math.round(radiusFrac * 0.35 * 100) / 100));
      state.satMin = Math.max(0, Math.min(state.satMax, Math.round(spreadRatio * state.satMax * 100) / 100));
      $('satMax').value = state.satMax;
      $('satMin').value = state.satMin;
      updateDualRanges();
    }
    render();
  });

  const endDrag = () => { mode = null; pointIdx = -1; };
  wrap.addEventListener('pointerup', endDrag);
  wrap.addEventListener('pointercancel', endDrag);
}
