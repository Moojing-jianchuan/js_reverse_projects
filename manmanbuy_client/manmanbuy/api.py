# manmanbuy/api.py

from config.settings import API_URL

class ManManBuyAPI:

    def __init__(self, session, ticket):
        self.session = session
        self.ticket = ticket

    def post(self, payload: dict):
        headers = {
            # ⚠️ 不是 Bearer
            "Authorization": f"BasicAuth {self.ticket}",
            "Accept": "*/*",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Referer": "http://tool.manmanbuy.com/HistoryLowest.aspx",
        }

        # ⚠️ 必须是 form
        resp = self.session.post(
            API_URL,
            data=payload,
            headers=headers,
            timeout=30,
        )

        # 调试期建议先不 raise
        if resp.status_code != 200:
            raise RuntimeError(
                f"API error {resp.status_code}: {resp.text}"
            )

        return resp.json()
