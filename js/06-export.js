/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (C) 2026 Teo Monroy — Cuicuiltic
   PNG snapshot and CSS/hex export
   Classic script: shares one global lexical scope with the other js/ files; load order matters (see index.html). */
"use strict";

/* ---------- Image & Code Export ---------- */
function fitFontSize(ctx, text, maxWidth, weight, family, maxSize, minSize){
  let size = maxSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

/** Returns the text lines (hex, RGB, HSL, OKLab, CMYK) printed under each swatch in image exports. */
function colorCodeLines(c){
  return [
    c.hex.toUpperCase(),
    `RGB ${c.formats.rgb}`,
    `HSL ${c.formats.hsl}`,
    `OKLAB ${c.formats.oklab}`,
    `CMYK ${c.formats.cmyk}`
  ];
}

/** Renders the palette as vertical color bars with labels onto a new canvas. */
function exportBarsImage(colors, width, height){
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const cCtx = canvas.getContext('2d');
  const swatchW = width / colors.length;
  const pad = Math.min(24, swatchW * 0.08);

  colors.forEach((c, i) => {
    const left = i * swatchW;
    cCtx.fillStyle = c.hex;
    cCtx.fillRect(left, 0, swatchW, height);

    cCtx.save();
    cCtx.beginPath();
    cCtx.rect(left, 0, swatchW, height);
    cCtx.clip();

    const luma = c.L;
    cCtx.fillStyle = luma > 0.6 ? '#000000' : '#ffffff';
    cCtx.textAlign = 'center';
    const cx = left + swatchW / 2;
    const maxTextWidth = swatchW - pad * 2;
    const lines = colorCodeLines(c);
    const bottomPad = Math.max(24, height * 0.02);

    // Fit each line's font size independently so nothing overlaps or spills
    // into the neighboring swatch.
    const hexSize = fitFontSize(cCtx, lines[0], maxTextWidth, 'bold', 'monospace', 30, 12);
    const bodySize = Math.min(
      ...lines.slice(1).map(l => fitFontSize(cCtx, l, maxTextWidth, '600', 'monospace', 18, 8))
    );
    const lineHeight = bodySize * 1.55;
    const bodyBlockHeight = (lines.length - 1) * lineHeight;
    const hexBlockHeight = hexSize * 1.35;
    const topY = height - bottomPad - hexBlockHeight - bodyBlockHeight;

    cCtx.font = `bold ${hexSize}px monospace`;
    cCtx.fillText(lines[0], cx, topY + hexSize);

    cCtx.font = `600 ${bodySize}px monospace`;
    lines.slice(1).forEach((line, li) => {
      cCtx.fillText(line, cx, topY + hexBlockHeight + li * lineHeight + bodySize);
    });

    cCtx.restore();
  });

  return canvas;
}

/** Renders the radial palette view (ring plus connecting line) onto a new square canvas. */
function exportCircleImage(colors){
  const size = 1600, cx0 = size / 2, cy0 = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const cCtx = canvas.getContext('2d');

  cCtx.fillStyle = state.theme === 'dark' ? '#121212' : '#EDEAE3';
  cCtx.fillRect(0, 0, size, size);

  const n = colors.length;
  const ringRadius = size * 0.30;
  // Shrink swatch circles as more colors need to share the ring's circumference.
  const swatchRadius = Math.max(46, Math.min(110, (Math.PI * ringRadius / n) * 0.62));

  // Faint connecting spokes, echoing the on-screen ring view.
  cCtx.strokeStyle = state.theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';
  cCtx.lineWidth = 2;
  cCtx.setLineDash([10, 10]);
  cCtx.beginPath();
  cCtx.arc(cx0, cy0, ringRadius, 0, Math.PI * 2);
  cCtx.stroke();
  cCtx.setLineDash([]);

  const positions = colors.map((c, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { c, x: cx0 + Math.cos(angle) * ringRadius, y: cy0 + Math.sin(angle) * ringRadius };
  });

  positions.forEach(({ c, x, y }) => {
    cCtx.strokeStyle = c.hex;
    cCtx.globalAlpha = 0.4;
    cCtx.lineWidth = 1.5;
    cCtx.beginPath();
    cCtx.moveTo(cx0, cy0);
    cCtx.lineTo(x, y);
    cCtx.stroke();
    cCtx.globalAlpha = 1;
  });

  positions.forEach(({ c, x, y }) => {
    cCtx.beginPath();
    cCtx.arc(x, y, swatchRadius, 0, Math.PI * 2);
    cCtx.fillStyle = c.hex;
    cCtx.shadowColor = 'rgba(0,0,0,0.45)';
    cCtx.shadowBlur = 24;
    cCtx.fill();
    cCtx.shadowBlur = 0;

    // Hex code inside the circle, sized to fit its diameter.
    const luma = c.L;
    cCtx.fillStyle = luma > 0.6 ? '#000000' : '#ffffff';
    cCtx.textAlign = 'center';
    const hexSize = fitFontSize(cCtx, c.hex.toUpperCase(), swatchRadius * 1.6, 'bold', 'monospace', swatchRadius * 0.34, 9);
    cCtx.font = `bold ${hexSize}px monospace`;
    cCtx.fillText(c.hex.toUpperCase(), x, y + hexSize * 0.35);

    // Remaining codes as a small stacked label beneath the circle.
    const lines = [`RGB ${c.formats.rgb}`, `HSL ${c.formats.hsl}`, `OKLAB ${c.formats.oklab}`, `CMYK ${c.formats.cmyk}`];
    const maxTextWidth = swatchRadius * 2.6;
    const bodySize = Math.min(...lines.map(l => fitFontSize(cCtx, l, maxTextWidth, '600', 'monospace', 15, 8)));
    const lineHeight = bodySize * 1.5;
    cCtx.font = `600 ${bodySize}px monospace`;
    cCtx.fillStyle = state.theme === 'dark' ? '#F5F3EE' : '#1C1B19';
    let ly = y + swatchRadius + lineHeight;
    lines.forEach(line => { cCtx.fillText(line, x, ly); ly += lineHeight; });
  });

  return canvas;
}

/* Triggers a browser download of a canvas as a PNG file. */
function downloadCanvas(canvas, filename){
  const a = document.createElement('a');
  a.download = filename;
  a.href = canvas.toDataURL('image/png');
  a.click();
}

/** Downloads a PNG of the active view (canvas modes snapshot the live canvas). */
function exportImage() {
  const colors = state.lastComputed || computePalette();
  const isCanvasMode = ['pixel', 'graphics', 'particles', 'automata'].includes(state.viewMode);

  if (isCanvasMode && vizCanvas.width > 0) {
    downloadCanvas(vizCanvas, `cuicuiltic-${state.viewMode}-${Date.now()}.png`);
  } else if (state.viewMode === 'circle') {
    downloadCanvas(exportCircleImage(colors), `cuicuiltic-circle-${Date.now()}.png`);
  } else {
    downloadCanvas(exportBarsImage(colors, 1920, 1080), `cuicuiltic-palette-${Date.now()}.png`);
  }
}

/** Downloads a text file of the palette as CSS custom properties plus a plain hex list. */
function exportColorCodes() {
  const colors = state.lastComputed || computePalette();
  const lines = [
    "/* Cuicuiltic Palette Export */",
    ...colors.map((c, i) => `--color-${i + 1}: ${c.hex}; /* RGB: (${c.formats.rgb}) | HSL: (${c.formats.hsl}) */`),
    "",
    "/* Hex Codes */",
    colors.map(c => c.hex.toUpperCase()).join(', ')
  ].join('\n');

  const fallbackToFile = () => {
    const blob = new Blob([lines], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cuicuiltic-colors-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(lines).then(() => {
      alert('Color codes and CSS variables copied.');
    }).catch(fallbackToFile);
  } else {
    fallbackToFile();
  }
}
