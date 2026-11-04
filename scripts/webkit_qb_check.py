"""Check the Safari bundles of UW Support and QB Support on a saved QB page in WebKit, without the iPad (2026-11-04).

Loads the capture at its QB origin, serves its saved CSS and images, blocks the site's own JS (a saved page re-rendered
by QB's app would lose its question), injects UW Support's QB content scripts at document start with a browser/chrome
stub, then QB Support's content script, and prints where the UW tab and the copy buttons ended up.
Uses the signed mini builds from scripts/mini_install.py build. Needs Playwright with WebKit (/opt/anaconda3/bin/python3,
`python -m playwright install webkit`).

  scripts/webkit_qb_check.py CAPTURE.html [URL] [--qb-only] [--scenario NAME | --matrix] [--json OUT] [--shots DIR] [--wait MS]

Scenarios (--matrix runs them all and prints one row each):
  both            callback-capable chrome and browser, both extensions (what Safari gives)
  uw-only qb-only none   only one extension, or nothing injected (what a missing site permission looks like)
  browser-only    only `browser` exists, promise API
  promise-only    `chrome` and `browser` exist but never call callbacks
  stalled-storage storage.local never answers
  hide-uw         after both render, UW's host is set to display:none (UW drawn but invisible)
  no-choices      the choice list is removed before the extensions read the page
  no-css          the site's CSS is not served
  root-transform  html and body get transform and filter (containing block changes for fixed UI)
  qb-panel-closed QB Support alone with its settings panel saved as closed (enabled: false)
  stem-image-stalled  the question has an image whose fetch through the background never answers
  copy-before     both extensions, then the shown copy button is tapped and Y is pressed before answering;
                  prints what reached the clipboard
  copy-after      like copy-before, but an answer box and an explanation are added first (the page after answering)
  hidden-explanation(-qb)  a hidden explanation and answer box sit in the page before answering (both, or QB only);
                  the copy must stay 問題をコピー and must not contain SECRET
  phase-revert    the page starts answered, then the explanation is removed and UW's copy state and snapshot are read
                  at once (before the next update); then a snapshot is started and the explanation removed while it waits
  hidden-inner    a visible #resultcontent whose explanation part is hidden (both extensions)
  nbsp(-qb)       the stem holds a no-break space (both, or QB only); the copy must turn it into a normal space
  heading-only    a visible #resultcontent shows only the 解説 heading, its body hidden (both extensions)
  style-revert    the page starts answered, then QB hides the explanation and answer box through style and hidden;
                  the dock button must go back to 問題をコピー Y without any other change
  slow-get        storage reads answer after 7 s (saved custom template MINE); a template is added in the dock at 5 s,
                  which must not write defaults over MINE, and UW's settings button waits for the read

Three things made the first runs lie: the saved site JS re-rendered the page and lost the question (so it is blocked),
CSS served without text/css was not applied, and a promise-only API stub never called chat_dock.js's callbacks (Safari's
chrome.* does call them; the same code runs on UWorld on the iPad).
"""
import json, sys, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path('/Users/shinyyama/Documents/プログラミング')
UW = next((ROOT / 'USMLE_support/safari/build/DerivedData-mini/Build/Products/Debug-iphoneos/UW Support.app/PlugIns').glob('*.appex'))
QB = next((ROOT / 'ipad拡張機能/QB_support/build/DerivedData-mini/Build/Products/Debug-iphoneos/QB Support.app/PlugIns').glob('*.appex'))
UW_FILES = ['build_config.js', 'note_search_transport.js', 'qb_adapter.js', 'content.js', 'chat_core.js', 'chat_dock.js']
SCENARIOS = ['both', 'uw-only', 'qb-only', 'none', 'browser-only', 'promise-only', 'stalled-storage', 'hide-uw',
             'no-choices', 'no-css', 'root-transform', 'qb-panel-closed', 'stem-image-stalled', 'copy-before', 'copy-after', 'hidden-explanation',
             'hidden-explanation-qb', 'phase-revert', 'slow-get', 'hidden-inner', 'nbsp', 'nbsp-qb', 'heading-only',
             'style-revert']

STUB = r"""
(() => {
  const MODE = __MODE__;
  window.__errs = []; window.__csp = [];
  addEventListener('error', e => window.__errs.push('onerror: ' + (e.message || e.error)));
  addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
  addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
  const store = {};
  const ev = () => ({ addListener() {}, removeListener() {}, hasListener() { return false; } });
  const never = () => new Promise(() => {});
  const api = {
    runtime: { id: 'stub', getURL: p => 'safari-web-extension://stub/' + p,
               sendMessage: async m => MODE === 'stem-image-stalled' && m && m.action === 'fetchImage' ? never() : ({}), sendNativeMessage: async () => ({}),
               connect: () => ({ name: 'stub', postMessage() {}, disconnect() {}, onMessage: ev(), onDisconnect: ev() }),
               onMessage: ev(), lastError: undefined, getManifest: () => ({ version: 'stub' }) },
    storage: { local: { get: async k => { if (k == null) return { ...store }; const ks = Array.isArray(k) ? k : typeof k === 'string' ? [k] : Object.keys(k);
                        const o = {}; for (const x of ks) if (x in store) o[x] = store[x]; else if (k && typeof k === 'object' && !Array.isArray(k)) o[x] = k[x]; return o; },
                        set: async o => { Object.assign(store, o); }, remove: async k => { for (const x of [].concat(k)) delete store[x]; } },
               onChanged: ev(), session: undefined },
    i18n: { getMessage: () => '', getUILanguage: () => 'ja' },
  };
  if (MODE === 'qb-panel-closed') store.qb_support_settings_v1 = { enabled: false };
  if (MODE === 'stalled-storage') for (const m of ['get', 'set', 'remove']) api.storage.local[m] = never;
  if (MODE === 'slow-get') {
    store.uw_support_chat_templates = [{ id: 'mine', label: 'MINE', text: 'x', phase: 'before', mode: 'insert', webSearch: false }];
    store.uw_support_chat_templates_version = 3; window.__writes = []; window.__store = store;
    const get = api.storage.local.get, set = api.storage.local.set;
    api.storage.local.get = k => new Promise(r => setTimeout(() => r(get(k)), 7000));
    api.storage.local.set = o => { window.__writes.push(Object.keys(o).join(',')); return set(o); };
  }
  const cb = f => (...args) => { const last = args[args.length - 1]; const hasCb = typeof last === 'function';
    const pr = f(...(hasCb ? args.slice(0, -1) : args)); if (hasCb) { pr.then(v => last(v), () => last(undefined)); return; } return pr; };
  if (MODE !== 'promise-only' && MODE !== 'browser-only') {
    for (const m of ['get', 'set', 'remove']) api.storage.local[m] = cb(api.storage.local[m]);
    api.runtime.sendMessage = cb(api.runtime.sendMessage); api.runtime.sendNativeMessage = cb(api.runtime.sendNativeMessage);
  }
  window.browser = api;
  if (MODE !== 'browser-only') window.chrome = api;
  if (MODE === 'stem-image-stalled') document.addEventListener('DOMContentLoaded', () => document.querySelector('.question-content .body')
    ?.insertAdjacentHTML('beforeend', '<img src="https://qb.medilink-study.com/stall.png" width="40" height="40">'), true);
  const HIDDEN = ['hidden-explanation', 'hidden-explanation-qb'].includes(MODE);
  if (MODE === 'heading-only') document.addEventListener('DOMContentLoaded', () => document.querySelector('.question-content')
    ?.insertAdjacentHTML('afterend', '<div id="resultcontent"><p>解説</p><div style="display:none"><p>SECRET の解説の本文です。</p></div></div>'), true);
  if (MODE === 'hidden-inner') document.addEventListener('DOMContentLoaded', () => document.querySelector('.question-content')
    ?.insertAdjacentHTML('afterend', '<div id="resultcontent" style="padding:8px"><div style="display:none"><p>解説</p><p>SECRET の解説の本文です。</p></div></div>'), true);
  if (MODE === 'nbsp' || MODE === 'nbsp-qb') document.addEventListener('DOMContentLoaded', () => document.querySelector('.question-content .body')
    ?.insertAdjacentHTML('beforeend', '<p>血清 Na\u00a0140 mEq/L。</p>'), true);
  if (HIDDEN || MODE === 'phase-revert' || MODE === 'style-revert') document.addEventListener('DOMContentLoaded', () => {
    const style = HIDDEN ? ' style="display:none"' : '', word = HIDDEN ? 'SECRET' : 'OLD';
    document.getElementById('answerSection')?.insertAdjacentHTML('afterbegin', `<div class="probe"${style}>正解：c ${word}</div>`);
    document.querySelector('.question-content')?.insertAdjacentHTML('afterend', `<div id="resultcontent"${style}><p>解説</p><p>${word} の解説の本文です。虫垂炎を疑う。</p></div>`);
  }, true);
  if (['copy-before', 'copy-after', 'hidden-inner', 'nbsp', 'nbsp-qb', 'heading-only'].includes(MODE) || HIDDEN) { window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copied.push(t); return Promise.resolve(); } } }); }
  if (MODE === 'no-choices') document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('.multiple-answer-options').forEach(n => n.remove()), true);
})();
"""

MEASURE = """() => {
  const host = document.getElementById('uw-support-chat');
  const tab = host?.shadowRoot?.getElementById('chat-toggle');
  const copyUw = host?.shadowRoot?.getElementById('copy-question');
  const copyQb = document.querySelector('.qb-support-copy-button');
  const shown = el => { if (!el) return false; const r = el.getBoundingClientRect();
    if (el.hidden || r.width <= 0 || r.height <= 0 || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    for (let n = el; n; n = n.parentElement || n.getRootNode().host) { const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) === 0) return false; }
    return true; };
  const box = el => el ? (r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), shown: shown(el), label: el.getAttribute('aria-label') }))(el.getBoundingClientRect()) : null;
  return { bridge: !!globalThis.UWSupportBridge, qbank: !!globalThis.UWSupportQbank, qbMarker: document.documentElement.dataset.qbSupportInjected === 'true',
           host: !!host, tab: box(tab), copyUw: box(copyUw), copyQb: box(copyQb),
           qbTheme: document.documentElement.dataset.qbTheme || null, errs: window.__errs || [], csp: window.__csp || [] };
}"""

def wrap(name, code):
    return f"try {{\n{code}\n}} catch (e) {{ (window.__errs = window.__errs || []).push({json.dumps(name)} + ': ' + (e && (e.stack || e.message) || e)); }}\n"

def run(browser, scenario, html, files_dir, url, shots, wait=4000):
    uw_on = scenario not in ('qb-only', 'none', 'qb-panel-closed', 'hidden-explanation-qb', 'nbsp-qb')
    qb_on = scenario not in ('uw-only', 'none')
    init = STUB.replace('__MODE__', json.dumps(scenario)) if scenario != 'none' else ''
    if uw_on:
        init += ''.join(wrap(f, (UW / f).read_text()) for f in UW_FILES)
    page = browser.new_page(viewport={'width': 1366, 'height': 1024}, has_touch=True)
    logs = []
    page.on('console', lambda m: logs.append(f'{m.type}: {m.text}'[:300]) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: logs.append(f'pageerror: {e}'[:300]))
    def route(r):
        u = r.request.url
        if u.split('#')[0] == url:
            return r.fulfill(status=200, content_type='text/html; charset=utf-8', body=html)
        name = urllib.parse.unquote(urllib.parse.urlparse(u).path).split('/')[-1]
        local = files_dir / name
        if u.startswith('https://qb.medilink-study.com/') and local.exists() and not name.endswith('.js'):
            if scenario == 'no-css' and name.endswith('.css'):
                return r.abort()
            kind = 'text/css' if name.endswith('.css') else 'application/octet-stream'
            return r.fulfill(status=200, content_type=kind, body=local.read_bytes())
        return r.abort()
    page.route('**/*', route)
    if init:
        page.add_init_script(init)
    page.goto(url, wait_until='domcontentloaded')
    if scenario == 'root-transform':
        page.add_style_tag(content='html, body { transform: translateZ(0); filter: saturate(1); }')
    if qb_on:
        page.add_style_tag(content=(QB / 'content.css').read_text())
        page.evaluate(f"() => {{ {wrap('qb content.js', (QB / 'content.js').read_text())} }}")
    page.wait_for_timeout(wait)
    if scenario == 'style-revert':
        state0 = page.evaluate(MEASURE)
        page.evaluate("""() => { document.getElementById('resultcontent').style.display = 'none';
          document.querySelector('.probe').hidden = true; }""")
        page.wait_for_timeout(800)
    if scenario == 'hide-uw':
        page.evaluate("() => { const h = document.getElementById('uw-support-chat'); if (h) h.style.display = 'none'; }")
        page.wait_for_timeout(1500)
    if scenario == 'copy-after':
        page.evaluate("""() => { document.getElementById('answerSection')?.insertAdjacentHTML('afterbegin', '<div>正解：c</div>');
          document.querySelector('.question-content')?.insertAdjacentHTML('afterend', '<div id="resultcontent"><p>解説</p><p>心窩部から右下腹部へ移る痛みは虫垂炎を疑う。</p></div>'); }""")
        page.wait_for_timeout(1500)
    if scenario == 'slow-get':
        page.wait_for_timeout(5000 - wait if wait < 5000 else 0)
        early = page.evaluate("""() => { const sh = document.getElementById('uw-support-chat')?.shadowRoot;
          const item = [...(sh?.querySelectorAll('button, [role="menuitem"]') || [])].find(b => b.textContent.includes('チャット設定'));
          item?.click();
          sh?.querySelector('button[title="テンプレートを追加"]')?.click();
          return { opened: !!item, writes: [...window.__writes], settingsBtn: !!document.getElementById('uw-support-settings-btn'),
                   notice: sh?.querySelector('[role="status"], .notice')?.textContent || '' }; }""")
        page.wait_for_timeout(4000)
        late = page.evaluate("""() => ({ writes: [...window.__writes], settingsBtn: !!document.getElementById('uw-support-settings-btn'),
          templates: (window.__store.uw_support_chat_templates || []).map(t => t.label),
          editor: [...(document.getElementById('uw-support-chat')?.shadowRoot?.querySelectorAll('#templates-editor .template-edit input') || [])]
            .filter(i => i.type !== 'checkbox').map(i => i.value) })""")
    if scenario == 'phase-revert':
        revert = page.evaluate("""async () => { const B = globalThis.UWSupportBridge, wait = ms => new Promise(r => setTimeout(r, ms));
          const remove = () => document.querySelectorAll('#resultcontent, .probe').forEach(n => n.remove());
          const add = () => { document.getElementById('answerSection')?.insertAdjacentHTML('afterbegin', '<div class="probe">正解：c OLD</div>');
            document.querySelector('.question-content')?.insertAdjacentHTML('afterend', '<div id="resultcontent"><p>解説</p><p>OLD の解説の本文です。虫垂炎を疑う。</p></div>'); };
          const before = B.actions.copyState?.();
          remove();
          const state = B.actions.copyState?.(); const snap = await B.getSnapshot();
          add(); await wait(500);
          const pending = B.getSnapshot(); remove(); const raced = await pending;
          return { answeredState: before, copyState: state, snapshotPhase: snap?.phase, snapshotExplanation: !!snap?.explanation,
                   racedPhase: raced ? raced.phase : null, racedExplanation: !!raced?.explanation }; }""")
    state = page.evaluate(MEASURE)
    if scenario == 'slow-get':
        state['slowGet'] = {'early': early, 'late': late}
    if scenario == 'phase-revert':
        state['revert'] = revert
    if scenario == 'style-revert':
        state['revert'] = {'labelAnswered': (state0['copyUw'] or {}).get('label'), 'labelAfterHiding': (state['copyUw'] or {}).get('label')}
    if scenario in ('copy-before', 'copy-after', 'hidden-explanation', 'hidden-explanation-qb', 'hidden-inner', 'nbsp', 'nbsp-qb', 'heading-only'):
        page.evaluate("""() => { const uw = document.getElementById('uw-support-chat')?.shadowRoot?.getElementById('copy-question');
          const qb = document.querySelector('.qb-support-copy-button'); (uw && !uw.hidden ? uw : qb)?.click(); }""")
        page.wait_for_timeout(300)
        page.mouse.click(400, 300)
        page.keyboard.press('y')
        page.wait_for_timeout(300)
        state['copied'] = [{'length': len(t), 'start': t[:30], 'end': t.splitlines()[-1][:40] if t else '', 'secret': 'SECRET' in t,
                            'nbsp': '\u00a0' in t}
                           for t in page.evaluate('() => window.__copied || []')]
    state['logs'] = logs[:15]
    if shots:
        page.screenshot(path=str(Path(shots) / f'webkit_qb_{scenario}.png'))
    page.close()
    return state

def row(name, s):
    b = lambda v: 'yes' if v else 'no'
    seen = lambda box: 'none' if box is None else ('shown' if box['shown'] else 'hidden')
    return (f"{name:16} bridge={b(s['bridge']):3} host={b(s['host']):3} tab={seen(s['tab']):6} copyUw={seen(s['copyUw']):6} "
            f"copyQb={seen(s['copyQb']):6} qbMarker={b(s['qbMarker']):3} errs={len(s['errs'])} csp={len(s['csp'])}"
            + (f" copied={s['copied']}" if 'copied' in s else '') + (f" slowGet={s['slowGet']}" if 'slowGet' in s else '')
            + (f" revert={s['revert']}" if 'revert' in s else ''))

def main():
    args = sys.argv[1:]
    opt = lambda flag: args[args.index(flag) + 1] if flag in args else None
    valued = {'--scenario', '--json', '--shots', '--wait'}
    positional = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or args[i - 1] not in valued)]
    capture = Path(positional[0])
    url = positional[1] if len(positional) > 1 else 'https://qb.medilink-study.com/Answer/118E36'
    scenarios = SCENARIOS if '--matrix' in args else [opt('--scenario') or ('qb-only' if '--qb-only' in args else 'both')]
    shots = opt('--shots') or (None if '--matrix' in args else '/tmp')
    html = capture.read_text(encoding='utf-8', errors='replace')
    files_dir = capture.with_name(capture.stem + '_files')
    results = {}
    with sync_playwright() as p:
        browser = p.webkit.launch()
        for name in scenarios:
            results[name] = run(browser, name, html, files_dir, url, shots, int(opt('--wait') or 4000))
        browser.close()
    print(f'UW {json.loads((UW / "manifest.json").read_text())["version"]}, QB {json.loads((QB / "manifest.json").read_text())["version"]}')
    if len(scenarios) == 1:
        print(json.dumps(results[scenarios[0]], ensure_ascii=False, indent=1))
    else:
        for name in scenarios:
            print(row(name, results[name]))
            for e in results[name]['errs'][:2]:
                print('    ' + e.splitlines()[0][:200])
    if opt('--json'):
        Path(opt('--json')).write_text(json.dumps(results, ensure_ascii=False, indent=1))

main()
