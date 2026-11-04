import re
import requests
from config.settings import LOGIN_URL, HISTORY_PAGE


class AuthService:
    """
    负责：
    - 登录
    - 获取 ticket
    """

    def __init__(self, session: requests.Session):
        self.session = session

    def login(self, username: str, password: str) -> bool:
        """
        登录慢慢买
        成功判断标准：
        1. status_code == 200
        2. response.text 包含 success（兜底）
        3. 或返回关键 cookie（主要）
        """

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Origin": "https://home.manmanbuy.com",
            "Referer": "https://home.manmanbuy.com/dist/login.html",
        }

        data = {
            "method": "passLoginSubmit",
            "txtUser": username,
            "txtPass": password,
            "autoLogin": "0",
        }

        resp = self.session.post(
            LOGIN_URL,
            data=data,
            headers=headers,
            timeout=30,
        )

        if resp.status_code != 200:
            return False

        # 1️⃣ cookie 判定（核心）
        cookies = self.session.cookies.get_dict()
        key_cookies = ("60014_mmmuser", "mmbuser_ext")

        for ck in key_cookies:
            if ck in cookies:
                return True

        # 2️⃣ response 文本兜底
        if resp.text and "success" in resp.text.lower():
            return True

        return False

    def get_ticket(self) -> str:
        """
        从 HistoryLowest.aspx 页面获取 ticket
        并执行前 4 位旋转
        """

        resp = self.session.get(HISTORY_PAGE, timeout=30)
        resp.raise_for_status()

        match = re.search(
            r'id="ticket".*?value="([^"]+)"', resp.text
        )

        if not match:
            raise RuntimeError("ticket not found in page")

        ticket = match.group(1)

        if len(ticket) > 4:
            ticket = ticket[-4:] + ticket[:-4]

        return ticket
