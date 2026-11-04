import requests
import re

def create_auth():
    """
    获取并处理认证票据ticket
    
    返回处理后的ticket值（如果长度大于4，进行旋转处理）
    """
    try:
        req = requests.get('http://tool.manmanbuy.com/HistoryLowest.aspx')
        if req.status_code == 200:
            history_price_html = req.text
            # 使用正则表达式提取ticket值
            search_ret = re.search(r'id="ticket".+value="(?P<value>.+?)"', history_price_html)
            if not search_ret:
                return ''
            
            ticket = search_ret.group('value')
            
            # 应用旋转逻辑（如果长度大于4）
            if len(ticket) > 4:
                # 取最后4个字符 + 取开头到倒数第4个字符
                ticket = ticket[-4:] + ticket[:-4]
            
            return ticket
        return ''
    except Exception as e:
        print(f"获取ticket失败: {e}")
        return