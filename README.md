# Cuicuiltic

Make a color palette, adjust each color, and see how it looks in charts, moving patterns or a pixel landscape. Cuicuiltic uses OKLCH for its color calculations and runs in your browser.

[Open Cuicuiltic](https://xochilcahua.github.io/CUICUILTIC/) · [Source code](https://github.com/xochilcahua/CUICUILTIC)

The name comes from *cuicuiltic*, a Nahuatl word for colorful.

## Start using it

Open the app link on your computer or phone. You don't need an account or an installation. You can also download this repository and open `index.html` locally; keep the `css` and `js` folders beside it.

The app opens in English with five colors. Reloading starts a fresh palette. Presets you've saved in that browser remain available under **My Presets**, but aren't applied automatically.

1. Open **Settings** with the sliders button at the top left.
2. Choose a preset or palette style. Use the wheel to change the base hue and chroma.
3. Adjust the color count, ranges and palette adjustments. Click a color to adjust it individually, or lock it to keep it when generating a new palette.
4. Switch views with the top menu. In **Pixel landscape**, you can load an image and recolor it using your palette.
5. Use **Download image** for a PNG, or **Copy color codes** for CSS variables and hex codes. If clipboard access is unavailable, the app downloads a text file instead.
6. Use **Save preset** to download a JSON file and add the preset to **My Presets**. Use **Load preset** to bring a saved file into another browser or device.

Each section's reset button restores that section's default values. Choosing **Default Palette** restores the default palette settings.

## Palette styles

Choose evenly spaced, split-complementary or compound hues, or drag the wheel points in Custom mode. Other styles take inspiration from historical palettes, Viridis, Cividis, Okabe–Ito, Munsell and Chevreul.

These styles are interpretations. Viridis and Cividis use sampled anchors, and the historical styles use simplified formulas. **Even OKLCH steps** works in OKLCH; **Alternating chart colors** selects reference hues. Neither performs CIELAB calculations or LMS daltonization. Palette adjustments can change the reference colors, so the app doesn't certify accessibility or WCAG contrast.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| C | Generate a new palette, keeping locked colors |
| D | Switch between dark and light themes |
| Space | Switch to the next view |
| Tab | Open or close settings |
| E | Download an image |
| X | Copy color codes |
| V | Remix the chart colors |

Shortcuts are ignored while you're editing an input or using a menu. On a phone, use the buttons and menus in Settings.

## Your presets and images

The app processes images and palettes in your browser. It doesn't upload them. Custom presets are saved in that browser's local storage; they don't sync through GitHub or between devices. Clearing browser data can remove them. Download a preset JSON file if you want a backup or want to use it elsewhere.

The code and hosted app are public. Personal preset files aren't included in the repository. GitHub serves the website; the app has no separate server or database.

## Code and hosting

There are no runtime dependencies or build step. `index.html` loads the stylesheet from `css/` and scripts from `js/` in numeric order. The scripts share a global scope, so keep their order and avoid duplicate top-level names.

The files cover state, presets, controls, storage, color math, palette generation, exports, visualizers, the pixel scene, rendering and event wiring. `tests/browser_check.py` checks the main interactions and phone layouts in Chromium. It requires Playwright only for testing.

Changes pushed to `main` run the browser checks, then publish the app with GitHub Pages. See [the GitHub and hosting guide](docs/github.md) for what commits, pushes and deployments mean and how to update the site.

## Credits

- [Björn Ottosson's OKLab](https://bottosson.github.io/posts/oklab/) provides the color-space calculations.
- Viridis anchors are sampled from the [BIDS colormaps](https://bids.github.io/colormap/), released under CC0. Cividis anchors follow the colormap described by [Nuñez, Anderton and Renslow](https://doi.org/10.1371/journal.pone.0199239).
- The categorical reference hues come from the Okabe–Ito palette, also discussed in [Wong's *Color blindness*](https://doi.org/10.1038/nmeth.1618).

## License

Copyright (C) 2026 Teo Monroy.

Cuicuiltic is free software under the GNU Affero General Public License, version 3 or any later version. See [LICENSE](LICENSE).

The author reserves the name “Cuicuiltic.” The code license doesn't grant rights to that name; published modified forks should use a different name.
