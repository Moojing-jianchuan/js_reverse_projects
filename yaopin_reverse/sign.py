import time
import hashlib
from urllib.parse import quote

APP_SECRET = "nmpasecret2020"


def js_encode_uri_component(s: str) -> str:
    # 对应 JS encodeURIComponent，并手动保持 ! ( ) ~ 被编码
    return (
        quote(s, safe="-_.*'")
        .replace("!", "%21")
        .replace("(", "%28")
        .replace(")", "%29")
        .replace("~", "%7E")
    )


def json_md5_to_str(param_str: str) -> str:
    raw = param_str + "&" + APP_SECRET
    encoded = js_encode_uri_component(raw)
    return hashlib.md5(encoded.encode("utf-8")).hexdigest()


def make_sign(
    item_id: str,
    search_value: str,
    page_num: int = 3,
    page_size: int = 10,
    is_senior: str = "N",
) -> tuple[str, str, str]:
    timestamp = int(time.time() * 1000)

    param_str = (
        f"isSenior={is_senior}"
        f"&itemId={item_id}"
        f"&pageNum={page_num}"
        f"&pageSize={page_size}"
        f"&searchValue={search_value}"
        f"&timestamp={timestamp}"
    )

    raw = param_str + "&" + APP_SECRET
    encoded = js_encode_uri_component(raw)
    sign = hashlib.md5(encoded.encode("utf-8")).hexdigest()

    return str(timestamp), encoded, sign
