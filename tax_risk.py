"""
涉税风险分析报告模块
综合分析评估：账务数据、成本结构、发票合规、税负水平、政策执行
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case, extract
from datetime import date, timedelta
from typing import Optional, List

from database import get_db, Company, Account, JournalEntry
from database import SalesInvoice, PurchaseInvoice, BookkeepingInvoice
from database import VATDeclaration, InputVATDeduction, BankTransaction
from database import SalaryRecord, SocialSecurityDetail, HousingFundDetail
from database import CulturalConstructionFeeDeclaration
from database import FixedAsset, IntangibleAsset
from database import Customer, Supplier, Employee, Contract, Payment

router = APIRouter(prefix="/api/tax-risk", tags=["涉税风险分析"])


# ── 工具函数 ──

def _safe_float(val, default=0.0):
    if val is None:
        return default
    return float(val)


def _risk_level(score: int) -> str:
    if score >= 7:
        return "高风险"
    elif score >= 4:
        return "中风险"
    elif score >= 1:
        return "低风险"
    return "良好"


def _risk_color(score: int) -> str:
    if score >= 7:
        return "#dc2626"
    elif score >= 4:
        return "#f59e0b"
    elif score >= 1:
        return "#3b82f6"
    return "#10b981"


def _get_period_range(db: Session, company_id: int):
    """获取公司数据期间范围"""
    min_entry = db.query(func.min(JournalEntry.entry_date)).filter(
        JournalEntry.company_id == company_id
    ).scalar()
    max_entry = db.query(func.max(JournalEntry.entry_date)).filter(
        JournalEntry.company_id == company_id
    ).scalar()
    if min_entry and max_entry:
        return str(min_entry), str(max_entry)
    return None, None


def _get_account_balance(db: Session, company_id: int, account_code: str, period: str = None) -> float:
    """获取科目余额"""
    q = db.query(
        func.coalesce(func.sum(JournalEntry.debit_amount), 0),
        func.coalesce(func.sum(JournalEntry.credit_amount), 0)
    ).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.account_code.like(account_code + '%')
    )
    if period:
        q = q.filter(JournalEntry.period <= period)
    debit, credit = q.first()
    return _safe_float(debit) - _safe_float(credit)


# ── 风险分析核心 ──

@router.get("/report")
def get_tax_risk_report(
    company_id: int = Query(...),
    period: Optional[str] = Query(None, description="分析期间 YYYY-MM，默认最近6个月"),
    db: Session = Depends(get_db)
):
    """
    生成涉税风险分析报告
    返回结构化风险清单，按维度分类
    """
    results = []

    # 确定分析范围
    if period:
        period_start = period
        period_end = period
    else:
        # 最近6个月
        latest = db.query(func.max(VATDeclaration.period)).filter(
            VATDeclaration.company_id == company_id
        ).scalar()
        if latest:
            period_end = latest
            y, m = int(latest[:4]), int(latest[5:7])
            m -= 5
            if m <= 0:
                m += 12
                y -= 1
            period_start = f"{y}-{m:02d}"
        else:
            period_start = period_end = date.today().strftime("%Y-%m")

    # ── 一、账务数据风险 ──
    _analyze_accounting_risks(db, company_id, period_start, period_end, results)

    # ── 二、发票合规风险 ──
    _analyze_invoice_risks(db, company_id, period_start, period_end, results)

    # ── 三、成本结构风险 ──
    _analyze_cost_risks(db, company_id, period_start, period_end, results)

    # ── 四、税负水平风险 ──
    _analyze_tax_burden_risks(db, company_id, period_start, period_end, results)

    # ── 五、政策执行风险 ──
    _analyze_policy_risks(db, company_id, period_start, period_end, results)

    # ── 六、资金与往来风险 ──
    _analyze_capital_risks(db, company_id, period_start, period_end, results)

    # ── 七、薪酬合规风险 ──
    _analyze_salary_risks(db, company_id, period_start, period_end, results)

    # ── 八、良好事项 ──
    _analyze_good_practices(db, company_id, period_start, period_end, results)

    # 按严重度排序
    results.sort(key=lambda x: (x.get("risk_score", 0)), reverse=True)

    # 汇总统计
    high_count = sum(1 for r in results if r.get("risk_level") == "高风险")
    mid_count = sum(1 for r in results if r.get("risk_level") == "中风险")
    low_count = sum(1 for r in results if r.get("risk_level") == "低风险")
    good_count = sum(1 for r in results if r.get("risk_level") == "良好")
    total_score = sum(r.get("risk_score", 0) for r in results)

    return {
        "company_id": company_id,
        "period_start": period_start,
        "period_end": period_end,
        "summary": {
            "total_items": len(results),
            "high_risk_count": high_count,
            "mid_risk_count": mid_count,
            "low_risk_count": low_count,
            "good_count": good_count,
            "overall_risk_score": total_score,
            "overall_risk_level": "高风险" if total_score >= 30 else ("中风险" if total_score >= 15 else ("低风险" if total_score >= 5 else "良好"))
        },
        "results": results
    }


# ── 一、账务数据风险 ──

def _analyze_accounting_risks(db: Session, company_id: int, ps: str, pe: str, results: list):
    """账务数据异常检测"""
    # 1.1 借贷平衡检查（逐月）
    entries = db.query(
        JournalEntry.period,
        func.sum(JournalEntry.debit_amount).label("debit"),
        func.sum(JournalEntry.credit_amount).label("credit"),
        func.count(JournalEntry.id).label("cnt")
    ).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period >= ps,
        JournalEntry.period <= pe
    ).group_by(JournalEntry.period).all()

    unbalanced = []
    for e in entries:
        diff = abs(_safe_float(e.debit) - _safe_float(e.credit))
        if diff > 0.01:
            unbalanced.append(e.period)

    if unbalanced:
        results.append({
            "category": "账务数据",
            "category_icon": "📊",
            "item": "借贷不平衡",
            "detail": f"以下期间借贷方金额不相等：{', '.join(unbalanced)}。借贷不平衡会导致报表数据失真，影响税务申报准确性。",
            "risk_score": 9,
            "risk_level": "高风险",
            "risk_color": "#dc2626",
            "suggestion": "逐月排查序时账，检查是否有凭证漏记或金额录入错误，确保每笔凭证借贷金额相等。",
            "urgency": "紧急"
        })

    # 1.2 期间凭证数量异常（过少或过多）
    for e in entries:
        cnt = int(e.cnt)
        if cnt == 0:
            results.append({
                "category": "账务数据",
                "category_icon": "📊",
                "item": f"期间 {e.period} 无凭证记录",
                "detail": f"{e.period} 期间没有任何序时账记录，可能尚未开始账务处理。",
                "risk_score": 7,
                "risk_level": "高风险",
                "risk_color": "#dc2626",
                "suggestion": "立即检查该期间是否漏记账务，补充必要的凭证录入。",
                "urgency": "紧急"
            })
        elif cnt > 500:
            results.append({
                "category": "账务数据",
                "category_icon": "📊",
                "item": f"期间 {e.period} 凭证量异常偏高",
                "detail": f"{e.period} 期间有 {cnt} 条凭证记录，远超常规。需确认是否存在重复录入或批量导入错误。",
                "risk_score": 4,
                "risk_level": "中风险",
                "risk_color": "#f59e0b",
                "suggestion": "核查是否重复导入或批量操作异常，建议抽查大额凭证的真实性。",
                "urgency": "提醒"
            })

    # 1.3 固定资产/无形资产是否计提折旧摊销
    fixed_count = db.query(func.count(FixedAsset.id)).filter(
        FixedAsset.company_id == company_id,
        FixedAsset.status.in_(["在用", "闲置"])
    ).scalar()
    intangible_count = db.query(func.count(IntangibleAsset.id)).filter(
        IntangibleAsset.company_id == company_id,
        IntangibleAsset.status.in_(["在用", "闲置"])
    ).scalar()

    if fixed_count and fixed_count > 0:
        # 检查是否有折旧凭证
        depr_entries = db.query(func.count(JournalEntry.id)).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.period >= ps,
            JournalEntry.account_code.like("1602%"),  # 累计折旧
            func.lower(JournalEntry.summary).contains("折旧")
        ).scalar()
        if not depr_entries:
            results.append({
                "category": "账务数据",
                "category_icon": "📊",
                "item": "未计提固定资产折旧",
                "detail": f"系统中有 {fixed_count} 项在用/闲置固定资产，但未发现折旧计提凭证。漏提折旧会导致利润虚增、多缴企业所得税。",
                "risk_score": 8,
                "risk_level": "高风险",
                "risk_color": "#dc2626",
                "suggestion": "按企业会计准则第4号，当月增加的固定资产次月起计提折旧，检查是否漏记折旧费用。",
                "urgency": "紧急"
            })

    if intangible_count and intangible_count > 0:
        amor_entries = db.query(func.count(JournalEntry.id)).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.period >= ps,
            func.lower(JournalEntry.summary).contains("摊销")
        ).scalar()
        if not amor_entries:
            results.append({
                "category": "账务数据",
                "category_icon": "📊",
                "item": "未计提无形资产摊销",
                "detail": f"系统中有 {intangible_count} 项无形资产，但未发现摊销凭证。漏摊销会导致利润虚增。",
                "risk_score": 6,
                "risk_level": "中风险",
                "risk_color": "#f59e0b",
                "suggestion": "按照无形资产摊销政策，检查是否漏记摊销费用。",
                "urgency": "提醒"
            })


# ── 二、发票合规风险 ──

def _analyze_invoice_risks(db: Session, company_id: int, ps: str, pe: str, results: list):
    """发票合规性分析"""
    # 2.1 进项发票风险标记
    risk_invoices = db.query(
        func.count(PurchaseInvoice.id),
        func.sum(PurchaseInvoice.total_amount)
    ).filter(
        PurchaseInvoice.company_id == company_id,
        PurchaseInvoice.invoice_risk_level.in_(["疑点", "异常", "失控"])
    ).first()

    risk_cnt, risk_amt = risk_invoices
    if risk_cnt and risk_cnt > 0:
        results.append({
            "category": "发票合规",
            "category_icon": "🧾",
            "item": "存在风险进项发票",
            "detail": f"有 {risk_cnt} 张进项发票被标记为「疑点/异常/失控」，涉及金额 {_safe_float(risk_amt):,.2f} 元。异常发票进项税额不得抵扣，已抵扣需做进项税额转出。",
            "risk_score": 9,
            "risk_level": "高风险",
            "risk_color": "#dc2626",
            "suggestion": "立即核实风险发票来源，如确认异常应及时做进项税额转出处理，避免税务稽查风险。",
            "urgency": "紧急"
        })

    # 2.2 销项发票作废/红冲率
    total_sales = db.query(func.count(SalesInvoice.id)).filter(
        SalesInvoice.company_id == company_id
    ).scalar() or 0

    void_cnt = db.query(func.count(SalesInvoice.id)).filter(
        SalesInvoice.company_id == company_id,
        SalesInvoice.status.in_(["作废", "红冲"])
    ).scalar() or 0

    if total_sales > 0:
        void_rate = void_cnt / total_sales * 100
        if void_rate > 10:
            results.append({
                "category": "发票合规",
                "category_icon": "🧾",
                "item": "销项发票作废/红冲率偏高",
                "detail": f"销项发票作废/红冲率为 {void_rate:.1f}%（{void_cnt}/{total_sales}），远超正常水平（<5%）。异常高的作废率可能被税务机关重点关注。",
                "risk_score": 7 if void_rate > 20 else 5,
                "risk_level": "高风险" if void_rate > 20 else "中风险",
                "risk_color": "#dc2626" if void_rate > 20 else "#f59e0b",
                "suggestion": "核查作废和红冲原因，是否符合国家税务总局公告2016年第47号规定的红冲条件。避免频繁作废发票。",
                "urgency": "紧急" if void_rate > 20 else "提醒"
            })

    # 2.3 进销项税号为空
    pi_empty_tax = db.query(func.count(PurchaseInvoice.id)).filter(
        PurchaseInvoice.company_id == company_id,
        (PurchaseInvoice.seller_tax_no == None) | (PurchaseInvoice.seller_tax_no == "")
    ).scalar()

    si_empty_tax = db.query(func.count(SalesInvoice.id)).filter(
        SalesInvoice.company_id == company_id,
        (SalesInvoice.buyer_tax_no == None) | (SalesInvoice.buyer_tax_no == "")
    ).scalar()

    if pi_empty_tax:
        results.append({
            "category": "发票合规",
            "category_icon": "🧾",
            "item": "进项发票缺少供应商税号",
            "detail": f"有 {pi_empty_tax} 张进项发票的供应商税号为空。缺少税号的发票可能无法正常认证抵扣。",
            "risk_score": 5,
            "risk_level": "中风险",
            "risk_color": "#f59e0b",
            "suggestion": "完善供应商档案信息，确保每张进项发票都有完整的供应商纳税人识别号。",
            "urgency": "提醒"
        })

    if si_empty_tax:
        results.append({
            "category": "发票合规",
            "category_icon": "🧾",
            "item": "销项发票缺少购买方税号",
            "detail": f"有 {si_empty_tax} 张销项发票的购买方税号为空。缺少购买方税号可能影响对方认证抵扣。",
            "risk_score": 4,
            "risk_level": "中风险",
            "risk_color": "#f59e0b",
            "suggestion": "完善客户档案信息，开票时要求提供纳税人识别号。",
            "urgency": "提醒"
        })

    # 2.4 进项抵扣风险
    input_risk = db.query(func.count(InputVATDeduction.id)).filter(
        InputVATDeduction.company_id == company_id,
        InputVATDeduction.risk_level.in_(["疑点", "异常", "失控"])
    ).scalar()
    if input_risk:
        results.append({
            "category": "发票合规",
            "category_icon": "🧾",
            "item": "进项抵扣存在风险记录",
            "detail": f"有 {input_risk} 条进项抵扣记录被标记为风险状态。需逐条核实抵扣凭证的真实性和合规性。",
            "risk_score": 8,
            "risk_level": "高风险",
            "risk_color": "#dc2626",
            "suggestion": "逐条核查风险进项抵扣记录，确认发票来源和业务真实性，必要时做进项税额转出。",
            "urgency": "紧急"
        })


# ── 三、成本结构风险 ──

def _analyze_cost_risks(db: Session, company_id: int, ps: str, pe: str, results: list):
    """成本结构异常分析"""
    # 3.1 收入成本匹配
    revenue = db.query(func.sum(JournalEntry.credit_amount)).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.account_code.like("6001%"),  # 主营业务收入
        JournalEntry.period >= ps,
        JournalEntry.period <= pe
    ).scalar()

    cost = db.query(func.sum(JournalEntry.debit_amount)).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.account_code.like("6401%"),  # 主营业务成本
        JournalEntry.period >= ps,
        JournalEntry.period <= pe
    ).scalar()

    revenue = _safe_float(revenue)
    cost = _safe_float(cost)

    if revenue > 0:
        gross_margin = (revenue - cost) / revenue * 100
        if gross_margin < 0:
            results.append({
                "category": "成本结构",
                "category_icon": "📈",
                "item": "收入成本倒挂",
                "detail": f"主营业务收入 {revenue:,.2f} 元，主营业务成本 {cost:,.2f} 元，毛利率为 {gross_margin:.1f}%。成本大于收入属于严重异常，可能涉及少计收入或多列成本。",
                "risk_score": 9,
                "risk_level": "高风险",
                "risk_color": "#dc2626",
                "suggestion": "核查收入是否完整入账、成本核算是否准确，是否存在跨期调节利润的行为。",
                "urgency": "紧急"
            })
        elif gross_margin < 5:
            results.append({
                "category": "成本结构",
                "category_icon": "📈",
                "item": "毛利率偏低",
                "detail": f"毛利率仅为 {gross_margin:.1f}%，远低于一般行业水平。低毛利率可能被税务机关质疑定价不合理或隐瞒收入。",
                "risk_score": 5,
                "risk_level": "中风险",
                "risk_color": "#f59e0b",
                "suggestion": "分析成本构成，确认是否存在非正常成本支出；检查关联交易定价是否公允。",
                "urgency": "提醒"
            })

    # 3.2 三项费用占比检查
    mgmt_exp = _safe_float(db.query(func.sum(JournalEntry.debit_amount)).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.account_code.like("6602%"),  # 管理费用
        JournalEntry.period >= ps, JournalEntry.period <= pe
    ).scalar())

    sales_exp = _safe_float(db.query(func.sum(JournalEntry.debit_amount)).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.account_code.like("6601%"),  # 销售费用
        JournalEntry.period >= ps, JournalEntry.period <= pe
    ).scalar())

    fin_exp = _safe_float(db.query(func.sum(JournalEntry.debit_amount)).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.account_code.like("6603%"),  # 财务费用
        JournalEntry.period >= ps, JournalEntry.period <= pe
    ).scalar())

    total_exp = mgmt_exp + sales_exp + fin_exp
    if revenue > 0 and total_exp / revenue > 0.5:
        results.append({
            "category": "成本结构",
            "category_icon": "📈",
            "item": "期间费用占比过高",
            "detail": f"三项期间费用合计 {total_exp:,.2f} 元，占收入 {total_exp/revenue*100:.1f}%。费用率过高可能影响企业所得税应纳税所得额计算。",
            "risk_score": 3,
            "risk_level": "低风险",
            "risk_color": "#3b82f6",
            "suggestion": "检查费用报销的合理性和合规性，确认各项费用的税前扣除政策。",
            "urgency": "建议"
        })

    # 3.3 业务招待费检查
    entertainment = _safe_float(db.query(func.sum(JournalEntry.debit_amount)).filter(
        JournalEntry.company_id == company_id,
        func.lower(JournalEntry.summary).contains("招待"),
        JournalEntry.period >= ps, JournalEntry.period <= pe
    ).scalar())

    if entertainment > 0 and revenue > 0:
        ent_rate = entertainment / revenue * 100
        if ent_rate > 0.5:
            results.append({
                "category": "成本结构",
                "category_icon": "📈",
                "item": "业务招待费可能超标",
                "detail": f"业务招待费 {entertainment:,.2f} 元，占收入 {ent_rate:.2f}%。按税法规定，业务招待费按发生额60%扣除，且不得超过营业收入5‰。",
                "risk_score": 5 if ent_rate > 1 else 3,
                "risk_level": "中风险" if ent_rate > 1 else "低风险",
                "risk_color": "#f59e0b" if ent_rate > 1 else "#3b82f6",
                "suggestion": "汇算清缴时注意纳税调增超标部分。建议控制业务招待费，完善报销审批流程。",
                "urgency": "提醒"
            })


# ── 四、税负水平风险 ──

def _analyze_tax_burden_risks(db: Session, company_id: int, ps: str, pe: str, results: list):
    """税负水平分析"""
    # 4.1 增值税税负率
    vat_list = db.query(VATDeclaration).filter(
        VATDeclaration.company_id == company_id,
        VATDeclaration.period >= ps,
        VATDeclaration.period <= pe
    ).order_by(VATDeclaration.period).all()

    low_vat_periods = []
    for v in vat_list:
        if v.form_main:
            import json
            fm = v.form_main if isinstance(v.form_main, dict) else json.loads(v.form_main)
            sales = _safe_float(fm.get("sales_amount")) or _safe_float(fm.get("total_sales"))
            vat_payable = _safe_float(fm.get("vat_payable"))
            if sales > 0:
                rate = vat_payable / sales * 100
                if rate < 0.5:
                    low_vat_periods.append(f"{v.period}({rate:.2f}%)")

    if low_vat_periods:
        results.append({
            "category": "税负水平",
            "category_icon": "💰",
            "item": "增值税税负率偏低",
            "detail": f"以下期间增值税税负率低于0.5%，可能触发税务预警：{', '.join(low_vat_periods)}。不同行业有预警税负率参照值。",
            "risk_score": 6,
            "risk_level": "中风险",
            "risk_color": "#f59e0b",
            "suggestion": "分析税负偏低原因（如期末留抵、免税收入、进项税额过大等），做好合理解释准备。避免增值税税负率持续低于行业预警值。",
            "urgency": "提醒"
        })

    # 4.2 CCF 减征是否应用
    ccf = db.query(CulturalConstructionFeeDeclaration).filter(
        CulturalConstructionFeeDeclaration.company_id == company_id,
        CulturalConstructionFeeDeclaration.period >= ps,
        CulturalConstructionFeeDeclaration.period <= pe
    ).first()

    if ccf:
        rate = _safe_float(ccf.fee_reduction_rate, 0.5)
        reduction = _safe_float(ccf.row10a_fee_reduction_current, 0)
        if rate < 0.01 and reduction < 1:
            results.append({
                "category": "政策执行",
                "category_icon": "📋",
                "item": "文化事业建设费未享受50%减征优惠",
                "detail": f"期间 {ccf.period} 文化事业建设费申报未应用财税〔2025〕7号的50%减征优惠，可能多缴费款。",
                "risk_score": 2,
                "risk_level": "低风险",
                "risk_color": "#3b82f6",
                "suggestion": "确认是否符合减征条件，如符合应在下次申报时应用50%减征。已多缴的款项可咨询税务机关办理退抵。",
                "urgency": "建议"
            })
        elif reduction > 0:
            results.append({
                "category": "政策执行",
                "category_icon": "📋",
                "item": "已享受文化事业建设费50%减征",
                "detail": f"期间 {ccf.period} 已正确应用财税〔2025〕7号减征优惠，减免额 {reduction:,.2f} 元。",
                "risk_score": 0,
                "risk_level": "良好",
                "risk_color": "#10b981",
                "suggestion": "继续保持。",
                "urgency": ""
            })


# ── 五、政策执行风险 ──

def _analyze_policy_risks(db: Session, company_id: int, ps: str, pe: str, results: list):
    """政策执行风险"""
    # 5.1 社保公积金基数一致性
    ss_details = db.query(SocialSecurityDetail).filter(
        SocialSecurityDetail.declaration_id.in_(
            db.query(SocialSecurityDetail.declaration_id).distinct()
        )
    ).all()
    # 简化检查：查看是否有员工社保工资基数
    if not ss_details:
        results.append({
            "category": "政策执行",
            "category_icon": "📋",
            "item": "未发现社保缴存记录",
            "detail": "系统中未检测到社会保险费申报记录。未依法缴纳社保存在劳动监察和补缴风险。",
            "risk_score": 8,
            "risk_level": "高风险",
            "risk_color": "#dc2626",
            "suggestion": "依法为员工缴纳社会保险费，包括养老、医疗、失业、工伤、生育保险。",
            "urgency": "紧急"
        })

    hf_details = db.query(func.count(HousingFundDetail.id)).filter(
        HousingFundDetail.company_id == company_id
    ).scalar()
    if not hf_details:
        results.append({
            "category": "政策执行",
            "category_icon": "📋",
            "item": "未发现住房公积金缴存记录",
            "detail": "系统中未检测到住房公积金缴存记录。未依法缴纳公积金存在被责令限期缴存的风险。",
            "risk_score": 6,
            "risk_level": "中风险",
            "risk_color": "#f59e0b",
            "suggestion": "按照《住房公积金管理条例》为员工缴存住房公积金。",
            "urgency": "提醒"
        })

    # 5.2 结账状态检查
    from database import Period as PeriodModel
    open_periods = db.query(func.count(PeriodModel.id)).filter(
        PeriodModel.company_id == company_id,
        PeriodModel.status == "开放",
        PeriodModel.period <= pe
    ).scalar()
    if open_periods and open_periods > 3:
        results.append({
            "category": "政策执行",
            "category_icon": "📋",
            "item": "存在多个未结账期间",
            "detail": f"有 {open_periods} 个开放状态的期间未结账。长期不结账可能导致账目混乱和数据不一致。",
            "risk_score": 4,
            "risk_level": "中风险",
            "risk_color": "#f59e0b",
            "suggestion": "定期进行月度结账，确保各期间数据独立完整。建议每月末及时结账。",
            "urgency": "提醒"
        })


# ── 六、资金与往来风险 ──

def _analyze_capital_risks(db: Session, company_id: int, ps: str, pe: str, results: list):
    """资金与往来款项风险"""
    # 6.1 银行存款与账面核对
    bank_deposit = _safe_float(db.query(func.sum(JournalEntry.debit_amount) - func.sum(JournalEntry.credit_amount)).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.account_code.like("1002%")
    ).scalar())

    if bank_deposit < 0:
        results.append({
            "category": "资金与往来",
            "category_icon": "🏦",
            "item": "银行存款余额为负",
            "detail": f"银行存款科目余额为 {bank_deposit:,.2f} 元（贷方）。银行存款余额为负说明可能存在记账错误或未达账项。",
            "risk_score": 8,
            "risk_level": "高风险",
            "risk_color": "#dc2626",
            "suggestion": "编制银行存款余额调节表，逐笔核对银行对账单与账面金额，查找差异原因并调整。",
            "urgency": "紧急"
        })

    # 6.2 应收账款/应付账款账龄
    ar_balance = _get_account_balance(db, company_id, "1122")
    ap_balance = _get_account_balance(db, company_id, "2202")

    if ar_balance > 0:
        # 检查是否有长期挂账
        early_ar = db.query(func.sum(JournalEntry.debit_amount)).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.account_code.like("1122%"),
            JournalEntry.entry_date < (date.today() - timedelta(days=365)).isoformat()
        ).scalar()
        if early_ar and early_ar > 0:
            results.append({
                "category": "资金与往来",
                "category_icon": "🏦",
                "item": "应收账款存在长期挂账",
                "detail": f"应收账款余额 {ar_balance:,.2f} 元，其中可能包含超过1年的长期挂账。长期未收回的应收账款存在坏账风险。",
                "risk_score": 5,
                "risk_level": "中风险",
                "risk_color": "#f59e0b",
                "suggestion": "清理应收账款，对长期挂账发函催收。根据账龄计提坏账准备，坏账损失需符合税法规定的条件方可税前扣除。",
                "urgency": "提醒"
            })

    # 6.3 其他应收款异常
    other_rec = _get_account_balance(db, company_id, "1221")
    if other_rec > 0:
        total_assets = _get_account_balance(db, company_id, "1")  # 资产类合计
        if total_assets > 0 and other_rec / total_assets > 0.1:
            results.append({
                "category": "资金与往来",
                "category_icon": "🏦",
                "item": "其他应收款占比偏高",
                "detail": f"其他应收款余额 {other_rec:,.2f} 元，占总资产 {other_rec/total_assets*100:.1f}%。股东借款或关联方占用资金可能涉及个人所得税风险。",
                "risk_score": 6,
                "risk_level": "中风险",
                "risk_color": "#f59e0b",
                "suggestion": "核查其他应收款明细，清理不合规的关联方资金占用。个人股东借款超过1年未归还的，需视同分红缴纳个人所得税。",
                "urgency": "提醒"
            })


# ── 七、薪酬合规风险 ──

def _analyze_salary_risks(db: Session, company_id: int, ps: str, pe: str, results: list):
    """薪酬发放与个税风险"""
    salary_records = db.query(SalaryRecord).filter(
        SalaryRecord.company_id == company_id,
        SalaryRecord.period >= ps,
        SalaryRecord.period <= pe
    ).all()

    if not salary_records:
        return

    # 7.1 全员按5000元基数（个税起征点刚好不纳税）
    low_income_count = 0
    for sr in salary_records:
        income = _safe_float(sr.current_income)
        if 4500 <= income <= 5500:
            low_income_count += 1

    total_emp = len(salary_records)
    if total_emp > 1 and low_income_count / total_emp > 0.5:
        results.append({
            "category": "薪酬合规",
            "category_icon": "👥",
            "item": "工资集中在个税起征点附近",
            "detail": f"{low_income_count}/{total_emp} 名员工的月收入集中在5,000元左右。全员收入在起征点附近可能被怀疑通过分拆工资等方式规避个税。",
            "risk_score": 5,
            "risk_level": "中风险",
            "risk_color": "#f59e0b",
            "suggestion": "确保工资发放真实反映员工劳动价值。如确有合理性（如全员均为基层员工），保留薪酬制度和岗位说明备查。",
            "urgency": "提醒"
        })

    # 7.2 个税计算检查
    zero_tax_count = sum(1 for sr in salary_records if _safe_float(sr.tax_payable) < 0.01)
    if zero_tax_count == total_emp and total_emp > 2:
        results.append({
            "category": "薪酬合规",
            "category_icon": "👥",
            "item": "全体员工均无需缴纳个税",
            "detail": f"全部 {total_emp} 名员工均未产生个人所得税。如确有高管或高薪人员，需核实是否少报收入或违规使用专项附加扣除。",
            "risk_score": 3,
            "risk_level": "低风险",
            "risk_color": "#3b82f6",
            "suggestion": "核实收入是否全额申报，特别是奖金、补贴等是否并入工资薪金所得计税。",
            "urgency": "建议"
        })


# ── 八、良好事项 ──

def _analyze_good_practices(db: Session, company_id: int, ps: str, pe: str, results: list):
    """识别做得好的事项"""
    # 8.1 发票税号完整
    pi_total = db.query(func.count(PurchaseInvoice.id)).filter(
        PurchaseInvoice.company_id == company_id
    ).scalar() or 0

    if pi_total > 0:
        pi_has_tax = db.query(func.count(PurchaseInvoice.id)).filter(
            PurchaseInvoice.company_id == company_id,
            PurchaseInvoice.seller_tax_no != None,
            PurchaseInvoice.seller_tax_no != ""
        ).scalar() or 0
        if pi_has_tax / pi_total >= 0.9:
            results.append({
                "category": "良好实践",
                "category_icon": "✅",
                "item": "进项发票税号填写规范",
                "detail": f"进项发票供应商税号填写率 {pi_has_tax/pi_total*100:.0f}%，发票管理较为规范。",
                "risk_score": 0,
                "risk_level": "良好",
                "risk_color": "#10b981",
                "suggestion": "继续保持。",
                "urgency": ""
            })

    # 8.2 凭证完整性
    entry_count = db.query(func.count(JournalEntry.id)).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period >= ps,
        JournalEntry.period <= pe
    ).scalar() or 0
    if entry_count > 50:
        results.append({
            "category": "良好实践",
            "category_icon": "✅",
            "item": "账务记录较为完整",
            "detail": f"分析期间内有 {entry_count} 条序时账记录，说明账务处理较为及时和完整。",
            "risk_score": 0,
            "risk_level": "良好",
            "risk_color": "#10b981",
            "suggestion": "继续保持。",
            "urgency": ""
        })

    # 8.3 发票无风险标记
    risk_cnt = db.query(func.count(PurchaseInvoice.id)).filter(
        PurchaseInvoice.company_id == company_id,
        PurchaseInvoice.invoice_risk_level.in_(["疑点", "异常", "失控"])
    ).scalar() or 0
    if pi_total > 0 and risk_cnt == 0:
        results.append({
            "category": "良好实践",
            "category_icon": "✅",
            "item": "进项发票无异常风险标记",
            "detail": f"全部 {pi_total} 张进项发票均无异常风险标记，发票管理质量良好。",
            "risk_score": 0,
            "risk_level": "良好",
            "risk_color": "#10b981",
            "suggestion": "继续保持。",
            "urgency": ""
        })

    # 8.4 多税种申报
    vat_count = db.query(func.count(VATDeclaration.id)).filter(
        VATDeclaration.company_id == company_id
    ).scalar() or 0
    ccf_count = db.query(func.count(CulturalConstructionFeeDeclaration.id)).filter(
        CulturalConstructionFeeDeclaration.company_id == company_id
    ).scalar() or 0

    if vat_count > 0:
        results.append({
            "category": "良好实践",
            "category_icon": "✅",
            "item": "已进行增值税申报",
            "detail": f"系统中有 {vat_count} 期增值税申报记录，税务申报工作已开展。",
            "risk_score": 0,
            "risk_level": "良好",
            "risk_color": "#10b981",
            "suggestion": "继续保持按期申报。",
            "urgency": ""
        })
