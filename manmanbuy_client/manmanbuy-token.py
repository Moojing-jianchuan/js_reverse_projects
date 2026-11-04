import time
import hashlib
import urllib.parse

def encode_uri_component_upper(value):
    """
    模拟JavaScript的encodeURIComponent函数，输出大写的百分比编码
    """
    encoded = urllib.parse.quote(str(value), safe='')
    # 将十六进制字符转换为大写
    return encoded.replace('%3a', '%3A').replace('%2f', '%2F').replace('%2e', '%2E')

def get_jd_signature_params(params, secret="c5c3f201a8e8fc634d37a766a0299218"):
    """
    生成京东历史趋势请求的签名参数
    
    Args:
        params: dict, 原始参数字典，至少包含method和key
        secret: str, 签名密钥
    
    Returns:
        dict: 添加了时间戳和token签名的完整参数
    
    签名流程:
    1. 确保包含时间戳参数 't'（毫秒级）
    2. 按字母顺序排序参数键
    3. 构建签名字符串: secret + 排序后的键值对 + secret
    4. 将整个签名字符串转换为大写
    5. 计算MD5哈希并转换为大写作为token
    """
    # 添加时间戳
    if 't' not in params:
        params['t'] = int(time.time() * 1000)
    
    # 对参数键进行字母顺序排序
    sorted_keys = sorted(params.keys())
    
    # 构建签名字符串: secret + 参数键值对 + secret
    sign_str = secret
    
    # 按照排序后的键遍历参数
    for key in sorted_keys:
        value = params[key]
        if value is not None and value != '':
            # 键不编码，值进行URL编码（使用大写的百分比编码）
            encoded_value = encode_uri_component_upper(value)
            sign_str += key + encoded_value
    
    # 添加第二个secret
    sign_str += secret
    
    # 将整个字符串转换为大写
    sign_str = sign_str.upper()
    
    # 计算MD5并转换为大写
    token = hashlib.md5(sign_str.encode('utf-8')).hexdigest().upper()
    
    # 添加token到参数
    params['token'] = token
    
    return params