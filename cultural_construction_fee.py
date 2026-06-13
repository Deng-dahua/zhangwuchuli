"""
文化事业建设费申报 API 路由
使用 FastAPI APIRouter，在 main.py 中 include_router 加载。
完全参照 vat.py 的架构复刻。
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from datetime import datetime
from typing import Optional, List
import json
import calendar

from database import (
    CulturalConstructionFeeDeclaration,
    CulturalConstructionFeeDeduction,
    Company, get_db,
    SalesInvoice, PurchaseInvoice, BookkeepingInvoice,
    JournalEntry, Account, Supplier,
)

router = APIRouter(prefix="/api/cultural-construction-fee", tags=["文化事业建设费"])


# ==================== 工具函数 ====================

def _ccf_to_num(val):
    """安全转数值"""
    if val is None: return 0
    if isinstance(val, (int, float)): return float(val)
    try:
        s = str(val).replace(",", "").replace("，", "").replace(" ", "").replace("　", "")
        if s in ("", "-", "—", "——", "无", "零"): return 0
        return float(s)
    except (ValueError, TypeError): return 0


def _ccf_build_form_main_from_db(decl):
    """从 ORM 列构建 form_main dict（JSON 为空时的 fallback）"""
    row_keys = [
        "row1_taxable_income", "row2_tax_exempt_income",
        "row3_deduction_beginning", "row4_deduction_current_period",
        "row5_taxable_income_deduction", "row6_tax_exempt_deduction",
        "row7_deduction_ending_balance", "row8_taxable_sales",
        "row9_fee_rate",
        "row10_payable_fee", "row10a_fee_reduction",
        "row11_unpaid_beginning",
        "row12_paid_current_period", "row13_prepaid",
        "row14_paid_last_period", "row15_paid_arrears",
        "row16_unpaid_ending", "row17_arrears",
        "row18_fill_refund", "row19_inspected_supplement",
    ]
    result = {}
    for key in row_keys:
        if key == "row9_fee_rate":
            result["row9_fee_rate"] = float(getattr(decl, "row9_fee_rate", 0.03) or 0.03)
        elif key == "row10a_fee_reduction":
            result["row10a_fee_reduction_current"] = float(getattr(decl, "row10a_fee_reduction_current", 0) or 0)
            result["row10a_fee_reduction_ytd"] = float(getattr(decl, "row10a_fee_reduction_ytd", 0) or 0)
        else:
            result[key + "_current"] = float(getattr(decl, key + "_current", 0) or 0)
            result[key + "_ytd"] = float(getattr(decl, key + "_ytd", 0) or 0)
    result["fee_reduction_rate"] = float(getattr(decl, "fee_reduction_rate", 0.5) or 0.5)
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
    row10a_fee_reduction_current: float = 0.0
    row10a_fee_reduction_ytd: float = 0.0
    fee_reduction_rate: float = 0.5
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

    # ★ YTD 跨期累加
    _ccf_aggregate_ytd(decl, db, company_id)

    # ★ 从ORM列重建 form_main（确保所有字段完整），再统一重算公式栏次
    decl.form_main = json.dumps(_ccf_build_form_main_from_db(decl), ensure_ascii=False)
    _ccf_recompute(decl, db)
    decl.updated_at = datetime.now()
    db.commit()

    deductions = db.query(CulturalConstructionFeeDeduction).filter(
        CulturalConstructionFeeDeduction.declaration_id == declaration_id
    ).order_by(CulturalConstructionFeeDeduction.seq).all()

    # 从更新后的 form_main 读取
    try:
        form_main = json.loads(decl.form_main) if isinstance(decl.form_main, str) else (decl.form_main or {})
    except Exception:
        form_main = {}
    try:
        form_deduction = json.loads(decl.form_deduction) if isinstance(decl.form_deduction, str) else (decl.form_deduction or {})
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

    # 创建后自动激活 AI 填列
    try:
        _ccf_auto_fill_core(db, company_id, decl.id)
        db.commit()
        db.refresh(decl)
    except Exception:
        pass

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


def _ccf_recompute(decl, db=None):
    """
    统一重新计算所有公式栏次，同时写回 ORM 属性和 form_main JSON。
    在 GET 接口和 auto_calculate 接口中均调用此函数。
    """
    period = decl.period or ''
    period_year = int(period[:4]) if period else 0
    period_month = int(period[5:7]) if len(period) >= 7 else 0
    rate = float(decl.row9_fee_rate or 0.03)

    # 减半征收判断：财税〔2019〕46号（2019.7-2024.12）+ 财税〔2025〕7号（2025+）
    # 2019年仅7月及以后减半，2020年起全年减半
    _halving = period_year > 2019 or (period_year == 2019 and period_month >= 7)

    # 辅助：安全取 float（SQLAlchemy 可能返回 Decimal，不能直接和 float 运算）
    def _f(v): return float(v or 0)

    # ---- 本月数 ----
    # 栏次7 = 3+4-5-6
    decl.row7_deduction_ending_balance_current = round(
        _f(decl.row3_deduction_beginning_current)
        + _f(decl.row4_deduction_current_period_current)
        - _f(decl.row5_taxable_income_deduction_current)
        - _f(decl.row6_tax_exempt_deduction_current), 2
    )
    # 栏次8 = 1-5
    decl.row8_taxable_sales_current = round(
        _f(decl.row1_taxable_income_current)
        - _f(decl.row5_taxable_income_deduction_current), 2
    )
    # 栏次10 = 8×9 × 50%（减半征收）
    fee = _f(decl.row8_taxable_sales_current) * rate
    if _halving:
        fee = fee * 0.5
    decl.row10_payable_fee_current = round(fee, 2)
    # 栏次12 = 13+14+15
    decl.row12_paid_current_period_current = round(
        _f(decl.row13_prepaid_current)
        + _f(decl.row14_paid_last_period_current)
        + _f(decl.row15_paid_arrears_current), 2
    )
    # 栏次16 = 10+11-12
    decl.row16_unpaid_ending_current = round(
        _f(decl.row10_payable_fee_current)
        + _f(decl.row11_unpaid_beginning_current)
        - _f(decl.row12_paid_current_period_current), 2
    )
    # 栏次17 = 11-14-15
    decl.row17_arrears_current = round(
        _f(decl.row11_unpaid_beginning_current)
        - _f(decl.row14_paid_last_period_current)
        - _f(decl.row15_paid_arrears_current), 2
    )
    # 栏次18 = 10-13
    decl.row18_fill_refund_current = round(
        _f(decl.row10_payable_fee_current)
        - _f(decl.row13_prepaid_current), 2
    )

    # ---- 本年累计（同公式）----
    decl.row7_deduction_ending_balance_ytd = round(
        _f(decl.row3_deduction_beginning_ytd)
        + _f(decl.row4_deduction_current_period_ytd)
        - _f(decl.row5_taxable_income_deduction_ytd)
        - _f(decl.row6_tax_exempt_deduction_ytd), 2
    )
    decl.row8_taxable_sales_ytd = round(
        _f(decl.row1_taxable_income_ytd)
        - _f(decl.row5_taxable_income_deduction_ytd), 2
    )
    fee_ytd = _f(decl.row8_taxable_sales_ytd) * rate
    if _halving:
        fee_ytd = fee_ytd * 0.5
    decl.row10_payable_fee_ytd = round(fee_ytd, 2)
    decl.row12_paid_current_period_ytd = round(
        _f(decl.row13_prepaid_ytd)
        + _f(decl.row14_paid_last_period_ytd)
        + _f(decl.row15_paid_arrears_ytd), 2
    )
    decl.row16_unpaid_ending_ytd = round(
        _f(decl.row10_payable_fee_ytd)
        + _f(decl.row11_unpaid_beginning_ytd)
        - _f(decl.row12_paid_current_period_ytd), 2
    )
    decl.row17_arrears_ytd = round(
        _f(decl.row11_unpaid_beginning_ytd)
        - _f(decl.row14_paid_last_period_ytd)
        - _f(decl.row15_paid_arrears_ytd), 2
    )
    decl.row18_fill_refund_ytd = round(
        _f(decl.row10_payable_fee_ytd)
        - _f(decl.row13_prepaid_ytd), 2
    )

    # ---- 同步写回 form_main JSON ----
    try:
        fm = json.loads(decl.form_main) if isinstance(decl.form_main, str) else (decl.form_main or {})
    except Exception:
        fm = {}
    for key in ['row7_deduction_ending_balance', 'row8_taxable_sales',
                'row10_payable_fee', 'row12_paid_current_period',
                'row16_unpaid_ending', 'row17_arrears', 'row18_fill_refund']:
        orm_key_cur = key + '_current'
        orm_key_ytd = key + '_ytd'
        fm[orm_key_cur] = float(getattr(decl, orm_key_cur, 0) or 0)
        fm[orm_key_ytd] = float(getattr(decl, orm_key_ytd, 0) or 0)
    decl.form_main = json.dumps(fm, ensure_ascii=False)
    return decl


# ==================== YTD 跨期累加（helper） ====================

def _ccf_aggregate_ytd(decl, db, company_id):
    """
    YTD 跨期累加：取本年1月至当前月所有申报表，
    把本月数累加到本年累计。参照 vat.py 的 YTD 逻辑。
    """
    if not decl.period or len(decl.period) < 7:
        return
    try:
        year = int(decl.period[:4])
        month = int(decl.period[5:7])
        # 需要累加的输入栏次（不含公式栏次）
        ytd_fields = [
            "row1_taxable_income",
            "row2_tax_exempt_income",
            "row4_deduction_current_period",
            "row5_taxable_income_deduction",
            "row6_tax_exempt_deduction",
            "row13_prepaid",
            "row14_paid_last_period",
            "row15_paid_arrears",
            "row19_inspected_supplement",
        ]
        # 历史各月（不含当前月）
        hist_periods = [f"{year}-{m:02d}" for m in range(1, month)]
        hist_decls = db.query(CulturalConstructionFeeDeclaration).filter(
            CulturalConstructionFeeDeclaration.company_id == company_id,
            CulturalConstructionFeeDeclaration.period.in_(hist_periods),
        ).all() if hist_periods else []
        def _f2(v): return float(v or 0)
        ytd_sums = {f: 0.0 for f in ytd_fields}
        for d in hist_decls:
            for f in ytd_fields:
                ytd_sums[f] += _f2(getattr(d, f + "_current", 0))
        # 写回当前 decl 的 _ytd 列：YTD = 历史合计 + 本月数
        for f in ytd_fields:
            current_val = _f2(getattr(decl, f + "_current", 0))
            ytd_val = round(ytd_sums[f] + current_val, 2)
            orm_key = f + "_ytd"
            if hasattr(decl, orm_key):
                setattr(decl, orm_key, ytd_val)
        # 余额类栏次：YTD = 本月余额（不累加）
        for f in ["row3_deduction_beginning", "row11_unpaid_beginning"]:
            v = _f2(getattr(decl, f + "_current", 0))
            orm_key = f + "_ytd"
            if hasattr(decl, orm_key):
                setattr(decl, orm_key, v)
        # row9 费率：YTD = 本月费率
        decl.row9_fee_rate = _f2(getattr(decl, "row9_fee_rate", 0.03)) or 0.03
    except Exception as e:
        print(f"[CCF YTD] error: {e}")
        import traceback; traceback.print_exc()


# ==================== 自动计算 ====================

@router.post("/declarations/{declaration_id}/auto-calculate")
def auto_calculate(declaration_id: int, company_id: int = Query(), db: Session = Depends(get_db)):
    """自动计算文化事业建设费申报表各栏次（同时存 DB + form_main JSON）"""
    decl = db.query(CulturalConstructionFeeDeclaration).filter(
        CulturalConstructionFeeDeclaration.id == declaration_id,
        CulturalConstructionFeeDeclaration.company_id == company_id,
    ).first()
    if not decl:
        raise HTTPException(404, "申报记录不存在")

    # ★ YTD 跨期累加
    _ccf_aggregate_ytd(decl, db, company_id)

    _ccf_recompute(decl, db)
    decl.updated_at = datetime.now()
    db.commit()
    return {"message": "自动计算完成"}


# ==================== AI 自动填列 ====================

# 文化事业建设费 — 广告服务关键词（用于匹配销项/进项发票的货物/服务名称）
CCF_AD_KEYWORDS = ["广告服务", "广告发布费", "广告制作费", "广告代理", "广告策划", "广告设计"]

# 文化事业建设费 — 非广告服务关键词（有广告字眼但实际不是广告服务）
CCF_AD_EXCLUDE = ["非广告", "非广告服务"]


def _ccf_auto_fill_core(db, company_id, declaration_id):
    """AI自动填列核心逻辑，供 create_declaration 和 ai_auto_fill 调用"""
    from calendar import monthrange

    decl = db.query(CulturalConstructionFeeDeclaration).filter(
        CulturalConstructionFeeDeclaration.id == declaration_id,
        CulturalConstructionFeeDeclaration.company_id == company_id,
    ).first()
    if not decl:
        return None

    period = decl.period
    year, month = period.split("-")
    year, month = int(year), int(month)
    _, last_day = monthrange(year, month)
    period_start = f"{year}-{month:02d}-01"
    period_end = f"{year}-{month:02d}-{last_day:02d}"
    entry_date = datetime(year, month, last_day).date()

    # 1. 扫描销项发票 → 应征收入
    taxable_income = 0.0
    for si in db.query(SalesInvoice).filter(
        SalesInvoice.company_id == company_id,
        SalesInvoice.invoice_date.between(period_start, period_end),
        SalesInvoice.total_amount > 0,
    ).all():
        goods = (si.goods_name or "").lower()
        if any(kw.lower() in goods for kw in CCF_AD_KEYWORDS) and not any(kw.lower() in goods for kw in CCF_AD_EXCLUDE):
            taxable_income += float(si.total_amount or 0)

    taxable_income = round(taxable_income, 2)
    decl.row1_taxable_income_current = taxable_income
    decl.row1_taxable_income_ytd = taxable_income
    decl.row2_tax_exempt_income_current = 0
    decl.row2_tax_exempt_income_ytd = 0

    # 2. 扫描进项/记账发票 → 扣除项目
    db.query(CulturalConstructionFeeDeduction).filter(
        CulturalConstructionFeeDeduction.declaration_id == declaration_id
    ).delete()

    deduction_total = 0.0
    deduction_count = 0
    for inv in (
        list(db.query(PurchaseInvoice).filter(
            PurchaseInvoice.company_id == company_id,
            PurchaseInvoice.invoice_date.between(period_start, period_end),
            PurchaseInvoice.total_amount > 0).all())
        + list(db.query(BookkeepingInvoice).filter(
            BookkeepingInvoice.company_id == company_id,
            BookkeepingInvoice.invoice_date.between(period_start, period_end),
            BookkeepingInvoice.total_amount > 0).all())
    ):
        goods = (getattr(inv, 'goods_name', '') or '').lower()
        if any(kw.lower() in goods for kw in CCF_AD_KEYWORDS) and not any(kw.lower() in goods for kw in CCF_AD_EXCLUDE):
            amount = float(getattr(inv, 'total_amount', 0) or 0)
            seller_name = getattr(inv, 'seller_name', '') or getattr(inv, 'party_name', '') or ''
            deduction_total += amount
            deduction_count += 1
            inv_type = "purchase" if isinstance(inv, PurchaseInvoice) else "bookkeeping"
            tax_no = (getattr(inv, 'seller_tax_no', '') or getattr(inv, 'party_tax_no', '') or '')
            digital = getattr(inv, 'digital_invoice_no', '') or ''
            inv_code = getattr(inv, 'invoice_code', '') or ''
            inv_no_raw = getattr(inv, 'invoice_no', '') or ''
            inv_no = digital or ((inv_code + inv_no_raw).strip())
            db.add(CulturalConstructionFeeDeduction(
                declaration_id=declaration_id, seq=deduction_count,
                invoice_supplier_tax_no=tax_no or "",
                invoice_supplier_name=seller_name,
                service_item_name=getattr(inv, 'goods_name', '') or '',
                voucher_no=inv_no, amount=amount,
            ))

    deduction_total = round(deduction_total, 2)
    decl.row4_deduction_current_period_current = deduction_total
    decl.row4_deduction_current_period_ytd = deduction_total

    # 3. 计算主表
    bb = float(decl.row3_deduction_beginning_current or 0)
    total_avail = round(bb + deduction_total, 2)
    decl.row5_taxable_income_deduction_current = min(total_avail, taxable_income)
    decl.row7_deduction_ending_balance_current = round(total_avail - float(decl.row5_taxable_income_deduction_current or 0), 2)

    ts = round(taxable_income - float(decl.row5_taxable_income_deduction_current or 0), 2)
    decl.row8_taxable_sales_current = ts
    decl.row9_fee_rate = 0.03
    fee = round(ts * 0.03, 2)
    decl.row10_payable_fee_current = fee

    if year >= 2025:
        decl.row10a_fee_reduction_current = round(fee * 0.5, 2)
    else:
        decl.row10a_fee_reduction_current = 0

    decl.row11_unpaid_beginning_current = 0
    decl.row12_paid_current_period_current = 0
    decl.row16_unpaid_ending_current = round(fee - float(decl.row10a_fee_reduction_current or 0), 2)

    for fn in ["row13_prepaid_current","row14_paid_last_period_current","row15_paid_arrears_current",
               "row17_arrears_current","row18_fill_refund_current","row19_inspected_supplement_current"]:
        setattr(decl, fn, 0)

    decl.status = "已申报"
    decl.updated_at = datetime.now()

    # 4. 生成凭证
    if fee > 0:
        try:
            _generate_ccf_voucher(db, company_id, decl, fee, entry_date, period)
        except Exception:
            pass
        try:
            _match_ccf_payment_voucher(db, company_id, decl, fee, entry_date, period)
        except Exception:
            pass

    return decl


def _get_next_voucher_no(db, company_id: int) -> int:
    """获取下一个凭证号"""
    max_no = db.query(func.max(JournalEntry.voucher_no)).filter(
        JournalEntry.company_id == company_id
    ).scalar()
    return (max_no or 0) + 1


def _get_or_create_account(db, company_id: int, code: str, name: str,
                           parent_code: str = None, category: str = "负债",
                           balance_direction: str = "贷") -> Account:
    """查找科目，不存在则自动创建"""
    acct = db.query(Account).filter(
        Account.company_id == company_id,
        Account.code == code,
    ).first()
    if not acct:
        acct = Account(
            company_id=company_id,
            code=code,
            name=name,
            parent_code=parent_code,
            category=category,
            balance_direction=balance_direction,
        )
        db.add(acct)
        db.flush()
    return acct


def _generate_ccf_voucher(db, company_id: int, decl, fee_amount: float,
                          entry_date, period: str) -> dict:
    """生成文化事业建设费计提凭证（借：税金及附加 / 贷：应交文化事业建设费）"""
    # 确保科目存在
    tax_account = _get_or_create_account(
        db, company_id, "6403", "税金及附加",
        category="损益", balance_direction="借"
    )
    ccf_account = _get_or_create_account(
        db, company_id, "221016", "应交文化事业建设费",
        parent_code="2210", category="负债", balance_direction="贷"
    )

    # 检查是否已存在同日同金额的 CCF 凭证
    existing = db.query(JournalEntry).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.source == "文化事业建设费",
        JournalEntry.entry_date == entry_date,
        JournalEntry.debit_amount == fee_amount,
    ).first()
    if existing:
        vno = existing.voucher_no
        return {"voucher_no": vno, "exists": True, "message": f"凭证 记-{vno} 已存在，跳过生成"}

    vno = _get_next_voucher_no(db, company_id)
    summary = f"计提文化事业建设费-{period}"

    # 借方：税金及附加
    db.add(JournalEntry(
        company_id=company_id,
        entry_date=entry_date,
        period=period,
        voucher_word="记",
        voucher_no=vno,
        summary=summary,
        account_code=tax_account.code,
        account_name=tax_account.name,
        debit_amount=fee_amount,
        credit_amount=0,
        source="文化事业建设费",
        ref_id=decl.id,
        attach_count=0,
    ))

    # 贷方：应交文化事业建设费
    db.add(JournalEntry(
        company_id=company_id,
        entry_date=entry_date,
        period=period,
        voucher_word="记",
        voucher_no=vno,
        summary=summary,
        account_code=ccf_account.code,
        account_name=ccf_account.name,
        debit_amount=0,
        credit_amount=fee_amount,
        source="文化事业建设费",
        ref_id=decl.id,
        attach_count=0,
    ))

    db.flush()
    return {"voucher_no": vno, "exists": False, "message": f"已生成凭证 记-{vno}"}


def _match_ccf_payment_voucher(db, company_id: int, decl, fee_amount: float,
                               entry_date, period: str) -> dict:
    """匹配银行流水中的文化事业建设费支付记录"""
    from database import BankTransaction

    # 查找银行流水中对方户名含"国家金库"且金额匹配的支付
    bank_txs = db.query(BankTransaction).filter(
        BankTransaction.company_id == company_id,
        BankTransaction.transaction_date >= entry_date,
        BankTransaction.credit_amount == fee_amount,
        BankTransaction.counterparty_name.contains("国家金库"),
    ).all()

    if not bank_txs:
        return {"matched": False, "message": "未找到匹配的银行支付流水"}

    results = []
    for tx in bank_txs:
        # 检查是否已有支付凭证
        existing_je = db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.source == "文化事业建设费缴纳",
            JournalEntry.entry_date == tx.transaction_date,
        ).first()
        if existing_je:
            results.append({"voucher_no": existing_je.voucher_no, "matched": True,
                          "message": f"支付凭证 记-{existing_je.voucher_no} 已存在",
                          "bank_tx_id": tx.id})
            continue

        vno = _get_next_voucher_no(db, company_id)
        summary = f"缴纳文化事业建设费-{period}"

        # 确保科目存在
        ccf_account = _get_or_create_account(
            db, company_id, "221016", "应交文化事业建设费",
            parent_code="2210", category="负债", balance_direction="贷"
        )
        bank_account = db.query(Account).filter(
            Account.company_id == company_id,
            Account.code == "1002",
        ).first()
        if not bank_account:
            bank_account = _get_or_create_account(
                db, company_id, "1002", "银行存款",
                category="资产", balance_direction="借"
            )

        # 借方：应交文化事业建设费（冲减）
        db.add(JournalEntry(
            company_id=company_id,
            entry_date=tx.transaction_date,
            period=period,
            voucher_word="记",
            voucher_no=vno,
            summary=summary,
            account_code=ccf_account.code,
            account_name=ccf_account.name,
            debit_amount=fee_amount,
            credit_amount=0,
            source="文化事业建设费缴纳",
            ref_id=decl.id,
        ))

        # 贷方：银行存款
        db.add(JournalEntry(
            company_id=company_id,
            entry_date=tx.transaction_date,
            period=period,
            voucher_word="记",
            voucher_no=vno,
            summary=summary,
            account_code=bank_account.code,
            account_name=bank_account.name,
            debit_amount=0,
            credit_amount=fee_amount,
            source="文化事业建设费缴纳",
            ref_id=decl.id,
        ))

        db.flush()
        # 回写银行流水的凭证号
        tx.journal_voucher_no = f"记-{vno}"
        decl.row15_paid_arrears_current = fee_amount
        results.append({"voucher_no": vno, "matched": True,
                       "message": f"已生成支付凭证 记-{vno}",
                       "bank_tx_id": tx.id})

    return {"matched": True, "results": results}


@router.post("/declarations/{declaration_id}/ai-auto-fill")
def ai_auto_fill(declaration_id: int, company_id: int = Query(),
                 db: Session = Depends(get_db)):
    """🤖 AI 自动填列文化事业建设费申报表"""
    result = _ccf_auto_fill_core(db, company_id, declaration_id)
    if result is None:
        raise HTTPException(404, "申报记录不存在")
    db.commit()
    return {"success": True, "message": "AI 自动填列完成", "declaration_id": declaration_id}
