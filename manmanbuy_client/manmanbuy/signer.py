# manmanbuy/signer.py

import hashlib
import time
import urllib.parse

class JDSigner:

    def __init__(self, secret: str):
        self.secret = secret

    @staticmethod
    def encode(value):
        return urllib.parse.quote(str(value), safe='').upper()

    def sign(self, params: dict) -> dict:
        params.setdefault("t", int(time.time() * 1000))

        sign_str = self.secret
        for k in sorted(params):
            if params[k]:
                sign_str += k + self.encode(params[k])
        sign_str += self.secret

        token = hashlib.md5(sign_str.upper().encode()).hexdigest().upper()
        params["token"] = token
        return params
