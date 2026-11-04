#!/usr/bin/env python3
"""Build, sign and install QB Support and UW Support on the iPad from the mini, without the Air (2026-11-04).

The mini's Xcode has no Apple ID. It signs with the Apple Development certificate that USMLE_qbank_web's
app/scripts/mini_signing.py made with the team's App Store Connect API key (U7JT3699P2); the identity lives in
~/Library/Keychains/qbank-build.keychain-db and its id in USMLE_qbank_web/app/.signing/state.json. This script adds
one iOS development profile per bundle id, named "mini <bundle id>" and listing the iPad, and builds with manual
signing so each target picks its own profile through PROVISIONING_PROFILE_SPECIFIER. Apps signed here replace the
ones the Air installed in place (same team and bundle ids), so the App Group data stays.

The iPad must be unlocked and on the mini's network (devicectl finds it by Bonjour, not over Tailscale).
UW Support embeds the Gemini key from USMLE_support/safari/gemini_api_key.txt (gitignored); without that file the
build goes on without translation.

Usage (a Python with PyJWT: /opt/anaconda3/bin/python3):
  scripts/mini_install.py status            read-only: the profiles on the account and this Mac, the iPad's state
  scripts/mini_install.py setup             create the missing profiles and put them where Xcode looks
  scripts/mini_install.py build [qb|uw]     build and sign (both when omitted)
  scripts/mini_install.py install [qb|uw]   build, sign and install on the iPad
"""
import base64, json, plistlib, subprocess, sys, time, urllib.error, urllib.request
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
                b = bundle_id(bundle)
                if not b:
                    sys.exit(f'{bundle} is not registered on the account')
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


if __name__ == '__main__':
    command, keys = sys.argv[1], sys.argv[2:] or list(APPS)
    if command in ('build', 'install'):
        for key in keys:
            {'build': build, 'install': install}[command](key)
    else:
        {'status': status, 'setup': setup}[command]()
