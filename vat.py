"""
增值税申报表 API 路由
使用 FastAPI APIRouter，在 main.py 中 include_router 加载。
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime
import json

from database import (
    VATDeclaration, Company, SalesInvoice, PurchaseInvoice,
    InputVATDeduction, JournalEntry, get_db
)

router = APIRouter(prefix="/api/vat", tags=["增值税申报"])


@router.get("/declarations")
def list_vat_declarations(company_id: int = Query(1), period: str = Query(None), db: Session = Depends(get_db)):
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
def create_vat_declaration(data: dict, db: Session = Depends(get_db)):
    company_id = data.get("company_id", 1)
    period = data.get("period", "")
    if not period:
        raise HTTPException(400, detail="税款所属期不能为空")
    existing = db.query(VATDeclaration).filter(
        VATDeclaration.company_id == company_id,
        VATDeclaration.period == period
    ).first()
    if existing:
        raise HTTPException(400, detail=f"{period} 已有申报表，不能重复创建")
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
        reduction_end=period + "-31",
    )
    db.add(vd)
    db.flush()
    _compute_vat_forms(db, vd)
    db.commit()
    db.refresh(vd)
    return {"id": vd.id, "period": vd.period, "status": vd.status, "msg": "申报表已创建并计算完成"}


@router.get("/declarations/{declaration_id}")
def get_vat_declaration(declaration_id: int, db: Session = Depends(get_db)):
    vd = db.query(VATDeclaration).filter(VATDeclaration.id == declaration_id).first()
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
def update_vat_declaration(declaration_id: int, data: dict, db: Session = Depends(get_db)):
    vd = db.query(VATDeclaration).filter(VATDeclaration.id == declaration_id).first()
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
def delete_vat_declaration(declaration_id: int, db: Session = Depends(get_db)):
    vd = db.query(VATDeclaration).filter(VATDeclaration.id == declaration_id).first()
    if not vd:
        raise HTTPException(404, detail="申报表不存在")
    db.delete(vd)
    db.commit()
    return {"msg": "删除成功"}


@router.post("/declarations/{declaration_id}/recompute")
def recompute_vat_declaration(declaration_id: int, db: Session = Depends(get_db)):
    vd = db.query(VATDeclaration).filter(VATDeclaration.id == declaration_id).first()
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
        SalesInvoice.invoice_date <= period + "-31"
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

    # 主表
    form_main = {
        "period": period,
        "taxpayer_name": vd.taxpayer_name,
        "row1_sales": round(sales_total, 2),
        "row11_output_tax": round(output_tax, 2),
        "row12_input_tax": round(input_tax, 2),
        "row19_tax_payable": round(tax_payable, 2),
        "city_maintenance_tax": city_tax,
        "education_surcharge": edu_surcharge,
        "local_education_surcharge": local_edu,
        "total_surcharge": round(city_tax + edu_surcharge + local_edu, 2),
    }
    vd.form_main = json.dumps(form_main, ensure_ascii=False)

    # 附列资料（一）：销售明细
    sales_by_rate = {}
    for inv in sales_invoices:
        rate = int(inv.tax_rate or 13)
        key = f"rate_{rate}"
        if key not in sales_by_rate:
            sales_by_rate[key] = {"amount": 0, "tax": 0}
        sales_by_rate[key]["amount"] += inv.amount or 0
        sales_by_rate[key]["tax"] += inv.tax_amount or 0

    form_sales = {
        "period": period,
        "rate_13_sales": sales_by_rate.get("rate_13", {}).get("amount", 0),
        "rate_13_tax": sales_by_rate.get("rate_13", {}).get("tax", 0),
        "rate_6_sales": sales_by_rate.get("rate_6", {}).get("amount", 0),
        "rate_6_tax": sales_by_rate.get("rate_6", {}).get("tax", 0),
        "total_sales": round(sales_total, 2),
        "total_output_tax": round(output_tax, 2),
    }
    vd.form_sales = json.dumps(form_sales, ensure_ascii=False)

    # 附列资料（二）：进项明细
    certified_list = [d for d in input_deductions if d.deduction_status == "已抵扣"]
    form_input = {
        "period": period,
        "certified_count": len(certified_list),
        "certified_amount": sum((d.amount or 0) + (d.tax_amount or 0) for d in certified_list),
        "certified_tax": sum(d.deductible_tax_amount or 0 for d in certified_list),
        "total_deductible": round(input_tax, 2),
    }
    vd.form_input = json.dumps(form_input, ensure_ascii=False)

    # 附列资料（三）：扣除项目
    form_deduction = {
        "period": period,
        "row1_total_price_tax": round(sales_total, 2),
        "row1_deduction": 0.0,
        "row1_after_deduction": round(sales_total, 2),
    }
    vd.form_deduction = json.dumps(form_deduction, ensure_ascii=False)

    # 附列资料（四）：税额抵减
    form_credit = {
        "period": period,
        "tax_control_device": 0.0,
        "item1_begin": 0.0, "item1_occur": 0.0,
        "item1_should_deduct": 0.0, "item1_actual_deduct": 0.0, "item1_end": 0.0,
    }
    vd.form_credit = json.dumps(form_credit, ensure_ascii=False)

    # 附列资料（五）：附加税费
    form_surcharge = {
        "period": period,
        "micro_enterprise": vd.micro_enterprise,
        "six_tax_reduction": vd.six_tax_reduction,
        "city_base": round(tax_payable, 2),
        "city_rate": 0.07,
        "city_tax": city_tax,
        "city_reduction_rate": 0.5 if vd.micro_enterprise and vd.six_tax_reduction else 0.0,
        "city_final": city_tax,
        "edu_base": round(tax_payable, 2),
        "edu_rate": 0.03,
        "edu_tax": edu_surcharge,
        "edu_reduction_rate": 0.5 if vd.micro_enterprise and vd.six_tax_reduction else 0.0,
        "edu_final": edu_surcharge,
        "local_edu_base": round(tax_payable, 2),
        "local_edu_rate": 0.02,
        "local_edu_tax": local_edu,
        "local_edu_reduction_rate": 0.5 if vd.micro_enterprise and vd.six_tax_reduction else 0.0,
        "local_edu_final": local_edu,
    }
    vd.form_surcharge = json.dumps(form_surcharge, ensure_ascii=False)

    # 减免税申报明细表
    form_reduction = {
        "period": period,
        "micro_enterprise": vd.micro_enterprise,
        "reduction_items": [],
    }
    vd.form_reduction = json.dumps(form_reduction, ensure_ascii=False)
