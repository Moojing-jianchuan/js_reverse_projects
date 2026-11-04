import requests

def login(self, username=None, password=None):
        """
        登录慢慢买网站
        
        Args:
            username: 用户名/手机号，如果不提供则使用初始化时的
            password: 密码，如果不提供则使用初始化时的
            
        Returns:
            bool: 登录是否成功
        """
        if username:
            self.username = username
        if password:
            self.password = password
            
        if not self.username or not self.password:
            raise ValueError("用户名和密码不能为空")
        
        # 登录接口URL
        login_url = "https://home.manmanbuy.com/reg.ashx"
        
        # 登录参数
        login_data = {
            'method': 'passLoginSubmit',
            'txtUser': self.username,
            'txtPass': self.password,
            'autoLogin': '0'
        }
        
        try:
            # 发送登录请求
            response = self.session.post(
                login_url,
                data=login_data,
                timeout=30
            )
            
            if response.status_code == 200:
                # 检查响应内容，确认登录成功
                if response.text and "success" in response.text.lower():
                    self.is_logged_in = True
                    print("登录成功！")
                    # 保存cookie
                    self.cookies = self.session.cookies.get_dict()
                    return True
                else:
                    print(f"登录失败，响应内容: {response.text}")
                    return False
            else:
                print(f"登录失败，状态码: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"登录请求异常: {e}")
            return False