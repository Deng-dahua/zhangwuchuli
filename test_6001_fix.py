#!/usr/bin/env python3
"""
数据库级综合验证：发票记账 → 自动创建会计科目 → 完整凭证
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import (
    SessionLocal, engine, Base, Company, Account, SalesInvoice, JournalEntry,
    auto_generate_journals, auto_generate_single_invoice,
)
from datetime import datetime

db = SessionLocal()

print("=" * 60)
print("综合测试：发票自动记账 → 自动创建会计科目")
print("=" * 60)

# 1. 创建测试公司
print("\n--- 1. 创建测试公司 ---")
company = Company(
    name="测试-科目自动创建",
    uscc="91110000MA11111111",
    legal_representative="张三",
    registered_capital=1000000,
    address="北京",
)
db.add(company)
db.flush()
print(f"✅ 公司ID={company.id}")

# 2. 确认科目为空
print("\n--- 2. 确认科目为空 ---")
existing = db.query(Account).filter(Account.company_id == company.id).count()
print(f"   科目数={existing}")
if existing == 0:
    print(f"   ✅ 无科目，可测试纯自动创建")

# 3. 创建销项发票
print("\n--- 3. 创建销项发票 ---")
inv = SalesInvoice(
    company_id=company.id,
    invoice_code="1234567890",
    invoice_no="12345678",
    invoice_date=datetime(2025, 6, 1),
    invoice_category="增值税专用发票",
    seller_name="测试贸易有限公司",
    seller_tax_no="91110000MA12345678",
    buyer_name="东城科技公司",
    buyer_tax_no="91110000MA87654321",
    goods_name="高端服务器",
    spec="SR-800V",
    unit="台",
    quantity=5,
    unit_price=20000,
    amount=100000,
    tax_rate=13,
    tax_amount=13000,
    total_amount=113000,
    status="正常",
    is_positive=True,
)
db.add(inv)
db.flush()
print(f"✅ 发票创建成功 ID={inv.id}")

# 4. 调用自动生成凭证
print("\n--- 4. 自动生成凭证 ---")
auto_generate_single_invoice(db, inv)
db.flush()

# 5. 检查自动创建的科目
print("\n--- 5. 检查自动创建的科目 ---")
accounts = db.query(Account).filter(Account.company_id == company.id).order_by(Account.code).all()
print(f"   自动创建了 {len(accounts)} 个科目：")
for acc in accounts:
    code = acc.code
    name = acc.name
    expected_len = 2 * (acc.level or 1) + 2
    ok = "✅" if len(code) == expected_len else "❌"
    print(f"   {ok} {code} ({len(code)}位) = {name} | level={acc.level}")

# 6. 验证6001子科目编码规则
print("\n--- 6. 验证6001子科目编码规则 ---")
for acc in accounts:
    code = acc.code
    if code.startswith("6001") and code != "6001":
        if len(code) == 6:
            seq = int(code[4:6])
            print(f"   ✅ {code} → 序号={seq} (正确：6位)")
        else:
            print(f"   ❌ {code} → 长度={len(code)} (异常！)")

# 7. 检查生成的凭证
print("\n--- 7. 检查生成的凭证 ---")
entries = db.query(JournalEntry).filter(
    JournalEntry.company_id == company.id
).order_by(JournalEntry.voucher_no).all()
print(f"   凭证条目数={len(entries)}")

from collections import defaultdict
by_voucher = defaultdict(list)
for e in entries:
    by_voucher[e.voucher_no].append(e)

all_balanced = True
for vno in sorted(by_voucher.keys()):
    lines = by_voucher[vno]
    total_debit = sum(l.debit_amount for l in lines)
    total_credit = sum(l.credit_amount for l in lines)
    balanced = abs(total_debit - total_credit) < 0.01
    status = "✅ 平衡" if balanced else "❌ 不平衡!"
    if not balanced:
        all_balanced = False
    
    print(f"\n   凭证记-{vno} ({len(lines)}条分录) 借={total_debit:.2f} 贷={total_credit:.2f} {status}")
    for l in lines:
        code = l.account_code
        name = l.account_name
        # 检查account_name完整性
        name_ok = "✅" if name and name != code and len(name) > len(code) else "⚠️ 名称不完整"
        print(f"     {name_ok} {code} {name}: 借={l.debit_amount} 贷={l.credit_amount}")

# 8. 最终结论
print("\n" + "=" * 60)
print("最终结论：")
all_codes_ok = True
for acc in accounts:
    code = acc.code
    if code.startswith("6001") and code != "6001":
        if len(code) != 6:
            print(f"   ❌ 科目编码异常: {code}")
            all_codes_ok = False

if all_codes_ok and all_balanced:
    print("   ✅ 所有检查通过：科目自动创建、编码规则正确、借贷平衡")
else:
    if not all_codes_ok:
        print("   ❌ 科目编码检查未通过")
    if not all_balanced:
        print("   ❌ 借贷平衡检查未通过")

# 清理
print(f"\n--- 清理测试数据 ---")
# 删除凭证
db.query(JournalEntry).filter(JournalEntry.company_id == company.id).delete()
# 删除发票
db.query(SalesInvoice).filter(SalesInvoice.company_id == company.id).delete()
# 删除科目
db.query(Account).filter(Account.company_id == company.id).delete()
# 删除公司
db.delete(company)
db.commit()
print("✅ 测试数据已清理")
db.close()
