import requests
def test_login(username, password, use_proxy=False):
    """
    测试慢慢买登录功能
    
    Args:
        username: 用户名/手机号
        password: 密码
        use_proxy: 是否使用代理
        
    Returns:
        tuple: (是否成功, 响应文本, cookies字典)
    """
    # 创建会话
    session = requests.Session()
    
    # 设置请求头
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://home.manmanbuy.com',
        'Referer': 'https://home.manmanbuy.com/dist/login.html',
    }
    
    
    
    # 登录接口URL
    login_url = "https://home.manmanbuy.com/reg.ashx"
    
    # 登录参数
    login_data = {
        'method': 'passLoginSubmit',
        'txtUser': username,
        'txtPass': password,
        'autoLogin': '0'
    }
    
    try:
        print(f"正在登录账号: {username}")
        print(f"登录URL: {login_url}")
        print(f"登录参数: {login_data}")
        
        # 发送登录请求
        response = session.post(
            login_url,
            data=login_data,
            headers=headers,
            timeout=30
        )
        
        print(f"\n=== 响应状态码: {response.status_code} ===")
        print(f"响应内容: {response.text}")
        print(f"响应头: {dict(response.headers)}")
        
        # 获取cookies
        cookies = session.cookies.get_dict()
        print(f"\n=== Cookies ===")
        for key, value in cookies.items():
            print(f"  {key}: {value}")
        
        # 检查登录是否成功的条件
        success = False
        
        # 条件1: 状态码为200
        if response.status_code == 200:
            # 条件2: 响应文本包含success（不区分大小写）
            if 'success' in response.text.lower():
                success = True
                print("✅ 登录成功 (根据响应文本判断)")
            else:
                print("⚠️  状态码200但响应文本不包含'success'")
            
            # 条件3: 检查关键cookies是否存在
            key_cookies = ['60014_mmmuser', 'mmbuser_ext']
            found_cookies = []
            
            for cookie_key in key_cookies:
                if cookie_key in cookies:
                    found_cookies.append(cookie_key)
                    print(f"✅ 找到关键cookie: {cookie_key}")
                else:
                    print(f"❌ 未找到关键cookie: {cookie_key}")
            
            if len(found_cookies) >= 1:
                success = True
                print("✅ 登录成功 (根据关键cookies判断)")
        else:
            print(f"❌ 登录失败，状态码不是200")
        
        return success, response.text, cookies
        
    except Exception as e:
        print(f"\n❌ 登录请求异常: {e}")
        return False, str(e), {}
def quick_test():
    """快速测试登录"""
    USERNAME = "15711365012"
    PASSWORD = "Moojing15711365012"
    
    print("快速登录测试...")
    success, response, cookies = test_login(USERNAME, PASSWORD)
    
    if success:
        print("\n✅ 登录成功!")
        # 显示重要的cookies
        important_cookies = {k: v for k, v in cookies.items() if 'mmmuser' in k or 'mmbuser' in k}
        if important_cookies:
            print("重要Cookies:")
            for k, v in important_cookies.items():
                print(f"  {k}: {v[:50]}..." if len(v) > 50 else f"  {k}: {v}")
    else:
        print("\n❌ 登录失败!")
        print(f"响应: {response}")


if __name__ == "__main__":
    # 如果你想快速测试，取消下面的注释
    quick_test()