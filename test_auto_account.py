"""验证：科目不存在时，发票自动建档+记账"""
import urllib.request
import json
from datetime import date

BASE = "http://localhost:8001"

def api(method, path, data=None):
    url = f"{BASE}{path}"
    if data:
        req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"),
            headers={"Content-Type": "application/json; charset=utf-8"},
            method=method)
    else:
        req = urllib.request.Request(url, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        return {"error": e.code, "detail": body}

# ============================
# 1. 创建测试公司
# ============================
print("=== 步骤1: 创建全新测试公司 ===")
r = api("POST", "/api/companies", {
    "name": "自动建科测试公司2",
    "company_type": "一般纳税人",
    "tax_no": "91110108MA01TESTY",
})
if "error" in r:
    print(f"  创建失败: {r}")
    exit(1)
test_cid = r["id"]
print(f"  ✅ 测试公司 ID={test_cid}")

# ============================
# 2. 确认初始科目
# ============================
print("\n=== 步骤2: 确认初始科目状态 ===")
accts = api("GET", f"/api/accounts?company_id={test_cid}")
if isinstance(accts, list):
    count = len(accts)
    print(f"  科目数量: {count}")
    # 列出关键科目是否已存在
    for code in ["1122", "2210", "221001", "221001001", "6001"]:
        found = [a for a in accts if a.get("code") == code]
        status = f"✅ {found[0]['name']}" if found else "❌ 缺失"
        print(f"  {code}: {status}")
else:
    print(f"  ⚠️ {accts}")

# ============================
# 3. 创建发票（触发 auto_generate_single_invoice）
# ============================
print("\n=== 步骤3: 创建发票 → 自动建科目+记账 ===")
today = date.today().isoformat()

inv_data = {
    "company_id": test_cid,
    "invoice_date": today,
    "digital_invoice_no": f"AUTO-TEST-{today.replace('-','')}",
    "seller_name": "演示贸易有限公司",
    "seller_tax_no": "91110108MA01SELLER",
    "buyer_name": "杭州锐创科技有限公司",
    "buyer_tax_no": "91330100MA2K12345X",
    "goods_name": "精密零部件",
    "spec": "P-200",
    "quantity": 200,
    "unit": "件",
    "unit_price": 250,
    "amount": 50000,
    "tax_rate": 13,
    "tax_amount": 6500,
    "total_amount": 56500,
    "status": "正常",
    "is_positive": True,
}

r2 = api("POST", f"/api/sales-invoices?company_id={test_cid}", inv_data)
if "error" not in r2:
    inv_id = r2.get("id")
    print(f"  ✅ 发票创建成功 ID={inv_id}")
    
    # ============================
    # 4. 检查科目是否自动创建
    # ============================
    print("\n=== 步骤4: 验证科目自动创建 ===")
    accts2 = api("GET", f"/api/accounts?company_id={test_cid}")
    if isinstance(accts2, list):
        print(f"  总科目数: {len(accts2)}")
        for code in ["1122", "2210", "221001", "221001001", "6001"]:
            found = [a for a in accts2 if a.get("code") == code]
            name = found[0]["name"] if found else "N/A"
            status = f"✅ {name}" if found else "❌ 缺失!"
            print(f"  {code}: {status}")
        
        # 6xxx 子科目
        subs = [a for a in accts2 if str(a.get("parent_code","")) == "6001"]
        if subs:
            print(f"\n  6001子科目:")
            for s in subs:
                print(f"    {s['code']} - {s['name']}")
    
    # ============================
    # 5. 检查凭证
    # ============================
    print("\n=== 步骤5: 验证凭证生成 ===")
    entries_resp = api("GET", f"/api/journal-entries?company_id={test_cid}")
    if isinstance(entries_resp, dict) and "items" in entries_resp:
        entries = entries_resp["items"]
        voucher_entries = [e for e in entries if e.get("source") == "销项发票"]
        print(f"  销项发票凭证: {len(voucher_entries)} 条")
        
        # 按凭证号分组
        by_vno = {}
        for e in voucher_entries:
            vno = e["voucher_no"]
            if vno not in by_vno:
                by_vno[vno] = []
            by_vno[vno].append(e)
        
        for vno, items in by_vno.items():
            print(f"\n  凭证号 记-{vno}:")
            for e in items:
                dr = e.get("debit_amount") or 0
                cr = e.get("credit_amount") or 0
                acc_name = e.get("account_name") or e.get("account_code")
                print(f"    {e['account_code']} {acc_name} | 借:{dr} 贷:{cr}")
            
            # 检验借贷平衡
            total_dr = sum(e.get("debit_amount") or 0 for e in items)
            total_cr = sum(e.get("credit_amount") or 0 for e in items)
            bal = total_dr - total_cr
            if abs(bal) < 0.01:
                print(f"    ✅ 借贷平衡 (借={total_dr}, 贷={total_cr})")
            else:
                print(f"    ❌ 借贷不平! 差额={bal}")
    else:
        print(f"  凭证查询: {json.dumps(entries_resp, ensure_ascii=False)[:500]}")

    # ============================
    # 6. 验证 account_name 不是裸编码
    # ============================
    print("\n=== 步骤6: 验证 account_name 质量 ===")
    entries_resp2 = api("GET", f"/api/journal-entries?company_id={test_cid}")
    if isinstance(entries_resp2, dict) and "items" in entries_resp2:
        for e in entries_resp2["items"]:
            if e.get("source") == "销项发票":
                ac = e["account_code"]
                an = e.get("account_name", "")
                if an == ac:
                    print(f"  ❌ {ac}: account_name 仍是裸编码!")
                else:
                    print(f"  ✅ {ac} → account_name = {an}")
    print()
else:
    err_detail = r2.get("detail", "")
    if "seller_name" in str(err_detail):
        print(f"  ❌ seller_name NOT NULL 约束 — 测试数据不完整")
    else:
        print(f"  ❌ 创建发票失败: {json.dumps(r2, ensure_ascii=False)[:300]}")

print("=== 测试完成 ===")
