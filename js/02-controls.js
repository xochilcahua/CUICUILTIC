/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (C) 2026 Teo Monroy — Cuicuiltic
   Total colors / unique hues editors, UI sync, section resets
   Classic script: shares one global lexical scope with the other js/ files; load order matters (see index.html). */
"use strict";

/* ---------- Total Colors / Unique Hues (click-to-type editors) ----------
   Total Colors and Unique Hues can be set beyond the 1-10/0-10 the sliders
   dial through, by clicking their number label and typing (see
   setupEditableValue). Whatever the source — slider drag, typed edit,
   preset, or import — every change funnels through here, so the "hues
   can't exceed colors" invariant always holds, and `countEditGeneration`
   bumps so any inline editor left open elsewhere knows its typed value is
   now stale (see setupEditableValue's race-guard below). */
const COUNT_MAX = 64;
let countEditGeneration = 0;
/** Clamps Total Colors and Unique Hues to their limits and keeps hues from exceeding colors. */
function applyCountConstraints(){
  state.count = Math.max(1, Math.min(COUNT_MAX, Math.round(state.count) || 1));
  state.hueCount = Math.max(0, Math.min(COUNT_MAX, Math.round(state.hueCount) || 0));
  if (state.hueCount > state.count) state.hueCount = state.count;
  countEditGeneration++;
}

/* Setting textContent on a label mid-edit would blow away the <input>
   the person is actively typing into, so every writer of these two
   labels goes through this guard instead of touching textContent directly. */
function setLabelText(el, text){
  if (el && !el.querySelector('input')) el.textContent = text;
}

/* Refreshes the Total Colors / Unique Hues sliders and their labels from
   state. Assigning a value above a range input's `max` attribute just
   silently clamps the visible thumb to that max — state stays authoritative,
   the slider only shows its best approximation within its 1-10 (0-10) dial. */
function updateCountControls(){
  $('count').value = state.count;
  $('hueCount').value = state.hueCount;
  setLabelText($('countVal'), state.count);
  setLabelText($('hueCountVal'), state.hueCount === 0 ? 'Auto' : state.hueCount);
}

/* Makes a label span click-to-edit: click swaps it for an inline
   <input type="number">, typing + Enter/blur commits the parsed value
   through `commitFn`, Escape reverts without committing.

   Race guard: if count or hueCount changes from anywhere else (the
   field's own slider, a Reset button, picking a preset, importing one)
   while this editor is still open and uncommitted, `countEditGeneration`
   will have moved on by the time the person finally hits Enter/blurs —
   so the stale typed value is silently discarded instead of clobbering
   whatever just took effect. */
function setupEditableValue(labelId, sliderId, minValue, commitFn){
  const label = $(labelId);
  if (!label) return;
  label.addEventListener('click', () => {
    if ($(sliderId).disabled) return; // e.g. Unique Hues while Custom scheme is active
    if (label.querySelector('input')) return; // already editing
    const priorText = label.textContent;
    const openedGen = countEditGeneration;
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'val-edit-input';
    input.min = String(minValue);
    input.max = String(COUNT_MAX);
    input.step = '1';
    input.value = parseInt(priorText, 10) || 0;
    label.textContent = '';
    label.appendChild(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      input.remove(); // clears the way for updateCountControls' setLabelText guard to write the real value
      if (openedGen !== countEditGeneration) return; // stale — something else already changed count/hueCount
      const parsed = parseInt(input.value, 10);
      commitFn(Number.isNaN(parsed) ? parseInt(priorText, 10) || 0 : parsed);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      else if (e.key === 'Escape') { committed = true; label.textContent = priorText; }
    });
    input.addEventListener('blur', commit, { once: true });
  });
}

/* ---------- UI Sync & Section Resets ---------- */
/* Pushes all current `state` values onto their corresponding form controls. */
function syncUIFromState() {
  updateCountControls();
  $('scheme').value = state.scheme;

  $('spread').value = state.spread;
  $('spreadVal').textContent = `${state.spread}°`;
  $('randomness').value = state.randomness;
  $('randomnessVal').textContent = `${state.randomness}%`;

  $('lightMin').value = Math.round(state.lightMin * 100);
  $('lightMax').value = Math.round(state.lightMax * 100);
  $('satMin').value = state.satMin;
  $('satMax').value = state.satMax;

  $('postHue').value = state.postHue;
  $('postHueVal').textContent = `${state.postHue}°`;
  $('postSat').value = state.postSat;
  $('postSatVal').textContent = `${state.postSat.toFixed(2)}x`;
  $('postLum').value = state.postLum;
  $('postLumVal').textContent = state.postLum.toFixed(2);
  $('postCon').value = state.postCon;
  $('postConVal').textContent = `${state.postCon.toFixed(2)}x`;

  updateDualRanges();
}

/** Clears the preset selection after a manual edit. */
function clearPresetSelection() {
  const presetDropdown = $('presetSelect');
  if (presetDropdown.value !== "") presetDropdown.value = "";
  // Any manual edit invalidates the Foggy Pond day/night dual-mutation
  // relationship (it depends on the exact harmony recipe the preset set up).
  state.fogboatDualActive = false;
}

/** Restores one drawer section ("comp", "dist" or "post") to its default values and re-renders. */
function resetSection(sectionName) {
  clearPresetSelection();
  if (sectionName === 'comp') {
    state.count = DEFAULT_PRESET.count;
    state.hueCount = DEFAULT_PRESET.hueCount;
    state.scheme = DEFAULT_PRESET.scheme;
    applyCountConstraints(); // DEFAULT_PRESET is already a valid combo, but this also bumps
                              // countEditGeneration so a stale open editor gets discarded, not applied
    updateCountControls();
    $('scheme').value = state.scheme;
  } else if (sectionName === 'dist') {
    state.spread = DEFAULT_PRESET.spread;
    state.randomness = DEFAULT_PRESET.randomness;
    state.lightMin = DEFAULT_PRESET.lightMin;
    state.lightMax = DEFAULT_PRESET.lightMax;
    state.satMin = DEFAULT_PRESET.satMin;
    state.satMax = DEFAULT_PRESET.satMax;
    $('spread').value = state.spread;
    $('spreadVal').textContent = `${state.spread}°`;
    $('randomness').value = state.randomness;
    $('randomnessVal').textContent = `${state.randomness}%`;
    $('lightMin').value = Math.round(state.lightMin * 100);
    $('lightMax').value = Math.round(state.lightMax * 100);
    $('satMin').value = state.satMin;
    $('satMax').value = state.satMax;
    updateDualRanges();
  } else if (sectionName === 'post') {
    state.postHue = DEFAULT_PRESET.postHue;
    state.postSat = DEFAULT_PRESET.postSat;
    state.postLum = DEFAULT_PRESET.postLum;
    state.postCon = DEFAULT_PRESET.postCon;
    $('postHue').value = state.postHue;
    $('postHueVal').textContent = `${state.postHue}°`;
    $('postSat').value = state.postSat;
    $('postSatVal').textContent = `${state.postSat.toFixed(2)}x`;
    $('postLum').value = state.postLum;
    $('postLumVal').textContent = state.postLum.toFixed(2);
    $('postCon').value = state.postCon;
    $('postConVal').textContent = `${state.postCon.toFixed(2)}x`;
  }
  render();
}
