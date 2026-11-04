def get_history_trend(self, product_url):
        """
        获取京东商品历史价格趋势
        
        Args:
            product_url: 商品URL，如 'http://item.jd.com/65335507710.html'
            
        Returns:
            dict: 历史价格数据
        """
        if not self.is_logged_in:
            raise Exception("请先登录")
        
        # 1. 获取ticket
        ticket = self.get_ticket()
        if not ticket:
            raise Exception("获取ticket失败")
        
        # 2. 准备参数
        params = {
            'method': 'getHistoryTrend',
            'key': product_url
        }
        
        # 3. 生成签名参数
        signed_params = self.get_jd_signature_params(params)
        
        # 4. 构建请求头
        headers = {
            'Authorization': f'Bearer {ticket}',
            'Content-Type': 'application/json',
            'Referer': 'http://tool.manmanbuy.com/HistoryLowest.aspx'
        }
        
        # 5. 发送请求
        api_url = "http://tool.manmanbuy.com/api/api.ashx"
        
        try:
            response = self.session.post(
                url=api_url,
                json=signed_params,
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                raise Exception(f"请求失败，状态码: {response.status_code}, 响应: {response.text}")
                
        except Exception as e:
            raise Exception(f"发送请求异常: {e}")
    