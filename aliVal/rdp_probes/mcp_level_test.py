import asyncio, json
from camoufox_reverse_mcp.server import mcp

async def main():
    r = await mcp.call_tool("debugger_status", {})
    print("[status]", str(r)[:200])
    r = await mcp.call_tool("debugger_launch", {"url": "https://tool.manmanbuy.com/m/aliVal.aspx", "port": 6145, "wait_page": 7})
    print("[launch]", str(r)[:300])
    r = await mcp.call_tool("debugger_enable", {"url_substr": "aliVal"})
    print("[enable]", str(r)[:300])
    r = await mcp.call_tool("debugger_sources", {"url_filter": "alicdn"})
    print("[sources]", str(r)[:400])
    r = await mcp.call_tool("debugger_evaluate", {"expression": "location.host"})
    print("[eval]", str(r)[:200])
    r = await mcp.call_tool("debugger_close", {})
    print("[close]", str(r)[:120])

asyncio.run(main())
