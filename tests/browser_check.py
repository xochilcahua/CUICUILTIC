"""Check palette controls, saved presets, exports and phone layouts in Chromium."""

import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import tempfile
import threading

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def palette(page):
    return page.locator('.hexlabel').all_text_contents()


def check(url):
    errors = []
    with sync_playwright() as pw, tempfile.TemporaryDirectory() as temp:
        browser = pw.chromium.launch()
        context = browser.new_context(viewport={'width': 1440, 'height': 900}, locale='es-MX')
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url)
        page.wait_for_selector('.hexlabel')
        assert page.locator('html').get_attribute('lang') == 'en'
        assert len(palette(page)) == 5
        page.click('#settingsToggle')
        page.wait_for_timeout(350)

        schemes = page.locator('#scheme option').evaluate_all('(options) => options.map(o => o.value)')
        for scheme in schemes:
            page.select_option('#scheme', scheme)
            assert all(re.fullmatch(r'#[0-9A-F]{6}', c) for c in palette(page)), scheme
        presets = page.locator('#presetSelect option').evaluate_all('(options) => options.map(o => o.value).filter(Boolean)')
        for preset in presets:
            page.select_option('#presetSelect', preset)
            assert all(re.fullmatch(r'#[0-9A-F]{6}', c) for c in palette(page)), preset
        page.select_option('#presetSelect', 'default')
        for section in ['Comp', 'Dist', 'Post']:
            page.click(f'#reset{section}Btn')
            assert page.locator('html').get_attribute('lang') == 'en'
        page.click('#closeDrawerBtn')
        page.wait_for_timeout(350)

        page.locator('.lock-btn').first.click()
        locked = palette(page)[0]
        page.keyboard.press('c')
        assert palette(page)[0] == locked, 'Randomize changed a locked color'
        assert page.locator('.lock-btn').first.get_attribute('aria-label') == 'Unlock color'

        # A locked color must also survive a save/load after global adjustments.
        page.evaluate("state.postHue = 90; syncUIFromState(); render()")
        saved_colors = palette(page)
        page.once('dialog', lambda dialog: dialog.accept('Browser check'))
        with page.expect_download() as downloaded:
            page.evaluate('exportPresetJSON()')
        preset_path = Path(temp) / 'preset.json'
        downloaded.value.save_as(preset_path)
        payload = json.loads(preset_path.read_text())
        assert len(payload['colors']['slots']) == 5
        page.reload()
        page.wait_for_selector('.hexlabel')
        assert page.locator('#presetSelect option').filter(has_text='Browser check').count() == 1
        assert len(palette(page)) == 5
        page.once('dialog', lambda dialog: dialog.accept('Loaded check'))
        page.set_input_files('#presetFileInput', preset_path)
        page.wait_for_function("document.querySelector('#presetSelect').value.startsWith('custom:')")
        assert palette(page) == saved_colors, 'Save/load changed the palette'

        image_path = Path(temp) / 'palette.png'
        for view in ['bars', 'circle', 'graphics', 'particles', 'automata', 'pixel']:
            page.select_option('#viewSelect', view)
            page.wait_for_timeout(150)
            with page.expect_download() as downloaded:
                page.evaluate('exportImage()')
            downloaded.value.save_as(image_path)
            assert image_path.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'), view

        page.set_input_files('#pixelImgFileInput', image_path)
        page.wait_for_selector('#clearPixelImgBtn', state='visible')
        page.click('#clearPixelImgBtn')
        page.wait_for_selector('#clearPixelImgBtn', state='hidden')
        page.evaluate("Object.defineProperty(navigator, 'clipboard', {value: undefined, configurable: true})")
        with page.expect_download() as downloaded:
            page.evaluate('exportColorCodes()')
        codes_path = Path(temp) / 'colors.txt'
        downloaded.value.save_as(codes_path)
        assert '--color-1:' in codes_path.read_text()
        assert saved_colors[0] in codes_path.read_text().upper()
        context.close()

        for width in [320, 390]:
            phone = browser.new_context(viewport={'width': width, 'height': 844}, is_mobile=True, has_touch=True, locale='es-MX')
            page = phone.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(url)
            page.wait_for_selector('.hexlabel')
            boxes = page.locator('.swatch, #viewSelect, #topbar .brand').evaluate_all('els => els.map(el => {const r = el.getBoundingClientRect(); return {x:r.x, right:r.right, bottom:r.bottom};})')
            assert all(b['x'] >= 0 and b['right'] <= width and b['bottom'] <= 844 for b in boxes), boxes
            page.locator('.swatch').last.click(position={'x': 20, 'y': 40})
            panel = page.locator('.swatch-tweak-panel:visible')
            bounds = panel.bounding_box()
            assert bounds['y'] >= 52 and bounds['y'] + bounds['height'] <= 844
            panel.locator('.close-panel-btn').click()
            page.click('#settingsToggle')
            page.wait_for_timeout(350)
            page.evaluate("state.count = 10; applyCountConstraints(); syncUIFromState(); render()")
            page.click('#closeDrawerBtn')
            page.wait_for_timeout(350)
            page.locator('.swatch').last.scroll_into_view_if_needed()
            assert page.locator('.swatch').last.bounding_box()['y'] < 844
            page.select_option('#viewSelect', 'pixel')
            page.set_input_files('#pixelImgFileInput', image_path)
            page.wait_for_selector('#clearPixelImgBtn', state='visible')
            toolbar = page.locator('#pixelArtControls').bounding_box()
            assert toolbar['x'] >= 0 and toolbar['x'] + toolbar['width'] <= width
            page.click('#clearPixelImgBtn')
            phone.close()

        browser.close()
    assert not errors, errors
    print(f'Passed: {len(schemes)} styles, {len(presets)} presets, 6 views and PNG exports, preset round trip, locks, text export, images, English defaults and 320/390px phone layouts.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', help='Check a hosted app instead of the local files')
    args = parser.parse_args()
    if args.url:
        check(args.url)
    else:
        server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            check(f'http://127.0.0.1:{server.server_port}/')
        finally:
            server.shutdown()
            server.server_close()
