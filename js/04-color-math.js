/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (C) 2026 Teo Monroy — Cuicuiltic
   Utilities, OKLCH/OKLab <-> sRGB math, reference colormap data
   Classic script: shares one global lexical scope with the other js/ files; load order matters (see index.html). */
"use strict";

/* ---------- Utility Functions ---------- */
function copyHex(hex, el) {
  const flashCopied = () => {
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 1000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(hex).then(flashCopied).catch(() => fallbackCopy(hex, flashCopied));
  } else {
    fallbackCopy(hex, flashCopied);
  }
}

/** Clipboard fallback for browsers without the async Clipboard API: copies text through a temporary textarea. */
function fallbackCopy(text, onSuccess) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok && onSuccess) onSuccess();
  } catch { /* Clipboard access is unavailable. */ }
}

/* ---------- Math & Conversions ---------- */
function oklabToLinearSrgb(L,a,b){
  const l_=L+0.3963377774*a+0.2158037573*b;
  const m_=L-0.1055613458*a-0.0638541728*b;
  const s_=L-0.0894841775*a-1.2914855480*b;
  const l=l_*l_*l_, m=m_*m_*m_, s=s_*s_*s_;
  return {
    r:+4.0767416621*l-3.3077115913*m+0.2309699292*s,
    g:-1.2684380046*l+2.6097574011*m-0.3413193965*s,
    b:-0.0041960863*l-0.7034186147*m+1.7076147010*s,
  };
}
/** Converts OKLCH (L, chroma, hue in degrees) to OKLab {L, a, b}. */
function oklchToOklab(L,C,H){
  const hr=H*Math.PI/180;
  return {L, a:C*Math.cos(hr), b:C*Math.sin(hr)};
}
/** sRGB transfer function: linear-light channel (0-1) to gamma-encoded. */
function linearToSrgb(c){ return c<=0.0031308 ? c*12.92 : 1.055*Math.pow(c,1/2.4)-0.055; }
/** Inverse sRGB transfer function: gamma-encoded channel (0-1) to linear-light. */
function srgbToLinear(c){ return c<=0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); }
/* Forward sRGB -> OKLab, the inverse of oklabToLinearSrgb+linearToSrgb above.
   Used for locking exact colors into a preset and for nearest-color image
   quantization, both of which need to go from a known RGB value to OKLab
   rather than the usual generation direction (OKLCH -> RGB). */
function srgbToOklab(r, g, b){
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = 0.4122214708*lr + 0.5363325363*lg + 0.0514459929*lb;
  const m = 0.2119034982*lr + 0.6806995451*lg + 0.1073969566*lb;
  const s = 0.0883024619*lr + 0.2817188376*lg + 0.6299787005*lb;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return {
    L: 0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_,
    a: 1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_,
    b: 0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_
  };
}
/** Parses a #rrggbb string and returns the equivalent OKLCH {L, C, H}. */
function hexToOklch(hex){
  hex = hex.replace('#', '');
  const r = parseInt(hex.slice(0,2),16)/255, g = parseInt(hex.slice(2,4),16)/255, b = parseInt(hex.slice(4,6),16)/255;
  const lab = srgbToOklab(r, g, b);
  const C = Math.sqrt(lab.a*lab.a + lab.b*lab.b);
  let H = Math.atan2(lab.b, lab.a) * 180 / Math.PI;
  if (H < 0) H += 360;
  return { L: lab.L, C, H };
}
/** Converts 0-1 RGB channels (clamped) to a #rrggbb string. */
function rgb01ToHex(r,g,b){
  const c=v=>Math.round(Math.min(1,Math.max(0,v))*255).toString(16).padStart(2,'0');
  return '#'+c(r)+c(g)+c(b);
}
/** True if the OKLCH color fits inside the sRGB gamut (within a small tolerance). */
function isInGamut(L,C,H){
  const {a,b}=oklchToOklab(L,C,H);
  const lin=oklabToLinearSrgb(L,a,b);
  const e=1e-4;
  return lin.r>=-e&&lin.r<=1+e&&lin.g>=-e&&lin.g<=1+e&&lin.b>=-e&&lin.b<=1+e;
}
/** Returns the largest chroma <= C that stays in the sRGB gamut at this L and H (binary search). */
function clampChroma(L,C,H){
  if(C<=0||isInGamut(L,C,H)) return Math.max(0,C);
  let lo=0, hi=C;
  for(let i=0;i<24;i++){
    const mid=(lo+hi)/2;
    if(isInGamut(L,mid,H)) lo=mid; else hi=mid;
  }
  return lo;
}

/* Reference anchors sampled from Viridis, Cividis and the Okabe–Ito palette.
   The generator interpolates and adjusts these colors in OKLCH; its output
   differs from the source palettes. */
const VIRIDIS_STOPS = [
  { L: 0.2850, C: 0.1366, H: 318.11 }, { L: 0.3634, C: 0.1304, H: 297.99 },
  { L: 0.4313, C: 0.1047, H: 273.14 }, { L: 0.4973, C: 0.0842, H: 241.41 },
  { L: 0.5595, C: 0.0847, H: 207.74 }, { L: 0.6290, C: 0.1089, H: 178.15 },
  { L: 0.6943, C: 0.1447, H: 157.82 }, { L: 0.7640, C: 0.1790, H: 140.29 },
  { L: 0.9177, C: 0.1859, H: 102.11 }
];
const CIVIDIS_STOPS = [
  { L: 0.2533, C: 0.0915, H: 257.42 }, { L: 0.3897, C: 0.0710, H: 263.68 },
  { L: 0.5206, C: 0.0116, H: 267.28 }, { L: 0.6488, C: 0.0337, H: 95.05 },
  { L: 0.9271, C: 0.1738, H: 101.77 }
];
const OKABE_ITO = [
  { L: 0.7527, C: 0.1576, H: 76.77 },  // orange
  { L: 0.7345, C: 0.1174, H: 236.18 }, // sky blue
  { L: 0.6198, C: 0.1295, H: 165.46 }, // bluish green
  { L: 0.9016, C: 0.1721, H: 105.04 }, // yellow
  { L: 0.5319, C: 0.1313, H: 244.05 }, // blue
  { L: 0.6213, C: 0.1705, H: 47.51 },  // vermillion
  { L: 0.6794, C: 0.1177, H: 346.32 }  // reddish purple
];

/* Piecewise-linear interpolation across a list of {L,C,H} stops, t in [0,1].
   Hue is interpolated along the shorter angular path. */
function sampleOklchStops(stops, t){
  const n = stops.length;
  const pos = Math.min(1, Math.max(0, t)) * (n - 1);
  const i0 = Math.min(n - 2, Math.floor(pos));
  const i1 = i0 + 1;
  const frac = pos - i0;
  const a = stops[i0], b = stops[i1];
  const dH = ((b.H - a.H + 540) % 360) - 180;
  return {
    L: a.L + (b.L - a.L) * frac,
    C: a.C + (b.C - a.C) * frac,
    H: (a.H + dH * frac + 360) % 360
  };
}

/** Gamut-maps an OKLCH color and returns its hex, RGB, HSL, CMYK and OKLab strings plus the mapped chroma. */
function getFullColorFormats(L, C, H) {
  const Cc = clampChroma(L, C, H);
  const lab = oklchToOklab(L, Cc, H);
  const lin = oklabToLinearSrgb(L, lab.a, lab.b);

  const r01 = Math.min(1, Math.max(0, linearToSrgb(lin.r)));
  const g01 = Math.min(1, Math.max(0, linearToSrgb(lin.g)));
  const b01 = Math.min(1, Math.max(0, linearToSrgb(lin.b)));

  const r = Math.round(r01 * 255);
  const g = Math.round(g01 * 255);
  const b = Math.round(b01 * 255);

  const hex = rgb01ToHex(r01, g01, b01);

  const max = Math.max(r01, g01, b01), min = Math.min(r01, g01, b01);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r01: h = (g01 - b01) / d + (g01 < b01 ? 6 : 0); break;
      case g01: h = (b01 - r01) / d + 2; break;
      case b01: h = (r01 - g01) / d + 4; break;
    }
    h /= 6;
  }
  const hslStr = `${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;

  const cK = 1 - max;
  const cC = (1 - r01 - cK) / (1 - cK) || 0;
  const cM = (1 - g01 - cK) / (1 - cK) || 0;
  const cY = (1 - b01 - cK) / (1 - cK) || 0;
  const cmykStr = `${Math.round(cC*100)}%, ${Math.round(cM*100)}%, ${Math.round(cY*100)}%, ${Math.round(cK*100)}%`;

  return { hex, rgb: `${r}, ${g}, ${b}`, hsl: hslStr, cmyk: cmykStr, oklab: `${L.toFixed(2)}, ${lab.a.toFixed(3)}, ${lab.b.toFixed(3)}`, clampedC: Cc };
}
