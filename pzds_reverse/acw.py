import argparse
import requests

from ssxmod_gen import generate_ssxmod_cookies


def get_page_cookies(ssxmod_itna: str, ssxmod_itna2: str, timeout: int = 30) -> dict:
    """访问页面获取所有 cookie（acw_tc + _c_WBKFRo + 追踪 cookie）。"""
    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Pragma": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        "sec-ch-ua": "\"Chromium\";v=\"140\", \"Not=A?Brand\";v=\"24\", \"Google Chrome\";v=\"140\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
    }
    req_cookies = {
        "ssxmod_itna": ssxmod_itna,
        "ssxmod_itna2": ssxmod_itna2,
    }
    url = "https://www.pzds.com/goodsList/7/6"
    response = requests.get(url, headers=headers, cookies=req_cookies, timeout=timeout)
    return dict(response.cookies)


def get_acw_tc(ssxmod_itna: str, ssxmod_itna2: str, timeout: int = 30) -> str:
    """兼容旧接口。"""
    return get_page_cookies(ssxmod_itna, ssxmod_itna2, timeout).get("acw_tc", "")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ssxmod_itna")
    parser.add_argument("--ssxmod_itna2")
    args = parser.parse_args()

    ssxmod_itna = args.ssxmod_itna
    ssxmod_itna2 = args.ssxmod_itna2
    if not ssxmod_itna or not ssxmod_itna2:
        ssxmod_itna, ssxmod_itna2 = generate_ssxmod_cookies()

    acw_tc = get_acw_tc(ssxmod_itna, ssxmod_itna2, timeout=30)

    # 按用户要求只输出这个格式
    if acw_tc:
        print(f"acw_tc={acw_tc};")
    else:
        print("acw_tc=;")


if __name__ == "__main__":
    main()