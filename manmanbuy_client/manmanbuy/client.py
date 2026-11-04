# manmanbuy/client.py

import requests
from config.settings import BASE_HEADERS, JD_SECRET
from .auth import AuthService
from .signer import JDSigner
from .api import ManManBuyAPI

class ManManBuyClient:

    def __init__(self, username, password):
        self.session = requests.Session()
        self.session.headers.update(BASE_HEADERS)

        self.auth = AuthService(self.session)
        self.signer = JDSigner(JD_SECRET)

        self.username = username
        self.password = password
        self.api = None

    def login(self):
        if not self.auth.login(self.username, self.password):
            raise RuntimeError("login failed")

        ticket = self.auth.get_ticket()
        self.api = ManManBuyAPI(self.session, ticket)


    def get_jd_history(self, product_url):
        payload = {
            "method": "getHistoryTrend",
            "key": product_url
        }
        payload = self.signer.sign(payload)
        return self.api.post(payload)
