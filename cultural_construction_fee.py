"""
文化事业建设费申报 API 路由
使用 FastAPI APIRouter，在 main.py 中 include_router 加载。
完全参照 vat.py 的架构复刻。
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from datetime import datetime
from typing import Optional, List
import json

from database import (
    CulturalConstructionFeeDeclaration,
    CulturalConstructionFeeDeduction,
    Company, get_db,
)

router = APIRouter(prefix="/api/cultural-construction-fee", tags=["文化事业建设费"])


# ==================== 工具函数 ====================

def _ccf_build_form_main_from_db(decl):
    """从 ORM 列构建 form_main dict（JSON 为空时的 fallback）"""
    row_keys = [
        "row1_taxable_income", "row2_tax_exempt_income",
        "row3_deduction_beginning", "row4_deduction_current_period",
        "row5_taxable_income_deduction", "row6_tax_exempt_deduction",
        "row7_deduction_ending_balance", "row8_taxable_sales",
        "row9_fee_rate",
        "row10_payable_fee", "row11_unpaid_beginning",
        "row12_paid_current_period", "row13_prepaid",
        "row14_paid_last_period", "row15_paid_arrears",
        "row16_unpaid_ending", "row17_arrears",
        "row18_fill_refund", "row19_inspected_supplement",
    ]
    result = {}
    for key in row_keys:
        if key == "row9_fee_rate":
            result["row9_fee_rate"] = float(getattr(decl, "row9_fee_rate", 0.03) or 0.03)
        else:
            result[key + "_current"] = float(getattr(decl, key + "_current", 0) or 0)
            result[key + "_ytd"] = float(getattr(decl, key + "_ytd", 0) or 0)
    return result


# ==================== Pydantic 模型 ====================

class DeductionItem(BaseModel):
    seq: int = 0
    invoice_supplier_tax_no: str = ""
    invoice_supplier_name: str = ""
    service_item_name: str = ""
    voucher_type: str = ""
    voucher_no: str = ""
    amount: float = 0.0


class DeclarationCreate(BaseModel):
    period: str = ""
    taxpayer_name: str = ""
    note: str = ""
    # 主表栏次（本月数 / 本年累计）
    row1_taxable_income_current: float = 0.0
    row1_taxable_income_ytd: float = 0.0
    row2_tax_exempt_income_current: float = 0.0
    row2_tax_exempt_income_ytd: float = 0.0
    row3_deduction_beginning_current: float = 0.0
    row3_deduction_beginning_ytd: float = 0.0
    row4_deduction_current_period_current: float = 0.0
    row4_deduction_current_period_ytd: float = 0.0
    row5_taxable_income_deduction_current: float = 0.0
    row5_taxable_income_deduction_ytd: float = 0.0
    row6_tax_exempt_deduction_current: float = 0.0
    row6_tax_exempt_deduction_ytd: float = 0.0
    row7_deduction_ending_balance_current: float = 0.0
    row7_deduction_ending_balance_ytd: float = 0.0
    row8_taxable_sales_current: float = 0.0
    row8_taxable_sales_ytd: float = 0.0
    row9_fee_rate: float = 0.03
    row10_payable_fee_current: float = 0.0
    row10_payable_fee_ytd: float = 0.0
    row11_unpaid_beginning_current: float = 0.0
    row11_unpaid_beginning_ytd: float = 0.0
    row12_paid_current_period_current: float = 0.0
    row12_paid_current_period_ytd: float = 0.0
    row13_prepaid_current: float = 0.0
    row13_prepaid_ytd: float = 0.0
    row14_paid_last_period_current: float = 0.0
    row14_paid_last_period_ytd: float = 0.0
    row15_paid_arrears_current: float = 0.0
    row15_paid_arrears_ytd: float = 0.0
    row16_unpaid_ending_current: float = 0.0
    row16_unpaid_ending_ytd: float = 0.0
    row17_arrears_current: float = 0.0
    row17_arrears_ytd: float = 0.0
    row18_fill_refund_current: float = 0.0
    row18_fill_refund_ytd: float = 0.0
    row19_inspected_supplement_current: float = 0.0
    row19_inspected_supplement_ytd: float = 0.0
    # JSON 表单数据
    form_main: dict = {}
    form_deduction: dict = {}
    # 扣除项目清单
    deductions: List[DeductionItem] = []


class DeclarationUpdate(DeclarationCreate):
    pass


# ==================== 统计卡片 ====================

@router.get("/stats")
def get_stats(company_id: int = Query(), db: Session = Depends(get_db)):
    """统计卡片数据"""
    declarations = db.query(CulturalConstructionFeeDeclaration).filter(
        CulturalConstructionFeeDeclaration.company_id == company_id
    ).all()
    count = len(declarations)
    total_taxable_income = sum(float(d.row1_taxable_income_current or 0) for d in declarations)
    total_fee = sum(float(d.row10_payable_fee_current or 0) for d in declarations)
    total_fill_refund = sum(float(d.row18_fill_refund_current or 0) for d in declarations)
    return {
        "count": count,
        "total_taxable_income": round(total_taxable_income, 2),
        "total_fee": round(total_fee, 2),
        "total_fill_refund": round(total_fill_refund, 2),
    }


# ==================== CRUD ====================

@router.get("/declarations")
def list_declarations(
    company_id: int = Query(),
    period: str = Query(None),
    period_from: str = Query(None),
    period_to: str = Query(None),
    db: Session = Depends(get_db),
):
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
            "taxpayer_name": item.taxpayer_name,
            "taxpayer_id": item.taxpayer_id,
            "fill_date": str(item.fill_date) if item.fill_date else None,
            "deduction_count": deduction_count,
            "payable_fee_current": float(item.row10_payable_fee_current or 0),
            "payable_fee_ytd": float(item.row10_payable_fee_ytd or 0),
            "fill_refund_current": float(item.row18_fill_refund_current or 0),
            "fill_refund_ytd": float(item.row18_fill_refund_ytd or 0),
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        })
    return {"items": result, "total": len(result)}


@router.get("/declarations/{declaration_id}")
def get_declaration(declaration_id: int, company_id: int = Query(), db: Session = Depends(get_db)):
    decl = db.query(CulturalConstructionFeeDeclaration).filter(
        CulturalConstructionFeeDeclaration.id == declaration_id,
        CulturalConstructionFeeDeclaration.company_id == company_id,
    ).first()
    if not decl:
        raise HTTPException(404, "申报记录不存在")

    deductions = db.query(CulturalConstructionFeeDeduction).filter(
        CulturalConstructionFeeDeduction.declaration_id == declaration_id
    ).order_by(CulturalConstructionFeeDeduction.seq).all()

    # 从 JSON 读取，若为空则从 DB 列合成
    form_main = {}
    form_deduction = {}
    try:
        if decl.form_main:
            form_main = json.loads(decl.form_main) if isinstance(decl.form_main, str) else decl.form_main
    except Exception:
        form_main = {}
    if not form_main:
        form_main = _ccf_build_form_main_from_db(decl)
    try:
        if decl.form_deduction:
            form_deduction = json.loads(decl.form_deduction) if isinstance(decl.form_deduction, str) else decl.form_deduction
    except Exception:
        form_deduction = {}

    return {
        "id": decl.id,
        "company_id": decl.company_id,
        "period": decl.period,
        "status": decl.status,
        "note": decl.note,
        "taxpayer_name": decl.taxpayer_name,
        "taxpayer_id": decl.taxpayer_id,
        "fill_date": str(decl.fill_date) if decl.fill_date else None,
        "form_main": form_main,
        "form_deduction": form_deduction,
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
def create_declaration(payload: DeclarationCreate, company_id: int = Query(), db: Session = Depends(get_db)):
    period = payload.period
    if not period:
        raise HTTPException(400, "税款所属期不能为空")
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "公司不存在")

    # 按期间去重
    existing = db.query(CulturalConstructionFeeDeclaration).filter(
        CulturalConstructionFeeDeclaration.company_id == company_id,
        CulturalConstructionFeeDeclaration.period == period,
    ).first()
    if existing:
        raise HTTPException(400, f"期间 {period} 已有申报记录")

    decl = CulturalConstructionFeeDeclaration(
        company_id=company_id,
        period=period,
        taxpayer_name=payload.taxpayer_name or company.name,
        taxpayer_id=company.uscc or "",
        status="草稿",
        note=payload.note or "",
        fill_date=datetime.now().date(),
    )
    # 主表栏次（通过 setattr 批量赋值）
    for field in [
        "row1_taxable_income_current", "row1_taxable_income_ytd",
        "row2_tax_exempt_income_current", "row2_tax_exempt_income_ytd",
        "row3_deduction_beginning_current", "row3_deduction_beginning_ytd",
        "row4_deduction_current_period_current", "row4_deduction_current_period_ytd",
        "row5_taxable_income_deduction_current", "row5_taxable_income_deduction_ytd",
        "row6_tax_exempt_deduction_current", "row6_tax_exempt_deduction_ytd",
        "row7_deduction_ending_balance_current", "row7_deduction_ending_balance_ytd",
        "row8_taxable_sales_current", "row8_taxable_sales_ytd",
        "row10_payable_fee_current", "row10_payable_fee_ytd",
        "row11_unpaid_beginning_current", "row11_unpaid_beginning_ytd",
        "row12_paid_current_period_current", "row12_paid_current_period_ytd",
        "row13_prepaid_current", "row13_prepaid_ytd",
        "row14_paid_last_period_current", "row14_paid_last_period_ytd",
        "row15_paid_arrears_current", "row15_paid_arrears_ytd",
        "row16_unpaid_ending_current", "row16_unpaid_ending_ytd",
        "row17_arrears_current", "row17_arrears_ytd",
        "row18_fill_refund_current", "row18_fill_refund_ytd",
        "row19_inspected_supplement_current", "row19_inspected_supplement_ytd",
    ]:
        if hasattr(payload, field):
            setattr(decl, field, getattr(payload, field, 0.0))

    if hasattr(payload, "row9_fee_rate"):
        decl.row9_fee_rate = payload.row9_fee_rate or 0.03

    # 保存 JSON 表单
    if payload.form_main:
        decl.form_main = json.dumps(payload.form_main, ensure_ascii=False)
    if payload.form_deduction:
        decl.form_deduction = json.dumps(payload.form_deduction, ensure_ascii=False)

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
    db.refresh(decl)
    return {"id": decl.id, "message": "创建成功"}


@router.put("/declarations/{declaration_id}")
def update_declaration(declaration_id: int, payload: dict, company_id: int = Query(), db: Session = Depends(get_db)):
    decl = db.query(CulturalConstructionFeeDeclaration).filter(
        CulturalConstructionFeeDeclaration.id == declaration_id,
        CulturalConstructionFeeDeclaration.company_id == company_id,
    ).first()
    if not decl:
        raise HTTPException(404, "申报记录不存在")

    # 更新基础字段
    if "period" in payload:
        decl.period = payload["period"]
    if "taxpayer_name" in payload:
        decl.taxpayer_name = payload["taxpayer_name"]
    if "status" in payload:
        decl.status = payload["status"]
    if "note" in payload:
        decl.note = payload["note"]
    decl.fill_date = datetime.now().date()

    # 更新主表栏次
    field_map = {
        "row1_taxable_income_current": "row1_taxable_income_current",
        "row1_taxable_income_ytd": "row1_taxable_income_ytd",
        "row2_tax_exempt_income_current": "row2_tax_exempt_income_current",
        "row2_tax_exempt_income_ytd": "row2_tax_exempt_income_ytd",
        "row3_deduction_beginning_current": "row3_deduction_beginning_current",
        "row3_deduction_beginning_ytd": "row3_deduction_beginning_ytd",
        "row4_deduction_current_period_current": "row4_deduction_current_period_current",
        "row4_deduction_current_period_ytd": "row4_deduction_current_period_ytd",
        "row5_taxable_income_deduction_current": "row5_taxable_income_deduction_current",
        "row5_taxable_income_deduction_ytd": "row5_taxable_income_deduction_ytd",
        "row6_tax_exempt_deduction_current": "row6_tax_exempt_deduction_current",
        "row6_tax_exempt_deduction_ytd": "row6_tax_exempt_deduction_ytd",
        "row7_deduction_ending_balance_current": "row7_deduction_ending_balance_current",
        "row7_deduction_ending_balance_ytd": "row7_deduction_ending_balance_ytd",
        "row8_taxable_sales_current": "row8_taxable_sales_current",
        "row8_taxable_sales_ytd": "row8_taxable_sales_ytd",
        "row9_fee_rate": "row9_fee_rate",
        "row10_payable_fee_current": "row10_payable_fee_current",
        "row10_payable_fee_ytd": "row10_payable_fee_ytd",
        "row11_unpaid_beginning_current": "row11_unpaid_beginning_current",
        "row11_unpaid_beginning_ytd": "row11_unpaid_beginning_ytd",
        "row12_paid_current_period_current": "row12_paid_current_period_current",
        "row12_paid_current_period_ytd": "row12_paid_current_period_ytd",
        "row13_prepaid_current": "row13_prepaid_current",
        "row13_prepaid_ytd": "row13_prepaid_ytd",
        "row14_paid_last_period_current": "row14_paid_last_period_current",
        "row14_paid_last_period_ytd": "row14_paid_last_period_ytd",
        "row15_paid_arrears_current": "row15_paid_arrears_current",
        "row15_paid_arrears_ytd": "row15_paid_arrears_ytd",
        "row16_unpaid_ending_current": "row16_unpaid_ending_current",
        "row16_unpaid_ending_ytd": "row16_unpaid_ending_ytd",
        "row17_arrears_current": "row17_arrears_current",
        "row17_arrears_ytd": "row17_arrears_ytd",
        "row18_fill_refund_current": "row18_fill_refund_current",
        "row18_fill_refund_ytd": "row18_fill_refund_ytd",
        "row19_inspected_supplement_current": "row19_inspected_supplement_current",
        "row19_inspected_supplement_ytd": "row19_inspected_supplement_ytd",
    }
    for key in field_map:
        if key in payload:
            setattr(decl, key, payload[key])

    # 更新 JSON 表单
    if "form_main" in payload:
        decl.form_main = json.dumps(payload["form_main"], ensure_ascii=False)
    if "form_deduction" in payload:
        decl.form_deduction = json.dumps(payload["form_deduction"], ensure_ascii=False)

    # 替换扣除项目清单
    db.query(CulturalConstructionFeeDeduction).filter(
        CulturalConstructionFeeDeduction.declaration_id == declaration_id
    ).delete()
    for i, d in enumerate(payload.get("deductions", [])):
        deduction = CulturalConstructionFeeDeduction(
            declaration_id=declaration_id,
            seq=i + 1,
            invoice_supplier_tax_no=d.get("invoice_supplier_tax_no", ""),
            invoice_supplier_name=d.get("invoice_supplier_name", ""),
            service_item_name=d.get("service_item_name", ""),
            voucher_type=d.get("voucher_type", ""),
            voucher_no=d.get("voucher_no", ""),
            amount=d.get("amount", 0.0),
        )
        db.add(deduction)

    decl.updated_at = datetime.now()
    db.commit()
    return {"message": "更新成功"}


@router.delete("/declarations/{declaration_id}")
def delete_declaration(declaration_id: int, company_id: int = Query(), db: Session = Depends(get_db)):
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


# ==================== 自动计算 ====================

@router.post("/declarations/{declaration_id}/auto-calculate")
def auto_calculate(declaration_id: int, company_id: int = Query(), db: Session = Depends(get_db)):
    """自动计算文化事业建设费申报表各栏次"""
    decl = db.query(CulturalConstructionFeeDeclaration).filter(
        CulturalConstructionFeeDeclaration.id == declaration_id,
        CulturalConstructionFeeDeclaration.company_id == company_id,
    ).first()
    if not decl:
        raise HTTPException(404, "申报记录不存在")

    # 栏次7 = 3 + 4 - 5 - 6
    decl.row7_deduction_ending_balance_current = round(
        (decl.row3_deduction_beginning_current or 0)
        + (decl.row4_deduction_current_period_current or 0)
        - (decl.row5_taxable_income_deduction_current or 0)
        - (decl.row6_tax_exempt_deduction_current or 0),
        2
    )

    # 栏次8 = 1 - 5
    decl.row8_taxable_sales_current = round(
        (decl.row1_taxable_income_current or 0)
        - (decl.row5_taxable_income_deduction_current or 0),
        2
    )

    # 栏次10 = 8 × 9
    decl.row10_payable_fee_current = round(
        (decl.row8_taxable_sales_current or 0) * (decl.row9_fee_rate or 0.03),
        2
    )

    # 栏次12 = 13 + 14 + 15
    decl.row12_paid_current_period_current = round(
        (decl.row13_prepaid_current or 0)
        + (decl.row14_paid_last_period_current or 0)
        + (decl.row15_paid_arrears_current or 0),
        2
    )

    # 栏次16 = 10 + 11 - 12
    decl.row16_unpaid_ending_current = round(
        (decl.row10_payable_fee_current or 0)
        + (decl.row11_unpaid_beginning_current or 0)
        - (decl.row12_paid_current_period_current or 0),
        2
    )

    # 栏次17 = 11 - 14 - 15
    decl.row17_arrears_current = round(
        (decl.row11_unpaid_beginning_current or 0)
        - (decl.row14_paid_last_period_current or 0)
        - (decl.row15_paid_arrears_current or 0),
        2
    )

    # 栏次18 = 10 - 13
    decl.row18_fill_refund_current = round(
        (decl.row10_payable_fee_current or 0)
        - (decl.row13_prepaid_current or 0),
        2
    )

    # 本年累计 = 本月数 + 历史期间数据
    # 简化：暂不实现 YTD 自动计算

    decl.updated_at = datetime.now()
    db.commit()
    return {"message": "自动计算完成"}
