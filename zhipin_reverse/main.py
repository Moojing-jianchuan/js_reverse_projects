# 主脚本：Python(curl_cffi 模拟 Firefox TLS/HTTP2) 发请求 + Node 生成 __zp_stoken__
import subprocess
import random
import urllib.parse
import uuid
import time
from curl_cffi import requests

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0'
JOBLIST = 'https://www.zhipin.com/wapi/zpgeek/search/joblist.json'
BODY = 'page=1&pageSize=15&city=101040100&position=100101&expectInfo=&query=&multiSubway=&multiBusinessDistrict=&jobType=&salary=&experience=&degree=&industry=&scale=&stage=&scene=1&encryptExpectId='
IMPERSONATE = 'firefox144'  # curl_cffi 最接近 Firefox 152 的目标


def gen_trace_id():
    chars = '0123456789abcdef'
    return 'F-' + ''.join(random.choice(chars) for _ in range(20))


def gen_token(seed, raw_ts):
    out = subprocess.check_output(['node', 'gen_token.js', seed, str(raw_ts)], text=True).strip()
    return out


def build_headers():
    sec_ts = str(int(time.time() * 1000))
    return {
        'User-Agent': UA,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-requested-with': 'XMLHttpRequest',
        'traceid': gen_trace_id(),
        'Origin': 'https://www.zhipin.com',
        'Referer': 'https://www.zhipin.com/web/geek/jobs?city=101040100&position=100101&_security_check=1_' + sec_ts,
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
    }


def build_cookies():
    now = int(time.time())
    return {
        'isOHPC': '1',
        'ab_guid': str(uuid.uuid4()),
        '__g': '-',
        '__l': 'l=%2Fwww.zhipin.com%2Fweb%2Fgeek%2Fjobs%3Fcity%3D101040100%26position%3D100101&r=&g=&s=3&friend_source=0',
        '__c': str(now),
        '__a': '%s.%s..%s.2.1.2.2' % (random.randint(10000000, 99999999), now, now),
    }


def main():
    # 1. getSeed
    r1 = requests.post(JOBLIST, headers=build_headers(), data=BODY, cookies=build_cookies(), impersonate=IMPERSONATE)
    j1 = r1.json()
    zp = j1.get('zpData')
    print('[seed] code:', j1.get('code'), 'seed:', (zp or {}).get('seed'))
    if not zp or not zp.get('seed'):
        print('[getSeed] 未拿到 seed:', j1)
        return

    # 2. genToken (Node)
    token = gen_token(zp['seed'], zp['ts'])
    print('[token] len:', len(token))

    # 3. fetchJobs
    cookies = build_cookies()
    cookies['__zp_stoken__'] = urllib.parse.quote(token, safe='')
    r2 = requests.post(JOBLIST, headers=build_headers(), data=BODY, cookies=cookies, impersonate=IMPERSONATE)
    j2 = r2.json()
    print('[jobs] code:', j2.get('code'), 'message:', j2.get('message'))
    if j2.get('zpData') and j2['zpData'].get('jobList'):
        print('[jobs] 成功拿到', len(j2['zpData']['jobList']), '条职位')
    else:
        print('[jobs] 响应:', str(j2)[:400])


if __name__ == '__main__':
    main()
