/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (C) 2026 Teo Monroy — Cuicuiltic
   Control wiring and event listeners (runs last)
   Classic script: shares one global lexical scope with the other js/ files; load order matters (see index.html). */
"use strict";

/* ---------- Remaining Control Wiring (dual-range fills, then every other event listener) ---------- */
function updateDualRanges() {
  ['light', 'sat'].forEach(prefix => {
    const minEl = $(`${prefix}Min`);
    const maxEl = $(`${prefix}Max`);
    const fill = $(`${prefix}Fill`);
    const read = $(`${prefix}Readout`);
    if (minEl && maxEl && fill && read) {
      const min = parseFloat(minEl.value);
      const max = parseFloat(maxEl.value);
      const minLimit = parseFloat(minEl.min);
      const maxLimit = parseFloat(minEl.max);
      const range = maxLimit - minLimit;

      const percentMin = ((min - minLimit) / range) * 100;
      const percentMax = ((max - minLimit) / range) * 100;

      fill.style.left = percentMin + '%';
      fill.style.width = (percentMax - percentMin) + '%';

      if (prefix === 'light') {
         read.textContent = `${min}% - ${max}%`;
      } else {
         read.textContent = `${min.toFixed(2)} - ${max.toFixed(2)}`;
      }
    }
  });
}

/** Registers keyboard shortcuts and every control listener (called once at startup). */
function setupEvents() {
  $('settingsToggle').addEventListener('click', () => {
    $('drawer').classList.toggle('open');
  });

  $('closeDrawerBtn').addEventListener('click', () => {
    $('drawer').classList.remove('open');
  });

  $('themeToggle').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    $('themeToggle').innerHTML = state.theme === 'dark' ? MOON_ICON : SUN_ICON;
    fbDayFactorTarget = state.theme === 'light' ? 1 : 0;
    render();
  });
  $('themeToggle').innerHTML = MOON_ICON;

  $('viewSelect').addEventListener('change', (e) => {
    state.viewMode = e.target.value;
    render();
  });

  $('presetSelect').addEventListener('change', (e) => {
    if (e.target.value) applyPreset(e.target.value);
  });

  $('exportPresetBtn').addEventListener('click', exportPresetJSON);
  $('importPresetBtn').addEventListener('click', () => $('presetFileInput').click());
  $('presetFileInput').addEventListener('change', importPresetJSON);

  $('loadPixelImgBtn').addEventListener('click', () => $('pixelImgFileInput').click());
  $('pixelImgFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      img.onload = () => { loadCustomPixelImage(img); };
      img.onerror = () => alert('Could not load that image file.');
      img.src = evt.target.result;
    };
    reader.onerror = () => alert('Could not read that file.');
    reader.readAsDataURL(file);
    e.target.value = '';
  });
  $('clearPixelImgBtn').addEventListener('click', clearCustomPixelImage);
  setupHueWheelEvents();

  $('resetCompBtn').addEventListener('click', () => resetSection('comp'));
  $('resetDistBtn').addEventListener('click', () => resetSection('dist'));
  $('resetPostBtn').addEventListener('click', () => resetSection('post'));

  const binds = [
    ['spread', 'spreadVal', v => state.spread = parseInt(v), v => v + '°'],
    ['randomness', 'randomnessVal', v => state.randomness = parseInt(v), v => v + '%'],
    ['postHue', 'postHueVal', v => state.postHue = parseInt(v), v => v + '°'],
    ['postSat', 'postSatVal', v => state.postSat = parseFloat(v), v => parseFloat(v).toFixed(2) + 'x'],
    ['postLum', 'postLumVal', v => state.postLum = parseFloat(v), v => parseFloat(v).toFixed(2)],
    ['postCon', 'postConVal', v => state.postCon = parseFloat(v), v => parseFloat(v).toFixed(2) + 'x']
  ];

  binds.forEach(([id, valId, updateFn, formatFn]) => {
    const el = $(id);
    if (el) {
      el.addEventListener('input', (e) => {
        clearPresetSelection();
        updateFn(e.target.value);
        if(valId) $(valId).textContent = formatFn ? formatFn(e.target.value) : e.target.value;
        render();
      });
    }
  });

  /* Total Colors / Unique Hues: kept out of the generic `binds` loop above
     because they share one invariant (hues can never exceed colors) that
     has to be re-checked no matter which of the two just changed, and
     because each also has a click-to-type path (setupEditableValue) in
     addition to its slider. */
  function commitCount(newCount){
    state.count = newCount;
    applyCountConstraints();
    clearPresetSelection();
    updateCountControls();
    render();
  }
  function commitHueCount(newHueCount){
    state.hueCount = newHueCount;
    applyCountConstraints();
    clearPresetSelection();
    updateCountControls();
    render();
  }
  $('count').addEventListener('input', (e) => commitCount(parseInt(e.target.value, 10)));
  $('hueCount').addEventListener('input', (e) => commitHueCount(parseInt(e.target.value, 10)));
  setupEditableValue('countVal', 'count', 1, commitCount);
  setupEditableValue('hueCountVal', 'hueCount', 0, commitHueCount);

  $('scheme').addEventListener('change', (e) => {
    clearPresetSelection();
    if (e.target.value === 'custom' && state.scheme !== 'custom') {
      // Remember what we're switching from, so Custom mode seeds its
      // starting shape from whatever harmony was showing a moment ago.
      state.lastNonCustomScheme = state.scheme;
      state.lastNonCustomSpread = state.spread;
      state.customPoints = null; // force a fresh seed from the shape above
    }
    state.scheme = e.target.value;
    render();
  });

  ['lightMin', 'lightMax'].forEach(id => {
    $(id).addEventListener('input', (e) => {
      clearPresetSelection();
      const min = parseInt($('lightMin').value);
      const max = parseInt($('lightMax').value);
      if (min > max) { if (id === 'lightMin') $('lightMax').value = min; else $('lightMin').value = max; }
      state.lightMin = parseInt($('lightMin').value) / 100;
      state.lightMax = parseInt($('lightMax').value) / 100;
      updateDualRanges();
      render();
    });
  });

  ['satMin', 'satMax'].forEach(id => {
    $(id).addEventListener('input', (e) => {
      clearPresetSelection();
      const min = parseFloat($('satMin').value);
      const max = parseFloat($('satMax').value);
      if (min > max) { if (id === 'satMin') $('satMax').value = min; else $('satMin').value = max; }
      state.satMin = parseFloat($('satMin').value);
      state.satMax = parseFloat($('satMax').value);
      updateDualRanges();
      render();
    });
  });

  $('randomizeBtn').addEventListener('click', randomizeSeeds);
  $('exportImgBtn').addEventListener('click', exportImage);
  $('exportTxtBtn').addEventListener('click', exportColorCodes);
  $('remixVizBtn').addEventListener('click', shuffleVizColors);

  document.querySelectorAll('.section-header h2').forEach(header => {
    header.addEventListener('click', (e) => {
      const section = e.target.closest('section');
      section.classList.toggle('collapsed');
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'c' || e.key === 'C') randomizeSeeds();
    if (e.key === 'd' || e.key === 'D') $('themeToggle').click();
    if (e.key === 'e' || e.key === 'E') exportImage();
    if (e.key === 'x' || e.key === 'X') exportColorCodes();
    if (e.key === 'v' || e.key === 'V') shuffleVizColors();
    if (e.key === 'Tab') { e.preventDefault(); $('settingsToggle').click(); }
    if (e.key === ' ') {
      e.preventDefault();
      const nextIdx = (VIEW_MODES.indexOf(state.viewMode) + 1) % VIEW_MODES.length;
      state.viewMode = VIEW_MODES[nextIdx];
      render();
    }
  });
}

populateCustomPresetOptions();
applyPreset('default');
setupEvents();
window.addEventListener('resize', () => {
  if(['pixel', 'graphics', 'particles', 'automata', 'circle'].includes(state.viewMode)) render();
});
