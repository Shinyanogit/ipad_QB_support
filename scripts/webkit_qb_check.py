"""Check the Safari bundles of UW Support and QB Support on a saved QB page in WebKit, without the iPad (2026-11-04).

Loads the capture at its QB origin, serves its saved CSS and images, blocks the site's own JS (a saved page re-rendered
by QB's app would lose its question), injects UW Support's QB content scripts at document start with a callback-capable
browser/chrome stub, then QB Support's content script, and prints where the UW tab and the copy buttons ended up.
Uses the signed mini builds from scripts/mini_install.py build. Needs Playwright with WebKit (/opt/anaconda3/bin/python3,
`python -m playwright install webkit`).

  scripts/webkit_qb_check.py CAPTURE.html [URL] [--qb-only]

Three things made the first runs lie: the saved site JS re-rendered the page and lost the question (so it is blocked),
CSS served without text/css was not applied, and a promise-only API stub never called chat_dock.js's callbacks (Safari's
chrome.* does call them; the same code runs on UWorld on the iPad).
"""
import json, sys, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path('/Users/shinyyama/Documents/プログラミング')
ARGS = [a for a in sys.argv[1:] if a != '--qb-only']
QB_ONLY = '--qb-only' in sys.argv
CAPTURE = Path(ARGS[0])
URL = ARGS[1] if len(ARGS) > 1 else 'https://qb.medilink-study.com/Answer/118E36'
UW = next((ROOT / 'USMLE_support/safari/build/DerivedData-mini/Build/Products/Debug-iphoneos/UW Support.app/PlugIns').glob('*.appex'))
QB = next((ROOT / 'ipad拡張機能/QB_support/build/DerivedData-mini/Build/Products/Debug-iphoneos/QB Support.app/PlugIns').glob('*.appex'))
UW_FILES = ['build_config.js', 'note_search_transport.js', 'qb_adapter.js', 'content.js', 'chat_core.js', 'chat_dock.js']

STUB = r"""
(() => {
  window.__errs = [];
  addEventListener('error', e => window.__errs.push('onerror: ' + (e.message || e.error)));
  addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
  const store = {};
  const ev = () => ({ addListener() {}, removeListener() {}, hasListener() { return false; } });
  const api = {
    runtime: { id: 'stub', getURL: p => 'safari-web-extension://stub/' + p, sendMessage: async () => ({}), sendNativeMessage: async () => ({}),
               onMessage: ev(), lastError: undefined, getManifest: () => ({ version: 'stub' }) },
    storage: { local: { get: async k => { if (k == null) return { ...store }; const ks = Array.isArray(k) ? k : typeof k === 'string' ? [k] : Object.keys(k);
                        const o = {}; for (const x of ks) if (x in store) o[x] = store[x]; else if (k && typeof k === 'object' && !Array.isArray(k)) o[x] = k[x]; return o; },
                        set: async o => { Object.assign(store, o); }, remove: async k => { for (const x of [].concat(k)) delete store[x]; } },
               onChanged: ev(), session: undefined },
    i18n: { getMessage: () => '', getUILanguage: () => 'ja' },
  };
  const cb = f => (...args) => { const last = args[args.length - 1]; const hasCb = typeof last === 'function';
    const pr = f(...(hasCb ? args.slice(0, -1) : args)); if (hasCb) { pr.then(v => last(v), () => last(undefined)); return; } return pr; };
  for (const area of [api.storage.local]) for (const m of ['get', 'set', 'remove']) area[m] = cb(area[m]);
  api.runtime.sendMessage = cb(api.runtime.sendMessage); api.runtime.sendNativeMessage = cb(api.runtime.sendNativeMessage);
  window.browser = api; window.chrome = api;
})();
"""

def wrap(name, code):
    return f"try {{\n{code}\n}} catch (e) {{ (window.__errs = window.__errs || []).push({json.dumps(name)} + ': ' + (e && (e.stack || e.message) || e)); }}\n"

def main():
    html = CAPTURE.read_text(encoding='utf-8', errors='replace')
    files_dir = CAPTURE.with_name(CAPTURE.stem + '_files')
    uw = STUB + ('' if QB_ONLY else ''.join(wrap(f, (UW / f).read_text()) for f in UW_FILES))
    qb_js = wrap('qb content.js', (QB / 'content.js').read_text())
    qb_css = (QB / 'content.css').read_text()
    with sync_playwright() as p:
        browser = p.webkit.launch()
        page = browser.new_page(viewport={'width': 1366, 'height': 1024}, has_touch=True)
        logs = []
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}'[:300]) if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: logs.append(f'pageerror: {e}'[:300]))
        def route(r):
            u = r.request.url
            if u.split('#')[0] == URL:
                return r.fulfill(status=200, content_type='text/html; charset=utf-8', body=html)
            name = urllib.parse.unquote(urllib.parse.urlparse(u).path).split('/')[-1]
            local = files_dir / name
            if u.startswith('https://qb.medilink-study.com/') and local.exists() and not name.endswith('.js'):
                kind = 'text/css' if name.endswith('.css') else 'application/octet-stream'
                return r.fulfill(status=200, content_type=kind, body=local.read_bytes())
            return r.abort()
        page.route('**/*', route)
        page.add_init_script(uw)
        page.goto(URL, wait_until='domcontentloaded')
        page.add_style_tag(content=qb_css)
        page.evaluate(f"() => {{ {qb_js} }}")
        page.wait_for_timeout(4000)
        state = page.evaluate("""() => {
          const host = document.getElementById('uw-support-chat');
          const tab = host?.shadowRoot?.getElementById('chat-toggle');
          const copyUw = host?.shadowRoot?.getElementById('copy-question');
          const copyQb = document.querySelector('.qb-support-copy-button');
          const box = el => el ? (r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), hidden: !!el.hidden, vis: getComputedStyle(el).visibility, disp: getComputedStyle(el).display }))(el.getBoundingClientRect()) : null;
          return { bridge: !!globalThis.UWSupportBridge, qbank: !!globalThis.UWSupportQbank, host: !!host, tab: box(tab), copyUw: box(copyUw), copyQb: box(copyQb),
                   qbTheme: document.documentElement.dataset.qbTheme || null, errs: window.__errs || [] };
        }""")
        page.screenshot(path='/tmp/webkit_qb_check.png')
        browser.close()
    print(json.dumps(state, ensure_ascii=False, indent=1))
    print('\n'.join(logs[:15]))

main()
