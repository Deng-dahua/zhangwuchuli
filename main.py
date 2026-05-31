"""
中小制造业账务处理系统 - 后端 API
"""
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
import os

from database import get_db, init_db, Account, Voucher, VoucherDetail, Period

app = FastAPI(title="账务处理系统", description="中小制造业账务管理系统", version="1.0.0")

# 启动时初始化数据库
@app.on_event("startup")
async def startup_event():
    init_db()

# 挂载静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")


# ==================== Pydantic 模型 ====================

class AccountCreate(BaseModel):
    code: str
    name: str
    category: str
    balance_direction: str
    level: int = 1
    parent_code: Optional[str] = None

class AccountUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None

class VoucherDetailIn(BaseModel):
    line_no: int
    summary: Optional[str] = None
    account_code: str
    debit_amount: float = 0.0
    credit_amount: float = 0.0

class VoucherCreate(BaseModel):
    voucher_date: date
    summary: str
    period: str
    creator: str = "管理员"
    attachments: int = 0
    details: List[VoucherDetailIn]

class VoucherUpdate(BaseModel):
    summary: Optional[str] = None
    checker: Optional[str] = None
    status: Optional[str] = None


# ==================== 首页 ====================

@app.get("/", response_class=HTMLResponse)
async def index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()


# ==================== 会计科目 ====================

@app.get("/api/accounts")
def list_accounts(
    category: Optional[str] = None,
    keyword: Optional[str] = None,
    level: Optional[int] = None,
    db: Session = Depends(get_db)
):
    q = db.query(Account)
    if category:
        q = q.filter(Account.category == category)
    if keyword:
        q = q.filter(or_(
            Account.code.contains(keyword),
            Account.name.contains(keyword)
        ))
    if level:
        q = q.filter(Account.level == level)
    accounts = q.order_by(Account.code).all()
    return [
        {
            "id": a.id, "code": a.code, "name": a.name,
            "category": a.category, "balance_direction": a.balance_direction,
            "level": a.level, "parent_code": a.parent_code,
            "is_active": a.is_active
        } for a in accounts
    ]


@app.post("/api/accounts")
def create_account(data: AccountCreate, db: Session = Depends(get_db)):
    existing = db.query(Account).filter(Account.code == data.code).first()
    if existing:
        raise HTTPException(400, detail=f"科目编码 {data.code} 已存在")
    acc = Account(**data.model_dump())
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return {"id": acc.id, "code": acc.code, "name": acc.name, "message": "创建成功"}


@app.put("/api/accounts/{account_id}")
def update_account(account_id: int, data: AccountUpdate, db: Session = Depends(get_db)):
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(404, detail="科目不存在")
    if data.name is not None:
        acc.name = data.name
    if data.is_active is not None:
        acc.is_active = data.is_active
    db.commit()
    return {"message": "更新成功"}


@app.delete("/api/accounts/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db)):
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(404, detail="科目不存在")
    # 检查是否有凭证使用了该科目
    used = db.query(VoucherDetail).filter(VoucherDetail.account_code == acc.code).first()
    if used:
        raise HTTPException(400, detail="该科目已有凭证使用，不能删除，请停用")
    db.delete(acc)
    db.commit()
    return {"message": "删除成功"}


# ==================== 凭证管理 ====================

@app.get("/api/vouchers")
def list_vouchers(
    period: Optional[str] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db)
):
    q = db.query(Voucher)
    if period:
        q = q.filter(Voucher.period == period)
    if status:
        q = q.filter(Voucher.status == status)
    if keyword:
        q = q.filter(or_(
            Voucher.voucher_no.contains(keyword),
            Voucher.summary.contains(keyword)
        ))
    total = q.count()
    vouchers = q.order_by(Voucher.voucher_date.desc(), Voucher.voucher_no.desc()) \
                .offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "data": [
            {
                "id": v.id,
                "voucher_no": v.voucher_no,
                "voucher_date": str(v.voucher_date),
                "summary": v.summary,
                "total_debit": v.total_debit,
                "total_credit": v.total_credit,
                "creator": v.creator,
                "checker": v.checker,
                "status": v.status,
                "period": v.period,
                "attachments": v.attachments
            } for v in vouchers
        ]
    }


@app.get("/api/vouchers/{voucher_id}")
def get_voucher(voucher_id: int, db: Session = Depends(get_db)):
    v = db.query(Voucher).filter(Voucher.id == voucher_id).first()
    if not v:
        raise HTTPException(404, detail="凭证不存在")
    return {
        "id": v.id,
        "voucher_no": v.voucher_no,
        "voucher_date": str(v.voucher_date),
        "summary": v.summary,
        "total_debit": v.total_debit,
        "total_credit": v.total_credit,
        "creator": v.creator,
        "checker": v.checker,
        "status": v.status,
        "period": v.period,
        "attachments": v.attachments,
        "details": [
            {
                "id": d.id,
                "line_no": d.line_no,
                "summary": d.summary,
                "account_code": d.account_code,
                "account_name": d.account.name if d.account else "",
                "debit_amount": d.debit_amount,
                "credit_amount": d.credit_amount
            } for d in sorted(v.details, key=lambda x: x.line_no)
        ]
    }


@app.post("/api/vouchers")
def create_voucher(data: VoucherCreate, db: Session = Depends(get_db)):
    # 校验借贷平衡
    total_debit = sum(d.debit_amount for d in data.details)
    total_credit = sum(d.credit_amount for d in data.details)
    if abs(total_debit - total_credit) > 0.001:
        raise HTTPException(400, detail=f"借贷不平衡：借方 {total_debit:.2f}，贷方 {total_credit:.2f}")
    if total_debit <= 0:
        raise HTTPException(400, detail="凭证金额不能为零")

    # 生成凭证号
    period_no = data.period.replace("-", "")
    count = db.query(Voucher).filter(Voucher.period == data.period).count()
    voucher_no = f"记-{period_no}-{str(count + 1).zfill(4)}"

    # 校验科目存在
    for d in data.details:
        acc = db.query(Account).filter(Account.code == d.account_code).first()
        if not acc:
            raise HTTPException(400, detail=f"科目 {d.account_code} 不存在")

    voucher = Voucher(
        voucher_no=voucher_no,
        voucher_date=data.voucher_date,
        summary=data.summary,
        total_debit=total_debit,
        total_credit=total_credit,
        creator=data.creator,
        period=data.period,
        attachments=data.attachments,
        status="草稿"
    )
    db.add(voucher)
    db.flush()

    for d in data.details:
        detail = VoucherDetail(
            voucher_id=voucher.id,
            line_no=d.line_no,
            summary=d.summary,
            account_code=d.account_code,
            debit_amount=d.debit_amount,
            credit_amount=d.credit_amount
        )
        db.add(detail)

    db.commit()
    db.refresh(voucher)
    return {"id": voucher.id, "voucher_no": voucher_no, "message": "凭证创建成功"}


@app.put("/api/vouchers/{voucher_id}/audit")
def audit_voucher(voucher_id: int, checker: str = "审核员", db: Session = Depends(get_db)):
    v = db.query(Voucher).filter(Voucher.id == voucher_id).first()
    if not v:
        raise HTTPException(404, detail="凭证不存在")
    if v.status != "草稿":
        raise HTTPException(400, detail="只有草稿状态的凭证才能审核")
    v.status = "已审核"
    v.checker = checker
    db.commit()
    return {"message": "审核成功"}


@app.delete("/api/vouchers/{voucher_id}")
def delete_voucher(voucher_id: int, db: Session = Depends(get_db)):
    v = db.query(Voucher).filter(Voucher.id == voucher_id).first()
    if not v:
        raise HTTPException(404, detail="凭证不存在")
    if v.status == "已过账":
        raise HTTPException(400, detail="已过账凭证不能删除")
    db.delete(v)
    db.commit()
    return {"message": "删除成功"}


# ==================== 账簿查询 ====================

@app.get("/api/ledger/general")
def general_ledger(
    period_from: str,
    period_to: str,
    account_code: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """总账/明细账查询"""
    q = db.query(
        VoucherDetail.account_code,
        Account.name.label("account_name"),
        Account.balance_direction,
        func.sum(VoucherDetail.debit_amount).label("total_debit"),
        func.sum(VoucherDetail.credit_amount).label("total_credit")
    ).join(Account, VoucherDetail.account_code == Account.code) \
     .join(Voucher, VoucherDetail.voucher_id == Voucher.id) \
     .filter(
        Voucher.period >= period_from,
        Voucher.period <= period_to
    )
    if account_code:
        q = q.filter(VoucherDetail.account_code.startswith(account_code))
    q = q.group_by(VoucherDetail.account_code, Account.name, Account.balance_direction)
    results = q.all()

    data = []
    for r in results:
        net = r.total_debit - r.total_credit
        if r.balance_direction == "借":
            balance = net
        else:
            balance = -net
        data.append({
            "account_code": r.account_code,
            "account_name": r.account_name,
            "balance_direction": r.balance_direction,
            "total_debit": round(r.total_debit, 2),
            "total_credit": round(r.total_credit, 2),
            "balance": round(balance, 2)
        })
    return sorted(data, key=lambda x: x["account_code"])


@app.get("/api/ledger/detail")
def detail_ledger(
    account_code: str,
    period_from: str,
    period_to: str,
    db: Session = Depends(get_db)
):
    """明细账"""
    results = db.query(
        Voucher.voucher_date,
        Voucher.voucher_no,
        VoucherDetail.summary,
        VoucherDetail.debit_amount,
        VoucherDetail.credit_amount
    ).join(VoucherDetail, Voucher.id == VoucherDetail.voucher_id) \
     .filter(
        VoucherDetail.account_code == account_code,
        Voucher.period >= period_from,
        Voucher.period <= period_to
    ).order_by(Voucher.voucher_date, Voucher.voucher_no).all()

    acc = db.query(Account).filter(Account.code == account_code).first()
    balance = 0.0
    rows = []
    for r in results:
        if acc and acc.balance_direction == "借":
            balance += r.debit_amount - r.credit_amount
        else:
            balance += r.credit_amount - r.debit_amount
        rows.append({
            "voucher_date": str(r.voucher_date),
            "voucher_no": r.voucher_no,
            "summary": r.summary,
            "debit_amount": round(r.debit_amount, 2),
            "credit_amount": round(r.credit_amount, 2),
            "balance": round(balance, 2)
        })
    return {
        "account_code": account_code,
        "account_name": acc.name if acc else "",
        "balance_direction": acc.balance_direction if acc else "借",
        "rows": rows
    }


# ==================== 财务报表 ====================

@app.get("/api/reports/profit-loss")
def profit_loss_report(period_from: str, period_to: str, db: Session = Depends(get_db)):
    """利润表"""
    def get_amount(codes_prefix: list):
        total = 0.0
        for code in codes_prefix:
            r = db.query(
                func.sum(VoucherDetail.debit_amount).label("d"),
                func.sum(VoucherDetail.credit_amount).label("c")
            ).join(Voucher, VoucherDetail.voucher_id == Voucher.id) \
             .join(Account, VoucherDetail.account_code == Account.code) \
             .filter(
                VoucherDetail.account_code.startswith(code),
                Voucher.period >= period_from,
                Voucher.period <= period_to
            ).first()
            if r and r.c:
                total += (r.c or 0) - (r.d or 0)
        return round(total, 2)

    def get_cost(codes_prefix: list):
        total = 0.0
        for code in codes_prefix:
            r = db.query(
                func.sum(VoucherDetail.debit_amount).label("d"),
                func.sum(VoucherDetail.credit_amount).label("c")
            ).join(Voucher, VoucherDetail.voucher_id == Voucher.id) \
             .filter(
                VoucherDetail.account_code.startswith(code),
                Voucher.period >= period_from,
                Voucher.period <= period_to
            ).first()
            if r and r.d:
                total += (r.d or 0) - (r.c or 0)
        return round(total, 2)

    revenue = get_amount(["6001"])
    other_revenue = get_amount(["6051"])
    main_cost = get_cost(["6401"])
    other_cost = get_cost(["6402"])
    tax = get_cost(["6403"])
    gross_profit = revenue - main_cost
    selling_expense = get_cost(["6601"])
    admin_expense = get_cost(["6602"])
    finance_expense = get_cost(["6603"])
    operating_profit = gross_profit + other_revenue - other_cost - tax - selling_expense - admin_expense - finance_expense
    non_op_income = get_amount(["6301"])
    non_op_expense = get_cost(["6711"])
    profit_before_tax = operating_profit + non_op_income - non_op_expense
    income_tax = get_cost(["6801"])
    net_profit = profit_before_tax - income_tax

    return {
        "period_from": period_from,
        "period_to": period_to,
        "items": [
            {"label": "一、营业收入", "amount": revenue, "bold": True},
            {"label": "  减：营业成本", "amount": main_cost},
            {"label": "  税金及附加", "amount": tax},
            {"label": "  销售费用", "amount": selling_expense},
            {"label": "  管理费用", "amount": admin_expense},
            {"label": "  财务费用", "amount": finance_expense},
            {"label": "  加：其他业务收入", "amount": other_revenue},
            {"label": "  减：其他业务成本", "amount": other_cost},
            {"label": "二、营业利润", "amount": round(operating_profit, 2), "bold": True},
            {"label": "  加：营业外收入", "amount": non_op_income},
            {"label": "  减：营业外支出", "amount": non_op_expense},
            {"label": "三、利润总额", "amount": round(profit_before_tax, 2), "bold": True},
            {"label": "  减：所得税费用", "amount": income_tax},
            {"label": "四、净利润", "amount": round(net_profit, 2), "bold": True, "highlight": True},
        ]
    }


@app.get("/api/reports/balance-sheet")
def balance_sheet(period: str, db: Session = Depends(get_db)):
    """资产负债表（简化版，基于期间累计）"""
    def get_balance(code_prefix: str, direction: str):
        r = db.query(
            func.sum(VoucherDetail.debit_amount).label("d"),
            func.sum(VoucherDetail.credit_amount).label("c")
        ).join(Voucher, VoucherDetail.voucher_id == Voucher.id) \
         .filter(
            VoucherDetail.account_code.startswith(code_prefix),
            Voucher.period <= period
        ).first()
        d = r.d or 0
        c = r.c or 0
        if direction == "借":
            return round(d - c, 2)
        else:
            return round(c - d, 2)

    cash = get_balance("1001", "借")
    bank = get_balance("1002", "借")
    ar = get_balance("1122", "借")
    other_ar = get_balance("1221", "借")
    prepay = get_balance("2203", "借")
    inventory = get_balance("1401", "借") + get_balance("1403", "借") + get_balance("1405", "借")
    wip = get_balance("5001", "借")
    fa = get_balance("1601", "借") - get_balance("1602", "贷")
    intangible = get_balance("1701", "借")
    total_assets = cash + bank + ar + other_ar + prepay + inventory + wip + fa + intangible

    st_loan = get_balance("2001", "贷")
    ap = get_balance("2202", "贷")
    advance = get_balance("1123", "贷")
    tax_pay = get_balance("2210", "贷")
    salary_pay = get_balance("2211", "贷")
    other_ap = get_balance("2221", "贷")
    lt_loan = get_balance("2501", "贷")
    total_liabilities = st_loan + ap + advance + tax_pay + salary_pay + other_ap + lt_loan

    capital = get_balance("4001", "贷")
    surplus = get_balance("4002", "贷") + get_balance("4101", "贷")
    retained = get_balance("4103", "贷") + get_balance("4104", "贷")
    total_equity = capital + surplus + retained

    return {
        "period": period,
        "assets": [
            {"label": "流动资产", "bold": True, "amount": None},
            {"label": "货币资金", "amount": round(cash + bank, 2)},
            {"label": "应收账款", "amount": ar},
            {"label": "其他应收款", "amount": other_ar},
            {"label": "预付账款", "amount": prepay},
            {"label": "存货（含在产品）", "amount": round(inventory + wip, 2)},
            {"label": "非流动资产", "bold": True, "amount": None},
            {"label": "固定资产净值", "amount": fa},
            {"label": "无形资产", "amount": intangible},
            {"label": "资产总计", "amount": round(total_assets, 2), "bold": True, "highlight": True},
        ],
        "liabilities_equity": [
            {"label": "流动负债", "bold": True, "amount": None},
            {"label": "短期借款", "amount": st_loan},
            {"label": "应付账款", "amount": ap},
            {"label": "预收账款", "amount": advance},
            {"label": "应交税费", "amount": tax_pay},
            {"label": "应付职工薪酬", "amount": salary_pay},
            {"label": "其他应付款", "amount": other_ap},
            {"label": "非流动负债", "bold": True, "amount": None},
            {"label": "长期借款", "amount": lt_loan},
            {"label": "负债合计", "amount": round(total_liabilities, 2), "bold": True},
            {"label": "所有者权益", "bold": True, "amount": None},
            {"label": "实收资本", "amount": capital},
            {"label": "资本公积及盈余公积", "amount": surplus},
            {"label": "未分配利润", "amount": retained},
            {"label": "所有者权益合计", "amount": round(total_equity, 2), "bold": True},
            {"label": "负债和所有者权益总计", "amount": round(total_liabilities + total_equity, 2), "bold": True, "highlight": True},
        ]
    }


# ==================== 期间管理 ====================

@app.get("/api/periods")
def list_periods(db: Session = Depends(get_db)):
    periods = db.query(Period).order_by(Period.period.desc()).all()
    return [{"period": p.period, "status": p.status} for p in periods]


@app.post("/api/periods/{period}/close")
def close_period(period: str, db: Session = Depends(get_db)):
    p = db.query(Period).filter(Period.period == period).first()
    if not p:
        raise HTTPException(404, detail="期间不存在")
    if p.status == "已结账":
        raise HTTPException(400, detail="该期间已结账")
    # 检查是否有未审核凭证
    unaudited = db.query(Voucher).filter(
        Voucher.period == period,
        Voucher.status == "草稿"
    ).count()
    if unaudited > 0:
        raise HTTPException(400, detail=f"还有 {unaudited} 张草稿凭证未审核，不能结账")
    p.status = "已结账"
    p.closed_at = datetime.now()

    # 自动创建下期
    year, month = int(period[:4]), int(period[5:])
    if month == 12:
        next_period = f"{year + 1}-01"
    else:
        next_period = f"{year}-{str(month + 1).zfill(2)}"
    existing = db.query(Period).filter(Period.period == next_period).first()
    if not existing:
        db.add(Period(period=next_period))

    db.commit()
    return {"message": f"{period} 结账成功，已自动创建 {next_period} 期间"}


# ==================== 统计看板 ====================

@app.get("/api/dashboard")
def dashboard(period: Optional[str] = None, db: Session = Depends(get_db)):
    if not period:
        from datetime import date
        period = date.today().strftime("%Y-%m")

    total_vouchers = db.query(Voucher).filter(Voucher.period == period).count()
    draft_vouchers = db.query(Voucher).filter(Voucher.period == period, Voucher.status == "草稿").count()
    audited_vouchers = db.query(Voucher).filter(Voucher.period == period, Voucher.status == "已审核").count()
    total_debit = db.query(func.sum(Voucher.total_debit)).filter(Voucher.period == period).scalar() or 0

    # 最近5张凭证
    recent = db.query(Voucher).filter(Voucher.period == period) \
               .order_by(Voucher.created_at.desc()).limit(5).all()

    return {
        "period": period,
        "total_vouchers": total_vouchers,
        "draft_vouchers": draft_vouchers,
        "audited_vouchers": audited_vouchers,
        "total_amount": round(total_debit, 2),
        "recent_vouchers": [
            {
                "voucher_no": v.voucher_no,
                "voucher_date": str(v.voucher_date),
                "summary": v.summary,
                "total_debit": v.total_debit,
                "status": v.status
            } for v in recent
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
