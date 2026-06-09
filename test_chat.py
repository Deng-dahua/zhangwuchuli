"""测试存勤法税智能体 - 多场景"""
import urllib.request
import json
import sys

scenarios = [
    ("公司买二手车，入账和折旧", 
     "公司上月买了一辆二手车用于跑业务，花了8万块钱，发票已收到。怎么做账务处理？折旧年限按几年？残值率怎么定？"),
    ("业务招待费超标处理",
     "我们公司今年业务招待费花了20万，年收入1000万，汇算清缴时怎么处理？要调增多少？"),
    ("小规模纳税人申报",
     "小规模纳税人，这个季度开了25万的普票，要交多少增值税？有什么优惠政策？"),
    ("工资个税计算",
     "员工月薪15000，社保扣1000，专项附加扣除2000，要交多少个税？"),
    ("发票红冲处理",
     "给客户开了一张发票，金额开错了，跨月了怎么办？能红冲吗？"),
]

for title, msg in scenarios:
    print(f"\n{'='*60}")
    print(f"场景：{title}")
    print(f"{'='*60}")
    data = json.dumps({"message": msg, "session_id": f"test-{scenarios.index((title,msg))}"}).encode("utf-8")
    req = urllib.request.Request(
        "http://localhost:8001/api/chat?company_id=1",
        data=data,
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        body = resp.read().decode("utf-8")
        result = json.loads(body)
        reply = result.get("reply", "NO REPLY")
        # 截取前500字符
        if len(reply) > 500:
            print(reply[:500] + "\n... (已截断)")
        else:
            print(reply)
    except Exception as e:
        print(f"❌ Error: {e}")
