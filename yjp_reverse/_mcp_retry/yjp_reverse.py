import requests
import json
import time
import hashlib
import hmac
import random

# ================== 工具函数 ==================

def sha1_hex(s: str):
    return hashlib.sha1(s.encode()).hexdigest()

def hmac_sha1(key: str, data: str):
    return hmac.new(key.encode(), data.encode(), hashlib.sha1).hexdigest()

def gen_nonce():
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    arr = [random.choice(chars[:16]) for _ in range(36)]
    arr[14] = '4'
    arr[19] = chars[(int(arr[19], 36) & 3) | 8]
    for i in [8, 13, 18, 23]:
        arr[i] = '_'
    return ''.join(arr)

def gen_sign(method, url_path, data, token=""):
    nonce = gen_nonce()
    timestamp = str(int(time.time()))

    # 关键：必须和前端一致（无空格）
    body = json.dumps(data, separators=(',', ':'))
    body_hash = sha1_hex(body)

    # g 拼接
    g = "\n".join([
        method.upper(),
        url_path,
        timestamp,
        nonce,
        body_hash
    ])

    key = token if token else timestamp
    sign = hmac_sha1(key, g)

    return {
        "x-sign": sign,
        "x-sign-nonce": nonce,
        "x-sign-timestamp": timestamp,
        "x-sign-version": "2.0",
        "x-sign-algorithm": "HMAC_SHA_1",
        "token": token
    }

# ================== 请求参数 ==================

url = "https://www.yijiupi.com/v58/Product/List"
url_path = "/v58/Product/List"   # ⚠️ 注意这里必须是 path

data = {
    "currentPage": 3,
    "data": {
        "searchModes": [2],
        "sort": 0,
        "currentPage": 3,
        "pageSize": 25,
        "filterSpecialArea": False,
        "searchSource": 1,
        "searchKeyNotCorrect": False,
        "brandId": ""
    },
    "pageSize": 25,
    "cityId": 402,
    "countyRegionId": "320116",
    "userClassId": 1,
    "userDisplayClass": 0,
    "addressId": "",
    "deviceType": 3
}

token = ""  # 如果你后面抓到 TOKEN，这里填

# ================== 生成签名 ==================

sign_headers = gen_sign("POST", url_path, data, token)

# ================== headers ==================

headers = {
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json",
    "origin": "https://www.yijiupi.com",
    "referer": "https://www.yijiupi.com/",
    "user-agent": "Mozilla/5.0",
    "appcode": "ShoppingMallPC",
    "uuid": "2fc72840656cbc904de409129694ffab",

    # 👇 动态签名
    **sign_headers
}

# ================== 发送请求 ==================

body = json.dumps(data, separators=(',', ':'))

response = requests.post(url, headers=headers, data=body)

print(response.status_code)
print(response.text)