"""
文化事业建设费申报 API 路由
使用 FastAPI APIRouter，在 main.py 中 include_router 加载。
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, List

from database import (
    CulturalConstructionFeeDeclaration,
    CulturalConstructionFeeDeduction,
    Company, get_db,
)

router = APIRouter(prefix="/api/cultural-construction-fee", tags=["文化事业建设费"])


# ============ Pydantic 模型 ============

class DeductionItem(BaseModel):
    invoice_supplier_tax_no: str = ""
    invoice_supplier_name: str = ""
    service_item_name: str = ""
    voucher_type: str = ""
    voucher_no: str = ""
    amount: float = 0.0


class DeclarationCreate(BaseModel):
    period: str
    status: str = "草稿"
    note: str = ""
    # 主表字段（本月数 / 本年累计）
    taxable_income_current: float = 0.0
    taxable_income_ytd: float = 0.0
    tax_exempt_income_current: float = 0.0
    tax_exempt_income_ytd: float = 0.0
    deduction_beginning_current: float = 0.0
    deduction_beginning_ytd: float = 0.0
    deduction_current_period_current: float = 0.0
    deduction_current_period_ytd: float = 0.0
    taxable_income_deduction_current: float = 0.0
    taxable_income_deduction_ytd: float = 0.0
    tax_exempt_deduction_current: float = 0.0
    tax_exempt_deduction_ytd: float = 0.0
    deduction_ending_balance_current: float = 0.0
    deduction_ending_balance_ytd: float = 0.0
    taxable_sales_current: float = 0.0
    taxable_sales_ytd: float = 0.0
    fee_rate: float = 0.03
    payable_fee_current: float = 0.0
    payable_fee_ytd: float = 0.0
    unpaid_beginning_current: float = 0.0
    unpaid_beginning_ytd: float = 0.0
    paid_current_period_current: float = 0.0
    paid_current_period_ytd: float = 0.0
    prepaid_current: float = 0.0
    prepaid_ytd: float = 0.0
    paid_last_period_current: float = 0.0
    paid_last_period_ytd: float = 0.0
    paid_arrears_current: float = 0.0
    paid_arrears_ytd: float = 0.0
    unpaid_ending_current: float = 0.0
    unpaid_ending_ytd: float = 0.0
    arrears_current: float = 0.0
    arrears_ytd: float = 0.0
    fill_refund_current: float = 0.0
    fill_refund_ytd: float = 0.0
    inspected_supplement_current: float = 0.0
    inspected_supplement_ytd: float = 0.0
    # 扣除项目清单
    deductions: List[DeductionItem] = []


class DeclarationUpdate(DeclarationCreate):
    pass


# ============ CRUD ============

@router.get("/declarations")
def list_declarations(
    company_id: int,
    period: str = Query(None),
    period_from: str = Query(None),
    period_to: str = Query(None),
    db: Session = Depends(get_db),
):
    """列表查询"""
    q = db.query(CulturalConstructionFeeDeclaration).filter(
        CulturalConstructionFeeDeclaration.company_id == company_id
    )
    if period:
        q = q.filter(CulturalConstructionFeeDeclaration.period == period)
    if period_from:
        q = q.filter(CulturalConstructionFeeDeclaration.period >= period_from)
    if period_to:
        q = q.filter(CulturalConstructionFeeDeclaration.period <= period_to)
    items = q.order_by(CulturalConstructionFeeDeclaration.period.desc()).all()
    result = []
    for item in items:
        deduction_count = db.query(CulturalConstructionFeeDeduction).filter(
            CulturalConstructionFeeDeduction.declaration_id == item.id
        ).count()
        result.append({
            "id": item.id,
            "company_id": item.company_id,
            "period": item.period,
            "status": item.status,
            "note": item.note,
            "deduction_count": deduction_count,
            "payable_fee_current": float(item.payable_fee_current or 0),
            "payable_fee_ytd": float(item.payable_fee_ytd or 0),
            "fill_refund_current": float(item.fill_refund_current or 0),
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        })
    return {"items": result, "total": len(result)}


@router.get("/declarations/{declaration_id}")
def get_declaration(declaration_id: int, company_id: int, db: Session = Depends(get_db)):
    """获取申报详情（含扣除项目清单）"""
    decl = db.query(CulturalConstructionFeeDeclaration).filter(
        CulturalConstructionFeeDeclaration.id == declaration_id,
        CulturalConstructionFeeDeclaration.company_id == company_id,
    ).first()
    if not decl:
        raise HTTPException(404, "申报记录不存在")

    deductions = db.query(CulturalConstructionFeeDeduction).filter(
        CulturalConstructionFeeDeduction.declaration_id == declaration_id
    ).order_by(CulturalConstructionFeeDeduction.seq).all()

    return {
        "id": decl.id,
        "company_id": decl.company_id,
        "period": decl.period,
        "status": decl.status,
        "note": decl.note,
        "taxable_income_current": float(decl.taxable_income_current or 0),
        "taxable_income_ytd": float(decl.taxable_income_ytd or 0),
        "tax_exempt_income_current": float(decl.tax_exempt_income_current or 0),
        "tax_exempt_income_ytd": float(decl.tax_exempt_income_ytd or 0),
        "deduction_beginning_current": float(decl.deduction_beginning_current or 0),
        "deduction_beginning_ytd": float(decl.deduction_beginning_ytd or 0),
        "deduction_current_period_current": float(decl.deduction_current_period_current or 0),
        "deduction_current_period_ytd": float(decl.deduction_current_period_ytd or 0),
        "taxable_income_deduction_current": float(decl.taxable_income_deduction_current or 0),
        "taxable_income_deduction_ytd": float(decl.taxable_income_deduction_ytd or 0),
        "tax_exempt_deduction_current": float(decl.tax_exempt_deduction_current or 0),
        "tax_exempt_deduction_ytd": float(decl.tax_exempt_deduction_ytd or 0),
        "deduction_ending_balance_current": float(decl.deduction_ending_balance_current or 0),
        "deduction_ending_balance_ytd": float(decl.deduction_ending_balance_ytd or 0),
        "taxable_sales_current": float(decl.taxable_sales_current or 0),
        "taxable_sales_ytd": float(decl.taxable_sales_ytd or 0),
        "fee_rate": float(decl.fee_rate or 0.03),
        "payable_fee_current": float(decl.payable_fee_current or 0),
        "payable_fee_ytd": float(decl.payable_fee_ytd or 0),
        "unpaid_beginning_current": float(decl.unpaid_beginning_current or 0),
        "unpaid_beginning_ytd": float(decl.unpaid_beginning_ytd or 0),
        "paid_current_period_current": float(decl.paid_current_period_current or 0),
        "paid_current_period_ytd": float(decl.paid_current_period_ytd or 0),
        "prepaid_current": float(decl.prepaid_current or 0),
        "prepaid_ytd": float(decl.prepaid_ytd or 0),
        "paid_last_period_current": float(decl.paid_last_period_current or 0),
        "paid_last_period_ytd": float(decl.paid_last_period_ytd or 0),
        "paid_arrears_current": float(decl.paid_arrears_current or 0),
        "paid_arrears_ytd": float(decl.paid_arrears_ytd or 0),
        "unpaid_ending_current": float(decl.unpaid_ending_current or 0),
        "unpaid_ending_ytd": float(decl.unpaid_ending_ytd or 0),
        "arrears_current": float(decl.arrears_current or 0),
        "arrears_ytd": float(decl.arrears_ytd or 0),
        "fill_refund_current": float(decl.fill_refund_current or 0),
        "fill_refund_ytd": float(decl.fill_refund_ytd or 0),
        "inspected_supplement_current": float(decl.inspected_supplement_current or 0),
        "inspected_supplement_ytd": float(decl.inspected_supplement_ytd or 0),
        "deductions": [{
            "id": d.id,
            "seq": d.seq,
            "invoice_supplier_tax_no": d.invoice_supplier_tax_no,
            "invoice_supplier_name": d.invoice_supplier_name,
            "service_item_name": d.service_item_name,
            "voucher_type": d.voucher_type,
            "voucher_no": d.voucher_no,
            "amount": float(d.amount or 0),
        } for d in deductions],
        "created_at": decl.created_at.isoformat() if decl.created_at else None,
        "updated_at": decl.updated_at.isoformat() if decl.updated_at else None,
    }


@router.post("/declarations")
def create_or_update_declaration(payload: DeclarationCreate, company_id: int, db: Session = Depends(get_db)):
    """创建或更新申报（按期间去重）"""
    existing = db.query(CulturalConstructionFeeDeclaration).filter(
        CulturalConstructionFeeDeclaration.company_id == company_id,
        CulturalConstructionFeeDeclaration.period == payload.period,
    ).first()

    if existing:
        decl = existing
        decl.status = payload.status or "草稿"
        decl.note = payload.note
        decl.taxable_income_current = payload.taxable_income_current
        decl.taxable_income_ytd = payload.taxable_income_ytd
        decl.tax_exempt_income_current = payload.tax_exempt_income_current
        decl.tax_exempt_income_ytd = payload.tax_exempt_income_ytd
        decl.deduction_beginning_current = payload.deduction_beginning_current
        decl.deduction_beginning_ytd = payload.deduction_beginning_ytd
        decl.deduction_current_period_current = payload.deduction_current_period_current
        decl.deduction_current_period_ytd = payload.deduction_current_period_ytd
        decl.taxable_income_deduction_current = payload.taxable_income_deduction_current
        decl.taxable_income_deduction_ytd = payload.taxable_income_deduction_ytd
        decl.tax_exempt_deduction_current = payload.tax_exempt_deduction_current
        decl.tax_exempt_deduction_ytd = payload.tax_exempt_deduction_ytd
        decl.deduction_ending_balance_current = payload.deduction_ending_balance_current
        decl.deduction_ending_balance_ytd = payload.deduction_ending_balance_ytd
        decl.taxable_sales_current = payload.taxable_sales_current
        decl.taxable_sales_ytd = payload.taxable_sales_ytd
        decl.fee_rate = payload.fee_rate
        decl.payable_fee_current = payload.payable_fee_current
        decl.payable_fee_ytd = payload.payable_fee_ytd
        decl.unpaid_beginning_current = payload.unpaid_beginning_current
        decl.unpaid_beginning_ytd = payload.unpaid_beginning_ytd
        decl.paid_current_period_current = payload.paid_current_period_current
        decl.paid_current_period_ytd = payload.paid_current_period_ytd
        decl.prepaid_current = payload.prepaid_current
        decl.prepaid_ytd = payload.prepaid_ytd
        decl.paid_last_period_current = payload.paid_last_period_current
        decl.paid_last_period_ytd = payload.paid_last_period_ytd
        decl.paid_arrears_current = payload.paid_arrears_current
        decl.paid_arrears_ytd = payload.paid_arrears_ytd
        decl.unpaid_ending_current = payload.unpaid_ending_current
        decl.unpaid_ending_ytd = payload.unpaid_ending_ytd
        decl.arrears_current = payload.arrears_current
        decl.arrears_ytd = payload.arrears_ytd
        decl.fill_refund_current = payload.fill_refund_current
        decl.fill_refund_ytd = payload.fill_refund_ytd
        decl.inspected_supplement_current = payload.inspected_supplement_current
        decl.inspected_supplement_ytd = payload.inspected_supplement_ytd
        decl.updated_at = datetime.now()
        # 删除旧扣除项目
        db.query(CulturalConstructionFeeDeduction).filter(
            CulturalConstructionFeeDeduction.declaration_id == decl.id
        ).delete()
        db.flush()
    else:
        decl = CulturalConstructionFeeDeclaration(
            company_id=company_id,
            period=payload.period,
            status=payload.status or "草稿",
            note=payload.note,
            taxable_income_current=payload.taxable_income_current,
            taxable_income_ytd=payload.taxable_income_ytd,
            tax_exempt_income_current=payload.tax_exempt_income_current,
            tax_exempt_income_ytd=payload.tax_exempt_income_ytd,
            deduction_beginning_current=payload.deduction_beginning_current,
            deduction_beginning_ytd=payload.deduction_beginning_ytd,
            deduction_current_period_current=payload.deduction_current_period_current,
            deduction_current_period_ytd=payload.deduction_current_period_ytd,
            taxable_income_deduction_current=payload.taxable_income_deduction_current,
            taxable_income_deduction_ytd=payload.taxable_income_deduction_ytd,
            tax_exempt_deduction_current=payload.tax_exempt_deduction_current,
            tax_exempt_deduction_ytd=payload.tax_exempt_deduction_ytd,
            deduction_ending_balance_current=payload.deduction_ending_balance_current,
            deduction_ending_balance_ytd=payload.deduction_ending_balance_ytd,
            taxable_sales_current=payload.taxable_sales_current,
            taxable_sales_ytd=payload.taxable_sales_ytd,
            fee_rate=payload.fee_rate,
            payable_fee_current=payload.payable_fee_current,
            payable_fee_ytd=payload.payable_fee_ytd,
            unpaid_beginning_current=payload.unpaid_beginning_current,
            unpaid_beginning_ytd=payload.unpaid_beginning_ytd,
            paid_current_period_current=payload.paid_current_period_current,
            paid_current_period_ytd=payload.paid_current_period_ytd,
            prepaid_current=payload.prepaid_current,
            prepaid_ytd=payload.prepaid_ytd,
            paid_last_period_current=payload.paid_last_period_current,
            paid_last_period_ytd=payload.paid_last_period_ytd,
            paid_arrears_current=payload.paid_arrears_current,
            paid_arrears_ytd=payload.paid_arrears_ytd,
            unpaid_ending_current=payload.unpaid_ending_current,
            unpaid_ending_ytd=payload.unpaid_ending_ytd,
            arrears_current=payload.arrears_current,
            arrears_ytd=payload.arrears_ytd,
            fill_refund_current=payload.fill_refund_current,
            fill_refund_ytd=payload.fill_refund_ytd,
            inspected_supplement_current=payload.inspected_supplement_current,
            inspected_supplement_ytd=payload.inspected_supplement_ytd,
        )
        db.add(decl)
        db.flush()

    # 添加扣除项目清单
    for i, d in enumerate(payload.deductions):
        deduction = CulturalConstructionFeeDeduction(
            declaration_id=decl.id,
            seq=i + 1,
            invoice_supplier_tax_no=d.invoice_supplier_tax_no,
            invoice_supplier_name=d.invoice_supplier_name,
            service_item_name=d.service_item_name,
            voucher_type=d.voucher_type,
            voucher_no=d.voucher_no,
            amount=d.amount,
        )
        db.add(deduction)

    db.commit()
    return {"id": decl.id, "message": "保存成功"}


@router.put("/declarations/{declaration_id}")
def update_declaration(declaration_id: int, payload: DeclarationUpdate, company_id: int, db: Session = Depends(get_db)):
    """更新申报"""
    decl = db.query(CulturalConstructionFeeDeclaration).filter(
        CulturalConstructionFeeDeclaration.id == declaration_id,
        CulturalConstructionFeeDeclaration.company_id == company_id,
    ).first()
    if not decl:
        raise HTTPException(404, "申报记录不存在")

    decl.status = payload.status or decl.status
    decl.note = payload.note if payload.note is not None else decl.note
    decl.taxable_income_current = payload.taxable_income_current
    decl.taxable_income_ytd = payload.taxable_income_ytd
    decl.tax_exempt_income_current = payload.tax_exempt_income_current
    decl.tax_exempt_income_ytd = payload.tax_exempt_income_ytd
    decl.deduction_beginning_current = payload.deduction_beginning_current
    decl.deduction_beginning_ytd = payload.deduction_beginning_ytd
    decl.deduction_current_period_current = payload.deduction_current_period_current
    decl.deduction_current_period_ytd = payload.deduction_current_period_ytd
    decl.taxable_income_deduction_current = payload.taxable_income_deduction_current
    decl.taxable_income_deduction_ytd = payload.taxable_income_deduction_ytd
    decl.tax_exempt_deduction_current = payload.tax_exempt_deduction_current
    decl.tax_exempt_deduction_ytd = payload.tax_exempt_deduction_ytd
    decl.deduction_ending_balance_current = payload.deduction_ending_balance_current
    decl.deduction_ending_balance_ytd = payload.deduction_ending_balance_ytd
    decl.taxable_sales_current = payload.taxable_sales_current
    decl.taxable_sales_ytd = payload.taxable_sales_ytd
    decl.fee_rate = payload.fee_rate
    decl.payable_fee_current = payload.payable_fee_current
    decl.payable_fee_ytd = payload.payable_fee_ytd
    decl.unpaid_beginning_current = payload.unpaid_beginning_current
    decl.unpaid_beginning_ytd = payload.unpaid_beginning_ytd
    decl.paid_current_period_current = payload.paid_current_period_current
    decl.paid_current_period_ytd = payload.paid_current_period_ytd
    decl.prepaid_current = payload.prepaid_current
    decl.prepaid_ytd = payload.prepaid_ytd
    decl.paid_last_period_current = payload.paid_last_period_current
    decl.paid_last_period_ytd = payload.paid_last_period_ytd
    decl.paid_arrears_current = payload.paid_arrears_current
    decl.paid_arrears_ytd = payload.paid_arrears_ytd
    decl.unpaid_ending_current = payload.unpaid_ending_current
    decl.unpaid_ending_ytd = payload.unpaid_ending_ytd
    decl.arrears_current = payload.arrears_current
    decl.arrears_ytd = payload.arrears_ytd
    decl.fill_refund_current = payload.fill_refund_current
    decl.fill_refund_ytd = payload.fill_refund_ytd
    decl.inspected_supplement_current = payload.inspected_supplement_current
    decl.inspected_supplement_ytd = payload.inspected_supplement_ytd
    decl.updated_at = datetime.now()

    # 替换扣除项目清单
    db.query(CulturalConstructionFeeDeduction).filter(
        CulturalConstructionFeeDeduction.declaration_id == decl.id
    ).delete()
    for i, d in enumerate(payload.deductions):
        deduction = CulturalConstructionFeeDeduction(
            declaration_id=decl.id,
            seq=i + 1,
            invoice_supplier_tax_no=d.invoice_supplier_tax_no,
            invoice_supplier_name=d.invoice_supplier_name,
            service_item_name=d.service_item_name,
            voucher_type=d.voucher_type,
            voucher_no=d.voucher_no,
            amount=d.amount,
        )
        db.add(deduction)

    db.commit()
    return {"message": "更新成功"}


@router.delete("/declarations/{declaration_id}")
def delete_declaration(declaration_id: int, company_id: int, db: Session = Depends(get_db)):
    """删除申报记录及其扣除项目"""
    decl = db.query(CulturalConstructionFeeDeclaration).filter(
        CulturalConstructionFeeDeclaration.id == declaration_id,
        CulturalConstructionFeeDeclaration.company_id == company_id,
    ).first()
    if not decl:
        raise HTTPException(404, "申报记录不存在")
    db.query(CulturalConstructionFeeDeduction).filter(
        CulturalConstructionFeeDeduction.declaration_id == declaration_id
    ).delete()
    db.delete(decl)
    db.commit()
    return {"message": "删除成功"}


# ============ 自动计算 ============

@router.post("/declarations/{declaration_id}/auto-calculate")
def auto_calculate(declaration_id: int, company_id: int, db: Session = Depends(get_db)):
    """自动计算文化事业建设费申报表各栏次"""
    decl = db.query(CulturalConstructionFeeDeclaration).filter(
        CulturalConstructionFeeDeclaration.id == declaration_id,
        CulturalConstructionFeeDeclaration.company_id == company_id,
    ).first()
    if not decl:
        raise HTTPException(404, "申报记录不存在")

    # 栏次7 = 3 + 4 - 5 - 6
    decl.deduction_ending_balance_current = round(
        (decl.deduction_beginning_current or 0)
        + (decl.deduction_current_period_current or 0)
        - (decl.taxable_income_deduction_current or 0)
        - (decl.tax_exempt_deduction_current or 0),
        2
    )
    # 栏次8 = 1 - 5
    decl.taxable_sales_current = round(
        (decl.taxable_income_current or 0)
        - (decl.taxable_income_deduction_current or 0),
        2
    )
    # 栏次10 = 8 × 9
    decl.payable_fee_current = round(
        (decl.taxable_sales_current or 0) * (decl.fee_rate or 0.03),
        2
    )
    # 栏次12 = 13 + 14 + 15
    decl.paid_current_period_current = round(
        (decl.prepaid_current or 0)
        + (decl.paid_last_period_current or 0)
        + (decl.paid_arrears_current or 0),
        2
    )
    # 栏次16 = 10 + 11 - 12
    decl.unpaid_ending_current = round(
        (decl.payable_fee_current or 0)
        + (decl.unpaid_beginning_current or 0)
        - (decl.paid_current_period_current or 0),
        2
    )
    # 栏次17 = 11 - 14 - 15
    decl.arrears_current = round(
        (decl.unpaid_beginning_current or 0)
        - (decl.paid_last_period_current or 0)
        - (decl.paid_arrears_current or 0),
        2
    )
    # 栏次18 = 10 - 13
    decl.fill_refund_current = round(
        (decl.payable_fee_current or 0)
        - (decl.prepaid_current or 0),
        2
    )
    decl.updated_at = datetime.now()
    db.commit()
    return {"message": "计算完成", "id": decl.id}
