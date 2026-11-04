import requests


headers = {
    "Host": "www.zhipin.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": "https://www.zhipin.com",
    "Referer": "https://www.zhipin.com/web/geek/jobs?city=101040100&position=100101&_security_check=1_1788858988862",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-requested-with": "XMLHttpRequest",
    "traceid": "F-e525602c68e1b4cb895f"
}
cookies = {
    "isOHPC": "1",
    "ab_guid": "35a8e8ca-c8ac-492f-9d99-e62958d388d2",
    "__g": "-",
    "__l": "l=%2Fwww.zhipin.com%2Fweb%2Fgeek%2Fjobs%3Fcity%3D101040100%26position%3D100101&r=&g=&s=3&friend_source=0",
    "__zp_stoken__": "67f6gw43Do2EXOwsJYhUJEsKFUH7DgsK1fWVoSV7CsE5OwrFkakFWwr3DisKrf8KLwqnDgnLClMOFwrJvwqJiwrpzw77CscKZUcOvV8KQZsKixJ3Ds8OvxJLCm8O9w4PCkDk1wr%2FEg8ObxYPFgsOIw67ClxvDgsWCVsOBxYPFgsOmwqDDlcK7w5LFgsOmw5fFg8OWxYJKQzk9PTg%2BLj87Mz5%2BPz%2FCuCjDhMO3w4RtwrzDrsOEacOKPj8YHxdgWFgODGALEF4LFQFeDV0QCwhZZ2IUEA8UURdZGlgPNjLCuDoSwrnChgvDhHwawrjCpzbCscKSMsOPUcKbw7RSwr4mIik4PzlGw4bFgjg5Pjk%2FPzgxIDk4REM5OEdEMTA9wr%2FDj8OOXMKiw61Wwr%2FChxFAOz5GPz83woc5P0VKMTk4Q0RDNThAcis4wr7DnsODw5A5OA%3D%3D",
    "__c": "1788858987",
    "__a": "79766645.1788858987..1788858987.2.1.2.2"
}
url = 'https://www.zhipin.com/wapi/zpgeek/search/joblist.json'
data = 'page=1&pageSize=15&city=101040100&position=100101&expectInfo=&query=&multiSubway=&multiBusinessDistrict=&jobType=&salary=&experience=&degree=&industry=&scale=&stage=&scene=1&encryptExpectId='.encode('utf-8', 'surrogateescape')
response = requests.post(url, headers=headers, cookies=cookies, data=data)

print(response.text)
print(response)