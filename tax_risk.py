"""
涉税风险分析报告模块 V2
综合分析评估 23 个维度：
账务数据 / 发票合规 / 发票深度 / 成本结构 / 财税票比对 / 配比弹性 /
隐匿虚增 / 税负水平 / 城建税 / 房产税 / 个人所得税 / 印花税 /
纳税调整 / 收入时点 / 政策执行 / 资金往来 / 薪酬合规 /
客户穿透 / 供应商穿透 / 财务健康 / 企业信用 / 行业专项 / 良好实践
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case, extract, and_, or_
from datetime import date, timedelta
from typing import Optional, List
import json

from database import get_db, Company, Account, JournalEntry
from database import SalesInvoice, PurchaseInvoice, BookkeepingInvoice
from database import VATDeclaration, InputVATDeduction, BankTransaction
from database import SalaryRecord, SocialSecurityDetail, HousingFundDetail
from database import CulturalConstructionFeeDeclaration
from database import FixedAsset, IntangibleAsset
from database import Customer, Supplier, Employee, Contract, Payment
from database import SocialSecurityDeclaration, HousingFundDeclaration

router = APIRouter(prefix="/api/tax-risk", tags=["涉税风险分析"])

# ── 工具函数 ──

def _safe_float(val, default=0.0):
    if val is None: return default
    return float(val)

def _risk_level(score: int) -> str:
    if score >= 7: return "高风险"
    elif score >= 4: return "中风险"
    elif score >= 1: return "低风险"
    return "良好"

def _risk_color(score: int) -> str:
    if score >= 7: return "#dc2626"
    elif score >= 4: return "#f59e0b"
    elif score >= 1: return "#3b82f6"
    return "#10b981"

def _get_period_range(db: Session, company_id: int):
    min_entry = db.query(func.min(JournalEntry.entry_date)).filter(
        JournalEntry.company_id == company_id).scalar()
    max_entry = db.query(func.max(JournalEntry.entry_date)).filter(
        JournalEntry.company_id == company_id).scalar()
    if min_entry and max_entry: return str(min_entry), str(max_entry)
    return None, None

def _vat_payable_sum(db: Session, company_id: int, ps: str = None, pe: str = None) -> float:
    """汇总增值税应纳税额（从 form_main JSON 中提取）"""
    q = db.query(VATDeclaration).filter(VATDeclaration.company_id == company_id)
    if ps: q = q.filter(VATDeclaration.period >= ps)
    if pe: q = q.filter(VATDeclaration.period <= pe)
    total = 0.0
    for v in q.all():
        if v.form_main:
            fm = v.form_main if isinstance(v.form_main, dict) else json.loads(v.form_main)
            total += _safe_float(fm.get("vat_payable"))
    return total

def _get_account_balance(db: Session, company_id: int, account_code: str, period: str = None) -> float:
    q = db.query(
        func.coalesce(func.sum(JournalEntry.debit_amount), 0),
        func.coalesce(func.sum(JournalEntry.credit_amount), 0)
    ).filter(JournalEntry.company_id == company_id, JournalEntry.account_code.like(account_code + '%'))
    if period: q = q.filter(JournalEntry.period <= period)
    debit, credit = q.first()
    return _safe_float(debit) - _safe_float(credit)

def _get_account_sum(db: Session, company_id: int, account_code: str, ps: str, pe: str, field: str = "debit") -> float:
    """期间内科目发生额合计"""
    col = JournalEntry.debit_amount if field == "debit" else JournalEntry.credit_amount
    return _safe_float(db.query(func.sum(col)).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.account_code.like(account_code + '%'),
        JournalEntry.period >= ps, JournalEntry.period <= pe
    ).scalar())

def _get_periods_between(ps: str, pe: str) -> list:
    """生成两个 YYYY-MM 之间的所有月份"""
    result = []
    y1, m1 = int(ps[:4]), int(ps[5:7])
    y2, m2 = int(pe[:4]), int(pe[5:7])
    y, m = y1, m1
    while True:
        result.append(f"{y}-{m:02d}")
        if y == y2 and m == m2: break
        m += 1
        if m > 12: m = 1; y += 1
    return result

def _monthly_account_balance(db: Session, company_id: int, account_code: str, ps: str, pe: str) -> dict:
    """按月汇总科目借方/贷方发生额"""
    rows = db.query(
        JournalEntry.period,
        func.coalesce(func.sum(JournalEntry.debit_amount), 0),
        func.coalesce(func.sum(JournalEntry.credit_amount), 0)
    ).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.account_code.like(account_code + '%'),
        JournalEntry.period >= ps, JournalEntry.period <= pe
    ).group_by(JournalEntry.period).order_by(JournalEntry.period).all()
    return {r[0]: {"debit": _safe_float(r[1]), "credit": _safe_float(r[2])} for r in rows}


# ── 风险分析核心 ──

@router.get("/report")
def get_tax_risk_report(
    company_id: int = Query(...),
    period: Optional[str] = None,
    db: Session = Depends(get_db)
):
    results = []
    if period:
        period_start = period_end = period
    else:
        latest = db.query(func.max(VATDeclaration.period)).filter(
            VATDeclaration.company_id == company_id).scalar()
        if latest:
            period_end = latest
            y, m = int(latest[:4]), int(latest[5:7])
            m -= 5
            if m <= 0: m += 12; y -= 1
            period_start = f"{y}-{m:02d}"
        else:
            period_start = period_end = date.today().strftime("%Y-%m")

    # ── 23 个分析维度 ──
    _analyze_accounting(db, company_id, period_start, period_end, results)
    _analyze_invoice_compliance(db, company_id, period_start, period_end, results)
    _analyze_invoice_depth(db, company_id, period_start, period_end, results)
    _analyze_cost_structure(db, company_id, period_start, period_end, results)
    _analyze_financial_tax_invoice_cross(db, company_id, period_start, period_end, results)
    _analyze_ratio_elasticity(db, company_id, period_start, period_end, results)
    _analyze_hidden_inflated(db, company_id, period_start, period_end, results)
    _analyze_tax_burden(db, company_id, period_start, period_end, results)
    _analyze_urban_construction_tax(db, company_id, period_start, period_end, results)
    _analyze_property_tax(db, company_id, period_start, period_end, results)
    _analyze_iit(db, company_id, period_start, period_end, results)
    _analyze_stamp_tax(db, company_id, period_start, period_end, results)
    _analyze_tax_adjustment(db, company_id, period_start, period_end, results)
    _analyze_revenue_timing(db, company_id, period_start, period_end, results)
    _analyze_policy_execution(db, company_id, period_start, period_end, results)
    _analyze_capital_risks(db, company_id, period_start, period_end, results)
    _analyze_salary_compliance(db, company_id, period_start, period_end, results)
    _analyze_customer_penetration(db, company_id, period_start, period_end, results)
    _analyze_supplier_penetration(db, company_id, period_start, period_end, results)
    _analyze_financial_health(db, company_id, period_start, period_end, results)
    _analyze_business_credit(db, company_id, period_start, period_end, results)
    _analyze_industry_specific(db, company_id, period_start, period_end, results)
    _analyze_good_practices(db, company_id, period_start, period_end, results)

    results.sort(key=lambda x: (x.get("risk_score", 0)), reverse=True)

    high_count = sum(1 for r in results if r.get("risk_level") == "高风险")
    mid_count = sum(1 for r in results if r.get("risk_level") == "中风险")
    low_count = sum(1 for r in results if r.get("risk_level") == "低风险")
    good_count = sum(1 for r in results if r.get("risk_level") == "良好")
    total_score = sum(r.get("risk_score", 0) for r in results)

    # 计算主要税负率和财务指标
    revenue_debit = _get_account_sum(db, company_id, "6001", period_start, period_end, "credit")
    cost_debit = _get_account_sum(db, company_id, "6401", period_start, period_end, "debit")
    vat_total = _vat_payable_sum(db, company_id, period_start, period_end)

    return {
        "company_id": company_id,
        "period_start": period_start, "period_end": period_end,
        "summary": {
            "total_items": len(results),
            "high_risk_count": high_count, "mid_risk_count": mid_count,
            "low_risk_count": low_count, "good_count": good_count,
            "overall_risk_score": total_score,
            "overall_risk_level": (
                "高风险" if total_score >= 60 else
                ("中风险" if total_score >= 30 else
                 ("低风险" if total_score >= 10 else "良好"))
            )
        },
        "metrics": {
            "revenue": round(revenue_debit, 2),
            "cost": round(cost_debit, 2),
            "gross_margin_pct": round((revenue_debit - cost_debit) / revenue_debit * 100, 2) if revenue_debit > 0 else 0,
            "vat_payable": round(vat_total, 2),
        },
        "results": results
    }


# ═══════════════════════════════════════════════════════════════
#  一、账务数据风险
# ═══════════════════════════════════════════════════════════════

def _analyze_accounting(db, company_id, ps, pe, results):
    """借贷平衡、凭证数量、折旧摊销"""
    entries = db.query(
        JournalEntry.period,
        func.sum(JournalEntry.debit_amount).label("debit"),
        func.sum(JournalEntry.credit_amount).label("credit"),
        func.count(JournalEntry.id).label("cnt")
    ).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period >= ps, JournalEntry.period <= pe
    ).group_by(JournalEntry.period).all()

    unbalanced = [e.period for e in entries if abs(_safe_float(e.debit) - _safe_float(e.credit)) > 0.01]
    if unbalanced:
        results.append({
            "category": "账务数据", "category_icon": "📊", "risk_score": 9, "risk_level": "高风险",
            "risk_color": "#dc2626", "urgency": "紧急",
            "item": "借贷不平衡",
            "detail": f"以下期间借贷方金额不相等：{', '.join(unbalanced)}。借贷不平衡会导致报表数据失真，影响税务申报准确性。",
            "suggestion": "逐月排查序时账，检查是否有凭证漏记或金额录入错误，确保每笔凭证借贷金额相等。"
        })

    for e in entries:
        cnt = int(e.cnt)
        if cnt == 0:
            results.append({
                "category": "账务数据", "category_icon": "📊", "risk_score": 7, "risk_level": "高风险",
                "risk_color": "#dc2626", "urgency": "紧急",
                "item": f"期间 {e.period} 无凭证记录",
                "detail": f"{e.period} 期间没有任何序时账记录，可能尚未开始账务处理。",
                "suggestion": "立即检查该期间是否漏记账务，补充必要的凭证录入。"
            })
        elif cnt > 500:
            results.append({
                "category": "账务数据", "category_icon": "📊", "risk_score": 4, "risk_level": "中风险",
                "risk_color": "#f59e0b", "urgency": "提醒",
                "item": f"期间 {e.period} 凭证量异常偏高",
                "detail": f"{e.period} 期间有 {cnt} 条凭证记录，远超常规。需确认是否存在重复录入或批量导入错误。",
                "suggestion": "核查是否重复导入或批量操作异常，建议抽查大额凭证的真实性。"
            })

    fixed_count = db.query(func.count(FixedAsset.id)).filter(
        FixedAsset.company_id == company_id, FixedAsset.status.in_(["在用", "闲置"])).scalar()
    intangible_count = db.query(func.count(IntangibleAsset.id)).filter(
        IntangibleAsset.company_id == company_id, IntangibleAsset.status.in_(["在用", "闲置"])).scalar()

    if fixed_count and fixed_count > 0:
        depr = db.query(func.count(JournalEntry.id)).filter(
            JournalEntry.company_id == company_id, JournalEntry.period >= ps,
            JournalEntry.account_code.like("1602%"),
            func.lower(JournalEntry.summary).contains("折旧")).scalar()
        if not depr:
            results.append({
                "category": "账务数据", "category_icon": "📊", "risk_score": 8, "risk_level": "高风险",
                "risk_color": "#dc2626", "urgency": "紧急",
                "item": "未计提固定资产折旧",
                "detail": f"系统中有 {fixed_count} 项在用/闲置固定资产，但未发现折旧计提凭证。漏提折旧会导致利润虚增、多缴企业所得税。",
                "suggestion": "按企业会计准则第4号，当月增加的固定资产次月起计提折旧，检查是否漏记折旧费用。"
            })

    if intangible_count and intangible_count > 0:
        amor = db.query(func.count(JournalEntry.id)).filter(
            JournalEntry.company_id == company_id, JournalEntry.period >= ps,
            func.lower(JournalEntry.summary).contains("摊销")).scalar()
        if not amor:
            results.append({
                "category": "账务数据", "category_icon": "📊", "risk_score": 6, "risk_level": "中风险",
                "risk_color": "#f59e0b", "urgency": "提醒",
                "item": "未计提无形资产摊销",
                "detail": f"系统中有 {intangible_count} 项无形资产，但未发现摊销凭证。漏摊销会导致利润虚增。",
                "suggestion": "按照无形资产摊销政策，检查是否漏记摊销费用。"
            })


# ═══════════════════════════════════════════════════════════════
#  二、发票合规风险
# ═══════════════════════════════════════════════════════════════

def _analyze_invoice_compliance(db, company_id, ps, pe, results):
    """进项风险发票、销项作废红冲率、税号完整性、进项抵扣风险"""
    risk_invoices = db.query(
        func.count(PurchaseInvoice.id), func.sum(PurchaseInvoice.total_amount)
    ).filter(PurchaseInvoice.company_id == company_id,
             PurchaseInvoice.invoice_risk_level.in_(["疑点", "异常", "失控"])).first()
    risk_cnt, risk_amt = risk_invoices
    if risk_cnt and risk_cnt > 0:
        results.append({
            "category": "发票合规", "category_icon": "🧾", "risk_score": 9, "risk_level": "高风险",
            "risk_color": "#dc2626", "urgency": "紧急",
            "item": "存在风险进项发票",
            "detail": f"有 {risk_cnt} 张进项发票被标记为「疑点/异常/失控」，涉及金额 {_safe_float(risk_amt):,.2f} 元。异常发票进项税额不得抵扣，已抵扣需做进项税额转出。",
            "suggestion": "立即核实风险发票来源，如确认异常应及时做进项税额转出处理，避免税务稽查风险。"
        })

    total_sales = db.query(func.count(SalesInvoice.id)).filter(SalesInvoice.company_id == company_id).scalar() or 0
    void_cnt = db.query(func.count(SalesInvoice.id)).filter(
        SalesInvoice.company_id == company_id, SalesInvoice.status.in_(["作废", "红冲"])).scalar() or 0
    if total_sales > 0:
        void_rate = void_cnt / total_sales * 100
        if void_rate > 10:
            results.append({
                "category": "发票合规", "category_icon": "🧾",
                "risk_score": 7 if void_rate > 20 else 5,
                "risk_level": "高风险" if void_rate > 20 else "中风险",
                "risk_color": "#dc2626" if void_rate > 20 else "#f59e0b",
                "urgency": "紧急" if void_rate > 20 else "提醒",
                "item": "销项发票作废/红冲率偏高",
                "detail": f"销项发票作废/红冲率为 {void_rate:.1f}%（{void_cnt}/{total_sales}），远超正常水平（<5%）。异常高的作废率可能被税务机关重点关注。",
                "suggestion": "核查作废和红冲原因，是否符合国家税务总局公告2016年第47号规定的红冲条件。避免频繁作废发票。"
            })

    pi_empty_tax = db.query(func.count(PurchaseInvoice.id)).filter(
        PurchaseInvoice.company_id == company_id,
        (PurchaseInvoice.seller_tax_no == None) | (PurchaseInvoice.seller_tax_no == "")).scalar()
    si_empty_tax = db.query(func.count(SalesInvoice.id)).filter(
        SalesInvoice.company_id == company_id,
        (SalesInvoice.buyer_tax_no == None) | (SalesInvoice.buyer_tax_no == "")).scalar()
    if pi_empty_tax:
        results.append({
            "category": "发票合规", "category_icon": "🧾", "risk_score": 5, "risk_level": "中风险",
            "risk_color": "#f59e0b", "urgency": "提醒",
            "item": "进项发票缺少供应商税号",
            "detail": f"有 {pi_empty_tax} 张进项发票的供应商税号为空。缺少税号的发票可能无法正常认证抵扣。",
            "suggestion": "完善供应商档案信息，确保每张进项发票都有完整的供应商纳税人识别号。"
        })
    if si_empty_tax:
        results.append({
            "category": "发票合规", "category_icon": "🧾", "risk_score": 4, "risk_level": "中风险",
            "risk_color": "#f59e0b", "urgency": "提醒",
            "item": "销项发票缺少购买方税号",
            "detail": f"有 {si_empty_tax} 张销项发票的购买方税号为空。缺少购买方税号可能影响对方认证抵扣。",
            "suggestion": "完善客户档案信息，开票时要求提供纳税人识别号。"
        })

    input_risk = db.query(func.count(InputVATDeduction.id)).filter(
        InputVATDeduction.company_id == company_id,
        InputVATDeduction.risk_level.in_(["疑点", "异常", "失控"])).scalar()
    if input_risk:
        results.append({
            "category": "发票合规", "category_icon": "🧾", "risk_score": 8, "risk_level": "高风险",
            "risk_color": "#dc2626", "urgency": "紧急",
            "item": "进项抵扣存在风险记录",
            "detail": f"有 {input_risk} 条进项抵扣记录被标记为风险状态。需逐条核实抵扣凭证的真实性和合规性。",
            "suggestion": "逐条核查风险进项抵扣记录，确认发票来源和业务真实性，必要时做进项税额转出。"
        })


# ═══════════════════════════════════════════════════════════════
#  三、发票深度分析（新增 P2）
# ═══════════════════════════════════════════════════════════════

SENSITIVE_KEYWORDS = [
    "咨询费", "服务费", "劳务费", "管理费", "技术费", "推广费", "居间费",
    "预付费卡", "预付卡", "购物卡", "礼品", "生活用品", "办公用品",
    "会议费", "培训费", "差旅费"
]

ZERO_TAX_CATEGORIES = ["免税", "零税率", "不征税", "出口退税"]


def _analyze_invoice_depth(db, company_id, ps, pe, results):
    """发票深度分析：税率结构、敏感业务、零税额/顶额发票、代开发票"""
    # 3.1 各税率销项发票结构
    tax_rates = db.query(
        SalesInvoice.tax_rate,
        func.count(SalesInvoice.id),
        func.sum(SalesInvoice.total_amount)
    ).filter(SalesInvoice.company_id == company_id).group_by(SalesInvoice.tax_rate).all()

    if tax_rates:
        rate_summary = []
        has_odd_rate = False
        for tr in tax_rates:
            rate = _safe_float(tr[0])
            cnt = int(tr[1])
            amt = _safe_float(tr[2])
            rate_summary.append(f"{rate*100:.0f}%（{cnt}张/{amt:,.0f}元）")
            if rate not in [0.0, 0.03, 0.05, 0.06, 0.09, 0.13]:
                has_odd_rate = True

        if has_odd_rate:
            results.append({
                "category": "发票深度", "category_icon": "🔍", "risk_score": 6, "risk_level": "中风险",
                "risk_color": "#f59e0b", "urgency": "提醒",
                "item": "存在非标准税率发票",
                "detail": f"销项发票税率分布：{'; '.join(rate_summary)}。存在非标准税率发票，需确认税率适用是否正确。",
                "suggestion": "核对税率与商品服务类别的匹配关系，确保增值税税率适用正确。"
            })

    # 3.2 敏感业务发票检测
    sensitive_invoices = {"sales": [], "purchase": []}
    for inv in db.query(SalesInvoice).filter(SalesInvoice.company_id == company_id).all():
        gn = (getattr(inv, 'goods_name', '') or '').lower()
        for kw in SENSITIVE_KEYWORDS:
            if kw in gn:
                sensitive_invoices["sales"].append({
                    "no": getattr(inv, 'digital_invoice_no', '') or (getattr(inv, 'invoice_code', '') or '') + (getattr(inv, 'invoice_no', '') or ''),
                    "kw": kw, "amt": _safe_float(inv.total_amount)
                })
                break

    for inv in db.query(PurchaseInvoice).filter(PurchaseInvoice.company_id == company_id).all():
        gn = (getattr(inv, 'goods_name', '') or '').lower()
        for kw in SENSITIVE_KEYWORDS:
            if kw in gn:
                sensitive_invoices["purchase"].append({
                    "other": getattr(inv, 'seller_name', '') or '',
                    "kw": kw, "amt": _safe_float(inv.total_amount)
                })
                break

    total_sensitive = len(sensitive_invoices["sales"]) + len(sensitive_invoices["purchase"])
    if total_sensitive > 0:
        detail_items = []
        sens_amt = 0
        for s in sensitive_invoices["sales"]:
            if len(detail_items) < 6:
                detail_items.append(f"销项[{s['kw']}]{s['amt']:,.0f}元")
            sens_amt += s['amt']
        for s in sensitive_invoices["purchase"]:
            if len(detail_items) < 6:
                detail_items.append(f"进项[{s['kw']}]{s['other']}{s['amt']:,.0f}元")
            sens_amt += s['amt']

        detail = f"检测到 {total_sensitive} 张涉及敏感业务的发票（合计 {sens_amt:,.2f} 元）：{'；'.join(detail_items)}。咨询费、服务费等敏感项目容易被税务机关重点关注。"
        if total_sensitive >= 3:
            results.append({
                "category": "发票深度", "category_icon": "🔍", "risk_score": 7, "risk_level": "高风险",
                "risk_color": "#dc2626", "urgency": "紧急",
                "item": "存在多张敏感业务发票",
                "detail": detail,
                "suggestion": "核查咨询费、服务费等敏感业务发票的真实性和合理性，保留合同、协议、成果交付物等证明材料。大额咨询费需准备定价合理性说明。"
            })
        else:
            results.append({
                "category": "发票深度", "category_icon": "🔍", "risk_score": 3, "risk_level": "低风险",
                "risk_color": "#3b82f6", "urgency": "建议",
                "item": "存在敏感业务发票",
                "detail": detail,
                "suggestion": "确保敏感业务发票背后有真实交易支撑，保留相关业务文档备查。"
            })

    # 3.3 代开发票检测（摘要含"代开"）
    agency_cnt = db.query(func.count(PurchaseInvoice.id)).filter(
        PurchaseInvoice.company_id == company_id,
        or_(func.lower(PurchaseInvoice.seller_name).contains("代开"),
            func.lower(PurchaseInvoice.goods_name).contains("代开"))).scalar() or 0
    if agency_cnt:
        results.append({
            "category": "发票深度", "category_icon": "🔍", "risk_score": 5, "risk_level": "中风险",
            "risk_color": "#f59e0b", "urgency": "提醒",
            "item": "存在代开发票",
            "detail": f"检测到 {agency_cnt} 张代开发票。代开发票的业务真实性需要严格核实。",
            "suggestion": "核查代开发票对应业务的真实性，确保有合同、资金流、货物流'三流一致'的证据链。"
        })


# ═══════════════════════════════════════════════════════════════
#  四、成本结构风险
# ═══════════════════════════════════════════════════════════════

def _analyze_cost_structure(db, company_id, ps, pe, results):
    """毛利率、费用率、业务招待费"""
    revenue = _get_account_sum(db, company_id, "6001", ps, pe, "credit")
    cost = _get_account_sum(db, company_id, "6401", ps, pe, "debit")

    if revenue > 0:
        gross_margin = (revenue - cost) / revenue * 100
        if gross_margin < 0:
            results.append({
                "category": "成本结构", "category_icon": "📈", "risk_score": 9, "risk_level": "高风险",
                "risk_color": "#dc2626", "urgency": "紧急",
                "item": "收入成本倒挂",
                "detail": f"主营业务收入 {revenue:,.2f} 元，主营业务成本 {cost:,.2f} 元，毛利率为 {gross_margin:.1f}%。成本大于收入属于严重异常，可能涉及少计收入或多列成本。",
                "suggestion": "核查收入是否完整入账、成本核算是否准确，是否存在跨期调节利润的行为。"
            })
        elif gross_margin < 5:
            results.append({
                "category": "成本结构", "category_icon": "📈", "risk_score": 5, "risk_level": "中风险",
                "risk_color": "#f59e0b", "urgency": "提醒",
                "item": "毛利率偏低",
                "detail": f"毛利率仅为 {gross_margin:.1f}%，远低于一般行业水平。低毛利率可能被税务机关质疑定价不合理或隐瞒收入。",
                "suggestion": "分析成本构成，确认是否存在非正常成本支出；检查关联交易定价是否公允。"
            })

    mgmt_exp = _get_account_sum(db, company_id, "6602", ps, pe, "debit")
    sales_exp = _get_account_sum(db, company_id, "6601", ps, pe, "debit")
    fin_exp = _get_account_sum(db, company_id, "6603", ps, pe, "debit")
    total_exp = mgmt_exp + sales_exp + fin_exp
    if revenue > 0 and total_exp / revenue > 0.5:
        results.append({
            "category": "成本结构", "category_icon": "📈", "risk_score": 3, "risk_level": "低风险",
            "risk_color": "#3b82f6", "urgency": "建议",
            "item": "期间费用占比过高",
            "detail": f"三项期间费用合计 {total_exp:,.2f} 元，占收入 {total_exp/revenue*100:.1f}%。费用率过高可能影响企业所得税应纳税所得额计算。",
            "suggestion": "检查费用报销的合理性和合规性，确认各项费用的税前扣除政策。"
        })

    entertainment = _safe_float(db.query(func.sum(JournalEntry.debit_amount)).filter(
        JournalEntry.company_id == company_id,
        func.lower(JournalEntry.summary).contains("招待"),
        JournalEntry.period >= ps, JournalEntry.period <= pe).scalar())
    if entertainment > 0 and revenue > 0:
        ent_rate = entertainment / revenue * 100
        if ent_rate > 0.5:
            results.append({
                "category": "成本结构", "category_icon": "📈",
                "risk_score": 5 if ent_rate > 1 else 3,
                "risk_level": "中风险" if ent_rate > 1 else "低风险",
                "risk_color": "#f59e0b" if ent_rate > 1 else "#3b82f6",
                "urgency": "提醒" if ent_rate > 1 else "建议",
                "item": "业务招待费可能超标",
                "detail": f"业务招待费 {entertainment:,.2f} 元，占收入 {ent_rate:.2f}%。按税法规定，业务招待费按发生额60%扣除，且不得超过营业收入5‰。",
                "suggestion": "汇算清缴时注意纳税调增超标部分。建议控制业务招待费，完善报销审批流程。"
            })


# ═══════════════════════════════════════════════════════════════
#  五、财税票综合比对（新增 P0）
# ═══════════════════════════════════════════════════════════════

def _analyze_financial_tax_invoice_cross(db, company_id, ps, pe, results):
    """企业所得税申报收入 vs 增值税申报收入 vs 财报收入 vs 发票金额 四维交叉比对"""
    # 财报收入（序时账 6001 贷方发生额）
    fin_revenue = _get_account_sum(db, company_id, "6001", ps, pe, "credit")
    # 销项发票金额
    inv_amount = _safe_float(db.query(func.sum(SalesInvoice.total_amount)).filter(
        SalesInvoice.company_id == company_id,
        SalesInvoice.invoice_date >= ps + "-01",
        SalesInvoice.invoice_date <= pe + "-31").scalar())

    # 增值税申报销售额（取最近一期）
    vat_sales = 0
    ccp_revenue = 0
    vat_list = db.query(VATDeclaration).filter(
        VATDeclaration.company_id == company_id,
        VATDeclaration.period >= ps, VATDeclaration.period <= pe
    ).order_by(VATDeclaration.period.desc()).limit(3).all()
    for v in vat_list:
        if v.form_main:
            fm = v.form_main if isinstance(v.form_main, dict) else json.loads(v.form_main)
            vat_sales += _safe_float(fm.get("sales_amount") or fm.get("total_sales"))

    # 文化事业建设费申报的应征收入
    ccf_list = db.query(CulturalConstructionFeeDeclaration).filter(
        CulturalConstructionFeeDeclaration.company_id == company_id,
        CulturalConstructionFeeDeclaration.period >= ps, CulturalConstructionFeeDeclaration.period <= pe
    ).all()
    for ccf in ccf_list:
        ccp_revenue += _safe_float(ccf.row1_taxable_income_current)

    diffs = []
    if fin_revenue > 0 and vat_sales > 0:
        diff_pct = abs(fin_revenue - vat_sales) / max(fin_revenue, vat_sales) * 100
        if diff_pct > 10:
            diffs.append(f"财报收入({fin_revenue:,.0f})与增值税申报销售额({vat_sales:,.0f})差异 {diff_pct:.1f}%")

    if fin_revenue > 0 and inv_amount > 0:
        diff_pct = abs(fin_revenue - inv_amount) / max(fin_revenue, inv_amount) * 100
        if diff_pct > 10:
            diffs.append(f"财报收入({fin_revenue:,.0f})与销项发票金额({inv_amount:,.0f})差异 {diff_pct:.1f}%")

    if vat_sales > 0 and inv_amount > 0:
        diff_pct = abs(vat_sales - inv_amount) / max(vat_sales, inv_amount) * 100
        if diff_pct > 10:
            diffs.append(f"增值税销售额({vat_sales:,.0f})与销项发票金额({inv_amount:,.0f})差异 {diff_pct:.1f}%")

    if diffs:
        results.append({
            "category": "财税票比对", "category_icon": "🔗", "risk_score": 9, "risk_level": "高风险",
            "risk_color": "#dc2626", "urgency": "紧急",
            "item": "财税票数据不一致",
            "detail": f"收入类数据在财报/增值税申报/发票三个维度之间存在显著差异：{'；'.join(diffs)}。这可能暗示少计收入、虚开发票或申报数据错误。",
            "suggestion": "逐月核对三张表（财务报表、增值税申报表、发票汇总）的收入数据，查找差异原因。如因适用税率不同（如简易计税 vs 一般计税），应做好差异台账备查。"
        })
    elif fin_revenue > 0 and vat_sales > 0:
        diff_pct = abs(fin_revenue - vat_sales) / max(fin_revenue, vat_sales) * 100
        if diff_pct <= 5:
            results.append({
                "category": "财税票比对", "category_icon": "🔗", "risk_score": 0, "risk_level": "良好",
                "risk_color": "#10b981", "urgency": "",
                "item": "财税票收入数据基本一致",
                "detail": f"财报收入({fin_revenue:,.0f})与增值税销售额({vat_sales:,.0f})差异仅 {diff_pct:.1f}%，在合理范围内。",
                "suggestion": "继续保持财税票数据的一致性。"
            })


# ═══════════════════════════════════════════════════════════════
#  六、配比弹性分析（新增 P0）
# ═══════════════════════════════════════════════════════════════

def _analyze_ratio_elasticity(db, company_id, ps, pe, results):
    """收入/成本/费用/利润 变动率之间的弹性系数"""
    periods = _get_periods_between(ps, pe)
    if len(periods) < 2:
        return

    rev_data = _monthly_account_balance(db, company_id, "6001", ps, pe)
    cost_data = _monthly_account_balance(db, company_id, "6401", ps, pe)
    exp_data = {}
    for p in periods:
        d = _get_account_sum(db, company_id, "6601", p, p, "debit")
        d += _get_account_sum(db, company_id, "6602", p, p, "debit")
        d += _get_account_sum(db, company_id, "6603", p, p, "debit")
        exp_data[p] = d

    # 计算逐月变动率
    rev_changes = []
    cost_changes = []
    exp_changes = []
    for i in range(1, len(periods)):
        p1, p2 = periods[i - 1], periods[i]
        r1 = rev_data.get(p1, {}).get("credit", 0)
        r2 = rev_data.get(p2, {}).get("credit", 0)
        c1 = cost_data.get(p1, {}).get("debit", 0)
        c2 = cost_data.get(p2, {}).get("debit", 0)
        e1 = exp_data.get(p1, 0)
        e2 = exp_data.get(p2, 0)
        if r1 > 0: rev_changes.append((r2 - r1) / r1)
        if c1 > 0: cost_changes.append((c2 - c1) / c1)
        if e1 > 0: exp_changes.append((e2 - e1) / e1)

    all_changes = rev_changes + cost_changes + exp_changes
    if not all_changes:
        return

    max_change = max(abs(c) for c in all_changes)

    # 弹性系数：成本变动率 / 收入变动率
    elasticity_warnings = []
    for i in range(min(len(rev_changes), len(cost_changes))):
        rev_c = rev_changes[i]
        cost_c = cost_changes[i]
        if abs(rev_c) < 0.01: continue
        elasticity = abs(cost_c / rev_c) if abs(rev_c) > 0.001 else 99
        if elasticity > 1.5:
            elasticity_warnings.append(f"{periods[i+1]}: 成本弹性 {elasticity:.1f}（成本变动是收入的 {elasticity:.1f} 倍）")

    if max_change > 0.5:
        results.append({
            "category": "配比弹性", "category_icon": "📐", "risk_score": 8, "risk_level": "高风险",
            "risk_color": "#dc2626", "urgency": "紧急",
            "item": "收入/成本/费用变动率异常",
            "detail": f"分析期间内收入/成本/费用的最大单月变动率达 {max_change*100:.0f}%，远超正常水平（±30%以内）。月度间剧烈波动可能涉及跨期调节。" +
                     (f" 另有 {"；".join(elasticity_warnings[:3])}" if elasticity_warnings else ""),
            "suggestion": "逐项排查大额波动的原因（如大额订单、季节性因素、会计估计变更等），保留合理的商业解释和证明材料。特别是成本弹性>1.5的月份需重点核查。"
        })
    elif elasticity_warnings:
        results.append({
            "category": "配比弹性", "category_icon": "📐", "risk_score": 5, "risk_level": "中风险",
            "risk_color": "#f59e0b", "urgency": "提醒",
            "item": "成本弹性异常",
            "detail": f"部分月份成本增长率远超收入增长率：{'；'.join(elasticity_warnings[:3])}。弹性系数>1.5说明成本增长速度快于收入，需关注成本真实性。",
            "suggestion": "核查弹性异常月份的成本构成，确认是否存在虚增成本或多列费用的情况。"
        })
    elif max_change < 0.3 and len(periods) >= 3:
        results.append({
            "category": "配比弹性", "category_icon": "📐", "risk_score": 0, "risk_level": "良好",
            "risk_color": "#10b981", "urgency": "",
            "item": "收入成本配比稳定",
            "detail": f"分析期间内收入/成本/费用月度变动率均控制在±30%以内，收入成本配比关系稳定，经营状况较为健康。",
            "suggestion": "继续保持稳定的经营节奏。"
        })


# ═══════════════════════════════════════════════════════════════
#  七、隐匿收入 / 虚增成本 / 虚增利润（新增 P0）
# ═══════════════════════════════════════════════════════════════

def _analyze_hidden_inflated(db, company_id, ps, pe, results):
    """综合指标：其他应收款占比、存货异常、预收账款/应付账款激增"""
    other_rec = _get_account_balance(db, company_id, "1221")
    inventory = _get_account_balance(db, company_id, "1405")
    adv_receipts = _get_account_balance(db, company_id, "2203")  # 预收账款
    accounts_payable = _get_account_balance(db, company_id, "2202")

    revenue = _get_account_sum(db, company_id, "6001", ps, pe, "credit")
    total_assets = _get_account_balance(db, company_id, "1")

    # 7.1 其他应收款异常（隐匿收入/虚增成本的重要信号）
    if total_assets > 0 and other_rec / total_assets > 0.1:
        results.append({
            "category": "隐匿虚增", "category_icon": "⚠️", "risk_score": 8, "risk_level": "高风险",
            "risk_color": "#dc2626", "urgency": "紧急",
            "item": "其他应收款占比过高（疑似隐匿收入/虚增成本）",
            "detail": f"其他应收款余额 {other_rec:,.2f} 元，占总资产 {other_rec/total_assets*100:.1f}%。大额其他应收款可能隐藏以下风险：(1)将收入挂账在其他应收款贷方；(2)通过其他应收款核算无票支出或虚假采购；(3)股东/关联方占用资金。",
            "suggestion": "逐户清理其他应收款明细账。对个人股东借款超过1年的，需视同分红代扣20%个税。对挂账超过2年的无票支出，建议核实业务真实性并考虑纳税调增。"
        })

    # 7.2 存货异常
    if revenue > 0 and inventory > 0:
        inv_turnover = revenue / inventory
        if inv_turnover < 1:
            results.append({
                "category": "隐匿虚增", "category_icon": "⚠️", "risk_score": 7, "risk_level": "高风险",
                "risk_color": "#dc2626", "urgency": "紧急",
                "item": "存货周转率极低（疑似虚增存货/隐匿收入）",
                "detail": f"存货余额 {inventory:,.2f} 元，存货周转率仅 {inv_turnover:.1f} 次。极低的存货周转率可能暗示：(1)存货已发生减值但未计提跌价准备；(2)通过虚增存货来人为调高利润；(3)已销售商品未确认收入导致存货虚挂。",
                "suggestion": "进行存货实地盘点，核实账实是否相符。对滞销/过时存货应计提存货跌价准备。确认是否存在已发货未开票的情形，及时确认收入。"
            })

    # 7.3 预收账款/应付账款激增（隐匿收入信号）
    if revenue > 0:
        adv_receipt_pct = adv_receipts / revenue if adv_receipts > 0 else 0
        ap_pct = accounts_payable / revenue if accounts_payable > 0 else 0
        if adv_receipt_pct > 0.3:
            results.append({
                "category": "隐匿虚增", "category_icon": "⚠️", "risk_score": 6, "risk_level": "中风险",
                "risk_color": "#f59e0b", "urgency": "提醒",
                "item": "预收账款占比偏高（可能延迟确认收入）",
                "detail": f"预收账款余额 {adv_receipts:,.2f} 元，占当期收入 {adv_receipt_pct*100:.1f}%。大量预收账款长期挂账可能涉及已满足收入确认条件但不确认收入，人为调节利润或延迟纳税。",
                "suggestion": "逐笔核实预收账款对应的合同履约进度，已履约部分应及时结转收入。按照新收入准则的五步法模型判断收入确认时点。"
            })
        if ap_pct > 0.5:
            results.append({
                "category": "隐匿虚增", "category_icon": "⚠️", "risk_score": 4, "risk_level": "中风险",
                "risk_color": "#f59e0b", "urgency": "提醒",
                "item": "应付账款占比偏高",
                "detail": f"应付账款余额 {accounts_payable:,.2f} 元，占当期收入 {ap_pct*100:.1f}%。若应付账款余额持续增长但无对应的存货/资产增加，可能暗示虚列成本或费用挂账。",
                "suggestion": "核对大额应付账款明细，确认是否有真实业务支撑。关注是否存在超出正常信用期的应付账款。"
            })


# ═══════════════════════════════════════════════════════════════
#  八、税负水平风险
# ═══════════════════════════════════════════════════════════════

def _analyze_tax_burden(db, company_id, ps, pe, results):
    """增值税税负率、CCF减征"""
    vat_list = db.query(VATDeclaration).filter(
        VATDeclaration.company_id == company_id,
        VATDeclaration.period >= ps, VATDeclaration.period <= pe
    ).order_by(VATDeclaration.period).all()

    low_vat_periods = []
    vat_details = []
    for v in vat_list:
        if v.form_main:
            fm = v.form_main if isinstance(v.form_main, dict) else json.loads(v.form_main)
            sales = _safe_float(fm.get("sales_amount") or fm.get("total_sales"))
            vat_payable = _safe_float(fm.get("vat_payable"))
            if sales > 0:
                rate = vat_payable / sales * 100
                vat_details.append({"period": v.period, "rate": rate, "sales": sales, "vat": vat_payable})
                if rate < 0.5:
                    low_vat_periods.append(f"{v.period}({rate:.2f}%)")

    if low_vat_periods:
        results.append({
            "category": "税负水平", "category_icon": "💰", "risk_score": 6, "risk_level": "中风险",
            "risk_color": "#f59e0b", "urgency": "提醒",
            "item": "增值税税负率偏低",
            "detail": f"以下期间增值税税负率低于0.5%，可能触发税务预警：{', '.join(low_vat_periods)}。不同行业有预警税负率参照值。",
            "suggestion": "分析税负偏低原因（如期末留抵、免税收入、进项税额过大等），做好合理解释准备。避免增值税税负率持续低于行业预警值。"
        })

    # 整体税负率
    if vat_details:
        avg_rate = sum(d["rate"] for d in vat_details) / len(vat_details)
        if 0.5 <= avg_rate <= 5:
            results.append({
                "category": "税负水平", "category_icon": "💰", "risk_score": 0, "risk_level": "良好",
                "risk_color": "#10b981", "urgency": "",
                "item": "增值税税负率在合理范围",
                "detail": f"分析期间平均增值税税负率 {avg_rate:.2f}%，处于行业合理区间。",
                "suggestion": "继续保持合理的税负水平。"
            })

    # CCF 减征
    ccf = db.query(CulturalConstructionFeeDeclaration).filter(
        CulturalConstructionFeeDeclaration.company_id == company_id,
        CulturalConstructionFeeDeclaration.period >= ps,
        CulturalConstructionFeeDeclaration.period <= pe).first()
    if ccf:
        rate = _safe_float(ccf.fee_reduction_rate, 0.5)
        reduction = _safe_float(ccf.row10a_fee_reduction_current, 0)
        if rate < 0.01 and reduction < 1:
            results.append({
                "category": "税负水平", "category_icon": "💰", "risk_score": 2, "risk_level": "低风险",
                "risk_color": "#3b82f6", "urgency": "建议",
                "item": "文化事业建设费未享受50%减征优惠",
                "detail": f"期间 {ccf.period} 文化事业建设费申报未应用财税〔2025〕7号的50%减征优惠，可能多缴费款。",
                "suggestion": "确认是否符合减征条件，如符合应在下次申报时应用50%减征。已多缴的款项可咨询税务机关办理退抵。"
            })
        elif reduction > 0:
            results.append({
                "category": "税负水平", "category_icon": "💰", "risk_score": 0, "risk_level": "良好",
                "risk_color": "#10b981", "urgency": "",
                "item": "已享受文化事业建设费50%减征（财税〔2025〕7号）",
                "detail": f"期间 {ccf.period} 已正确应用减征优惠，减免额 {reduction:,.2f} 元。",
                "suggestion": "继续保持。"
            })


# ═══════════════════════════════════════════════════════════════
#  九、城建税（新增 P1）
# ═══════════════════════════════════════════════════════════════

CITY_TAX_RATES = {"市区": 0.07, "县城": 0.05, "建制镇": 0.05, "其他": 0.01}


def _analyze_urban_construction_tax(db, company_id, ps, pe, results):
    """城建税：税率合理性校验"""
    vat = _vat_payable_sum(db, company_id, ps, pe)

    if vat <= 0:
        return

    # 查找城建税相关凭证（通常科目编码 6404 或摘要含"城建税"）
    urban_tax = _safe_float(db.query(func.sum(JournalEntry.debit_amount)).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period >= ps, JournalEntry.period <= pe,
        func.lower(JournalEntry.summary).contains("城建")).scalar())

    if urban_tax <= 0:
        # 尝试用 6404 科目编码查找
        urban_tax = _get_account_sum(db, company_id, "6404", ps, pe, "debit")

    if urban_tax <= 0:
        # 尝试营业税金及附加中查找
        urban_tax = _safe_float(db.query(func.sum(JournalEntry.debit_amount)).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.account_code.like("6403%"),
            JournalEntry.period >= ps, JournalEntry.period <= pe,
            func.lower(JournalEntry.summary).contains("城建")).scalar())

    if urban_tax > 0 and vat > 0:
        effective_rate = urban_tax / vat
        # 正常城建税税率 = 增值税应纳税额 × 7%/5%/1%
        if effective_rate < 0.01:
            results.append({
                "category": "城建税", "category_icon": "🏙️", "risk_score": 7, "risk_level": "高风险",
                "risk_color": "#dc2626", "urgency": "紧急",
                "item": "城建税实际税率远低于法定税率",
                "detail": f"增值税应纳税额 {vat:,.2f} 元，城建税 {urban_tax:,.2f} 元，实际税率 {effective_rate*100:.2f}%。城建税法定税率为增值税税额的7%/5%/1%（按所在地）。实际税率过低可能涉及漏缴。",
                "suggestion": "核实企业所在地适用的城建税税率，检查是否完整计提城建税。同时检查增值税免抵税额是否也计提了城建税。"
            })
        elif 0.01 <= effective_rate <= 0.09:
            results.append({
                "category": "城建税", "category_icon": "🏙️", "risk_score": 0, "risk_level": "良好",
                "risk_color": "#10b981", "urgency": "",
                "item": "城建税计提比率合理",
                "detail": f"增值税应纳税额 {vat:,.2f} 元，城建税 {urban_tax:,.2f} 元，实际税率 {effective_rate*100:.2f}%，与法定税率匹配。",
                "suggestion": "继续保持。"
            })
    elif urban_tax <= 0 and vat > 1000:
        results.append({
            "category": "城建税", "category_icon": "🏙️", "risk_score": 6, "risk_level": "中风险",
            "risk_color": "#f59e0b", "urgency": "提醒",
            "item": "未发现城建税计提记录",
            "detail": f"增值税应纳税额 {vat:,.2f} 元，但未检测到城建税计提凭证。城建税是增值税的附加税，缴纳增值税必须同时缴纳城建税。",
            "suggestion": "立即检查是否漏提城建税。城建税 = 增值税应纳税额 × 适用税率（7%/5%/1%），同时计算教育费附加(3%)和地方教育附加(2%)。"
        })


# ═══════════════════════════════════════════════════════════════
#  十、房产税（新增 P1）
# ═══════════════════════════════════════════════════════════════

def _analyze_property_tax(db, company_id, ps, pe, results):
    """房产税：从价计征/从租计征"""
    # 查找固定资产中属于房屋建筑物的资产
    buildings = db.query(
        func.count(FixedAsset.id),
        func.sum(FixedAsset.original_value)
    ).filter(
        FixedAsset.company_id == company_id,
        FixedAsset.category.in_(["房屋建筑物", "房屋", "建筑物", "厂房", "办公楼", "仓库"]),
        FixedAsset.status.in_(["在用", "闲置"])
    ).first() or (0, 0)

    building_cnt, building_value = buildings
    if not building_cnt or building_cnt == 0:
        # 更宽泛的搜索
        buildings = db.query(
            func.count(FixedAsset.id),
            func.sum(FixedAsset.original_value)
        ).filter(
            FixedAsset.company_id == company_id,
            or_(FixedAsset.name.like("%房%"), FixedAsset.name.like("%楼%"),
                FixedAsset.category.like("%房%"), FixedAsset.category.like("%楼%")),
            FixedAsset.status.in_(["在用", "闲置"])
        ).first() or (0, 0)
        building_cnt, building_value = buildings

    # 查找房产税凭证
    property_tax = _safe_float(db.query(func.sum(JournalEntry.debit_amount)).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period >= ps, JournalEntry.period <= pe,
        func.lower(JournalEntry.summary).contains("房产税")).scalar())

    # 也查找税金及附加中的房产税
    if property_tax <= 0:
        property_tax = _safe_float(db.query(func.sum(JournalEntry.debit_amount)).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.account_code.like("6403%"),
            JournalEntry.period >= ps, JournalEntry.period <= pe,
            func.lower(JournalEntry.summary).contains("房产")).scalar())

    if building_cnt and building_cnt > 0:
        expected_tax = _safe_float(building_value) * 0.7 * 0.012  # 房产原值 × 70% × 1.2%
        if property_tax <= 0:
            results.append({
                "category": "房产税", "category_icon": "🏠", "risk_score": 8, "risk_level": "高风险",
                "risk_color": "#dc2626", "urgency": "紧急",
                "item": "有房产但未缴纳房产税",
                "detail": f"系统中有 {building_cnt} 项房屋建筑物（原值合计 {_safe_float(building_value):,.2f} 元），但未发现房产税计提凭证。房产税漏缴有严重税务风险，滞纳金按日万分之五计算。",
                "suggestion": f"立即核实房产税缴纳情况：(1)从价计征：房产原值×(1-30%)×1.2%（年税额估算 {expected_tax:,.2f} 元）；(2)从租计征：租金收入×12%。若有出租部分，需分别计算。尽快补缴并做好纳税申报。"
            })
        elif building_value > 0 and _safe_float(building_value) > 1000000:
            # 检查是否足额缴纳
            if property_tax < expected_tax * 0.5:
                results.append({
                    "category": "房产税", "category_icon": "🏠", "risk_score": 5, "risk_level": "中风险",
                    "risk_color": "#f59e0b", "urgency": "提醒",
                    "item": "房产税可能未足额缴纳",
                    "detail": f"房屋建筑物净值约 {_safe_float(building_value):,.2f} 元，预计年房产税约 {expected_tax:,.2f} 元，实际计提 {property_tax:,.2f} 元，可能不足。",
                    "suggestion": "核实房产税计税依据（房产原值），确认是否所有房产均已申报。检查有无新建、改建、扩建的房产未纳入计税范围。"
                })
    elif property_tax > 0:
        results.append({
            "category": "房产税", "category_icon": "🏠", "risk_score": 0, "risk_level": "良好",
            "risk_color": "#10b981", "urgency": "",
            "item": "已计提房产税",
            "detail": f"房产税已计提 {property_tax:,.2f} 元，房产税申报工作已开展。",
            "suggestion": "继续保持按期申报缴纳。"
        })


# ═══════════════════════════════════════════════════════════════
#  十一、个人所得税全面分析（新增 P0）
# ═══════════════════════════════════════════════════════════════

def _analyze_iit(db, company_id, ps, pe, results):
    """个税：工资薪金、劳务报酬、股息红利、股东借款"""
    salary_records = db.query(SalaryRecord).filter(
        SalaryRecord.company_id == company_id,
        SalaryRecord.period >= ps, SalaryRecord.period <= pe
    ).all()

    if not salary_records:
        # 检查是否有雇员
        emp_count = db.query(func.count(Employee.id)).filter(
            Employee.company_id == company_id).scalar() or 0
        if emp_count > 0:
            results.append({
                "category": "个人所得税", "category_icon": "🧑‍💼", "risk_score": 7, "risk_level": "高风险",
                "risk_color": "#dc2626", "urgency": "紧急",
                "item": "有员工但未进行工资薪金个税申报",
                "detail": f"系统中有 {emp_count} 名员工，但无工资薪金申报记录。不履行个人所得税代扣代缴义务将面临税务处罚。",
                "suggestion": "立即统计员工工资，完成个人所得税代扣代缴申报。即使员工工资未达到起征点（5,000元/月），也应当进行零申报。"
            })
        return

    # 11.1 劳务报酬代扣代缴
    labor_summaries = db.query(JournalEntry.summary).filter(
        JournalEntry.company_id == company_id, JournalEntry.period >= ps, JournalEntry.period <= pe,
        or_(func.lower(JournalEntry.summary).contains("劳务"),
            func.lower(JournalEntry.summary).contains("兼职"),
            func.lower(JournalEntry.summary).contains("临时工"))).all()

    if len(labor_summaries) > 3:
        # 检查是否有劳务报酬个税扣缴记录
        has_labor_tax = db.query(func.count(JournalEntry.id)).filter(
            JournalEntry.company_id == company_id, JournalEntry.period >= ps, JournalEntry.period <= pe,
            func.lower(JournalEntry.summary).contains("劳务报酬")
        ).scalar() or 0
        if not has_labor_tax:
            results.append({
                "category": "个人所得税", "category_icon": "🧑‍💼", "risk_score": 6, "risk_level": "中风险",
                "risk_color": "#f59e0b", "urgency": "提醒",
                "item": "可能存在未代扣劳务报酬个税",
                "detail": f"账务中涉及劳务/兼职/临时工等 {len(labor_summaries)} 笔记录，但未检测到劳务报酬个人所得税代扣记录。劳务报酬所得应按规定代扣代缴个人所得税。",
                "suggestion": "核查劳务费支付是否依法代扣代缴个人所得税（预扣率20%-40%）。要求劳务提供方到税务机关代开发票或通过自然人电子税务局申报。"
            })

    # 11.2 股东分红个税
    dividend_entries = db.query(JournalEntry).filter(
        JournalEntry.company_id == company_id, JournalEntry.period >= ps, JournalEntry.period <= pe,
        or_(func.lower(JournalEntry.summary).contains("股利"),
            func.lower(JournalEntry.summary).contains("分红"),
            func.lower(JournalEntry.summary).contains("利润分配"))).all()
    if dividend_entries:
        has_dividend_tax = db.query(func.count(JournalEntry.id)).filter(
            JournalEntry.company_id == company_id, JournalEntry.period >= ps, JournalEntry.period <= pe,
            func.lower(JournalEntry.summary).contains("股息红利")
        ).scalar() or 0
        if not has_dividend_tax:
            results.append({
                "category": "个人所得税", "category_icon": "🧑‍💼", "risk_score": 8, "risk_level": "高风险",
                "risk_color": "#dc2626", "urgency": "紧急",
                "item": "利润分配未代扣个人所得税",
                "detail": "账务中存在利润分配/分红记录，但未检测到股息红利个人所得税代扣记录。个人股东分红应代扣20%个人所得税。",
                "suggestion": "立即核查股东分红是否按规定代扣代缴20%个人所得税。根据《个人所得税法》，利息、股息、红利所得适用20%比例税率。"
            })

    # 11.3 股东借款视同分红
    other_rec_balance = _get_account_balance(db, company_id, "1221")
    if other_rec_balance > 100000:
        results.append({
            "category": "个人所得税", "category_icon": "🧑‍💼", "risk_score": 7, "risk_level": "高风险",
            "risk_color": "#dc2626", "urgency": "紧急",
            "item": "其他应收款大额挂账（疑似股东借款未归还）",
            "detail": f"其他应收款余额 {other_rec_balance:,.2f} 元。按照财税〔2003〕158号文，个人投资者从企业借款超过1年未归还且未用于生产经营的，视同股息红利分配，应代扣20%个人所得税。",
            "suggestion": "逐户清理其他应收款中的个人借款：(1)督促在纳税年度终了前归还；(2)超过1年未归还的，需按分红处理代扣20%个税；(3)完善借款管理制度，签订借款协议明确用途和归还期限。"
        })

    # 11.4 工资薪金个税整体情况
    tax_payers = sum(1 for sr in salary_records if _safe_float(sr.tax_payable) > 1)
    total_emp = len(salary_records)
    if total_emp > 5 and tax_payers == 0:
        results.append({
            "category": "个人所得税", "category_icon": "🧑‍💼", "risk_score": 3, "risk_level": "低风险",
            "risk_color": "#3b82f6", "urgency": "建议",
            "item": "无员工缴纳工资薪金个税",
            "detail": f"全部 {total_emp} 名员工均未缴纳个人所得税。如有管理层或高薪人员，需确认收入是否完整申报。",
            "suggestion": "核实：(1)奖金、津贴、补贴是否并入工资计税；(2)是否通过费用报销、私卡收款等方式变相发放工资；(3)专项附加扣除申报是否合规。"
        })
    elif tax_payers > 0:
        total_tax = sum(_safe_float(sr.tax_payable) for sr in salary_records)
        results.append({
            "category": "个人所得税", "category_icon": "🧑‍💼", "risk_score": 0, "risk_level": "良好",
            "risk_color": "#10b981", "urgency": "",
            "item": "工资薪金个税代扣代缴正常",
            "detail": f"{tax_payers}/{total_emp} 名员工已代扣工资薪金个税，合计 {total_tax:,.2f} 元。",
            "suggestion": "继续保持按期申报缴纳。"
        })


# ═══════════════════════════════════════════════════════════════
#  十二、印花税（新增 P0）
# ═══════════════════════════════════════════════════════════════

STAMP_TAX_RATES = {
    "购销合同": 0.0003, "加工承揽": 0.0005, "建筑工程勘察": 0.0005,
    "建筑安装工程承包": 0.0003, "财产租赁": 0.001, "货物运输": 0.0005,
    "仓储保管": 0.001, "借款合同": 0.00005, "财产保险": 0.001,
    "技术合同": 0.0003, "产权转移": 0.0005, "营业账簿": 5.0,  # 按件贴花
    "权利许可证照": 5.0
}


def _analyze_stamp_tax(db, company_id, ps, pe, results):
    """印花税：合同金额 vs 印花税缴纳"""
    # 查找印花税凭证
    stamp_tax = _safe_float(db.query(func.sum(JournalEntry.debit_amount)).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period >= ps, JournalEntry.period <= pe,
        func.lower(JournalEntry.summary).contains("印花税")).scalar())

    if stamp_tax <= 0:
        stamp_tax = _safe_float(db.query(func.sum(JournalEntry.debit_amount)).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.account_code.like("6403%"),
            JournalEntry.period >= ps, JournalEntry.period <= pe,
            func.lower(JournalEntry.summary).contains("印花")).scalar())

    # 检查合同台账
    contracts = db.query(func.count(Contract.id), func.sum(Contract.amount)).filter(
        Contract.company_id == company_id).first() or (0, 0)
    contract_cnt, contract_amount = contracts

    # 估算印花税 = 合同金额 × 0.03% + 业务收入 × 0.03%（购销合同）
    revenue = _get_account_sum(db, company_id, "6001", ps, pe, "credit")
    purchase = _get_account_sum(db, company_id, "1402", ps, pe, "debit")  # 采购/原材料

    estimated_stamp = 0
    if revenue > 0:
        estimated_stamp += revenue * 0.0003  # 销售合同印花税
    if purchase > 0:
        estimated_stamp += purchase * 0.0003  # 采购合同印花税
    if contract_cnt > 0:
        estimated_stamp += _safe_float(contract_amount) * 0.0003

    if revenue > 100000 and stamp_tax <= 0:
        results.append({
            "category": "印花税", "category_icon": "📜", "risk_score": 5, "risk_level": "中风险",
            "risk_color": "#f59e0b", "urgency": "提醒",
            "item": "未发现印花税缴纳记录",
            "detail": f"公司有较大营业收入（{revenue:,.2f} 元），但未检测到印花税计提凭证。购销合同、账簿等均需缴纳印花税，漏缴面临滞纳金和罚款。预计应缴印花税约 {estimated_stamp:,.2f} 元（仅按购销合同估计）。",
            "suggestion": "立即补缴印花税：(1)购销合同按合同金额万分之三贴花；(2)营业账簿按件贴花（每件5元）；(3)其他应税凭证按规定税率缴纳。可咨询税务机关确认申报方式。"
        })
    elif revenue > 100000 and stamp_tax > 0:
        if estimated_stamp > 0 and stamp_tax < estimated_stamp * 0.3:
            results.append({
                "category": "印花税", "category_icon": "📜", "risk_score": 3, "risk_level": "低风险",
                "risk_color": "#3b82f6", "urgency": "建议",
                "item": "印花税可能未足额缴纳",
                "detail": f"已缴印花税 {stamp_tax:,.2f} 元，但按购销合同初步估算约需 {estimated_stamp:,.2f} 元，可能存在少缴情况。",
                "suggestion": "全面梳理各类应税合同和凭证，按法定税率计算应缴印花税，及时补缴差额。"
            })
        else:
            results.append({
                "category": "印花税", "category_icon": "📜", "risk_score": 0, "risk_level": "良好",
                "risk_color": "#10b981", "urgency": "",
                "item": "已缴纳印花税",
                "detail": f"已计提印花税 {stamp_tax:,.2f} 元，印花税申报工作已开展。",
                "suggestion": "继续保持按期申报缴纳。"
            })


# ═══════════════════════════════════════════════════════════════
#  十三、纳税调整检查（新增 P1）
# ═══════════════════════════════════════════════════════════════

def _analyze_tax_adjustment(db, company_id, ps, pe, results):
    """纳税调整：业务招待费60%、广宣费15%、职工福利费14%、资产减值"""
    revenue = _get_account_sum(db, company_id, "6001", ps, pe, "credit")
    if revenue <= 0:
        return

    adjustments = []

    # 13.1 业务招待费 = 发生额 × 60% 与 收入 × 5‰ 取孰低
    entertainment = _safe_float(db.query(func.sum(JournalEntry.debit_amount)).filter(
        JournalEntry.company_id == company_id,
        func.lower(JournalEntry.summary).contains("招待"),
        JournalEntry.period >= ps, JournalEntry.period <= pe).scalar())
    if entertainment > 0:
        ded_limit_1 = entertainment * 0.6
        ded_limit_2 = revenue * 0.005
        actual_ded = min(ded_limit_1, ded_limit_2)
        non_ded = entertainment - actual_ded
        if non_ded > 1000:
            adjustments.append(f"业务招待费：发生{entertainment:,.0f}元，可扣{actual_ded:,.0f}元，需调增{non_ded:,.0f}元")

    # 13.2 广宣费 = 收入 × 15%（一般企业）或 30%（化妆品/医药/饮料制造）
    ad_promo = _safe_float(db.query(func.sum(JournalEntry.debit_amount)).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period >= ps, JournalEntry.period <= pe,
        or_(func.lower(JournalEntry.summary).contains("广告"),
            func.lower(JournalEntry.summary).contains("宣传"),
            func.lower(JournalEntry.summary).contains("推广"))).scalar())
    if ad_promo > 0:
        ad_limit = revenue * 0.15
        if ad_promo > ad_limit:
            non_ded = ad_promo - ad_limit
            adjustments.append(f"广宣费：发生{ad_promo:,.0f}元，限额{ad_limit:,.0f}元，需调增{non_ded:,.0f}元")

    # 13.3 职工福利费 = 工资总额 × 14%
    total_salary = _safe_float(db.query(func.sum(SalaryRecord.current_income)).filter(
        SalaryRecord.company_id == company_id,
        SalaryRecord.period >= ps, SalaryRecord.period <= pe).scalar())
    welfare = _safe_float(db.query(func.sum(JournalEntry.debit_amount)).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period >= ps, JournalEntry.period <= pe,
        or_(func.lower(JournalEntry.summary).contains("福利"),
            func.lower(JournalEntry.summary).contains("补贴"),
            func.lower(JournalEntry.summary).contains("补助")),
        ~func.lower(JournalEntry.summary).contains("工资")
    ).scalar())
    if welfare > 0 and total_salary > 0:
        wel_limit = total_salary * 0.14
        if welfare > wel_limit:
            non_ded = welfare - wel_limit
            adjustments.append(f"职工福利费：发生{welfare:,.0f}元，限额(工资×14%){wel_limit:,.0f}元，需调增{non_ded:,.0f}元")

    if adjustments:
        results.append({
            "category": "纳税调整", "category_icon": "📝", "risk_score": 6, "risk_level": "中风险",
            "risk_color": "#f59e0b", "urgency": "提醒",
            "item": "应纳税所得额存在需纳税调增项目",
            "detail": f"根据企业所得税法，以下项目需在汇算清缴时进行纳税调增：{'；'.join(adjustments)}。未做纳税调增将导致少缴企业所得税，面临补税+滞纳金+罚款风险。",
            "suggestion": "汇算清缴时务必在《纳税调整项目明细表》（A105000）中填写上述调增金额。建议提前做好税务台账管理，准备完整的证明材料备查。"
        })
    elif entertainment > 0 and entertainment < revenue * 0.005:
        results.append({
            "category": "纳税调整", "category_icon": "📝", "risk_score": 0, "risk_level": "良好",
            "risk_color": "#10b981", "urgency": "",
            "item": "纳税调整项目在限额内",
            "detail": f"业务招待费({entertainment:,.0f}元)在扣除限额(revenue×5‰={revenue*0.005:,.0f}元)以内，汇算清缴不会产生重大纳税调增。",
            "suggestion": "继续保持合理的费用控制。"
        })


# ═══════════════════════════════════════════════════════════════
#  十四、收入确认时点（新增 P1）
# ═══════════════════════════════════════════════════════════════

def _analyze_revenue_timing(db, company_id, ps, pe, results):
    """收入确认时点：四季度收入占比、年底集中开票"""
    # 获取全年各月收入
    y_start = ps[:4] + "-01"
    y_end = pe[:4] + "-12"
    monthly_rev = _monthly_account_balance(db, company_id, "6001", y_start, y_end)

    # 计算各季度收入
    q_rev = {"Q1": 0, "Q2": 0, "Q3": 0, "Q4": 0}
    for period, val in monthly_rev.items():
        m = int(period[5:7])
        month_amt = val.get("credit", 0)
        if 1 <= m <= 3: q_rev["Q1"] += month_amt
        elif 4 <= m <= 6: q_rev["Q2"] += month_amt
        elif 7 <= m <= 9: q_rev["Q3"] += month_amt
        else: q_rev["Q4"] += month_amt

    total = sum(q_rev.values())
    if total <= 0:
        return

    q4_pct = q_rev["Q4"] / total * 100

    if q4_pct > 40:
        results.append({
            "category": "收入时点", "category_icon": "📅", "risk_score": 7, "risk_level": "高风险",
            "risk_color": "#dc2626", "urgency": "紧急",
            "item": "四季度收入占比过高（可能跨期调节收入）",
            "detail": f"四季度收入占比 {q4_pct:.1f}%（Q1:{q_rev['Q1']/total*100:.0f}% Q2:{q_rev['Q2']/total*100:.0f}% Q3:{q_rev['Q3']/total*100:.0f}% Q4:{q4_pct:.1f}%）。四季度收入超过全年的40%可能涉及：(1)年底突击开票调节税负；(2)提前确认收入完成业绩指标；(3)跨期调节利润。",
            "suggestion": "核查四季度收入确认的真实性：(1)是否满足收入确认条件（交付/验收完成）；(2)是否存在次年退货或红冲的情况；(3)关联交易定价是否公允。保留合同、验收单、物流单据等证据链。"
        })
    elif q4_pct > 30:
        results.append({
            "category": "收入时点", "category_icon": "📅", "risk_score": 3, "risk_level": "低风险",
            "risk_color": "#3b82f6", "urgency": "建议",
            "item": "四季度收入占比较高",
            "detail": f"四季度收入占比 {q4_pct:.1f}%，略高于全年平均水平。如果存在明显的季节性因素是正常的，但仍建议关注。",
            "suggestion": "确认四季度收入增长是否有合理的商业理由（如季节性销售旺季、年底项目集中交付等），做好记录备查。"
        })
    else:
        q_details = " / ".join([f"Q{i+1}:{q_rev[f'Q{i+1}']/total*100:.0f}%" for i in range(4)])
        results.append({
            "category": "收入时点", "category_icon": "📅", "risk_score": 0, "risk_level": "良好",
            "risk_color": "#10b981", "urgency": "",
            "item": "收入季度分布均衡",
            "detail": f"各季度收入占比：{q_details}，收入分布较为均衡，无明显的年底集中确认迹象。",
            "suggestion": "继续保持均衡的收入确认节奏。"
        })


# ═══════════════════════════════════════════════════════════════
#  十五、政策执行风险
# ═══════════════════════════════════════════════════════════════

def _analyze_policy_execution(db, company_id, ps, pe, results):
    """社保公积金、结账状态"""
    from database import Period as PeriodModel
    ss_decl_count = db.query(func.count(SocialSecurityDeclaration.id)).filter(
        SocialSecurityDeclaration.company_id == company_id).scalar()
    if not ss_decl_count:
        results.append({
            "category": "政策执行", "category_icon": "📋", "risk_score": 8, "risk_level": "高风险",
            "risk_color": "#dc2626", "urgency": "紧急",
            "item": "未发现社保缴存记录",
            "detail": "系统中未检测到社会保险费申报记录。未依法缴纳社保存在劳动监察和补缴风险。",
            "suggestion": "依法为员工缴纳社会保险费，包括养老、医疗、失业、工伤、生育保险。"
        })

    hf_count = db.query(func.count(HousingFundDeclaration.id)).filter(
        HousingFundDeclaration.company_id == company_id).scalar()
    if not hf_count:
        results.append({
            "category": "政策执行", "category_icon": "📋", "risk_score": 6, "risk_level": "中风险",
            "risk_color": "#f59e0b", "urgency": "提醒",
            "item": "未发现住房公积金缴存记录",
            "detail": "系统中未检测到住房公积金缴存记录。未依法缴纳公积金存在被责令限期缴存的风险。",
            "suggestion": "按照《住房公积金管理条例》为员工缴存住房公积金。"
        })

    from database import Period as PeriodModel
    open_periods = db.query(func.count(PeriodModel.id)).filter(
        PeriodModel.company_id == company_id,
        PeriodModel.status == "开放",
        PeriodModel.period <= pe).scalar()
    if open_periods and open_periods > 3:
        results.append({
            "category": "政策执行", "category_icon": "📋", "risk_score": 4, "risk_level": "中风险",
            "risk_color": "#f59e0b", "urgency": "提醒",
            "item": "存在多个未结账期间",
            "detail": f"有 {open_periods} 个开放状态的期间未结账。长期不结账可能导致账目混乱和数据不一致。",
            "suggestion": "定期进行月度结账，确保各期间数据独立完整。建议每月末及时结账。"
        })


# ═══════════════════════════════════════════════════════════════
#  十六、资金与往来风险
# ═══════════════════════════════════════════════════════════════

def _analyze_capital_risks(db, company_id, ps, pe, results):
    """银行存款、应收账款、其他应收款"""
    bank_deposit = _get_account_balance(db, company_id, "1002")
    if bank_deposit < 0:
        results.append({
            "category": "资金往来", "category_icon": "🏦", "risk_score": 8, "risk_level": "高风险",
            "risk_color": "#dc2626", "urgency": "紧急",
            "item": "银行存款余额为负",
            "detail": f"银行存款科目余额为 {bank_deposit:,.2f} 元（贷方）。银行存款余额为负说明可能存在记账错误或未达账项。",
            "suggestion": "编制银行存款余额调节表，逐笔核对银行对账单与账面金额，查找差异原因并调整。"
        })

    ar_balance = _get_account_balance(db, company_id, "1122")
    if ar_balance > 0:
        early_ar = db.query(func.sum(JournalEntry.debit_amount)).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.account_code.like("1122%"),
            JournalEntry.entry_date < (date.today() - timedelta(days=365)).isoformat()).scalar()
        if early_ar and early_ar > 0:
            results.append({
                "category": "资金往来", "category_icon": "🏦", "risk_score": 5, "risk_level": "中风险",
                "risk_color": "#f59e0b", "urgency": "提醒",
                "item": "应收账款存在长期挂账",
                "detail": f"应收账款余额 {ar_balance:,.2f} 元，其中可能包含超过1年的长期挂账。长期未收回的应收账款存在坏账风险。",
                "suggestion": "清理应收账款，对长期挂账发函催收。根据账龄计提坏账准备，坏账损失需符合税法规定的条件方可税前扣除。"
            })

    other_rec = _get_account_balance(db, company_id, "1221")
    if other_rec > 0:
        total_assets = _get_account_balance(db, company_id, "1")
        if total_assets > 0 and other_rec / total_assets > 0.1:
            results.append({
                "category": "资金往来", "category_icon": "🏦", "risk_score": 6, "risk_level": "中风险",
                "risk_color": "#f59e0b", "urgency": "提醒",
                "item": "其他应收款占比偏高",
                "detail": f"其他应收款余额 {other_rec:,.2f} 元，占总资产 {other_rec/total_assets*100:.1f}%。股东借款或关联方占用资金可能涉及个人所得税风险。",
                "suggestion": "核查其他应收款明细，清理不合规的关联方资金占用。个人股东借款超过1年未归还的，需视同分红缴纳个人所得税。"
            })


# ═══════════════════════════════════════════════════════════════
#  十七、薪酬合规风险
# ═══════════════════════════════════════════════════════════════

def _analyze_salary_compliance(db, company_id, ps, pe, results):
    """工资分布、个税起征点"""
    salary_records = db.query(SalaryRecord).filter(
        SalaryRecord.company_id == company_id,
        SalaryRecord.period >= ps, SalaryRecord.period <= pe).all()
    if not salary_records:
        return

    low_income_count = sum(1 for sr in salary_records if 4500 <= _safe_float(sr.current_income) <= 5500)
    total_emp = len(salary_records)
    if total_emp > 1 and low_income_count / total_emp > 0.5:
        results.append({
            "category": "薪酬合规", "category_icon": "👥", "risk_score": 5, "risk_level": "中风险",
            "risk_color": "#f59e0b", "urgency": "提醒",
            "item": "工资集中在个税起征点附近",
            "detail": f"{low_income_count}/{total_emp} 名员工的月收入集中在5,000元左右。全员收入在起征点附近可能被怀疑通过分拆工资等方式规避个税。",
            "suggestion": "确保工资发放真实反映员工劳动价值。如确有合理性，保留薪酬制度和岗位说明备查。"
        })

    zero_tax_count = sum(1 for sr in salary_records if _safe_float(sr.tax_payable) < 0.01)
    if zero_tax_count == total_emp and total_emp > 2:
        results.append({
            "category": "薪酬合规", "category_icon": "👥", "risk_score": 3, "risk_level": "低风险",
            "risk_color": "#3b82f6", "urgency": "建议",
            "item": "全体员工均无需缴纳个税",
            "detail": f"全部 {total_emp} 名员工均未产生个人所得税。如确有高管或高薪人员，需核实是否少报收入或违规使用专项附加扣除。",
            "suggestion": "核实收入是否全额申报，特别是奖金、补贴等是否并入工资薪金所得计税。"
        })


# ═══════════════════════════════════════════════════════════════
#  十八、客户风险穿透（新增 P1）
# ═══════════════════════════════════════════════════════════════

def _analyze_customer_penetration(db, company_id, ps, pe, results):
    """前十大客户分析、客户集中度、异常客户"""
    customers = db.query(Customer).filter(Customer.company_id == company_id).all()
    if not customers:
        return

    # 统计每个客户的销售额
    customer_sales = {}
    for c in customers:
        code = c.code or ''
        if code:
            amt = _safe_float(db.query(func.sum(SalesInvoice.total_amount)).filter(
                SalesInvoice.company_id == company_id,
                SalesInvoice.buyer_tax_no == c.tax_no).scalar())
            if amt > 0:
                customer_sales[c.name or code] = amt

    if not customer_sales:
        return

    total_customer_sales = sum(customer_sales.values())
    top_sorted = sorted(customer_sales.items(), key=lambda x: x[1], reverse=True)

    # 客户集中度
    if len(top_sorted) >= 1:
        top1 = top_sorted[0][1] / total_customer_sales * 100
        if top1 > 50:
            results.append({
                "category": "客户穿透", "category_icon": "🏢", "risk_score": 6, "risk_level": "中风险",
                "risk_color": "#f59e0b", "urgency": "提醒",
                "item": "第一大客户占比过高",
                "detail": f"第一大客户「{top_sorted[0][0]}」销售额占全部销售 {top1:.1f}%。过度依赖单一客户可能影响经营的独立性判断，且存在关联交易被关注的风险。",
                "suggestion": "分析第一大客户是否为关联方：(1)如是关联方，确保关联交易定价公允且有完整文档；(2)如非关联方，关注客户集中风险对持续经营判断的影响。"
            })

    # 客户税号检查
    customers_no_tax = db.query(func.count(Customer.id)).filter(
        Customer.company_id == company_id,
        (Customer.tax_no == None) | (Customer.tax_no == "")).scalar() or 0
    total_cust = len(customers)
    if total_cust > 0 and customers_no_tax / total_cust > 0.3:
        results.append({
            "category": "客户穿透", "category_icon": "🏢", "risk_score": 4, "risk_level": "中风险",
            "risk_color": "#f59e0b", "urgency": "提醒",
            "item": "客户税号完整度不足",
            "detail": f"{customers_no_tax}/{total_cust} 个客户缺少纳税人识别号。缺少税号的开票无法被客户正常认证抵扣。",
            "suggestion": "完善客户档案，对经常开票的客户必须记录纳税人识别号、地址、电话及开户行信息。"
        })

    if total_customer_sales > 0 and len(top_sorted) >= 3:
        top3_pct = sum(x[1] for x in top_sorted[:3]) / total_customer_sales * 100
        if top3_pct < 80:
            results.append({
                "category": "客户穿透", "category_icon": "🏢", "risk_score": 0, "risk_level": "良好",
                "risk_color": "#10b981", "urgency": "",
                "item": "客户分布合理",
                "detail": f"前三大客户销售占比 {top3_pct:.0f}%，客户群体较为分散，不存在过度依赖单一客户的风险。",
                "suggestion": "继续保持合理的客户结构。"
            })


# ═══════════════════════════════════════════════════════════════
#  十九、供应商风险穿透（新增 P1）
# ═══════════════════════════════════════════════════════════════

def _analyze_supplier_penetration(db, company_id, ps, pe, results):
    """前十大供应商分析、供应商集中度、供应商税号完整性"""
    suppliers = db.query(Supplier).filter(Supplier.company_id == company_id).all()
    if not suppliers:
        return

    supplier_purchase = {}
    for s in suppliers:
        code = s.code or ''
        if code:
            amt = _safe_float(db.query(func.sum(PurchaseInvoice.total_amount)).filter(
                PurchaseInvoice.company_id == company_id,
                PurchaseInvoice.seller_tax_no == s.tax_no).scalar())
            if amt > 0:
                supplier_purchase[s.name or code] = amt

    if not supplier_purchase:
        return

    total_purchase = sum(supplier_purchase.values())
    top_sorted = sorted(supplier_purchase.items(), key=lambda x: x[1], reverse=True)

    if len(top_sorted) >= 1:
        top1 = top_sorted[0][1] / total_purchase * 100
        if top1 > 50:
            results.append({
                "category": "供应商穿透", "category_icon": "🏭", "risk_score": 5, "risk_level": "中风险",
                "risk_color": "#f59e0b", "urgency": "提醒",
                "item": "第一大供应商占比过高",
                "detail": f"第一大供应商「{top_sorted[0][0]}」采购额占全部采购 {top1:.1f}%。过度依赖单一供应商存在供应链风险，且可能被怀疑为关联交易或虚假采购。",
                "suggestion": "(1)确认是否为关联方，如是需做关联交易披露；(2)保持采购来源的多元化；(3)保留完整的采购合同、入库单、付款凭证等证据链。"
            })

    # 供应商税号检查
    no_tax = db.query(func.count(Supplier.id)).filter(
        Supplier.company_id == company_id,
        (Supplier.tax_no == None) | (Supplier.tax_no == "")).scalar() or 0
    total_sup = len(suppliers)
    if total_sup > 0 and no_tax / total_sup > 0.3:
        results.append({
            "category": "供应商穿透", "category_icon": "🏭", "risk_score": 4, "risk_level": "中风险",
            "risk_color": "#f59e0b", "urgency": "提醒",
            "item": "供应商税号完整度不足",
            "detail": f"{no_tax}/{total_sup} 个供应商缺少纳税人识别号。缺少税号会影响进项发票的获取和认证抵扣。",
            "suggestion": "完善供应商档案，要求所有供应商提供营业执照和纳税人识别号，建立供应商准入制度。"
        })

    if total_purchase > 0 and len(top_sorted) >= 3:
        top3_pct = sum(x[1] for x in top_sorted[:3]) / total_purchase * 100
        if top3_pct < 80:
            results.append({
                "category": "供应商穿透", "category_icon": "🏭", "risk_score": 0, "risk_level": "良好",
                "risk_color": "#10b981", "urgency": "",
                "item": "供应商分布合理",
                "detail": f"前三大供应商采购占比 {top3_pct:.0f}%，供应商体系较为分散。",
                "suggestion": "继续保持合理的供应商结构。"
            })


# ═══════════════════════════════════════════════════════════════
#  二十、财务健康分析（新增 P1）
# ═══════════════════════════════════════════════════════════════

def _analyze_financial_health(db, company_id, ps, pe, results):
    """盈利能力/偿债能力/营运能力"""
    revenue = _get_account_sum(db, company_id, "6001", ps, pe, "credit")
    cost = _get_account_sum(db, company_id, "6401", ps, pe, "debit")
    total_assets = _get_account_balance(db, company_id, "1")
    total_liab = _get_account_balance(db, company_id, "2")
    current_assets = _get_account_balance(db, company_id, "11") + _get_account_balance(db, company_id, "12")
    current_liab = _get_account_balance(db, company_id, "21") + _get_account_balance(db, company_id, "22")
    net_profit = revenue - cost - _get_account_sum(db, company_id, "6601", ps, pe, "debit") - _get_account_sum(db, company_id, "6602", ps, pe, "debit") - _get_account_sum(db, company_id, "6603", ps, pe, "debit")
    equity = total_assets - total_liab

    metrics = {}
    if revenue > 0:
        metrics["毛利率"] = round((revenue - cost) / revenue * 100, 1)
        metrics["净利率"] = round(net_profit / revenue * 100, 1)
    if total_assets > 0:
        metrics["资产负债率"] = round(total_liab / total_assets * 100, 1)
    if equity > 0:
        metrics["净资产收益率"] = round(net_profit / equity * 100, 1) if net_profit != 0 else 0
    if current_liab > 0 and current_assets > 0:
        metrics["流动比率"] = round(current_assets / current_liab, 2)
    if total_assets > 0 and revenue > 0:
        metrics["总资产周转率"] = round(revenue / total_assets, 2)

    # 风险评估
    warnings = []
    if "资产负债率" in metrics and metrics["资产负债率"] > 70:
        warnings.append(f"资产负债率{metrics['资产负债率']}%（>70%偏高，偿债压力大）")
    if "流动比率" in metrics and metrics["流动比率"] < 1:
        warnings.append(f"流动比率{metrics['流动比率']}（<1可能面临短期偿债困难）")
    if "毛利率" in metrics and metrics["毛利率"] < 0:
        warnings.append(f"毛利率{metrics['毛利率']}%（亏损经营）")
    if "净利率" in metrics and metrics["净利率"] < 0:
        warnings.append(f"净利率{metrics['净利率']}%（整体经营亏损）")

    metric_str = " / ".join([f"{k}:{v}{'%' if '%' in k else ''}" for k, v in sorted(metrics.items())])

    if warnings:
        results.append({
            "category": "财务健康", "category_icon": "💹", "risk_score": 7, "risk_level": "高风险",
            "risk_color": "#dc2626", "urgency": "紧急",
            "item": "财务健康状况堪忧",
            "detail": f"核心财务指标：{metric_str}。关键风险：{'；'.join(warnings)}。这些指标恶化可能影响持续经营能力判断和银行授信。",
            "suggestion": "制定财务改善计划：(1)控制成本费用支出；(2)加强应收账款回收和存货管理；(3)优化资本结构降低负债率；(4)必要时补充资本金或引入战略投资者。"
        })
    elif metrics:
        has_issues = any([
            metrics.get("资产负债率", 0) > 60,
            metrics.get("流动比率", 99) < 1.5,
            metrics.get("毛利率", 99) < 15
        ])
        if has_issues:
            results.append({
                "category": "财务健康", "category_icon": "💹", "risk_score": 3, "risk_level": "低风险",
                "risk_color": "#3b82f6", "urgency": "建议",
                "item": "部分财务指标需要关注",
                "detail": f"核心财务指标：{metric_str}。部分指标偏离了健康区间，建议关注并改善。",
                "suggestion": "持续监控财务指标变化，重点关注毛利率趋势和应收账款周转效率。"
            })
        else:
            results.append({
                "category": "财务健康", "category_icon": "💹", "risk_score": 0, "risk_level": "良好",
                "risk_color": "#10b981", "urgency": "",
                "item": "财务指标总体健康",
                "detail": f"核心财务指标：{metric_str}。各项指标均在合理区间内，财务状况良好。",
                "suggestion": "继续保持良好的财务管理水平。"
            })


# ═══════════════════════════════════════════════════════════════
#  二十一、企业信用（新增 P2）
# ═══════════════════════════════════════════════════════════════

def _analyze_business_credit(db, company_id, ps, pe, results):
    """企业经营信用评估（基于系统内数据）"""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        return

    company_name = company.name or ""

    # 21.1 空壳公司特征判断
    shell_indicators = []
    entry_count = db.query(func.count(JournalEntry.id)).filter(
        JournalEntry.company_id == company_id).scalar() or 0
    emp_count = db.query(func.count(Employee.id)).filter(
        Employee.company_id == company_id).scalar() or 0
    fixed_count = db.query(func.count(FixedAsset.id)).filter(
        FixedAsset.company_id == company_id).scalar() or 0
    revenue_total = _get_account_sum(db, company_id, "6001", ps, pe, "credit")

    if entry_count < 10:
        shell_indicators.append("凭证数量极少")
    if emp_count == 0:
        shell_indicators.append("无员工记录")
    if fixed_count == 0:
        shell_indicators.append("无固定资产")
    if revenue_total < 10000 and entry_count > 0:
        shell_indicators.append("营业收入极低")

    if len(shell_indicators) >= 3:
        results.append({
            "category": "企业信用", "category_icon": "🏛️", "risk_score": 7, "risk_level": "高风险",
            "risk_color": "#dc2626", "urgency": "紧急",
            "item": "存在空壳公司迹象",
            "detail": f"系统检测到以下异常：{'；'.join(shell_indicators)}。这些特征可能与空壳公司画像吻合，税务机关对此类企业关注度较高。",
            "suggestion": "确保公司有实际经营场所、真实员工和正常业务活动。如为初创企业，尽快补充人员、资产和业务记录。"
        })
    elif len(shell_indicators) >= 1:
        results.append({
            "category": "企业信用", "category_icon": "🏛️", "risk_score": 3, "risk_level": "低风险",
            "risk_color": "#3b82f6", "urgency": "建议",
            "item": "企业经营记录尚不完整",
            "detail": f"以下方面需要完善：{'；'.join(shell_indicators)}。经营记录不完整可能影响税务评级和信用等级。",
            "suggestion": "完善企业基础档案，确保人、财、物各项记录完整。"
        })

    # 21.2 经营异常判断
    if entry_count > 50 and emp_count >= 1 and fixed_count >= 1 and revenue_total > 100000:
        results.append({
            "category": "企业信用", "category_icon": "🏛️", "risk_score": 0, "risk_level": "良好",
            "risk_color": "#10b981", "urgency": "",
            "item": "企业经营实体特征正常",
            "detail": f"公司有 {entry_count} 条凭证、{emp_count} 名员工、{fixed_count} 项固定资产，营业收入 {revenue_total:,.2f} 元，经营实体特征完整。",
            "suggestion": "保持正常经营活动，按期进行工商年报和税务申报。"
        })


# ═══════════════════════════════════════════════════════════════
#  二十二、行业专项指标（新增 P2）
# ═══════════════════════════════════════════════════════════════

INDUSTRY_BENCHMARKS = {
    "制造业": {"gross_margin": 15, "vat_burden": 3.0},
    "建筑业": {"gross_margin": 10, "vat_burden": 2.5},
    "批发零售": {"gross_margin": 5, "vat_burden": 1.0},
    "交通运输": {"gross_margin": 15, "vat_burden": 2.0},
    "住宿餐饮": {"gross_margin": 40, "vat_burden": 2.5},
    "信息技术": {"gross_margin": 25, "vat_burden": 3.0},
    "租赁商务": {"gross_margin": 20, "vat_burden": 2.0},
    "居民服务": {"gross_margin": 30, "vat_burden": 2.5},
    "文化体育": {"gross_margin": 25, "vat_burden": 2.5},
    "房地产": {"gross_margin": 30, "vat_burden": 3.5},
}


def _analyze_industry_specific(db, company_id, ps, pe, results):
    """行业专项指标对比"""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        return
    company_info = (company.business_scope or '') + (company.company_type or '')
    benchmark = None
    found_industry = None
    for key in INDUSTRY_BENCHMARKS:
        if key in company_info:
            benchmark = INDUSTRY_BENCHMARKS[key]
            found_industry = key
            break

    if not benchmark:
        return

    revenue = _get_account_sum(db, company_id, "6001", ps, pe, "credit")
    cost = _get_account_sum(db, company_id, "6401", ps, pe, "debit")
    actual_margin = (revenue - cost) / revenue * 100 if revenue > 0 else 0

    # 增值税实际税负
    vat_list = db.query(VATDeclaration).filter(
        VATDeclaration.company_id == company_id,
        VATDeclaration.period >= ps, VATDeclaration.period <= pe
    ).all()
    vat_sales = 0
    vat_payable = 0
    for v in vat_list:
        if v.form_main:
            fm = v.form_main if isinstance(v.form_main, dict) else json.loads(v.form_main)
            vat_sales += _safe_float(fm.get("sales_amount") or fm.get("total_sales"))
            vat_payable += _safe_float(fm.get("vat_payable"))
    actual_vat_burden = vat_payable / vat_sales * 100 if vat_sales > 0 else 0

    # 制造业特有：电费与产值
    if "制造" in company_info:
        electricity = _safe_float(db.query(func.sum(JournalEntry.debit_amount)).filter(
            JournalEntry.company_id == company_id, JournalEntry.period >= ps, JournalEntry.period <= pe,
            func.lower(JournalEntry.summary).contains("电费")).scalar())
        if electricity > 0 and revenue > 0:
            elec_ratio = electricity / revenue * 100
            if elec_ratio < 1:
                results.append({
                    "category": "行业专项", "category_icon": "🏭", "risk_score": 5, "risk_level": "中风险",
                    "risk_color": "#f59e0b", "urgency": "提醒",
                    "item": "制造业电费占收入比偏低",
                    "detail": f"制造业电费 {electricity:,.2f} 元，占收入 {elec_ratio:.2f}%。电费与产值严重不匹配可能暗示产能虚报或存在账外收入。",
                    "suggestion": "核实生产用电是否与产量匹配。关注是否存在部分厂房出租但电费仍由公司承担的情况。"
                })

    # 通用行业指标对比
    margin_gap = abs(actual_margin - benchmark["gross_margin"])
    if margin_gap > 20:
        results.append({
            "category": "行业专项", "category_icon": "📊", "risk_score": 5, "risk_level": "中风险",
            "risk_color": "#f59e0b", "urgency": "提醒",
            "item": f"毛利率偏离{found_industry}行业参考值",
            "detail": f"实际毛利率 {actual_margin:.1f}%，{found_industry}行业参考毛利率 {benchmark['gross_margin']}%，偏差 {margin_gap:.1f} 个百分点。大幅偏离行业均值可能引起税务机关关注。",
            "suggestion": "如毛利率显著偏低：核查成本核算是否准确、是否存在关联交易转移利润。如毛利率显著偏高：确认收入是否完整入账。"
        })
    elif actual_vat_burden > 0 and benchmark["vat_burden"] > 0:
        vat_gap = abs(actual_vat_burden - benchmark["vat_burden"])
        if vat_gap > 1.5:
            results.append({
                "category": "行业专项", "category_icon": "📊", "risk_score": 4, "risk_level": "中风险",
                "risk_color": "#f59e0b", "urgency": "提醒",
                "item": f"增值税税负偏离{industry}行业均值",
                "detail": f"增值税实际税负 {actual_vat_burden:.2f}%，{industry}行业参考值 {benchmark['vat_burden']}%，偏差 {vat_gap:.1f} 个百分点。",
                "suggestion": "税负偏低：分析是否有大量留抵或进项税额过大。税负偏高：检查进项税额是否应抵尽抵。"
            })


# ═══════════════════════════════════════════════════════════════
#  二十三、良好实践
# ═══════════════════════════════════════════════════════════════

def _analyze_good_practices(db, company_id, ps, pe, results):
    """识别做得好的事项"""
    pi_total = db.query(func.count(PurchaseInvoice.id)).filter(
        PurchaseInvoice.company_id == company_id).scalar() or 0

    if pi_total > 0:
        pi_has_tax = db.query(func.count(PurchaseInvoice.id)).filter(
            PurchaseInvoice.company_id == company_id,
            PurchaseInvoice.seller_tax_no != None, PurchaseInvoice.seller_tax_no != "").scalar() or 0
        if pi_has_tax / pi_total >= 0.9:
            results.append({
                "category": "良好实践", "category_icon": "✅", "risk_score": 0, "risk_level": "良好",
                "risk_color": "#10b981", "urgency": "",
                "item": "进项发票税号填写规范",
                "detail": f"进项发票供应商税号填写率 {pi_has_tax/pi_total*100:.0f}%，发票管理较为规范。",
                "suggestion": "继续保持。"
            })

    entry_count = db.query(func.count(JournalEntry.id)).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period >= ps, JournalEntry.period <= pe).scalar() or 0
    if entry_count > 50:
        results.append({
            "category": "良好实践", "category_icon": "✅", "risk_score": 0, "risk_level": "良好",
            "risk_color": "#10b981", "urgency": "",
            "item": "账务记录较为完整",
            "detail": f"分析期间内有 {entry_count} 条序时账记录，说明账务处理较为及时和完整。",
            "suggestion": "继续保持。"
        })

    risk_cnt = db.query(func.count(PurchaseInvoice.id)).filter(
        PurchaseInvoice.company_id == company_id,
        PurchaseInvoice.invoice_risk_level.in_(["疑点", "异常", "失控"])).scalar() or 0
    if pi_total > 0 and risk_cnt == 0:
        results.append({
            "category": "良好实践", "category_icon": "✅", "risk_score": 0, "risk_level": "良好",
            "risk_color": "#10b981", "urgency": "",
            "item": "进项发票无异常风险标记",
            "detail": f"全部 {pi_total} 张进项发票均无异常风险标记，发票管理质量良好。",
            "suggestion": "继续保持。"
        })

    vat_count = db.query(func.count(VATDeclaration.id)).filter(
        VATDeclaration.company_id == company_id).scalar() or 0
    if vat_count > 0:
        results.append({
            "category": "良好实践", "category_icon": "✅", "risk_score": 0, "risk_level": "良好",
            "risk_color": "#10b981", "urgency": "",
            "item": "已进行增值税按期申报",
            "detail": f"系统中有 {vat_count} 期增值税申报记录，税务申报工作按时开展。",
            "suggestion": "继续保持按期申报。"
        })

    # 社保公积金
    ss_ok = db.query(func.count(SocialSecurityDeclaration.id)).filter(
        SocialSecurityDeclaration.company_id == company_id).scalar() or 0
    hf_ok = db.query(func.count(HousingFundDeclaration.id)).filter(
        HousingFundDeclaration.company_id == company_id).scalar() or 0
    if ss_ok > 0 and hf_ok > 0:
        results.append({
            "category": "良好实践", "category_icon": "✅", "risk_score": 0, "risk_level": "良好",
            "risk_color": "#10b981", "urgency": "",
            "item": "已建立社保和公积金缴存体系",
            "detail": "已申报社会保险费和住房公积金，五险一金缴存体系已建立。",
            "suggestion": "继续保持按期全员足额缴存。"
        })
