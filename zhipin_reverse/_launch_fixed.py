import json, sys
from browserforge.fingerprints import FingerprintGenerator, Fingerprint, Screen
from camoufox.server import launch_server

fp_path = './config/fingerprint.json'
try:
    fp = Fingerprint.loads(open(fp_path, encoding='utf-8').read())
    print('[fingerprint] 复用已保存指纹', flush=True)
except Exception:
    screen = Screen(min_width=1366, max_width=1366, min_height=768, max_height=768)
    fp = FingerprintGenerator().generate(screen=screen)
    open(fp_path, 'w', encoding='utf-8').write(fp.dumps())
    print('[fingerprint] 生成并保存固定指纹', flush=True)

print('[fingerprint] videoCard=', json.dumps(fp.videoCard, ensure_ascii=False) if hasattr(fp, 'videoCard') else 'n/a', flush=True)

launch_server(fingerprint=fp, headless=False, os='windows', locale='zh-CN')
