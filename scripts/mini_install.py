#!/usr/bin/env python3
"""Build, sign and install QB Support and UW Support on the iPad from the mini, without the Air (2026-11-04).

The mini's Xcode has no Apple ID. It signs with the Apple Development certificate that USMLE_qbank_web's
app/scripts/mini_signing.py made with the team's App Store Connect API key (U7JT3699P2); the identity lives in
~/Library/Keychains/qbank-build.keychain-db and its id in USMLE_qbank_web/app/.signing/state.json. This script adds
one iOS development profile per bundle id, named "mini <bundle id>" and listing the iPad, and builds with manual
signing so each target picks its own profile through PROVISIONING_PROFILE_SPECIFIER. Apps signed here replace the
ones the Air installed in place (same team and bundle ids), so the App Group data stays.

Two ways onto the iPad. `link` needs no cable and no shared Wi-Fi: it serves the signed apps to the tailnet only
(never Funnel; UW Support carries the Gemini key) at https://mini.taild5aa65.ts.net:19795/, the iPad opens that page
in Safari and taps Install on each, and the serve is removed once both apps were downloaded. `install` uses devicectl,
which finds the iPad only by Bonjour or a cable, so it works when the iPad is on the mini's own network.
UW Support embeds the Gemini key from USMLE_support/safari/gemini_api_key.txt (gitignored); without that file the
build goes on without translation.

Usage (a Python with PyJWT: /opt/anaconda3/bin/python3):
  scripts/mini_install.py status            read-only: the profiles on the account and this Mac, the iPad's state
  scripts/mini_install.py setup             create the missing profiles and put them where Xcode looks
  scripts/mini_install.py build [qb|uw]     build and sign (both when omitted)
  scripts/mini_install.py link [qb|uw]      build, sign and serve an install page over the tailnet until downloaded
  scripts/mini_install.py install [qb|uw]   build, sign and install on the iPad with devicectl
build, link and install run setup first when a profile is missing on this Mac.
"""
import base64, functools, http.server, json, plistlib, shutil, subprocess, sys, threading, time, urllib.error, urllib.request
from pathlib import Path

import jwt

QB = Path(__file__).resolve().parents[1]
UW = QB.parents[1] / 'USMLE_support'
QBANK_SIGN = QB.parents[1] / 'USMLE_qbank_web/app/.signing'
KEY_ID, ISSUER = 'U7JT3699P2', 'e5983e0b-f660-4b03-929c-1930a2c6b0d5'
KEY_FILE = Path.home() / f'Documents/プログラミング/imada-lab-app/ios/.secrets/AuthKey_{KEY_ID}.p8'
API = 'https://api.appstoreconnect.apple.com'
TEAM = '8WSQBQX6C5'
UDID = '00008103-000A29C83C60C01E'
KEYCHAIN = Path.home() / 'Library/Keychains/qbank-build.keychain-db'
PROFILE_DIRS = ('Library/MobileDevice/Provisioning Profiles', 'Library/Developer/Xcode/UserData/Provisioning Profiles')
TAILSCALE = '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
OTA_PORT = 19795
OTA_BASE = f'https://mini.taild5aa65.ts.net:{OTA_PORT}'
OTA_DIR = QB / 'build/ota'

APPS = {
    'qb': {'name': 'QB Support', 'dir': QB,
           'bundles': ['com.shinyyama.qb-support', 'com.shinyyama.qb-support.extension'],
           'prepare': [['npm', 'run', 'build:ext'], ['./scripts/prepare-safari-extension.sh']],
           'project': 'QB Support/QB Support.xcodeproj', 'scheme': 'QB Support (iOS)', 'derived': 'build/DerivedData-mini'},
    'uw': {'name': 'UW Support', 'dir': UW,
           'bundles': ['com.shinyyama.uwsupport', 'com.shinyyama.uwsupport.extension'],
           'prepare': [['safari/build.sh']],
           'project': 'safari/UW Support/UW Support.xcodeproj', 'scheme': 'UW Support',
           'derived': 'safari/build/DerivedData-mini', 'version': 'safari/build/version.json'},
}


def call(method, path, body=None):
    now = int(time.time())
    token = jwt.encode({'iss': ISSUER, 'iat': now, 'exp': now + 1100, 'aud': 'appstoreconnect-v1'}, KEY_FILE.read_text(),
                       algorithm='ES256', headers={'kid': KEY_ID, 'typ': 'JWT'})
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        sys.exit(f'{method} {path} -> HTTP {e.code}: {e.read().decode()[:600]}')


def run(*args, **kw):
    return subprocess.run(args, check=True, **kw)


def profile_name(bundle):
    return f'mini {bundle}'


def bundle_id(bundle):
    data = call('GET', f'/v1/bundleIds?filter[identifier]={bundle}')['data']
    return next((b for b in data if b['attributes']['identifier'] == bundle), None)


def account_profiles():
    return {p['attributes']['name']: p for p in call('GET', '/v1/profiles?limit=200')['data']}


def local_profile(bundle):
    for d in PROFILE_DIRS:
        for f in (Path.home() / d).glob('*.mobileprovision'):
            info = plistlib.loads(subprocess.run(['security', 'cms', '-D', '-i', str(f)], capture_output=True).stdout)
            if info.get('Name') == profile_name(bundle):
                return f, info
    return None, None


def status():
    profiles = account_profiles()
    for app in APPS.values():
        for bundle in app['bundles']:
            p = profiles.get(profile_name(bundle))
            f, info = local_profile(bundle)
            print(bundle, '| account:', p and (p['attributes']['profileState'], p['attributes']['expirationDate'][:10]),
                  '| this Mac:', f and (info['ExpirationDate'].date(), info['Entitlements'].get('com.apple.security.application-groups')))
    devices = subprocess.run(['xcrun', 'devicectl', 'list', 'devices'], capture_output=True, text=True).stdout
    print(next((line for line in devices.splitlines() if UDID in line), 'iPad not paired with this Mac'))


def setup():
    certificate = json.loads((QBANK_SIGN / 'state.json').read_text())['certificate']
    device = call('GET', f'/v1/devices?filter[udid]={UDID}')['data'][0]
    profiles = account_profiles()
    for app in APPS.values():
        for bundle in app['bundles']:
            p = profiles.get(profile_name(bundle))
            if not p or p['attributes']['profileState'] != 'ACTIVE':
                # QB Support was signed with the team wildcard profile on the Air, so its explicit App IDs did not exist.
                b = bundle_id(bundle) or call('POST', '/v1/bundleIds', {'data': {'type': 'bundleIds', 'attributes': {
                    'identifier': bundle, 'name': bundle.replace('.', ' '), 'platform': 'IOS'}}})['data']
                p = call('POST', '/v1/profiles', {'data': {'type': 'profiles', 'attributes': {
                    'name': profile_name(bundle), 'profileType': 'IOS_APP_DEVELOPMENT'}, 'relationships': {
                    'bundleId': {'data': {'type': 'bundleIds', 'id': b['id']}},
                    'certificates': {'data': [{'type': 'certificates', 'id': certificate}]},
                    'devices': {'data': [{'type': 'devices', 'id': device['id']}]}}}})['data']
                print('created profile', profile_name(bundle), p['attributes']['expirationDate'][:10])
            content = base64.b64decode(p['attributes']['profileContent'])
            for d in PROFILE_DIRS:
                target = Path.home() / d
                target.mkdir(parents=True, exist_ok=True)
                (target / f"{p['attributes']['uuid']}.mobileprovision").write_bytes(content)
    status()


def build(key):
    app = APPS[key]
    if any(local_profile(bundle)[0] is None for bundle in app['bundles']):
        setup()
    for step in app['prepare']:
        run(*step, cwd=app['dir'], stdout=subprocess.DEVNULL)
    run('security', 'unlock-keychain', '-p', (QBANK_SIGN / 'keychain_password').read_text(), str(KEYCHAIN))
    settings = ['CODE_SIGN_STYLE=Manual', 'CODE_SIGN_IDENTITY=Apple Development', f'DEVELOPMENT_TEAM={TEAM}',
                'PROVISIONING_PROFILE_SPECIFIER=mini $(PRODUCT_BUNDLE_IDENTIFIER)', f'OTHER_CODE_SIGN_FLAGS=--keychain {KEYCHAIN}']
    if app.get('version'):
        v = json.loads((app['dir'] / app['version']).read_text())
        settings += [f"MARKETING_VERSION={v['version']}", f"CURRENT_PROJECT_VERSION={v['build']}"]
    derived = app['dir'] / app['derived']
    derived.mkdir(parents=True, exist_ok=True)
    log = derived / 'mini_build.log'
    with open(log, 'w') as out:
        r = subprocess.run(['xcodebuild', '-project', app['project'], '-scheme', app['scheme'], '-configuration', 'Debug',
                            '-destination', 'generic/platform=iOS', '-derivedDataPath', str(derived), *settings, 'build'],
                           cwd=app['dir'], stdout=out, stderr=subprocess.STDOUT)
    if r.returncode:
        sys.exit(f"{app['name']} build failed, see {log}")
    product = derived / f"Build/Products/Debug-iphoneos/{app['name']}.app"
    print(app['name'], 'built:', product)
    return product


def install(key):
    product = build(key)
    for attempt in range(1, 4):
        r = subprocess.run(['xcrun', 'devicectl', 'device', 'install', 'app', '--device', UDID, str(product)],
                           capture_output=True, text=True)
        if r.returncode == 0:
            print(APPS[key]['name'], 'installed on the iPad')
            return
        print(f'install try {attempt} failed:', (r.stderr or r.stdout).strip().splitlines()[-1:])
        time.sleep(8)
    sys.exit(f"{APPS[key]['name']} was not installed; unlock the iPad and put it on the mini's network")


def package(key, product):
    """Zip the signed app into an IPA and write its over-the-air manifest next to it."""
    stage = OTA_DIR / 'stage'
    shutil.rmtree(stage, ignore_errors=True)
    (stage / 'Payload').mkdir(parents=True)
    shutil.copytree(product, stage / 'Payload' / product.name, symlinks=True)
    ipa = OTA_DIR / f'{key}.ipa'
    ipa.unlink(missing_ok=True)
    run('zip', '-qry', str(ipa), 'Payload', cwd=stage)
    shutil.rmtree(stage)
    info = plistlib.loads((product / 'Info.plist').read_bytes())
    assets = [{'kind': 'software-package', 'url': f'{OTA_BASE}/{key}.ipa'}]
    icons = sorted(product.glob('AppIcon*.png'), key=lambda p: p.stat().st_size)
    if icons:
        for size, kind in ((57, 'display-image'), (512, 'full-size-image')):
            run('sips', '-s', 'format', 'png', '-z', str(size), str(size), str(icons[-1]),
                '--out', str(OTA_DIR / f'{key}{size}.png'), stdout=subprocess.DEVNULL)
            assets.append({'kind': kind, 'url': f'{OTA_BASE}/{key}{size}.png'})
    metadata = {'bundle-identifier': info['CFBundleIdentifier'], 'bundle-version': info['CFBundleShortVersionString'],
                'kind': 'software', 'title': APPS[key]['name']}
    (OTA_DIR / f'{key}.plist').write_bytes(plistlib.dumps({'items': [{'assets': assets, 'metadata': metadata}]}))
    manifests = list(product.glob('PlugIns/*.appex/manifest.json'))
    version = json.loads(manifests[0].read_text())['version'] if manifests else info['CFBundleShortVersionString']
    return f"{APPS[key]['name']} {version}"


def serve(labels, port=OTA_PORT, timeout=3600):
    """Serve OTA_DIR to the tailnet until every IPA was downloaded once, then remove the serve."""
    buttons = ''.join(f'<a class="btn" href="itms-services://?action=download-manifest&amp;url={OTA_BASE}/{key}.plist">'
                      f'{n}. {label} を入れる</a>\n' for n, (key, label) in enumerate(labels.items(), 1))
    (OTA_DIR / 'index.html').write_text(
        '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1"><title>iPad インストール</title>'
        '<style>body{font-family:-apple-system,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.6}'
        'a.btn{display:block;margin:16px 0;padding:18px;border-radius:12px;background:#0a66d9;color:#fff;'
        'text-decoration:none;font-size:20px;text-align:center}</style></head><body><h1>iPad に入れる</h1>'
        '<p>上から順に押し、出てきた確認で「インストール」を押してください。今入っているアプリの上書きなので、設定とデータは残ります。</p>\n'
        + buttons + '</body></html>\n')
    pending = {f'/{key}.ipa' for key in labels}

    class Handler(http.server.SimpleHTTPRequestHandler):
        extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.plist': 'text/xml',
                          '.ipa': 'application/octet-stream', '.html': 'text/html; charset=utf-8'}

        def log_request(self, code='-', size='-'):
            print(time.strftime('%H:%M:%S'), self.command, self.path, code, flush=True)

        def do_GET(self):
            super().do_GET()  # raises if the connection drops mid-file, so only whole downloads count
            if self.path in pending:
                print(time.strftime('%H:%M:%S'), 'sent whole', self.path, flush=True)
                pending.discard(self.path)

    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=str(OTA_DIR)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    run(TAILSCALE, 'serve', '--bg', f'--https={port}', f'http://127.0.0.1:{port}', stdout=subprocess.DEVNULL)
    print(f'open on the iPad: {OTA_BASE}/ (tailnet only)', flush=True)
    try:
        deadline = time.time() + timeout
        while pending and time.time() < deadline:
            time.sleep(5)
        time.sleep(30 if not pending else 0)
        print('all apps downloaded' if not pending else f'stopped waiting; not downloaded: {sorted(pending)}')
    finally:
        subprocess.run([TAILSCALE, 'serve', f'--https={port}', 'off'], stdout=subprocess.DEVNULL)
        server.shutdown()


def link(keys):
    shutil.rmtree(OTA_DIR, ignore_errors=True)
    OTA_DIR.mkdir(parents=True)
    labels = {key: package(key, build(key)) for key in keys}
    serve(labels)


if __name__ == '__main__':
    command, keys = sys.argv[1], sys.argv[2:] or list(APPS)
    if command == 'link':
        link(keys)
    elif command in ('build', 'install'):
        for key in keys:
            {'build': build, 'install': install}[command](key)
    else:
        {'status': status, 'setup': setup}[command]()
