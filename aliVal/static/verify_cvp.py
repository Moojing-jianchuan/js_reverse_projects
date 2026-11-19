"""校验 cvp_capture.json 三者是否同轮配对：
   enc = base64decode(cvp_blob)[3:]
   T   = deflate_b64
   keystream = enc XOR T[3:]      （长度应相等）
另外顺带看 device_config 的 AES 解密（固定 key）能否还原出东西。
"""
import base64
import json
import sys

P = r"D:\ds_work\js_reverse_projects\aliVal\config\cvp_capture.json"


def main():
    d = json.load(open(P, encoding="utf-8"))
    cvp = d.get("captchaVerifyParam", "")
    blob = d.get("cvp_blob", "")
    T = d.get("deflate_b64", "")
    dc = d.get("device_config", "")

    print("cvp len      :", len(cvp))
    print("cvp envelope :", list(json.loads(cvp).keys()) if cvp.startswith("{") else "not-json")
    print("cvp_blob len :", len(blob), "prefix:", base64.b64decode(blob)[:3].hex() if blob else "-")
    print("deflate len  :", len(T), "head:", T[:12])
    print("device len   :", len(dc), "head:", dc[:16])
    print("certify_id   :", d.get("certify_id"))
    print("source       :", d.get("source"))

    if not (blob and T):
        print("[skip] 缺 blob 或 T")
        return
    enc = base64.b64decode(blob + "=" * (-len(blob) % 4))[3:]
    tb = T.encode("latin-1", "ignore")
    print("\nenc bytes    :", len(enc))
    print("T chars      :", len(tb))
    print("|enc| vs |T|-3:", len(enc), len(tb) - 3, "EQUAL" if len(enc) == len(tb) - 3 else "DIFF")

    n = min(len(enc), len(tb) - 3)
    ks = bytes(enc[i] ^ tb[i + 3] for i in range(n))
    print("keystream[0:48] :", ks[:48].hex())
    uniq = len(set(ks))
    print("keystream 唯一值:", uniq, "/", n)
    z = sum(1 for b in ks if b == 0)
    print("零字节占比      : %.3f" % (z / n if n else 0))
    # 16 字节周期性检查
    period = 0
    for p in (8, 16, 20, 32):
        if n > p and all(ks[i] == ks[i + p] for i in range(n - p)):
            period = p
            break
    print("检测到周期      :", period or "无")
    head = " ".join("%02x" % b for b in ks[:16])
    print("前 16 字节      :", head)


if __name__ == "__main__":
    sys.exit(main())
