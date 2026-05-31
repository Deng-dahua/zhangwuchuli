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

from database import (
    get_db, init_db,
    CompanyInfo, Department, Employee, Customer, Supplier,
    Account, Voucher, VoucherDetail, Period
)

app = FastAPI(title="账务处理系统", description="中小制造业账务管理系统", version="1.0.0")

# 启动时初始化数据库
@app.on_event("startup")
async def startup_event():
    init_db()

# 挂载静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")


# ==================== Pydantic 模型 ====================

# 公司信息
class CompanyInfoUpdate(BaseModel):
    company_name: Optional[str] = None
    tax_no: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    legal_representative: Optional[str] = None
    registered_capital: Optional[str] = None
    established_date: Optional[str] = None
    business_scope: Optional[str] = None

# 部门
class DepartmentCreate(BaseModel):
    code: str
    name: str
    parent_code: Optional[str] = None
    manager: Optional[str] = None
    description: Optional[str] = None

class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    manager: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

# 人员
class EmployeeCreate(BaseModel):
    code: str
    name: str
    department_code: Optional[str] = None
    position: Optional[str] = None
    id_card: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    salary: Optional[float] = 0.0
    entry_date: Optional[date] = None

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    department_code: Optional[str] = None
    position: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    salary: Optional[float] = None
    is_active: Optional[bool] = None

# 客户
class CustomerCreate(BaseModel):
    code: str
    name: str
    tax_no: Optional[str] = None
    contact: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    credit_limit: Optional[float] = 0.0
    payment_terms: Optional[int] = 30
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    remark: Optional[str] = None

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    contact: Optional[str] = None
    phone: Optional[str] = None
    credit_limit: Optional[float] = None
    is_active: Optional[bool] = None

# 供应商
class SupplierCreate(BaseModel):
    code: str
    name: str
    tax_no: Optional[str] = None
    contact: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    credit_limit: Optional[float] = 0.0
    payment_terms: Optional[int] = 30
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    remark: Optional[str] = None

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact: Optional[str] = None
    phone: Optional[str] = None
    credit_limit: Optional[float] = None
    is_active: Optional[bool] = None

# 凭证（原有）
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


# ==================== 公司信息 ====================

@app.get("/api/company")
def get_company(db: Session = Depends(get_db)):
    info = db.query(CompanyInfo).first()
    if not info:
        return {"company_name": "", "tax_no": "", "address": "", "phone": "",
                "bank_name": "", "bank_account": "", "legal_representative": "",
                "registered_capital": "", "established_date": None, "business_scope": ""}
    return {
        "id": info.id,
        "company_name": info.company_name,
        "tax_no": info.tax_no,
        "address": info.address,
        "phone": info.phone,
        "bank_name": info.bank_name,
        "bank_account": info.bank_account,
        "legal_representative": info.legal_representative,
        "registered_capital": info.registered_capital,
        "established_date": str(info.established_date) if info.established_date else None,
        "business_scope": info.business_scope,
    }

@app.put("/api/company")
def update_company(data: CompanyInfoUpdate, db: Session = Depends(get_db)):
    info = db.query(CompanyInfo).first()
    if not info:
        info = CompanyInfo(company_name=data.company_name or "")
        db.add(info)
        db.flush()
    for k, v in data.model_dump(exclude_unset=True).items():
        if k == 'established_date' and v:
            try:
                v = date.fromisoformat(v)
            except ValueError:
                v = None
        setattr(info, k, v)
    info.updated_at = datetime.now()
    db.commit()
    return {"message": "保存成功"}


# ==================== 部门档案 ====================

@app.get("/api/departments")
def list_departments(
    keyword: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(Department)
    if keyword:
        q = q.filter(or_(
            Department.code.contains(keyword),
            Department.name.contains(keyword)
        ))
    depts = q.order_by(Department.code).all()
    return [
        {
            "id": d.id, "code": d.code, "name": d.name,
            "parent_code": d.parent_code, "manager": d.manager,
            "description": d.description, "is_active": d.is_active
        } for d in depts
    ]

@app.post("/api/departments")
def create_department(data: DepartmentCreate, db: Session = Depends(get_db)):
    if db.query(Department).filter(Department.code == data.code).first():
        raise HTTPException(400, detail=f"部门编码 {data.code} 已存在")
    d = Department(**data.model_dump())
    db.add(d)
    db.commit()
    return {"message": "新增成功"}

@app.put("/api/departments/{dept_id}")
def update_department(dept_id: int, data: DepartmentUpdate, db: Session = Depends(get_db)):
    d = db.query(Department).filter(Department.id == dept_id).first()
    if not d:
        raise HTTPException(404, detail="部门不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    db.commit()
    return {"message": "更新成功"}

@app.delete("/api/departments/{dept_id}")
def delete_department(dept_id: int, db: Session = Depends(get_db)):
    d = db.query(Department).filter(Department.id == dept_id).first()
    if not d:
        raise HTTPException(404, detail="部门不存在")
    # 检查是否有员工关联
    emp = db.query(Employee).filter(Employee.department_code == d.code).first()
    if emp:
        raise HTTPException(400, detail="该部门下有员工，请先迁移员工后再删除")
    db.delete(d)
    db.commit()
    return {"message": "删除成功"}


# ==================== 人员档案 ====================

@app.get("/api/employees")
def list_employees(
    keyword: Optional[str] = None,
    department_code: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    q = db.query(Employee)
    if keyword:
        q = q.filter(or_(
            Employee.code.contains(keyword),
            Employee.name.contains(keyword),
            Employee.position.contains(keyword)
        ))
    if department_code:
        q = q.filter(Employee.department_code == department_code)
    if is_active is not None:
        q = q.filter(Employee.is_active == is_active)
    emps = q.order_by(Employee.code).all()
    return [
        {
            "id": e.id, "code": e.code, "name": e.name,
            "department_code": e.department_code,
            "department_name": e.department.name if e.department else "",
            "position": e.position, "phone": e.phone,
            "email": e.email, "salary": e.salary,
            "entry_date": str(e.entry_date) if e.entry_date else "",
            "is_active": e.is_active
        } for e in emps
    ]

@app.post("/api/employees")
def create_employee(data: EmployeeCreate, db: Session = Depends(get_db)):
    if db.query(Employee).filter(Employee.code == data.code).first():
        raise HTTPException(400, detail=f"工号 {data.code} 已存在")
    # 校验部门是否存在
    if data.department_code:
        dept = db.query(Department).filter(Department.code == data.department_code).first()
        if not dept:
            raise HTTPException(400, detail=f"部门 {data.department_code} 不存在")
    e = Employee(**data.model_dump())
    db.add(e)
    db.commit()
    return {"message": "新增成功"}

@app.put("/api/employees/{emp_id}")
def update_employee(emp_id: int, data: EmployeeUpdate, db: Session = Depends(get_db)):
    e = db.query(Employee).filter(Employee.id == emp_id).first()
    if not e:
        raise HTTPException(404, detail="员工不存在")
    if data.department_code:
        dept = db.query(Department).filter(Department.code == data.department_code).first()
        if not dept:
            raise HTTPException(400, detail=f"部门 {data.department_code} 不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(e, k, v)
    db.commit()
    return {"message": "更新成功"}

@app.delete("/api/employees/{emp_id}")
def delete_employee(emp_id: int, db: Session = Depends(get_db)):
    e = db.query(Employee).filter(Employee.id == emp_id).first()
    if not e:
        raise HTTPException(404, detail="员工不存在")
    db.delete(e)
    db.commit()
    return {"message": "删除成功"}


# ==================== 客户档案 ====================

@app.get("/api/customers")
def list_customers(
    keyword: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    q = db.query(Customer)
    if keyword:
        q = q.filter(or_(
            Customer.code.contains(keyword),
            Customer.name.contains(keyword),
            Customer.contact.contains(keyword)
        ))
    if is_active is not None:
        q = q.filter(Customer.is_active == is_active)
    items = q.order_by(Customer.code).all()
    return [
        {
            "id": c.id, "code": c.code, "name": c.name,
            "tax_no": c.tax_no, "contact": c.contact,
            "phone": c.phone, "address": c.address,
            "credit_limit": c.credit_limit,
            "payment_terms": c.payment_terms,
            "bank_name": c.bank_name,
            "bank_account": c.bank_account,
            "is_active": c.is_active,
            "remark": c.remark
        } for c in items
    ]

@app.post("/api/customers")
def create_customer(data: CustomerCreate, db: Session = Depends(get_db)):
    if db.query(Customer).filter(Customer.code == data.code).first():
        raise HTTPException(400, detail=f"客户编码 {data.code} 已存在")
    c = Customer(**data.model_dump())
    db.add(c)
    db.commit()
    return {"message": "新增成功"}

@app.put("/api/customers/{cust_id}")
def update_customer(cust_id: int, data: CustomerUpdate, db: Session = Depends(get_db)):
    c = db.query(Customer).filter(Customer.id == cust_id).first()
    if not c:
        raise HTTPException(404, detail="客户不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    return {"message": "更新成功"}

@app.delete("/api/customers/{cust_id}")
def delete_customer(cust_id: int, db: Session = Depends(get_db)):
    c = db.query(Customer).filter(Customer.id == cust_id).first()
    if not c:
        raise HTTPException(404, detail="客户不存在")
    db.delete(c)
    db.commit()
    return {"message": "删除成功"}


# ==================== 供应商档案 ====================

@app.get("/api/suppliers")
def list_suppliers(
    keyword: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    q = db.query(Supplier)
    if keyword:
        q = q.filter(or_(
            Supplier.code.contains(keyword),
            Supplier.name.contains(keyword),
            Supplier.contact.contains(keyword)
        ))
    if is_active is not None:
        q = q.filter(Supplier.is_active == is_active)
    items = q.order_by(Supplier.code).all()
    return [
        {
            "id": s.id, "code": s.code, "name": s.name,
            "tax_no": s.tax_no, "contact": s.contact,
            "phone": s.phone, "address": s.address,
            "credit_limit": s.credit_limit,
            "payment_terms": s.payment_terms,
            "bank_name": s.bank_name,
            "bank_account": s.bank_account,
            "is_active": s.is_active,
            "remark": s.remark
        } for s in items
    ]

@app.post("/api/suppliers")
def create_supplier(data: SupplierCreate, db: Session = Depends(get_db)):
    if db.query(Supplier).filter(Supplier.code == data.code).first():
        raise HTTPException(400, detail=f"供应商编码 {data.code} 已存在")
    s = Supplier(**data.model_dump())
    db.add(s)
    db.commit()
    return {"message": "新增成功"}

@app.put("/api/suppliers/{supp_id}")
def update_supplier(supp_id: int, data: SupplierUpdate, db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.id == supp_id).first()
    if not s:
        raise HTTPException(404, detail="供应商不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    return {"message": "更新成功"}

@app.delete("/api/suppliers/{supp_id}")
def delete_supplier(supp_id: int, db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.id == supp_id).first()
    if not s:
        raise HTTPException(404, detail="供应商不存在")
    db.delete(s)
    db.commit()
    return {"message": "删除成功"}


# ==================== 会计科目（原有，保留）====================

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
def create_account(data: dict, db: Session = Depends(get_db)):
    from pydantic import ValidationError
    code = data.get("code")
    name = data.get("name")
    category = data.get("category")
    balance_direction = data.get("balance_direction")
    level = data.get("level", 1)
    parent_code = data.get("parent_code")
    if not code or not name:
        raise HTTPException(400, detail="科目编码和名称不能为空")
    if db.query(Account).filter(Account.code == code).first():
        raise HTTPException(400, detail=f"科目编码 {code} 已存在")
    acc = Account(code=code, name=name, category=category,
                  balance_direction=balance_direction, level=level, parent_code=parent_code)
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return {"id": acc.id, "code": acc.code, "name": acc.name, "message": "创建成功"}


@app.put("/api/accounts/{account_id}")
def update_account(account_id: int, data: dict, db: Session = Depends(get_db)):
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(404, detail="科目不存在")
    if "name" in data and data["name"] is not None:
        acc.name = data["name"]
    if "is_active" in data and data["is_active"] is not None:
        acc.is_active = data["is_active"]
    db.commit()
    return {"message": "更新成功"}


@app.delete("/api/accounts/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db)):
    acc = db.query(Account).filter(Account.id == account_id).first()
    if not acc:
        raise HTTPException(404, detail="科目不存在")
    used = db.query(VoucherDetail).filter(VoucherDetail.account_code == acc.code).first()
    if used:
        raise HTTPException(400, detail="该科目已有凭证使用，不能删除，请停用")
    db.delete(acc)
    db.commit()
    return {"message": "删除成功"}


# ==================== 凭证管理（原有，保留）====================

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


# ==================== 账簿查询（原有，保留）====================

@app.get("/api/ledger/general")
def general_ledger(
    period_from: str,
    period_to: str,
    account_code: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """总账查询"""
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


# ==================== 财务报表（原有，保留）====================

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
    """资产负债表"""
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


# ==================== 期间管理（原有，保留）====================

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


# ==================== 统计看板（原有，保留）====================

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
