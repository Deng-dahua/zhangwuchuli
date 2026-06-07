"""
增值税申报表 API 路由
使用 FastAPI APIRouter，在 main.py 中 include_router 加载。
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime
import calendar
import json

from database import (
    VATDeclaration, Company, SalesInvoice, PurchaseInvoice,
    InputVATDeduction, JournalEntry, get_db
)

def _end_of_month(period: str) -> str:
    """返回期间的月末日期，如 '2025-02' -> '2025-02-28'"""
    y, m = period.split("-")
    last_day = calendar.monthrange(int(y), int(m))[1]
    return f"{y}-{m}-{last_day:02d}"

router = APIRouter(prefix="/api/vat", tags=["增值税申报"])


@router.get("/declarations")
def list_vat_declarations(company_id: int, period: str = Query(None), db: Session = Depends(get_db)):
    q = db.query(VATDeclaration).filter(VATDeclaration.company_id == company_id)
    if period:
        q = q.filter(VATDeclaration.period == period)
    items = q.order_by(VATDeclaration.period.desc()).all()
    return [{
        "id": v.id, "company_id": v.company_id, "period": v.period,
        "taxpayer_name": v.taxpayer_name, "status": v.status,
        "fill_date": str(v.fill_date) if v.fill_date else None,
        "submitted_at": v.submitted_at.isoformat() if v.submitted_at else None,
        "created_at": v.created_at.isoformat() if v.created_at else None,
        "micro_enterprise": v.micro_enterprise,
        "six_tax_reduction": v.six_tax_reduction,
    } for v in items]


@router.post("/declarations")
def create_vat_declaration(data: dict, company_id: int = Query(), db: Session = Depends(get_db)):
    period = data.get("period", "")
    if not period:
        raise HTTPException(400, detail="税款所属期不能为空")
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, detail="公司不存在")
    vd = VATDeclaration(
        company_id=company_id, period=period,
        taxpayer_name=company.name,
        taxpayer_id=company.uscc or "",
        industry=data.get("industry", ""),
        register_type=data.get("register_type", ""),
        legal_representative=company.legal_representative or "",
        address=company.address or "",
        bank_account=data.get("bank_account", ""),
        phone=data.get("phone", ""),
        micro_enterprise=data.get("micro_enterprise", True),
        six_tax_reduction=data.get("six_tax_reduction", True),
        reduction_start=period + "-01",
        reduction_end=_end_of_month(period),
    )
    db.add(vd)
    db.flush()
    _compute_vat_forms(db, vd)
    db.commit()
    db.refresh(vd)
    return {"id": vd.id, "period": vd.period, "status": vd.status, "msg": "申报表已创建并计算完成"}


@router.get("/declarations/{declaration_id}")
def get_vat_declaration(declaration_id: int, company_id: int = Query(), db: Session = Depends(get_db)):
    vd = db.query(VATDeclaration).filter(VATDeclaration.id == declaration_id, VATDeclaration.company_id == company_id).first()
    if not vd:
        raise HTTPException(404, detail="申报表不存在")
    return {
        "id": vd.id, "company_id": vd.company_id, "period": vd.period,
        "taxpayer_name": vd.taxpayer_name, "taxpayer_id": vd.taxpayer_id,
        "industry": vd.industry, "register_type": vd.register_type,
        "legal_representative": vd.legal_representative, "address": vd.address,
        "bank_account": vd.bank_account, "phone": vd.phone,
        "fill_date": str(vd.fill_date) if vd.fill_date else None,
        "micro_enterprise": vd.micro_enterprise,
        "six_tax_reduction": vd.six_tax_reduction,
        "reduction_start": vd.reduction_start, "reduction_end": vd.reduction_end,
        "city_maintenance_tax": vd.city_maintenance_tax,
        "education_surcharge": vd.education_surcharge,
        "local_education_surcharge": vd.local_education_surcharge,
        "status": vd.status,
        "submitted_at": vd.submitted_at.isoformat() if vd.submitted_at else None,
        "form_main": json.loads(vd.form_main) if vd.form_main else {},
        "form_sales": json.loads(vd.form_sales) if vd.form_sales else {},
        "form_input": json.loads(vd.form_input) if vd.form_input else {},
        "form_deduction": json.loads(vd.form_deduction) if vd.form_deduction else {},
        "form_credit": json.loads(vd.form_credit) if vd.form_credit else {},
        "form_surcharge": json.loads(vd.form_surcharge) if vd.form_surcharge else {},
        "form_reduction": json.loads(vd.form_reduction) if vd.form_reduction else {},
        "created_at": vd.created_at.isoformat() if vd.created_at else None,
        "updated_at": vd.updated_at.isoformat() if vd.updated_at else None,
    }


@router.put("/declarations/{declaration_id}")
def update_vat_declaration(declaration_id: int, data: dict, company_id: int = Query(), db: Session = Depends(get_db)):
    vd = db.query(VATDeclaration).filter(VATDeclaration.id == declaration_id, VATDeclaration.company_id == company_id).first()
    if not vd:
        raise HTTPException(404, detail="申报表不存在")
    for key in ["form_main", "form_sales", "form_input", "form_deduction", "form_credit", "form_surcharge", "form_reduction"]:
        if key in data:
            setattr(vd, key, json.dumps(data[key], ensure_ascii=False))
    for field in ["taxpayer_name", "taxpayer_id", "industry", "register_type",
                   "legal_representative", "address", "bank_account", "phone",
                   "fill_date", "micro_enterprise", "six_tax_reduction",
                   "reduction_start", "reduction_end"]:
        if field in data:
            setattr(vd, field, data[field])
    if data.get("status") in ("草稿", "已申报", "已缴税"):
        vd.status = data["status"]
        if vd.status == "已申报" and not vd.submitted_at:
            vd.submitted_at = datetime.now()
    db.commit()
    return {"msg": "保存成功"}


@router.delete("/declarations/{declaration_id}")
def delete_vat_declaration(declaration_id: int, company_id: int = Query(), db: Session = Depends(get_db)):
    vd = db.query(VATDeclaration).filter(VATDeclaration.id == declaration_id, VATDeclaration.company_id == company_id).first()
    if not vd:
        raise HTTPException(404, detail="申报表不存在")
    db.delete(vd)
    db.commit()
    return {"msg": "删除成功"}


@router.post("/declarations/{declaration_id}/recompute")
def recompute_vat_declaration(declaration_id: int, company_id: int = Query(), db: Session = Depends(get_db)):
    vd = db.query(VATDeclaration).filter(VATDeclaration.id == declaration_id, VATDeclaration.company_id == company_id).first()
    if not vd:
        raise HTTPException(404, detail="申报表不存在")
    _compute_vat_forms(db, vd)
    db.commit()
    return {"msg": "重新计算完成"}


# ========== 计算逻辑 ==========

def _compute_vat_forms(db: Session, vd: VATDeclaration):
    """从序时账自动计算7张申报表的数据"""
    company_id = vd.company_id
    period = vd.period

    entries = db.query(JournalEntry).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period == period
    ).all()

    # 销项税额（贷方 2221 应交增值税-销项税额）
    output_tax = sum(
        e.credit_amount or 0
        for e in entries
        if e.account_code and "2221" in e.account_code and "销项" in (e.account_name or "")
    )
    sales_invoices = db.query(SalesInvoice).filter(
        SalesInvoice.company_id == company_id,
        SalesInvoice.invoice_date >= period + "-01",
        SalesInvoice.invoice_date <= _end_of_month(period)
    ).all()
    sales_total = sum(i.total_amount or 0 for i in sales_invoices)
    if output_tax == 0:
        output_tax = sum(i.tax_amount or 0 for i in sales_invoices)

    # 进项税额
    input_tax_journal = sum(
        e.debit_amount or 0
        for e in entries
        if e.account_code and "2221" in e.account_code and "进项" in (e.account_name or "")
    )
    input_deductions = db.query(InputVATDeduction).filter(
        InputVATDeduction.company_id == company_id,
        (InputVATDeduction.deduction_period == period) |
        (InputVATDeduction.invoice_date.like(period + "%"))
    ).all()
    input_tax = sum(d.deductible_tax_amount or 0 for d in input_deductions)
    if input_tax_journal > 0:
        input_tax = input_tax_journal

    tax_payable = max(0, output_tax - input_tax)

    # 附加税费
    city_rate = 0.07
    edu_rate = 0.03
    local_edu_rate = 0.02
    city_tax = round(tax_payable * city_rate, 2)
    edu_surcharge = round(tax_payable * edu_rate, 2)
    local_edu = round(tax_payable * local_edu_rate, 2)

    if vd.micro_enterprise and vd.six_tax_reduction:
        city_tax = round(city_tax * 0.5, 2)
        edu_surcharge = round(edu_surcharge * 0.5, 2)
        local_edu = round(local_edu * 0.5, 2)

    vd.city_maintenance_tax = city_tax
    vd.education_surcharge = edu_surcharge
    vd.local_education_surcharge = local_edu

    # 解析当前期间（后续多处使用）
    period_date = datetime.strptime(period + "-01", "%Y-%m-%d")

    # ====== 主表 —— 本年累计(YTD)计算 ======
    # 取本年1月至当前月所有申报表，汇总各栏次数值
    year_str = period[:4]
    ytd_periods = [f"{year_str}-{m:02d}" for m in range(1, period_date.month + 1)]

    # WARNING: 查询本年所有已保存申报表（不含当前正在计算的本条，因为 form_main 尚未入库）
    ytd_declarations = db.query(VATDeclaration).filter(
        VATDeclaration.company_id == company_id,
        VATDeclaration.period.in_(ytd_periods),
        VATDeclaration.id != vd.id,
    ).all()

    def _parse_main(decl):
        """安全解析申报表 form_main JSON"""
        if not decl or not decl.form_main:
            return {}
        if isinstance(decl.form_main, str):
            return json.loads(decl.form_main)
        return decl.form_main

    # 需要累计的字段列表（主表所有数字栏次）
    ytd_fields = [
        "row1_sales", "row2_other_invoice", "row3_no_invoice", "row4_tax_check",
        "row5_simple_method", "row6_exempt_sales", "row7_export_exempt",
        "row8_tax_free", "row9_exempt_goods", "row10_exempt_service",
        "row11_output_tax", "row12_input_tax", "row13_prior_credit",
        "row14_input_transfer_out", "row15_exempt_refund", "row16_actual_deduct_by_item",
        "row17_total_deductible", "row18_actual_deduct", "row19_tax_payable",
        "row20_end_credit", "row21_simple_tax", "row22_simple_tax_reduction",
        "row23_reduction", "row24_tax_payable_total",
        "row25_prior_unpaid", "row26_real_paid_during", "row27_installment_prepaid",
        "row28_export_tax_refund", "row29_remote_prepaid", "row30_already_paid_total",
        "row31_should_pay_refund", "row32_check_tax_should", "row33_check_prepaid",
        "row34_should_check", "row36_prior_unpaid_check", "row37_check_paid",
        "row38_end_check",
        "row39_city_maintenance_tax", "row40_education_surcharge", "row41_local_education_surcharge",
    ]
    # 累加历史各月数据
    ytd_sums = {f: 0.0 for f in ytd_fields}
    for d in ytd_declarations:
        m = _parse_main(d)
        for f in ytd_fields:
            ytd_sums[f] += m.get(f, 0.0)

    # ====== 主表（会企02号）—— 41行完整字段 ======
    # 取上期留抵：从同公司上期申报表取期末留抵
    # 上期 = 当前期间往前1个月
    prev_year = period_date.year
    prev_month = period_date.month - 1
    if prev_month == 0:
        prev_year -= 1
        prev_month = 12
    prev_period = f"{prev_year}-{prev_month:02d}"
    prior_vd = db.query(VATDeclaration).filter(
        VATDeclaration.company_id == company_id,
        VATDeclaration.period == prev_period
    ).first()
    prior_credit = 0.0
    if prior_vd and prior_vd.form_main:
        prior_main = json.loads(prior_vd.form_main) if isinstance(prior_vd.form_main, str) else prior_vd.form_main
        prior_credit = prior_main.get("row20_end_credit", 0.0)

    # 主表计算链
    total_deduct = round(input_tax + prior_credit, 2)  # row17=12+13-14-15+16
    actual_deduct = min(total_deduct, output_tax)  # row18=min(17,11)
    end_credit = round(total_deduct - actual_deduct, 2)  # row20=17-18
    tax_payable_total = round(tax_payable, 2)  # row24=19+21-23 (简化为应纳税额)

    form_main = {
        "period": period,
        "taxpayer_name": vd.taxpayer_name,
        # 一、销售额
        "row1_sales": round(sales_total, 2),         # 按适用税率计税销售额
        "row2_other_invoice": 0.0,                     # 其中：开具其他发票
        "row3_no_invoice": 0.0,                        # 未开具发票
        "row4_tax_check": 0.0,                         # 纳税检查调整
        "row5_simple_method": 0.0,                     # （二）按简易办法计税销售额
        "row6_exempt_sales": 0.0,                      # 免税销售额
        "row7_export_exempt": 0.0,                     # 出口免税销售额
        "row8_tax_free": 0.0,                          # 其中：免税劳务
        "row9_exempt_goods": 0.0,                      # 免税货物销售额
        "row10_exempt_service": 0.0,                   # 免税劳务销售额
        # 二、税款计算
        "row11_output_tax": round(output_tax, 2),      # 销项税额
        "row12_input_tax": round(input_tax, 2),         # 进项税额
        "row13_prior_credit": round(prior_credit, 2),   # 上期留抵税额
        "row14_input_transfer_out": 0.0,                # 进项税额转出
        "row15_exempt_refund": 0.0,                     # 免抵退应退税额
        "row16_actual_deduct_by_item": 0.0,             # 按适用税率计算的纳税检查应补缴税额
        "row17_total_deductible": total_deduct,         # 应抵扣税额合计 =12+13-14-15+16
        "row18_actual_deduct": round(actual_deduct, 2), # 实际抵扣税额
        "row19_tax_payable": round(tax_payable, 2),     # 应纳税额 =11-18
        "row20_end_credit": round(end_credit, 2),       # 期末留抵税额 =17-18
        "row21_simple_tax": 0.0,                        # 简易计税办法计算的应纳税额
        "row22_simple_tax_reduction": 0.0,              # 按简易计税办法计算的纳税检查应补缴税额
        "row23_reduction": 0.0,                         # 应纳税额减征额
        "row24_tax_payable_total": tax_payable_total,   # 应纳税额合计 =19+21-23
        # 三、税款缴纳
        "row25_prior_unpaid": 0.0,                      # 期初未缴税额
        "row26_real_paid_during": 0.0,                  # 本期已缴税额
        "row27_installment_prepaid": 0.0,               # 分次预缴税额
        "row28_export_tax_refund": 0.0,                 # 出口开具专用缴款书预缴税额
        "row29_remote_prepaid": 0.0,                    # 本期缴纳上期应纳税额
        "row30_already_paid_total": 0.0,                # 本期缴纳欠缴税额
        "row31_should_pay_refund": 0.0,                 # 期末未缴税额
        "row32_check_tax_should": 0.0,                  # 其中：欠缴税额
        "row33_check_prepaid": 0.0,                     # 本期入库查补税额
        "row34_should_check": 0.0,                      # 期末未缴查补税额
        "row36_prior_unpaid_check": 0.0,                # 期初未缴查补税额
        "row37_check_paid": 0.0,                        # 本期入库查补税额
        "row38_end_check": 0.0,                         # 期末未缴查补税额
        # 四、附加税费
        "row39_city_maintenance_tax": city_tax,          # 城市维护建设税
        "row40_education_surcharge": edu_surcharge,      # 教育费附加
        "row41_local_education_surcharge": local_edu,    # 地方教育附加
        # 合计
        "city_maintenance_tax": city_tax,
        "education_surcharge": edu_surcharge,
        "local_education_surcharge": local_edu,
        "total_surcharge": round(city_tax + edu_surcharge + local_edu, 2),
    }

    # 本年累计(YTD) —— 注入 form_main
    _ytd_keys = [
        "row1_sales", "row2_other_invoice", "row3_no_invoice", "row4_tax_check",
        "row5_simple_method", "row6_exempt_sales", "row7_export_exempt",
        "row8_tax_free", "row9_exempt_goods", "row10_exempt_service",
        "row11_output_tax", "row12_input_tax", "row13_prior_credit",
        "row14_input_transfer_out", "row15_exempt_refund", "row16_actual_deduct_by_item",
        "row17_total_deductible", "row18_actual_deduct", "row19_tax_payable",
        "row20_end_credit", "row21_simple_tax", "row22_simple_tax_reduction",
        "row23_reduction", "row24_tax_payable_total",
        "row25_prior_unpaid", "row26_real_paid_during", "row27_installment_prepaid",
        "row28_export_tax_refund", "row29_remote_prepaid", "row30_already_paid_total",
        "row31_should_pay_refund", "row32_check_tax_should", "row33_check_prepaid",
        "row34_should_check", "row36_prior_unpaid_check", "row37_check_paid",
        "row38_end_check",
        "row39_city_maintenance_tax", "row40_education_surcharge", "row41_local_education_surcharge"
    ]
    for _k in _ytd_keys:
        # 本年累计 = 历史各月累计 + 本月发生额
        this_month = form_main.get(_k, 0.0)
        form_main[_k + "_ytd"] = round(ytd_sums.get(_k, 0.0) + this_month, 2)
        # 即征即退项目（当前系统不涉及，默认0）
        form_main[_k + "_refund"] = 0.0
        form_main[_k + "_refund_ytd"] = 0.0

    vd.form_main = json.dumps(form_main, ensure_ascii=False)

    # ====== 附列资料（一）：本期销售情况明细 ======
    # 按税率分类汇总
    sales_by_rate = {}
    for inv in sales_invoices:
        rate = int(inv.tax_rate or 13)
        key = f"rate_{rate}"
        if key not in sales_by_rate:
            sales_by_rate[key] = {"amount": 0, "tax": 0}
        sales_by_rate[key]["amount"] += inv.amount or 0
        sales_by_rate[key]["tax"] += inv.tax_amount or 0

    def _sr(rate_key):
        """安全取税率汇总数据"""
        return sales_by_rate.get(rate_key, {"amount": 0, "tax": 0})

    form_sales = {
        "period": period,
        # 全部征税项目：4种发票 + 合计
        # --- 13%税率的货物及加工修理修配劳务 ---
        "row1_13_special_sales": round(_sr("rate_13")["amount"], 2),
        "row1_13_special_tax": round(_sr("rate_13")["tax"], 2),
        "row1_13_other_sales": 0.0, "row1_13_other_tax": 0.0,
        "row1_13_no_invoice_sales": 0.0, "row1_13_no_invoice_tax": 0.0,
        "row1_13_check_sales": 0.0, "row1_13_check_tax": 0.0,
        "row1_13_total_sales": round(_sr("rate_13")["amount"], 2),
        "row1_13_total_tax": round(_sr("rate_13")["tax"], 2),
        # --- 13%税率的服务、不动产和无形资产 ---
        "row2_13_service_special_sales": 0.0, "row2_13_service_special_tax": 0.0,
        "row2_13_service_other_sales": 0.0, "row2_13_service_other_tax": 0.0,
        "row2_13_service_no_invoice_sales": 0.0, "row2_13_service_no_invoice_tax": 0.0,
        "row2_13_service_check_sales": 0.0, "row2_13_service_check_tax": 0.0,
        "row2_13_service_total_sales": 0.0, "row2_13_service_total_tax": 0.0,
        # --- 9%税率 ---
        "row3_9_special_sales": round(_sr("rate_9")["amount"], 2),
        "row3_9_special_tax": round(_sr("rate_9")["tax"], 2),
        "row3_9_other_sales": 0.0, "row3_9_other_tax": 0.0,
        "row3_9_no_invoice_sales": 0.0, "row3_9_no_invoice_tax": 0.0,
        "row3_9_check_sales": 0.0, "row3_9_check_tax": 0.0,
        "row3_9_total_sales": round(_sr("rate_9")["amount"], 2),
        "row3_9_total_tax": round(_sr("rate_9")["tax"], 2),
        # --- 6%税率 ---
        "row4_6_special_sales": round(_sr("rate_6")["amount"], 2),
        "row4_6_special_tax": round(_sr("rate_6")["tax"], 2),
        "row4_6_other_sales": 0.0, "row4_6_other_tax": 0.0,
        "row4_6_no_invoice_sales": 0.0, "row4_6_no_invoice_tax": 0.0,
        "row4_6_check_sales": 0.0, "row4_6_check_tax": 0.0,
        "row4_6_total_sales": round(_sr("rate_6")["amount"], 2),
        "row4_6_total_tax": round(_sr("rate_6")["tax"], 2),
        # --- 5%征收率 ---
        "row5_5_special_sales": round(_sr("rate_5")["amount"], 2),
        "row5_5_special_tax": round(_sr("rate_5")["tax"], 2),
        "row5_5_other_sales": 0.0, "row5_5_other_tax": 0.0,
        "row5_5_no_invoice_sales": 0.0, "row5_5_no_invoice_tax": 0.0,
        "row5_5_check_sales": 0.0, "row5_5_check_tax": 0.0,
        "row5_5_total_sales": round(_sr("rate_5")["amount"], 2),
        "row5_5_total_tax": round(_sr("rate_5")["tax"], 2),
        # --- 3%征收率的货物及加工修理修配劳务 ---
        "row6_3_goods_special_sales": round(_sr("rate_3")["amount"], 2),
        "row6_3_goods_special_tax": round(_sr("rate_3")["tax"], 2),
        "row6_3_goods_other_sales": 0.0, "row6_3_goods_other_tax": 0.0,
        "row6_3_goods_no_invoice_sales": 0.0, "row6_3_goods_no_invoice_tax": 0.0,
        "row6_3_goods_check_sales": 0.0, "row6_3_goods_check_tax": 0.0,
        "row6_3_goods_total_sales": round(_sr("rate_3")["amount"], 2),
        "row6_3_goods_total_tax": round(_sr("rate_3")["tax"], 2),
        # --- 3%征收率的服务、不动产和无形资产 ---
        "row7_3_service_special_sales": 0.0, "row7_3_service_special_tax": 0.0,
        "row7_3_service_total_sales": 0.0, "row7_3_service_total_tax": 0.0,
        # 6%征收率
        "row8_6_collect_sales": 0.0, "row8_6_collect_tax": 0.0,
        "row8_6_collect_other_sales": 0.0, "row8_6_collect_other_tax": 0.0,
        "row8_6_collect_no_invoice_sales": 0.0, "row8_6_collect_no_invoice_tax": 0.0,
        "row8_6_collect_check_sales": 0.0, "row8_6_collect_check_tax": 0.0,
        "row8_6_collect_total_sales": 0.0, "row8_6_collect_total_tax": 0.0,
        # 9%税率服务
        "row4_9_service_sales": 0.0, "row4_9_service_tax": 0.0,
        "row4_9_service_other_sales": 0.0, "row4_9_service_other_tax": 0.0,
        "row4_9_service_no_invoice_sales": 0.0, "row4_9_service_no_invoice_tax": 0.0,
        "row4_9_service_check_sales": 0.0, "row4_9_service_check_tax": 0.0,
        "row4_9_service_total_sales": 0.0, "row4_9_service_total_tax": 0.0,
        # 6%税率额外
        "row5_6_extra": 0.0, "row5_6_extra_tax": 0.0,
        # 5%征收率货物(9a)
        "row9a_5_goods_sales": 0.0, "row9a_5_goods_tax": 0.0,
        "row9a_5_goods_other_sales": 0.0, "row9a_5_goods_other_tax": 0.0,
        "row9a_5_goods_no_invoice_sales": 0.0, "row9a_5_goods_no_invoice_tax": 0.0,
        "row9a_5_goods_check_sales": 0.0, "row9a_5_goods_check_tax": 0.0,
        "row9a_5_goods_total_sales": 0.0, "row9a_5_goods_total_tax": 0.0,
        # 5%征收率服务(9b)
        "row9b_5_service_sales": 0.0, "row9b_5_service_tax": 0.0,
        "row9b_5_service_other_sales": 0.0, "row9b_5_service_other_tax": 0.0,
        "row9b_5_service_no_invoice_sales": 0.0, "row9b_5_service_no_invoice_tax": 0.0,
        "row9b_5_service_check_sales": 0.0, "row9b_5_service_check_tax": 0.0,
        "row9b_5_service_total_sales": 0.0, "row9b_5_service_total_tax": 0.0,
        # 4%征收率
        "row10_4_collect_sales": 0.0, "row10_4_collect_tax": 0.0,
        "row10_4_collect_other_sales": 0.0, "row10_4_collect_other_tax": 0.0,
        "row10_4_collect_no_invoice_sales": 0.0, "row10_4_collect_no_invoice_tax": 0.0,
        "row10_4_collect_check_sales": 0.0, "row10_4_collect_check_tax": 0.0,
        "row10_4_collect_total_sales": 0.0, "row10_4_collect_total_tax": 0.0,
        # 3%征收率货物(11)
        "row11_3_goods_sales": round(_sr("rate_3")["amount"], 2), "row11_3_goods_tax": round(_sr("rate_3")["tax"], 2),
        "row11_3_goods_other_sales": 0.0, "row11_3_goods_other_tax": 0.0,
        "row11_3_goods_no_invoice_sales": 0.0, "row11_3_goods_no_invoice_tax": 0.0,
        "row11_3_goods_check_sales": 0.0, "row11_3_goods_check_tax": 0.0,
        "row11_3_goods_total_sales": round(_sr("rate_3")["amount"], 2), "row11_3_goods_total_tax": round(_sr("rate_3")["tax"], 2),
        # 3%征收率服务(12)
        "row12_3_service_sales": 0.0, "row12_3_service_tax": 0.0,
        "row12_3_service_other_sales": 0.0, "row12_3_service_other_tax": 0.0,
        "row12_3_service_no_invoice_sales": 0.0, "row12_3_service_no_invoice_tax": 0.0,
        "row12_3_service_check_sales": 0.0, "row12_3_service_check_tax": 0.0,
        "row12_3_service_total_sales": 0.0, "row12_3_service_total_tax": 0.0,
        # --- 免抵退税 ---
        "row8_export_sales": 0.0, "row8_export_tax": 0.0,
        # --- 免税 ---
        "row9_exempt_sales": 0.0, "row9_exempt_tax": 0.0,
        # 合计
        "total_sales": round(sales_total, 2),
        "total_output_tax": round(output_tax, 2),
    }
    vd.form_sales = json.dumps(form_sales, ensure_ascii=False)

    # ====== 附列资料（二）：本期进项税额明细 ======
    # 取得进项发票列表
    purchase_invoices = db.query(PurchaseInvoice).filter(
        PurchaseInvoice.company_id == company_id,
        PurchaseInvoice.invoice_date >= period + "-01",
        PurchaseInvoice.invoice_date <= _end_of_month(period)
    ).all()

    def _cert_sum(inv_list, status_filter=None):
        """汇总进项发票：返回(份数,金额,税额)"""
        if status_filter:
            inv_list = [i for i in inv_list if i.status in status_filter]
        return (
            len(inv_list),
            sum(i.amount or 0 for i in inv_list),
            sum(i.tax_amount or 0 for i in inv_list)
        )

    cert_count, cert_amount, cert_tax = _cert_sum(purchase_invoices, ["正常"])
    cert_all_count, cert_all_amount, cert_all_tax = _cert_sum(purchase_invoices)

    form_input = {
        "period": period,
        # 一、申报抵扣的进项税额
        "row1_certified_count": cert_count,           # 认证相符的增值税专用发票-份数
        "row1_certified_amount": round(cert_amount, 2), # 金额
        "row1_certified_tax": round(cert_tax, 2),       # 税额
        "row2_certified_curr_count": cert_count, "row2_certified_curr_amount": round(cert_amount, 2), "row2_certified_curr_tax": round(cert_tax, 2),
        "row3_certified_prior_count": 0, "row3_certified_prior_amount": 0.0, "row3_certified_prior_tax": 0.0,
        # 其他扣税凭证
        "row4_other_count": 0, "row4_other_amount": 0.0, "row4_other_tax": 0.0,
        "row5_customs_count": 0, "row5_customs_amount": 0.0, "row5_customs_tax": 0.0,
        "row6_agri_count": 0, "row6_agri_amount": 0.0, "row6_agri_tax": 0.0,
        "row7_wht_count": 0, "row7_wht_tax": 0.0,
        "row8a_agri_extra": 0.0,
        "row8b_other_count": 0, "row8b_other_amount": 0.0, "row8b_other_tax": 0.0,
        # 不动产/旅客/外贸
        "row9_real_estate_count": 0, "row9_real_estate_amount": 0.0, "row9_real_estate_tax": 0.0,
        "row10_travel_count": 0, "row10_travel_amount": 0.0, "row10_travel_tax": 0.0,
        "row11_foreign_trade_count": 0, "row11_foreign_trade_tax": 0.0,
        # 二、进项税额转出额 (numbered 13-23b as frontend expects)
        "row13_transfer_out_total": 0.0,
        "row14_exempt_transfer": 0.0, "row15_collective_transfer": 0.0,
        "row16_abnormal_loss": 0.0, "row17_simple_tax_transfer": 0.0,
        "row18_exempt_credit_transfer": 0.0, "row19_tax_check_transfer": 0.0,
        "row20_red_letter_transfer": 0.0, "row21_prior_credit_arrears": 0.0,
        "row22_prior_credit_refund": 0.0, "row23a_abnormal_transfer": 0.0, "row23b_other_transfer": 0.0,
        # 三、待抵扣进项税额 (numbered 24-34)
        "row25_pending_begin_count": 0, "row25_pending_begin_amount": 0.0, "row25_pending_begin_tax": 0.0,
        "row26_pending_curr_count": 0, "row26_pending_curr_amount": 0.0, "row26_pending_curr_tax": 0.0,
        "row27_pending_end_count": 0, "row27_pending_end_amount": 0.0, "row27_pending_end_tax": 0.0,
        "row28_not_allowed_count": 0, "row28_not_allowed_amount": 0.0, "row28_not_allowed_tax": 0.0,
        "row29_other_pending_count": 0, "row29_other_pending_amount": 0.0, "row29_other_pending_tax": 0.0,
        "row30_customs_pending_count": 0, "row30_customs_pending_amount": 0.0, "row30_customs_pending_tax": 0.0,
        "row31_agri_pending_count": 0, "row31_agri_pending_amount": 0.0, "row31_agri_pending_tax": 0.0,
        "row32_wht_pending_count": 0, "row32_wht_pending_tax": 0.0,
        "row33_other_pending_count": 0, "row33_other_pending_amount": 0.0, "row33_other_pending_tax": 0.0,
        # 四、其他
        "row35_cert_count": cert_count, "row35_cert_amount": round(cert_amount, 2), "row35_cert_tax": round(cert_tax, 2),
        "row36_wht_total_tax": 0.0,
        # 合计(兼容)
        "certified_count": cert_count,
        "certified_amount": round(cert_amount, 2),
        "certified_tax": round(cert_tax, 2),
        "total_deductible": round(input_tax, 2),
    }
    vd.form_input = json.dumps(form_input, ensure_ascii=False)

    # ====== 附列资料（三）：服务、不动产和无形资产扣除项目明细 ======
    form_deduction = {
        "period": period,
        # 各项目：价税合计额/期初余额/本期发生额/本期应扣除金额/本期实际扣除金额/期末余额
        # 17%税率项目（已废止，保留占位）
        "row1_17_price_tax": 0.0, "row1_17_begin": 0.0, "row1_17_occur": 0.0,
        "row1_17_should": 0.0, "row1_17_actual": 0.0, "row1_17_end": 0.0,
        # 13%税率项目
        "row2_13_price_tax": 0.0, "row2_13_begin": 0.0, "row2_13_occur": 0.0,
        "row2_13_should": 0.0, "row2_13_actual": 0.0, "row2_13_end": 0.0,
        # 9%税率项目
        "row3_9_price_tax": 0.0, "row3_9_begin": 0.0, "row3_9_occur": 0.0,
        "row3_9_should": 0.0, "row3_9_actual": 0.0, "row3_9_end": 0.0,
        # 6%税率项目
        "row4_6_price_tax": round(sales_total, 2), "row4_6_begin": 0.0, "row4_6_occur": 0.0,
        "row4_6_should": 0.0, "row4_6_actual": 0.0, "row4_6_end": 0.0,
        # 5%征收率项目
        "row5_5_price_tax": 0.0, "row5_5_begin": 0.0, "row5_5_occur": 0.0,
        "row5_5_should": 0.0, "row5_5_actual": 0.0, "row5_5_end": 0.0,
        # 3%征收率
        "row6_3_price_tax": 0.0, "row6_3_begin": 0.0, "row6_3_occur": 0.0,
        "row6_3_should": 0.0, "row6_3_actual": 0.0, "row6_3_end": 0.0,
        # 金融商品转让
        "row4_fin_price_tax": 0.0, "row4_fin_begin": 0.0, "row4_fin_occur": 0.0,
        "row4_fin_should": 0.0, "row4_fin_actual": 0.0, "row4_fin_end": 0.0,
        # 免抵退税+免税
        "row7_exempt_credit_price_tax": 0.0, "row7_exempt_credit_begin": 0.0, "row7_exempt_credit_occur": 0.0,
        "row7_exempt_credit_should": 0.0, "row7_exempt_credit_actual": 0.0, "row7_exempt_credit_end": 0.0,
        "row8_exempt_price_tax": 0.0, "row8_exempt_begin": 0.0, "row8_exempt_occur": 0.0,
        "row8_exempt_should": 0.0, "row8_exempt_actual": 0.0, "row8_exempt_end": 0.0,
        # 合计
        "row_total_price_tax": round(sales_total, 2), "row_total_begin": 0.0,
        "row_total_occur": 0.0, "row_total_should": 0.0, "row_total_actual": 0.0, "row_total_end": 0.0,
        # 兼容旧字段
        "row1_total_price_tax": round(sales_total, 2),
        "row1_deduction": 0.0,
        "row1_after_deduction": round(sales_total, 2),
    }
    vd.form_deduction = json.dumps(form_deduction, ensure_ascii=False)

    # ====== 附列资料（四）：税额抵减情况表 ======
    form_credit = {
        "period": period,
        # 一、税额抵减情况（5项）
        "tax_control_device": 0.0,
        "tax_control_begin": 0.0, "tax_control_occur": 0.0, "tax_control_should": 0.0,
        "tax_control_actual": 0.0, "tax_control_end": 0.0,
        "subtotal_tax": 0.0,
        "branch_begin": 0.0, "branch_occur": 0.0, "branch_should": 0.0, "branch_actual": 0.0, "branch_end": 0.0,
        "construction_begin": 0.0, "construction_occur": 0.0, "construction_should": 0.0, "construction_actual": 0.0, "construction_end": 0.0,
        "real_estate_begin": 0.0, "real_estate_occur": 0.0, "real_estate_should": 0.0, "real_estate_actual": 0.0, "real_estate_end": 0.0,
        "rental_begin": 0.0, "rental_occur": 0.0, "rental_should": 0.0, "rental_actual": 0.0, "rental_end": 0.0,
        # 二、加计抵减情况（一般项目）
        "item1_begin": 0.0, "item1_occur": 0.0, "item1_adjust": 0.0,
        "item1_can_deduct": 0.0, "item1_should_deduct": 0.0,
        "item1_actual_deduct": 0.0, "item1_end": 0.0,
        # 即征即退项目
        "item2_begin": 0.0, "item2_occur": 0.0, "item2_adjust": 0.0,
        "item2_can_deduct": 0.0, "item2_should_deduct": 0.0,
        "item2_actual_deduct": 0.0, "item2_end": 0.0,
    }
    vd.form_credit = json.dumps(form_credit, ensure_ascii=False)

    # ====== 附列资料（五）：附加税费情况表 ======
    city_full = round(tax_payable * 0.07, 2)
    edu_full = round(tax_payable * 0.03, 2)
    local_edu_full = round(tax_payable * 0.02, 2)
    reduction_rate = 0.5 if vd.micro_enterprise and vd.six_tax_reduction else 0.0

    form_surcharge = {
        "period": period,
        "micro_enterprise": vd.micro_enterprise,
        "six_tax_reduction": vd.six_tax_reduction,
        # 城市维护建设税
        "city_base": round(tax_payable, 2),
        "city_rate": 0.07,
        "city_tax": round(city_full, 2),
        "city_reduction_code": "六税两费减征" if reduction_rate > 0 else "",
        "city_reduction_amount": round(city_full * reduction_rate, 2),
        "city_six_tax_amount": round(city_full * reduction_rate, 2),
        "city_final": city_tax,
        "city_reduction_rate": reduction_rate,
        "city_vat_exempt_credit": 0.0,
        "city_vat_refund_deduct": 0.0,
        "city_edu_pilot_code": "",
        "city_edu_pilot_amount": 0.0,
        "city_paid": 0.0,
        # 教育费附加
        "edu_base": round(tax_payable, 2),
        "edu_rate": 0.03,
        "edu_tax": round(edu_full, 2),
        "edu_reduction_code": "六税两费减征" if reduction_rate > 0 else "",
        "edu_reduction_amount": round(edu_full * reduction_rate, 2),
        "edu_six_tax_amount": round(edu_full * reduction_rate, 2),
        "edu_final": edu_surcharge,
        "edu_reduction_rate": reduction_rate,
        "edu_vat_exempt_credit": 0.0,
        "edu_vat_refund_deduct": 0.0,
        "edu_edu_pilot_code": "",
        "edu_edu_pilot_amount": 0.0,
        "edu_paid": 0.0,
        # 地方教育附加
        "local_edu_base": round(tax_payable, 2),
        "local_edu_rate": 0.02,
        "local_edu_tax": round(local_edu_full, 2),
        "local_edu_reduction_code": "六税两费减征" if reduction_rate > 0 else "",
        "local_edu_reduction_amount": round(local_edu_full * reduction_rate, 2),
        "local_edu_six_tax_amount": round(local_edu_full * reduction_rate, 2),
        "local_edu_final": local_edu,
        "local_edu_reduction_rate": reduction_rate,
        "local_edu_vat_exempt_credit": 0.0,
        "local_edu_vat_refund_deduct": 0.0,
        "local_edu_edu_pilot_code": "",
        "local_edu_edu_pilot_amount": 0.0,
        "local_edu_paid": 0.0,
        # 合计
        "total_tax": round(city_full + edu_full + local_edu_full, 2),
        "total_reduction": round((city_full + edu_full + local_edu_full) * reduction_rate, 2),
        "total_six_tax_reduction": round((city_full + edu_full + local_edu_full) * reduction_rate, 2),
        "total_edu_pilot": 0.0,
        "total_paid": 0.0,
        "total_final": round(city_tax + edu_surcharge + local_edu, 2),
        # 兼容
        "vat_exempt_credit": 0.0, "vat_refund_deduct": 0.0,
        "city_reduction_type": "六税两费减征" if reduction_rate > 0 else "",
        "edu_reduction_type": "六税两费减征" if reduction_rate > 0 else "",
        "local_edu_reduction_type": "六税两费减征" if reduction_rate > 0 else "",
    }
    vd.form_surcharge = json.dumps(form_surcharge, ensure_ascii=False)

    # ====== 增值税减免税申报明细表 ======
    form_reduction = {
        "period": period,
        "micro_enterprise": vd.micro_enterprise,
        "six_tax_reduction": vd.six_tax_reduction,
        # 一、减税项目
        "tax_reduction_items": [],
        "tax_reduction_total_occur": 0.0,    # 本期发生额
        "tax_reduction_total_should": 0.0,    # 本期应抵减税额
        "tax_reduction_total_actual": 0.0,    # 本期实际抵减税额
        "tax_reduction_total_end": 0.0,       # 期末余额
        # 二、免税项目
        "exempt_items": [],
        "exempt_total_exempt_sales": 0.0,     # 免征增值税项目销售额
        "exempt_total_exempt_tax": 0.0,       # 免税销售额对应的进项税额
        "exempt_total_exempt_amount": 0.0,    # 免税额
        # 兼容旧字段
        "reduction_items": [],
    }
    vd.form_reduction = json.dumps(form_reduction, ensure_ascii=False)
