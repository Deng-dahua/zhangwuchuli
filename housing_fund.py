from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import SessionLocal, HousingFundDeclaration
from datetime import datetime

router = APIRouter(prefix="/api/housing-fund", tags=["公积金缴存"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/declarations")
def list_declarations(company_id: int, period: str = None, db: Session = Depends(get_db)):
    q = db.query(HousingFundDeclaration).filter(
        HousingFundDeclaration.company_id == company_id
    )
    if period:
        q = q.filter(HousingFundDeclaration.period == period)
    items = q.order_by(HousingFundDeclaration.period.desc()).all()
    return [
        {
            "id": d.id,
            "company_id": d.company_id,
            "period": d.period,
            "unit_name": d.unit_name,
            "unit_account": d.unit_account,
            "funding_source": d.funding_source,
            "amount": d.amount,
            "amount_capital": d.amount_capital,
            "person_count_last": d.person_count_last,
            "person_count_increase": d.person_count_increase,
            "person_count_decrease": d.person_count_decrease,
            "person_count_this": d.person_count_this,
            "amount_last": d.amount_last,
            "amount_increase": d.amount_increase,
            "amount_decrease": d.amount_decrease,
            "amount_this": d.amount_this,
            "payment_method": d.payment_method,
            "temp_deposit_amount": d.temp_deposit_amount,
            "payer_account_name": d.payer_account_name,
            "payer_bank_name": d.payer_bank_name,
            "payer_account": d.payer_account,
            "note": d.note,
            "fill_date": d.fill_date,
            "status": d.status,
            "created_at": str(d.created_at) if d.created_at else None,
        }
        for d in items
    ]


@router.post("/declarations")
def save_declaration(payload: dict, db: Session = Depends(get_db)):
    company_id = payload.get("company_id")
    period = payload.get("period")
    if not company_id or not period:
        raise HTTPException(400, "company_id 和 period 必填")

    existing = db.query(HousingFundDeclaration).filter(
        HousingFundDeclaration.company_id == company_id,
        HousingFundDeclaration.period == period
    ).first()

    if existing:
        for key, val in payload.items():
            if hasattr(existing, key) and key not in ("id", "company_id", "period", "created_at"):
                setattr(existing, key, val)
        existing.updated_at = datetime.now()
        db.commit()
        db.refresh(existing)
        return {"msg": "更新成功", "id": existing.id}
    else:
        new = HousingFundDeclaration(**{k: v for k, v in payload.items() if hasattr(HousingFundDeclaration, k)})
        db.add(new)
        db.commit()
        db.refresh(new)
        return {"msg": "创建成功", "id": new.id}


@router.get("/declarations/{declaration_id}")
def get_declaration(declaration_id: int, company_id: int = None, db: Session = Depends(get_db)):
    q = db.query(HousingFundDeclaration).filter(HousingFundDeclaration.id == declaration_id)
    if company_id:
        q = q.filter(HousingFundDeclaration.company_id == company_id)
    d = q.first()
    if not d:
        raise HTTPException(404, "记录不存在")
    return {
        "id": d.id,
        "company_id": d.company_id,
        "period": d.period,
        "unit_name": d.unit_name,
        "unit_account": d.unit_account,
        "funding_source": d.funding_source,
        "amount": d.amount,
        "amount_capital": d.amount_capital,
        "person_count_last": d.person_count_last,
        "person_count_increase": d.person_count_increase,
        "person_count_decrease": d.person_count_decrease,
        "person_count_this": d.person_count_this,
        "amount_last": d.amount_last,
        "amount_increase": d.amount_increase,
        "amount_decrease": d.amount_decrease,
        "amount_this": d.amount_this,
        "payment_method": d.payment_method,
        "temp_deposit_amount": d.temp_deposit_amount,
        "payer_account_name": d.payer_account_name,
        "payer_bank_name": d.payer_bank_name,
        "payer_account": d.payer_account,
        "note": d.note,
        "fill_date": d.fill_date,
        "status": d.status,
        "created_at": str(d.created_at) if d.created_at else None,
    }


@router.delete("/declarations/{declaration_id}")
def delete_declaration(declaration_id: int, company_id: int = None, db: Session = Depends(get_db)):
    q = db.query(HousingFundDeclaration).filter(HousingFundDeclaration.id == declaration_id)
    if company_id:
        q = q.filter(HousingFundDeclaration.company_id == company_id)
    d = q.first()
    if not d:
        raise HTTPException(404, "记录不存在")
    db.delete(d)
    db.commit()
    return {"msg": "删除成功"}


@router.get("/stats")
def get_stats(company_id: int, db: Session = Depends(get_db)):
    items = db.query(HousingFundDeclaration).filter(
        HousingFundDeclaration.company_id == company_id
    ).all()
    total = len(items)
    total_amount = sum(d.amount or 0 for d in items)
    total_persons = sum(d.person_count_this or 0 for d in items)
    return {
        "total": total,
        "total_amount": round(total_amount, 2),
        "total_persons": total_persons,
    }
