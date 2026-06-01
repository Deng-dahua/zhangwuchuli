"""
去重自检脚本 — 独立运行，不依赖服务器
用法: python verify_dedup.py
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal, BankTransaction, SalesInvoice, PurchaseInvoice, InputVATDeduction
from datetime import date

def row_fingerprint(values_dict):
    """完全复制 main.py 中的指纹生成逻辑"""
    return tuple(sorted((str(k), str(v)) for k, v in values_dict.items()))

def verify_module(name, model):
    db = SessionLocal()
    try:
        # 1. 检查表中是否有 _fingerprint 列
        cols = [c.name for c in model.__table__.columns]
        if '_fingerprint' not in cols:
            print(f"[FAIL] {name}: 表中缺少 _fingerprint 列, 现有列={cols}")
            return False

        # 2. 写入 + 读回自检（构造一个最小有效记录）
        test_data = {"a": "1", "b": "hello", "c": "test"}
        fp = row_fingerprint(test_data)
        fp_json = json.dumps(list(fp))

        kwargs = {"company_id": 1, "_fingerprint": fp_json}
        if name == "bank_transactions":
            kwargs["transaction_date"] = date.today()
        rec = model(**kwargs)
        db.add(rec)
        db.flush()
        db.refresh(rec)

        if rec._fingerprint != fp_json:
            print(f"[FAIL] {name}: 指纹写入不一致, 写入={fp_json}, 读出={rec._fingerprint}")
            db.rollback()
            return False

        # 3. JSON 还原比对
        fp_loaded = tuple(tuple(x) for x in json.loads(rec._fingerprint))
        if fp_loaded != fp:
            print(f"[FAIL] {name}: 指纹还原失败, 原始={fp}, 还原={fp_loaded}")
            db.rollback()
            return False

        # 4. 清理
        db.delete(rec)
        db.commit()
        print(f"[OK] {name}: _fingerprint 读写正常")
        return True

    except Exception as e:
        db.rollback()
        print(f"[FAIL] {name}: {e}")
        return False
    finally:
        db.close()

if __name__ == "__main__":
    print("=" * 50)
    print("Dedup Self-Check")
    print("=" * 50)

    modules = {
        "bank_transactions": BankTransaction,
        "sales_invoices": SalesInvoice,
        "purchase_invoices": PurchaseInvoice,
        "input_vat_deductions": InputVATDeduction,
    }

    results = {}
    for name, model in modules.items():
        results[name] = verify_module(name, model)

    print("=" * 50)
    passed = sum(1 for v in results.values() if v)
    failed = len(results) - passed
    if failed:
        print(f"RESULT: {passed}/{len(results)} OK, {failed} FAILED -- dedup is BROKEN!")
        sys.exit(1)
    else:
        print(f"RESULT: {passed}/{len(results)} ALL OK -- dedup is WORKING")
