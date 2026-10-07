/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (C) 2026 Teo Monroy — Cuicuiltic
   Custom preset storage (localStorage) and preset import/export
   Classic script: shares one global lexical scope with the other js/ files; load order matters (see index.html). */
"use strict";

/* ---------- Custom Preset Storage (localStorage) ---------- */
const CUSTOM_PRESETS_KEY = 'cuicuilticCustomPresets';
const LEGACY_PRESETS_KEY = 'chromaGenCustomPresets'; // pre-rename key; read once as a fallback

/** Reads saved custom presets from localStorage (falling back to the pre-rename key); returns [] on any failure. */
function loadCustomPresets() {
  try {
    let raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (raw === null) raw = localStorage.getItem(LEGACY_PRESETS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Writes the custom preset list to localStorage and alerts if storage is unavailable or full. */
function saveCustomPresets(list) {
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(list));
  } catch {
    alert('This browser could not save the preset. Its storage may be full or disabled.');
  }
}

/** Appends a named preset (settings plus optional exact colors) with a unique id and persists the list. */
function addCustomPreset(name, settings, colors) {
  const list = loadCustomPresets();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  list.push({ id, name, settings, colors: colors || null });
  saveCustomPresets(list);
  populateCustomPresetOptions();
  return id;
}

/** Rebuilds the "Custom Presets" group in the preset dropdown from storage. */
function populateCustomPresetOptions() {
  const select = $('presetSelect');
  const existingGroup = document.getElementById('customPresetGroup');
  if (existingGroup) existingGroup.remove();

  const list = loadCustomPresets();
  if (list.length === 0) return;

  const group = document.createElement('optgroup');
  group.id = 'customPresetGroup';
  group.label = 'My Presets';
  list.forEach(p => {
    const opt = document.createElement('option');
    opt.value = `custom:${p.id}`;
    opt.textContent = p.name;
    group.appendChild(opt);
  });
  select.appendChild(group);
}

/** Returns a plain-object copy of every setting that defines the current palette, for saving or exporting. */
function currentSettingsSnapshot() {
  return {
    count: state.count,
    hueCount: state.hueCount,
    scheme: state.scheme,
    spread: state.spread,
    randomness: state.randomness,
    lightMin: state.lightMin,
    lightMax: state.lightMax,
    satMin: state.satMin,
    satMax: state.satMax,
    postHue: state.postHue,
    postSat: state.postSat,
    postLum: state.postLum,
    postCon: state.postCon,
    baseHue: state.baseHue,
    viewMode: state.viewMode,
    customPoints: state.scheme === 'custom' && Array.isArray(state.customPoints) ? state.customPoints.map(p => ({ ...p })) : null
  };
}

// Save random seeds, adjustments and locked colors as well as the settings.
function currentColorsSnapshot(){
  syncColorSlots();
  const computed = computePalette();
  return {
    hexList: computed.map(c => c.hex),
    slots: state.colors.map(s => ({
      locked: !!s.locked,
      randH: s.randH, randL: s.randL, randC: s.randC,
      tweakH: s.tweakH, tweakC: s.tweakC, tweakL: s.tweakL,
      computedCache: s.locked && s.computedCache ? { ...s.computedCache } : null
    })),
    paletteOrder: state.paletteOrder.slice()
  };
}

/* Restores state.colors/paletteOrder from a currentColorsSnapshot() payload.
   Tolerant of a slot-count mismatch (e.g. an older export, or a hand-edited
   file) — syncColorSlots pads/truncates to state.count as usual. */
function applyColorsSnapshot(snapshot){
  if (!snapshot || !Array.isArray(snapshot.slots)) return;
  syncColorSlots();
  for (let i = 0; i < state.colors.length; i++) {
    const s = snapshot.slots[i];
    if (!s) continue;
    state.colors[i] = {
      locked: !!s.locked,
      randH: Number(s.randH) || 0, randL: Number(s.randL) || 0, randC: Number(s.randC) || 0,
      tweakH: Number(s.tweakH) || 0, tweakC: Number(s.tweakC) || 0, tweakL: Number(s.tweakL) || 0
    };
    // A locked color may predate changes to the global settings. Restore its
    // final values so loading the preset keeps the same displayed color.
    const cache = s.computedCache;
    if (s.locked && cache &&
        ['finalH', 'finalL', 'finalC'].every(key => Number.isFinite(cache[key])) &&
        cache.finalL >= 0 && cache.finalL <= 1 && cache.finalC >= 0) {
      state.colors[i].computedCache = {
        finalH: cache.finalH, finalL: cache.finalL, finalC: cache.finalC
      };
    }
  }
  if (Array.isArray(snapshot.paletteOrder) && snapshot.paletteOrder.length === state.colors.length) {
    state.paletteOrder = snapshot.paletteOrder.slice();
  }
}

/** Prompts for a name, saves the current settings as a custom preset, and downloads them as a JSON file. */
function exportPresetJSON() {
  const name = prompt('Name this preset:', 'My Cuicuiltic Preset');
  if (name === null) return; // user cancelled
  const cleanName = name.trim() || 'My Cuicuiltic Preset';
  const settings = currentSettingsSnapshot();
  const colors = currentColorsSnapshot();

  const exportData = {
    name: cleanName,
    created: new Date().toISOString(),
    settings,
    colors
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'preset';
  a.download = `cuicuiltic-preset-${slug}.json`;
  a.click();
  URL.revokeObjectURL(url);

  // Save it for future reuse in the "My Presets" dropdown group too.
  const id = addCustomPreset(cleanName, settings, colors);
  $('presetSelect').value = `custom:${id}`;
}

/** File-input handler: reads a preset JSON file, validates it, and adds it to the custom presets. */
function importPresetJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      const s = data.settings || data;

      const settings = { ...currentSettingsSnapshot() };
      if (s.count !== undefined) settings.count = parseInt(s.count);
      if (s.hueCount !== undefined) settings.hueCount = parseInt(s.hueCount);
      // Clamp here (not just after Object.assign into state) so the
      // "hues can't exceed colors" invariant holds in the saved custom
      // preset too, not only in the live state applied below.
      settings.count = Math.max(1, Math.min(COUNT_MAX, Math.round(settings.count) || 1));
      settings.hueCount = Math.max(0, Math.min(COUNT_MAX, Math.round(settings.hueCount) || 0));
      if (settings.hueCount > settings.count) settings.hueCount = settings.count;
      if (s.scheme !== undefined) settings.scheme = s.scheme;
      if (s.spread !== undefined) settings.spread = parseInt(s.spread);
      if (s.randomness !== undefined) settings.randomness = parseInt(s.randomness);
      if (s.lightMin !== undefined) settings.lightMin = parseFloat(s.lightMin);
      if (s.lightMax !== undefined) settings.lightMax = parseFloat(s.lightMax);
      if (s.satMin !== undefined) settings.satMin = parseFloat(s.satMin);
      if (s.satMax !== undefined) settings.satMax = parseFloat(s.satMax);
      if (s.postHue !== undefined) settings.postHue = parseInt(s.postHue);
      if (s.postSat !== undefined) settings.postSat = parseFloat(s.postSat);
      if (s.postLum !== undefined) settings.postLum = parseFloat(s.postLum);
      if (s.postCon !== undefined) settings.postCon = parseFloat(s.postCon);
      if (s.baseHue !== undefined) settings.baseHue = parseFloat(s.baseHue);
      if (s.viewMode !== undefined) settings.viewMode = s.viewMode;
      if (Array.isArray(s.customPoints)) settings.customPoints = s.customPoints.map(p => ({ ...p }));

      const suggestedName = (typeof data.name === 'string' && data.name.trim()) ? data.name.trim() : file.name.replace(/\.json$/i, '');
      const name = prompt('Save this preset as:', suggestedName);
      const cleanName = (name === null) ? null : (name.trim() || suggestedName);

      Object.assign(state, settings);
      applyCountConstraints(); // settings.count/hueCount are already clamped above; this also
                                // bumps countEditGeneration to discard any stale open editor
      state.fogboatDualActive = false;
      if (data.colors) applyColorsSnapshot(data.colors);
      syncUIFromState();
      render();

      if (cleanName !== null) {
        const id = addCustomPreset(cleanName, settings, data.colors || null);
        $('presetSelect').value = `custom:${id}`;
      } else {
        clearPresetSelection();
      }
    } catch {
      alert('Could not load this preset. Please choose a Cuicuiltic preset JSON file.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}
