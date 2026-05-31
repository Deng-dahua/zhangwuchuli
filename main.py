"""
中小制造业账务处理系统 - 后端 API
"""
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
import os
import csv
import io
import re
import uuid
import openpyxl
from pypdf import PdfReader

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


# ==================== AI 智能助手对话引擎 ====================
import uuid
import re

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

sessions: dict = {}  # { session_id: { "intent": str, "step": int, "data": dict, "updated": float } }

def get_session(sid: str):
    if sid not in sessions:
        sessions[sid] = {"intent": None, "step": 0, "data": {}, "updated": 0}
    return sessions[sid]

def intent_from_text(msg: str) -> str:
    """从消息中识别意图"""
    msg_lower = msg.strip().lower()

    # 文件上传 — 最高优先级，先于所有其他意图
    if msg_lower.startswith("[上传文件]"):
        return "file_upload"

    # 凭证类
    if re.search(r"录[入记]凭证|做[一笔]?[账分]?[录项]|记账|填制凭证|nova.*voucher", msg_lower):
        return "create_voucher"
    if re.search(r"查[看询]?凭证|凭证列[表出]|voucher.*list", msg_lower):
        return "list_vouchers"
    # 客户
    if re.search(r"新[增添加][客]|录入客户|添加客户|new.*customer|create.*customer", msg_lower):
        return "create_customer"
    if re.search(r"查[看询]?客户|客户列[表出]", msg_lower):
        return "list_customers"
    # 供应商
    if re.search(r"新[增添加]供应商|录入供应商|添加供应商|new.*supplier", msg_lower):
        return "create_supplier"
    if re.search(r"查[看询]?供应商|供应商列[表出]", msg_lower):
        return "list_suppliers"
    # 人员员工
    if re.search(r"新[增添加](员工|人员|职员)|录入(员工|人员)|添加(员工|人员)|new.*employee", msg_lower):
        return "create_employee"
    if re.search(r"查[看询]?(员工|人员|职员)|(员工|人员)列[表出]", msg_lower):
        return "list_employees"
    # 报表
    if re.search(r"利润表|损益表|profit|loss", msg_lower):
        return "query_profit_loss"
    if re.search(r"资产负债表|balance.*sheet", msg_lower):
        return "query_balance_sheet"
    if re.search(r"总账|general.*ledger", msg_lower):
        return "query_general_ledger"
    if re.search(r"明细账|detail.*ledger", msg_lower):
        return "query_detail_ledger"
    # 公司
    if re.search(r"(公司|企业)信息|设置公司|录入公司", msg_lower):
        return "company_info"
    # 科目
    if re.search(r"科[目录]|account.*list", msg_lower):
        return "list_accounts"
    # 看板
    if re.search(r"看板|dashboard|数据概览|统计", msg_lower):
        return "dashboard"
    # 帮助
    if re.search(r"帮助|help|能做什么|会什么|功能|指令|命令", msg_lower):
        return "help"
    # 取消
    if re.search(r"取消|退出|算了|不要了|返回", msg_lower):
        return "cancel"
    return None

# 从自由文本中提取日期
def extract_date(text: str) -> Optional[str]:
    m = re.search(r"(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})[日号]?", text)
    if m:
        raw = m.group(1)
        raw = raw.replace("年", "-").replace("月", "-").replace("/", "-")
        parts = raw.split("-")
        if len(parts) == 3:
            return f"{parts[0]}-{parts[1].zfill(2)}-{parts[2].zfill(2)}"
    # 仅年月
    m = re.search(r"(\d{4})[-/年](\d{1,2})[月]?", text)
    if m:
        return f"{m.group(1)}-{m.group(2).zfill(2)}-01"
    return None

# 从文本中提取金额
def extract_amount(text: str) -> Optional[float]:
    m = re.search(r"(\d+\.?\d*)\s*(万|万元|元|块|块钱)?", text)
    if m:
        amt = float(m.group(1))
        if m.group(2) in ("万", "万元"):
            amt *= 10000
        return round(amt, 2)
    return None

# 提取数字
def extract_number(text: str) -> Optional[int]:
    m = re.search(r"(\d+)", text)
    return int(m.group(1)) if m else None


# ==================== 文件上传 ====================

def read_excel_content(file_bytes: bytes, filename: str) -> str:
    """读取 Excel 文件内容"""
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    lines = [f"[Excel] {filename}"]
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        lines.append(f"\n--- 工作表: {sheet_name} ---")
        headers = []
        for col in range(1, ws.max_column + 1):
            cell = ws.cell(row=1, column=col)
            headers.append(str(cell.value) if cell.value is not None else "")
        lines.append(" | ".join(headers))
        lines.append("-" * 60)
        row_count = 0
        for row in range(2, ws.max_row + 1):
            vals = []
            for col in range(1, ws.max_column + 1):
                cell = ws.cell(row=row, column=col)
                vals.append(str(cell.value) if cell.value is not None else "")
            if any(v.strip() for v in vals):
                lines.append(" | ".join(vals))
                row_count += 1
                if row_count >= 200:
                    lines.append(f"... (共 {ws.max_row - 1} 行，仅显示前 200 行)")
                    break
        lines.append(f"→ 共 {ws.max_row - 1} 行数据\n")
    return "\n".join(lines)


def read_csv_content(file_bytes: bytes, filename: str) -> str:
    """读取 CSV 文件内容"""
    text = file_bytes.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return f"[CSV] {filename}\n(空文件)"
    lines = [f"[CSV] {filename}"]
    lines.append(" | ".join(rows[0]))
    lines.append("-" * 60)
    for i, row in enumerate(rows[1:], 1):
        lines.append(" | ".join(row))
        if i >= 200:
            lines.append(f"... (共 {len(rows) - 1} 行，仅显示前 200 行)")
            break
    return "\n".join(lines)


def read_pdf_content(file_bytes: bytes, filename: str) -> str:
    """读取 PDF 文件文本内容"""
    reader = PdfReader(io.BytesIO(file_bytes))
    lines = [f"[PDF] {filename}"]
    total_text = ""
    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text:
            total_text += text + "\n"
    if not total_text.strip():
        return f"[PDF] {filename}\n(无法提取文本内容，可能是扫描件或图片型 PDF)"
    # 限制长度
    if len(total_text) > 5000:
        total_text = total_text[:5000] + f"\n...(共 {len(total_text)} 字符，仅显示前 5000)"
    lines.append(total_text.strip())
    return "\n".join(lines)


@app.post("/api/chat/upload")
async def upload_file(
    file: UploadFile = File(...),
    session_id: str = Form("")
):
    """上传文件并识别内容"""
    try:
        content_bytes = await file.read()
        fname = file.filename or "unknown"
        ext = os.path.splitext(fname)[1].lower()

        if ext in (".xlsx", ".xls"):
            content = read_excel_content(content_bytes, fname)
        elif ext == ".csv":
            content = read_csv_content(content_bytes, fname)
        elif ext == ".pdf":
            content = read_pdf_content(content_bytes, fname)
        elif ext in (".txt", ".md", ".log"):
            text = content_bytes.decode("utf-8")
            if len(text) > 5000:
                text = text[:5000] + f"\n...(共 {len(text)} 字符，仅显示前 5000)"
            content = f"[文本] {fname}\n{text}"
        elif ext in (".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"):
            content = f"[图片] {fname}\n(不支持图片文字识别，请直接描述需求或将数据整理为 Excel/CSV 格式上传)"
        else:
            return {"error": f"不支持的文件格式：{ext}。支持格式：xlsx, csv, pdf, txt, md, log", "session_id": session_id}

        return {
            "file_name": fname,
            "file_type": ext,
            "content": content,
            "session_id": session_id
        }
    except Exception as e:
        return {"error": f"文件处理失败：{str(e)}", "session_id": session_id}


@app.post("/api/chat")
def chat_endpoint(payload: ChatRequest, db: Session = Depends(get_db)):
    """AI 助手对话接口"""
    message = payload.message.strip()
    sid = payload.session_id or str(uuid.uuid4())
    sess = get_session(sid)

    if not message:
        return {"reply": "请说点什么吧 😊", "session_id": sid, "action": None}

    # 取消当前流程
    if re.search(r"^(取消|退出|算了|不要了|返回)$", message):
        sess["intent"] = None
        sess["step"] = 0
        sess["data"] = {}
        return {"reply": "好的，已取消当前操作。你可以随时开始新的任务。\n\n💡 试试这些：\n• 录入凭证\n• 新增客户\n• 查看利润表\n• 公司信息", "session_id": sid, "action": None}

    intent = intent_from_text(message)

    # 如果在流程中
    if sess["intent"]:
        intent = sess["intent"]
    elif intent == "cancel":
        sess["intent"] = None
        return {"reply": "当前没有进行中的任务。有什么我可以帮你的？", "session_id": sid, "action": None}

    # ────────────── 录入凭证 ──────────────
    if intent == "create_voucher":
        return handle_create_voucher(sess, message, db, sid)

    # ────────────── 新增客户 ──────────────
    if intent == "create_customer":
        return handle_create_customer(sess, message, db, sid)

    # ────────────── 新增供应商 ──────────────
    if intent == "create_supplier":
        return handle_create_supplier(sess, message, db, sid)

    # ────────────── 新增员工 ──────────────
    if intent == "create_employee":
        return handle_create_employee(sess, message, db, sid)

    # ────────────── 查询类 ──────────────
    if intent == "query_profit_loss":
        sess["intent"] = None
        today = date.today().strftime("%Y-%m")
        return {"reply": f"📅 请告诉我你要查询的期间范围，例如：\n• `{today}` → 查 {today} 月\n• `2026-01 到 2026-05` → 查1-5月", "session_id": sid, "action": None}

    if intent == "query_balance_sheet":
        sess["intent"] = None
        today = date.today().strftime("%Y-%m")
        return {"reply": f"📅 请告诉我你要查询的截止期间，例如：\n• `{today}` → 截止 {today} 月", "session_id": sid, "action": None}

    if intent == "query_general_ledger":
        return handle_query_general(sess, message, db, sid)

    if intent == "query_detail_ledger":
        return handle_query_detail(sess, message, db, sid)

    if intent == "list_vouchers":
        sess["intent"] = None
        return handle_list_vouchers(message, db, sid)

    if intent in ("list_customers", "list_suppliers", "list_employees", "list_accounts"):
        sess["intent"] = None
        return {"reply": f"✅ 请打开侧边栏的对应页面查看。\n💡 提示：你可以说「新增客户」来快捷录入。", "session_id": sid, "action": {"type": "navigate", "page": intent.replace("list_", "")}}

    if intent == "company_info":
        sess["intent"] = None
        return {"reply": "🏢 请打开侧边栏「公司信息」页面填写。\n你也可以直接告诉我：\n• 公司名称\n• 统一社会信用代码\n• 法定代表人\n• 地址电话等\n\n我会帮你一次性填好！", "session_id": sid, "action": None}

    if intent == "dashboard":
        sess["intent"] = None
        return {"reply": "📊 请打开侧边栏「数据看板」查看统计。", "session_id": sid, "action": {"type": "navigate", "page": "dashboard"}}

    if intent == "help":
        sess["intent"] = None
        return {
            "reply": "🤖 **我能帮你做什么？**\n\n"
                     "**📝 录入数据**\n"
                     "• 「录入凭证」— 智能引导填制记账凭证\n"
                     "• 「新增客户」— 添加客户档案\n"
                     "• 「新增供应商」— 添加供应商档案\n"
                     "• 「新增员工」— 添加员工信息\n\n"
                     "**📊 查询报表**\n"
                     "• 「查看利润表」— 查询损益表\n"
                     "• 「查看资产负债表」— 查询资产负债表\n"
                     "• 「总账」— 查询总账\n"
                     "• 「明细账」— 查询明细账\n\n"
                     "**💬 自然对话**\n"
                     "直接告诉我你要做什么，我会引导你一步步完成。\n"
                     "例如：「录入一笔采购原材料的凭证，5月28日，金额32000元」\n\n"
                     "输入「取消」可随时退出当前流程。",
            "session_id": sid,
            "action": None
        }

    # ────────────── 文件上传 ──────────────
    if intent == "file_upload":
        return handle_file_upload(sess, message, db, sid)

    # ────────────── 文件确认后续 ──────────────
    if intent == "file_confirm":
        return handle_file_confirm(sess, message, db, sid)

    # 未识别意图 → 尝试从文本中提取操作
    sess["intent"] = None
    return {
        "reply": "抱歉，我没完全理解你的意思 🤔\n\n"
                 "你可以试试这些：\n"
                 "• **录入凭证** — 开始填制记账凭证\n"
                 "• **新增客户 / 供应商 / 员工**\n"
                 "• **查看利润表 / 资产负债表**\n"
                 "• **帮助** — 查看我能做什么\n\n"
                 "或者直接描述你的需求，我会尽量理解 😊",
        "session_id": sid,
        "action": None
    }


# ──── 文件上传智能分析 ────

# 已知数据模式的列名关键词
DATA_PATTERNS = {
    "voucher": {
        "name": "记账凭证",
        "keywords": ["日期", "摘要", "科目", "借方", "贷方", "金额", "凭证", "voucher", "date", "account", "debit", "credit"],
        "min_match": 3,
        "action_hint": "我可以帮你**逐笔录入凭证**，你只需要确认每一笔即可。"
    },
    "customer": {
        "name": "客户档案",
        "keywords": ["客户", "名称", "联系人", "电话", "手机", "地址", "税号", "customer", "phone", "contact", "address"],
        "min_match": 2,
        "action_hint": "我可以帮你**批量导入客户档案**，请确认以下信息无误。"
    },
    "supplier": {
        "name": "供应商档案",
        "keywords": ["供应商", "厂家", "供货", "supplier", "采购"],
        "min_match": 2,
        "action_hint": "我可以帮你**批量导入供应商档案**，请确认以下信息无误。"
    },
    "employee": {
        "name": "员工花名册",
        "keywords": ["员工", "人员", "职员", "部门", "职位", "入职", "身份证", "employee", "department", "position"],
        "min_match": 2,
        "action_hint": "我可以帮你**批量导入员工信息**，请确认以下信息无误。"
    },
    "account": {
        "name": "会计科目",
        "keywords": ["科目编码", "科目名称", "科目类别", "余额方向", "account_code", "account_name"],
        "min_match": 2,
        "action_hint": "我可以帮你**批量导入会计科目**，请确认后处理。"
    },
}


def analyze_file_columns(headers: List[str]) -> dict:
    """分析文件列名，猜测数据类型"""
    headers_lower = [h.strip().lower() for h in headers]
    best_type = None
    best_score = 0

    for ptype, pattern in DATA_PATTERNS.items():
        score = 0
        for kw in pattern["keywords"]:
            for h in headers_lower:
                if kw in h:
                    score += 1
                    break
        if score >= pattern["min_match"] and score > best_score:
            best_score = score
            best_type = ptype

    return {
        "detected_type": best_type,
        "confidence": best_score,
        "pattern": DATA_PATTERNS.get(best_type) if best_type else None
    }


def handle_file_upload(sess, message: str, db, sid: str):
    """处理文件上传：分析内容 → 提问确认 → 等待用户指令"""
    # 解析消息格式: "[上传文件] filename\n\n文件内容如下，请帮我处理：\n\n[格式] filename\n..."
    lines = message.split("\n")
    file_name = ""
    content_start = 0

    # 提取文件名
    m = re.match(r"\[上传文件\]\s*(.+)", lines[0])
    if m:
        file_name = m.group(1).strip()

    # 找到内容起始位置（跳过 "文件内容如下，请帮我处理："）
    for i, line in enumerate(lines):
        if line.strip().startswith("[Excel]") or line.strip().startswith("[CSV]") or \
           line.strip().startswith("[PDF]") or line.strip().startswith("[文本]") or \
           line.strip().startswith("[图片]"):
            content_start = i
            break

    # 提取格式标签
    format_label = ""
    if content_start < len(lines):
        format_label = lines[content_start].strip()
        # 从格式标签提取纯文本 "文件名"
        fm = re.match(r"\[(\w+)\]\s*(.+)", format_label)
        if fm and not file_name:
            file_name = fm.group(2).strip()

    # 提取列名（第二行，即第一个 | 分隔的行）
    headers = []
    data_rows = 0
    for line in lines[content_start:]:
        stripped = line.strip()
        if " | " in stripped and not stripped.startswith("---"):
            parts = [p.strip() for p in stripped.split(" | ")]
            if not headers:
                headers = parts
            else:
                data_rows += 1
        # 检测 "共 X 行数据"
        rm = re.search(r"共\s*(\d+)\s*行", stripped)
        if rm:
            data_rows = max(data_rows, int(rm.group(1)))

    # ──── 无法解析列 → 直接提问 ────
    if not headers:
        sess["intent"] = None
        sess["step"] = 0
        sess["data"] = {}
        return {
            "reply": f"📎 已收到文件 **{file_name}**。\n\n"
                     f"我暂时无法自动识别这个文件的列结构。\n\n"
                     f"🤔 **请告诉我：**\n"
                     f"• 这个文件包含什么数据？（凭证 / 客户 / 供应商 / 员工 / 科目 / 其他）\n"
                     f"• 你希望我怎么处理？（录入系统 / 仅查看 / 导入到对应模块）\n\n"
                     f"也可以点击左侧菜单进入对应页面手动操作。",
            "session_id": sid,
            "action": None
        }

    # ──── 分析列名 ────
    analysis = analyze_file_columns(headers)
    detected = analysis["detected_type"]
    confidence = analysis["confidence"]
    pattern = analysis["pattern"]

    # 构建列名展示
    cols_display = "、".join(headers[:8])
    if len(headers) > 8:
        cols_display += f" ... 共 {len(headers)} 列"

    # ──── 不确定的情况 ────
    if not detected or confidence < 2:
        sess["intent"] = None
        sess["step"] = 0
        sess["data"] = {}
        return {
            "reply": f"📎 已收到文件 **{file_name}**（约 {data_rows} 行数据）\n\n"
                     f"📋 识别到的列：{cols_display}\n\n"
                     f"⚠️ 我无法确定这是什么类型的数据。\n\n"
                     f"🤔 **请确认：**\n"
                     f"1️⃣ 这是**凭证数据**？→ 回复「凭证」\n"
                     f"2️⃣ 这是**客户名单**？→ 回复「客户」\n"
                     f"3️⃣ 这是**供应商名单**？→ 回复「供应商」\n"
                     f"4️⃣ 这是**员工信息**？→ 回复「员工」\n"
                     f"5️⃣ 这是**会计科目**？→ 回复「科目」\n"
                     f"6️⃣ 只是给你看看，不做处理？→ 回复「不用」\n\n"
                     f"💡 也可以直接描述，例如：「把这些客户信息录入系统」",
            "session_id": sid,
            "action": None
        }

    # ──── 已识别，但需要确认 ────
    sess["intent"] = "file_confirm"
    sess["step"] = 0
    sess["data"] = {
        "file_name": file_name,
        "detected_type": detected,
        "headers": headers,
        "data_rows": data_rows,
        "raw_content": message
    }

    # 预览前几行数据
    preview_lines = []
    preview_count = 0
    for line in lines[content_start:]:
        stripped = line.strip()
        if " | " in stripped and not stripped.startswith("---") and not stripped.startswith("[") and preview_count < 3:
            # 跳过表头行（已提取为 headers）
            parts = [p.strip() for p in stripped.split(" | ")]
            if parts != headers:
                preview_lines.append(" | ".join(parts))
                preview_count += 1

    preview_text = ""
    if preview_lines:
        preview_text = "\n\n📋 **数据预览（前3行）：**\n" + "\n".join(f"  `{p}`" for p in preview_lines)

    return {
        "reply": f"📎 已收到文件 **{file_name}**（约 {data_rows} 行数据）\n\n"
                 f"🔍 我识别到这可能是一份 **{pattern['name']}** 数据。\n"
                 f"📋 包含列：{cols_display}"
                 f"{preview_text}\n\n"
                 f"⚠️ **请确认：**\n"
                 f"• 回复「**是**」或「**确认**」→ {pattern['action_hint']}\n"
                 f"• 回复「**不是**」→ 告诉我这是什么数据\n"
                 f"• 回复「**不用**」→ 仅查看，不做处理\n"
                 f"• 回复「**取消**」→ 放弃本次上传",
        "session_id": sid,
        "action": None
    }


def handle_file_confirm(sess, message: str, db, sid: str):
    """处理文件确认后的用户回应"""
    msg = message.strip()
    msg_lower = msg.lower()
    data = sess.get("data", {})
    detected_type = data.get("detected_type", "")
    file_name = data.get("file_name", "未知文件")

    # 用户确认 → 跳转到对应的录入流程
    if re.search(r"^(是|对|确认|好|可以|行|ok|yes|没错|是的|对的)$", msg_lower):
        sess["intent"] = None
        sess["step"] = 0
        sess["data"] = {}
        if detected_type == "voucher":
            return {
                "reply": f"✅ 好的！我将根据 **{file_name}** 的数据逐笔录入凭证。\n\n"
                         f"📝 请回复「**录入凭证**」开始，我会引导你一步步操作。\n\n"
                         f"💡 提示：你可以把文件中每一行的数据逐条告诉我，我来填。",
                "session_id": sid,
                "action": None
            }
        elif detected_type == "customer":
            return {
                "reply": f"✅ 好的！我将把 **{file_name}** 中的客户信息录入系统。\n\n"
                         f"请回复「**新增客户**」开始逐条录入。\n\n"
                         f"💡 提示：也可以告诉我「批量导入所有客户」，我会遍历每一行。",
                "session_id": sid,
                "action": None
            }
        elif detected_type == "supplier":
            return {
                "reply": f"✅ 好的！我将把 **{file_name}** 中的供应商信息录入系统。\n\n"
                         f"请回复「**新增供应商**」开始逐条录入。\n\n"
                         f"💡 提示：也可以告诉我「批量导入所有供应商」，我会遍历每一行。",
                "session_id": sid,
                "action": None
            }
        elif detected_type == "employee":
            return {
                "reply": f"✅ 好的！我将把 **{file_name}** 中的员工信息录入系统。\n\n"
                         f"请回复「**新增员工**」开始逐条录入。\n\n"
                         f"💡 提示：也可以告诉我「批量导入所有员工」，我会遍历每一行。",
                "session_id": sid,
                "action": None
            }
        else:
            return {
                "reply": f"✅ 好的！请告诉我具体要怎么处理 **{file_name}** 的数据？",
                "session_id": sid,
                "action": None
            }

    # 用户否认 → 重新提问
    if re.search(r"^(不是|不对|错了|不对的|no|不对哦)$", msg_lower):
        sess["intent"] = None
        sess["step"] = 0
        sess["data"] = {}
        return {
            "reply": f"🤔 抱歉识别错了！\n\n"
                     f"请告诉我 **{file_name}** 里是什么数据：\n"
                     f"• 回复「**凭证**」→ 记账凭证\n"
                     f"• 回复「**客户**」→ 客户档案\n"
                     f"• 回复「**供应商**」→ 供应商档案\n"
                     f"• 回复「**员工**」→ 员工信息\n"
                     f"• 回复「**科目**」→ 会计科目\n"
                     f"• 或直接描述你要做什么",
            "session_id": sid,
            "action": None
        }

    # 用户说不用
    if re.search(r"^(不用|算了|不需要|看看就行|仅查看|只是看看)$", msg_lower):
        sess["intent"] = None
        sess["step"] = 0
        sess["data"] = {}
        return {
            "reply": f"👌 好的，**{file_name}** 的数据仅供查看，不做录入处理。\n\n"
                     f"如果后续需要处理，随时告诉我！\n\n"
                     f"💡 你可以继续上传其他文件，或告诉我其他需求。",
            "session_id": sid,
            "action": None
        }

    # 用户说了其他内容 → 尝试理解
    sess["intent"] = None
    sess["step"] = 0
    sess["data"] = {}

    # 尝试从回复中识别数据类型
    type_hint = None
    if re.search(r"凭证|voucher|记账", msg_lower):
        type_hint = "voucher"
    elif re.search(r"客户|customer", msg_lower):
        type_hint = "customer"
    elif re.search(r"供应商|supplier", msg_lower):
        type_hint = "supplier"
    elif re.search(r"员工|人员|职员|employee", msg_lower):
        type_hint = "employee"
    elif re.search(r"科目|account", msg_lower):
        type_hint = "account"

    if type_hint:
        pattern = DATA_PATTERNS.get(type_hint, {})
        sess["intent"] = "file_confirm"
        sess["step"] = 0
        sess["data"] = {**data, "detected_type": type_hint}
        return {
            "reply": f"🔍 收到，你指定为 **{pattern.get('name', type_hint)}** 数据。\n\n"
                     f"⚠️ **再次确认：**\n"
                     f"• 回复「**是**」→ {pattern.get('action_hint', '开始处理')}\n"
                     f"• 回复「**不是**」→ 重新指定",
            "session_id": sid,
            "action": None
        }

    return {
        "reply": f"🤔 收到你的回复：「{msg}」\n\n"
                 f"关于 **{file_name}** 的数据处理，请明确告诉我：\n"
                 f"• 回复「**是**」→ 确认按识别类型处理\n"
                 f"• 回复「**不是**」→ 重新指定数据类型\n"
                 f"• 回复「**不用**」→ 仅查看\n"
                 f"• 回复「**取消**」→ 放弃\n\n"
                 f"💡 也可以直接说数据类型如「凭证」「客户」等。",
        "session_id": sid,
        "action": None
    }


# ──── 凭证录入流程 ────

def handle_create_voucher(sess, msg, db, sid):
    step = sess["step"]
    data = sess["data"]

    if step == 0:
        sess["intent"] = "create_voucher"
        sess["step"] = 1
        dd = extract_date(msg)
        if dd:
            data["voucher_date"] = dd
            summary = re.sub(r"录[入记]凭证|记账|做[一]?[笔]?", "", msg).strip("，。,.").strip()
            if summary and len(summary) > 1:
                data["summary"] = summary
            else:
                data["summary"] = None
            sess["step"] = 2
            sess["data"] = data
            if data["summary"]:
                return {"reply": f"📅 日期：**{dd}**\n📝 摘要：**{data['summary']}**\n\n接下来录入分录明细。请按格式告诉我：\n\n`科目 借方金额 贷方金额`\n\n例如：\n`原材料 50000 0`（借原材料5万）\n`银行存款 0 50000`（贷银行5万）", "session_id": sid, "action": None}
            else:
                return {"reply": f"📅 日期已识别：**{dd}**\n\n请输入凭证摘要（这笔业务的内容），例如：\n「采购原材料一批」", "session_id": sid, "action": None}
        else:
            return {"reply": "📅 好的，开始录入凭证。\n\n请先告诉我**凭证日期**，例如：\n• `2026-05-28`\n• `5月28日`", "session_id": sid, "action": None}

    elif step == 1:
        # 补填摘要
        data["summary"] = msg.strip()
        sess["step"] = 2
        sess["data"] = data
        return {"reply": f"📝 摘要：**{data['summary']}**\n\n接下来录入分录明细。请按格式告诉我：\n\n`科目 借方金额 贷方金额`\n\n例如：\n`原材料 50000 0`（借原材料5万）\n`银行存款 0 50000`（贷银行5万）\n\n输完一行后可以继续输下一行，输「完成」结束录入。", "session_id": sid, "action": None}

    elif step >= 2:
        # 录入明细行
        if re.search(r"^(完成|好了|结束|确认|提交|保存|ok|done)$", msg.strip(), re.IGNORECASE):
            return finalize_voucher(sess, db, sid)

        # 解析 "科目 借方 贷方"
        parts = msg.strip().split()
        if len(parts) >= 2:
            account = parts[0]
            debit = 0.0
            credit = 0.0
            try:
                if len(parts) >= 2:
                    debit = float(parts[1].replace(",", ""))
                if len(parts) >= 3:
                    credit = float(parts[2].replace(",", ""))
            except ValueError:
                return {"reply": "金额格式不对，请重新输入。格式：`科目 借方金额 贷方金额`", "session_id": sid, "action": None}

            # 模糊匹配科目
            acc = db.query(Account).filter(
                or_(Account.code == account, Account.name.contains(account))
            ).first()
            if not acc:
                # 列出可选科目
                accounts = db.query(Account).filter(Account.is_active == True).order_by(Account.code).all()
                return {
                    "reply": f"⚠️ 未找到科目「{account}」。\n\n请使用科目编码或名称，例如：\n• `1001` 库存现金\n• `1403` 原材料\n• `1002` 银行存款\n• `5001` 生产成本\n\n要查看全部科目请打开侧边栏「会计科目」。",
                    "session_id": sid,
                    "action": None
                }

            if "details" not in data:
                data["details"] = []
            detail_summary = data.get("summary", "") + (f"（{acc.name}）" if acc.name != account else "")
            data["details"].append({
                "account_code": acc.code,
                "account_name": acc.name,
                "debit_amount": debit,
                "credit_amount": credit,
                "summary": detail_summary
            })
            sess["data"] = data
            sess["step"] = 2

            debit_total = sum(d["debit_amount"] for d in data["details"])
            credit_total = sum(d["credit_amount"] for d in data["details"])

            lines_text = "\n".join([
                f"  {d['account_code']} {d['account_name']} | 借 {d['debit_amount']:,.2f} | 贷 {d['credit_amount']:,.2f}"
                for d in data["details"]
            ])
            return {
                "reply": f"✅ 已添加第 {len(data['details'])} 行分录。\n\n当前分录：\n{lines_text}\n\n📊 借方合计：**{debit_total:,.2f}** | 贷方合计：**{credit_total:,.2f}**\n\n继续输入下一行，或说「**完成**」保存凭证。",
                "session_id": sid,
                "action": None
            }
        else:
            return {"reply": "请按格式输入：`科目 借方金额 贷方金额`\n例如：`原材料 50000 0`", "session_id": sid, "action": None}

    return {"reply": "请继续...", "session_id": sid, "action": None}


def finalize_voucher(sess, db, sid):
    data = sess["data"]
    details = data.get("details", [])

    if not details:
        return {"reply": "还没有录入任何分录，请先添加明细行。", "session_id": sid, "action": None}

    debit_total = sum(d["debit_amount"] for d in details)
    credit_total = sum(d["credit_amount"] for d in details)

    if abs(debit_total - credit_total) < 0.01:
        # 借贷平衡，直接保存
        try:
            voucher_date = date.fromisoformat(data.get("voucher_date", date.today().isoformat()))
            period = voucher_date.strftime("%Y-%m")
            
            # ensure period exists
            existing_period = db.query(Period).filter(Period.period == period).first()
            if not existing_period:
                db.add(Period(period=period))
                db.flush()
            
            count = db.query(Voucher).filter(Voucher.period == period).count()
            voucher_no = f"记-{period.replace('-', '')}-{str(count + 1).zfill(4)}"

            voucher = Voucher(
                voucher_no=voucher_no,
                voucher_date=voucher_date,
                summary=data.get("summary", "业务凭证"),
                total_debit=debit_total,
                total_credit=credit_total,
                creator="AI助手",
                period=period,
                status="草稿"
            )
            db.add(voucher)
            db.flush()

            for i, d in enumerate(details):
                detail = VoucherDetail(
                    voucher_id=voucher.id,
                    line_no=i + 1,
                    summary=d.get("summary", ""),
                    account_code=d["account_code"],
                    debit_amount=d["debit_amount"],
                    credit_amount=d["credit_amount"]
                )
                db.add(detail)
            db.commit()

            lines_text = "\n".join([
                f"  {d['account_code']} {d['account_name']} | 借 {d['debit_amount']:,.2f} | 贷 {d['credit_amount']:,.2f}"
                for d in details
            ])
            sess["intent"] = None
            sess["step"] = 0
            sess["data"] = {}
            return {
                "reply": f"🎉 **凭证保存成功！**\n\n"
                         f"📋 凭证号：**{voucher_no}**\n"
                         f"📅 日期：{voucher_date}\n"
                         f"📝 摘要：{data.get('summary', '')}\n\n"
                         f"分录明细：\n{lines_text}\n\n"
                         f"借方 **{debit_total:,.2f}** = 贷方 **{credit_total:,.2f}** ✅\n\n"
                         f"💡 接下来你可以：\n"
                         f"• 继续「录入凭证」\n"
                         f"• 「查看凭证」看看刚才录入的\n"
                         f"• 「查看利润表」看看报表",
                "session_id": sid,
                "action": {"type": "reload", "page": "vouchers"}
            }
        except Exception as e:
            return {"reply": f"❌ 保存失败：{str(e)}", "session_id": sid, "action": None}
    else:
        return {
            "reply": f"⚠️ **借贷不平！** 借方 {debit_total:,.2f} ≠ 贷方 {credit_total:,.2f}\n\n"
                     f"请检查并修正，继续输入行或重新报数。",
            "session_id": sid,
            "action": None
        }


# ──── 客户录入流程 ────

def handle_create_customer(sess, msg, db, sid):
    step = sess["step"]
    data = sess["data"]

    if step == 0:
        sess["intent"] = "create_customer"
        sess["step"] = 1
        # 尝试一次性提取信息
        # 格式: "客户名 编码 XXX 联系人 XXX"
        parts = msg.strip()
        # 简单：仅名称
        code_match = re.search(r"编码[：:]*\s*(\S+)", msg)
        name_match = re.sub(r"新[增添加]客户|录入客户|添加客户", "", msg).strip("，。,.").strip()
        if name_match:
            data["name"] = name_match
        if code_match:
            data["code"] = code_match.group(1)

        if data.get("name"):
            if not data.get("code"):
                data["code"] = f"KH{db.query(Customer).count() + 1:03d}"
            sess["data"] = data
            sess["step"] = 2
            return {"reply": f"👤 客户名称：**{data['name']}**\n📋 编码：**{data['code']}**\n\n还需要添加其他信息吗？可以直接告诉我：\n• 联系人\n• 电话\n• 信用额度\n\n或说「**完成**」直接保存。", "session_id": sid, "action": None}

        return {"reply": "👤 好的，新增客户。\n\n请告诉我**客户名称**和**编码**（可选），例如：\n• 「广州钢材贸易有限公司」\n• 「编码 KH001 广州钢材贸易有限公司」", "session_id": sid, "action": None}

    elif step == 1:
        # 补充名称
        data["name"] = msg.strip()
        if not data.get("code"):
            data["code"] = f"KH{db.query(Customer).count() + 1:03d}"
        sess["data"] = data
        sess["step"] = 2
        return {"reply": f"👤 客户名称：**{data['name']}**\n📋 编码：**{data['code']}**\n\n还需要添加其他信息吗？可以告诉我联系人、电话、地址等。\n或说「**完成**」直接保存。", "session_id": sid, "action": None}

    elif step >= 2:
        if re.search(r"^(完成|好了|结束|确认|提交|保存|ok|done)$", msg.strip(), re.IGNORECASE):
            return save_customer(data, db, sess, sid)
        # 尝试提取联系方式
        contact_m = re.search(r"联系人[：:]*\s*(\S+)", msg)
        phone_m = re.search(r"电话[：:]*\s*(\S+)", msg)
        addr_m = re.search(r"地址[：:]*\s*(.+?)(?:$|电话|联系人)", msg)
        credit_m = re.search(r"额度[：:]*\s*(\d+\.?\d*)", msg)
        if contact_m: data["contact"] = contact_m.group(1)
        if phone_m: data["phone"] = phone_m.group(1)
        if addr_m: data["address"] = addr_m.group(1).strip()
        if credit_m: data["credit_limit"] = float(credit_m.group(1))
        # 兜底：整行当联系人+电话
        if not contact_m and not phone_m and not addr_m and not credit_m:
            pt = msg.strip().split()
            if len(pt) >= 1 and not data.get("contact"):
                data["contact"] = pt[0]
            if len(pt) >= 2 and not data.get("phone"):
                data["phone"] = pt[1]

        sess["data"] = data
        info_lines = []
        for k, label in [("name", "名称"), ("code", "编码"), ("contact", "联系人"), ("phone", "电话"), ("address", "地址"), ("credit_limit", "信用额度")]:
            if data.get(k):
                info_lines.append(f"  {label}：{data[k]}")
        return {"reply": f"已更新客户信息：\n" + "\n".join(info_lines) + "\n\n说「**完成**」保存，或继续补充信息。", "session_id": sid, "action": None}

    return {"reply": "请继续...", "session_id": sid, "action": None}


def save_customer(data, db, sess, sid):
    try:
        existing = db.query(Customer).filter(Customer.code == data.get("code", "")).first()
        if existing:
            return {"reply": f"⚠️ 编码 {data['code']} 已存在，请换一个编码。", "session_id": sid, "action": None}
        c = Customer(
            code=data.get("code", ""),
            name=data.get("name", "未命名客户"),
            contact=data.get("contact"),
            phone=data.get("phone"),
            address=data.get("address"),
            credit_limit=data.get("credit_limit", 0.0)
        )
        db.add(c)
        db.commit()
        sess["intent"] = None
        sess["step"] = 0
        sess["data"] = {}
        return {"reply": f"🎉 客户 **{c.name}**（{c.code}）添加成功！\n\n💡 接下来可以「新增客户」继续添加，或「查看利润表」查询报表。", "session_id": sid, "action": {"type": "reload", "page": "customers"}}
    except Exception as e:
        return {"reply": f"❌ 保存失败：{str(e)}", "session_id": sid, "action": None}


# ──── 供应商录入流程 ────

def handle_create_supplier(sess, msg, db, sid):
    step = sess["step"]
    data = sess["data"]

    if step == 0:
        sess["intent"] = "create_supplier"
        sess["step"] = 1
        name_match = re.sub(r"新[增添加]供应商|录入供应商|添加供应商", "", msg).strip("，。,.").strip()
        code_match = re.search(r"编码[：:]*\s*(\S+)", msg)
        if name_match: data["name"] = name_match
        if code_match: data["code"] = code_match.group(1)
        if data.get("name"):
            if not data.get("code"): data["code"] = f"GYS{db.query(Supplier).count() + 1:03d}"
            sess["data"] = data; sess["step"] = 2
            return {"reply": f"📦 供应商：**{data['name']}**（{data['code']}）\n\n需要补充联系人、电话、地址吗？或说「**完成**」直接保存。", "session_id": sid, "action": None}
        return {"reply": "📦 新增供应商。请告诉我**供应商名称**，例如：\n「广州钢铁供应链有限公司」", "session_id": sid, "action": None}

    elif step == 1:
        data["name"] = msg.strip()
        if not data.get("code"): data["code"] = f"GYS{db.query(Supplier).count() + 1:03d}"
        sess["data"] = data; sess["step"] = 2
        return {"reply": f"📦 供应商：**{data['name']}**（{data['code']}）\n\n需要补充其他信息吗？或说「**完成**」保存。", "session_id": sid, "action": None}

    elif step >= 2:
        if re.search(r"^(完成|好了|结束|确认|提交|保存|ok|done)$", msg.strip(), re.IGNORECASE):
            return save_supplier(data, db, sess, sid)
        contact_m = re.search(r"联系人[：:]*\s*(\S+)", msg)
        phone_m = re.search(r"电话[：:]*\s*(\S+)", msg)
        if contact_m: data["contact"] = contact_m.group(1)
        if phone_m: data["phone"] = phone_m.group(1)
        if not contact_m and not phone_m:
            pt = msg.strip().split()
            if len(pt) >= 1 and not data.get("contact"): data["contact"] = pt[0]
            if len(pt) >= 2 and not data.get("phone"): data["phone"] = pt[1]
        sess["data"] = data
        lines = [f"  {k}：{v}" for k, v in data.items() if v and k in ("name", "code", "contact", "phone")]
        return {"reply": "已更新：\n" + "\n".join(lines) + "\n\n说「**完成**」保存。", "session_id": sid, "action": None}

    return {"reply": "请继续...", "session_id": sid, "action": None}


def save_supplier(data, db, sess, sid):
    try:
        if db.query(Supplier).filter(Supplier.code == data.get("code", "")).first():
            return {"reply": f"⚠️ 编码 {data['code']} 已存在。", "session_id": sid, "action": None}
        s = Supplier(code=data.get("code", ""), name=data.get("name", ""), contact=data.get("contact"), phone=data.get("phone"))
        db.add(s); db.commit()
        sess["intent"] = None; sess["step"] = 0; sess["data"] = {}
        return {"reply": f"🎉 供应商 **{s.name}**（{s.code}）添加成功！", "session_id": sid, "action": {"type": "reload", "page": "suppliers"}}
    except Exception as e:
        return {"reply": f"❌ {e}", "session_id": sid, "action": None}


# ──── 员工录入流程 ────

def handle_create_employee(sess, msg, db, sid):
    step = sess["step"]
    data = sess["data"]

    if step == 0:
        sess["intent"] = "create_employee"
        sess["step"] = 1
        name_match = re.sub(r"新[增添加](员工|人员|职员)|录入(员工|人员)|添加(员工|人员)", "", msg).strip("，。,.").strip()
        dept_m = re.search(r"部门[：:]*\s*(\S+)", msg)
        if name_match: data["name"] = name_match
        if dept_m: data["department_name"] = dept_m.group(1)
        if data.get("name"):
            if not data.get("code"): data["code"] = f"YG{db.query(Employee).count() + 1:03d}"
            sess["data"] = data; sess["step"] = 2
            return {"reply": f"👤 员工：**{data['name']}**（{data['code']}）\n\n还需要补充部门、职位、电话吗？或说「**完成**」保存。", "session_id": sid, "action": None}
        return {"reply": "👤 新增员工。请告诉我**姓名**，例如：「张三」", "session_id": sid, "action": None}

    elif step == 1:
        data["name"] = msg.strip()
        if not data.get("code"): data["code"] = f"YG{db.query(Employee).count() + 1:03d}"
        sess["data"] = data; sess["step"] = 2
        return {"reply": f"👤 员工：**{data['name']}**\n\n需要补充部门、职位、电话吗？或说「**完成**」保存。", "session_id": sid, "action": None}

    elif step >= 2:
        if re.search(r"^(完成|好了|结束|确认|ok|done)$", msg.strip(), re.IGNORECASE):
            return save_employee(data, db, sess, sid)
        dept_m = re.search(r"部门[：:]*\s*(\S+)", msg)
        pos_m = re.search(r"职位[：:]*\s*(\S+)", msg)
        phone_m = re.search(r"电话[：:]*\s*(\S+)", msg)
        if dept_m: data["department_name"] = dept_m.group(1)
        if pos_m: data["position"] = pos_m.group(1)
        if phone_m: data["phone"] = phone_m.group(1)
        sess["data"] = data
        lines = [f"  {k}：{v}" for k, v in data.items() if v and k in ("name", "code", "department_name", "position", "phone")]
        return {"reply": "已更新：\n" + "\n".join(lines) + "\n\n说「**完成**」保存。", "session_id": sid, "action": None}

    return {"reply": "请继续...", "session_id": sid, "action": None}


def save_employee(data, db, sess, sid):
    try:
        dept_code = None
        if data.get("department_name"):
            d = db.query(Department).filter(Department.name.contains(data["department_name"])).first()
            if d: dept_code = d.code
        if db.query(Employee).filter(Employee.code == data.get("code", "")).first():
            return {"reply": f"⚠️ 工号 {data['code']} 已存在。", "session_id": sid, "action": None}
        e = Employee(code=data.get("code", ""), name=data.get("name", ""), department_code=dept_code, position=data.get("position"), phone=data.get("phone"))
        db.add(e); db.commit()
        sess["intent"] = None; sess["step"] = 0; sess["data"] = {}
        return {"reply": f"🎉 员工 **{e.name}** 添加成功！", "session_id": sid, "action": {"type": "reload", "page": "employees"}}
    except Exception as e:
        return {"reply": f"❌ {e}", "session_id": sid, "action": None}


# ──── 总账查询 ────

def handle_query_general(sess, msg, db, sid):
    periods_match = re.findall(r"(\d{4}-\d{2})", msg)
    if len(periods_match) >= 2:
        p_from, p_to = periods_match[0], periods_match[1]
    elif len(periods_match) == 1:
        p_from = p_to = periods_match[0]
    else:
        today = date.today().strftime("%Y-%m")
        p_from = p_to = today

    results = db.query(
        VoucherDetail.account_code,
        Account.name.label("account_name"),
        Account.balance_direction,
        func.sum(VoucherDetail.debit_amount).label("d"),
        func.sum(VoucherDetail.credit_amount).label("c")
    ).join(Account).join(Voucher).filter(
        Voucher.period >= p_from, Voucher.period <= p_to
    ).group_by(VoucherDetail.account_code, Account.name, Account.balance_direction).all()

    if not results:
        sess["intent"] = None
        return {"reply": f"📒 {p_from} 至 {p_to} 期间暂无总账数据。\n\n💡 先「录入凭证」试试？", "session_id": sid, "action": None}

    rows = []
    for r in results[:15]:
        net = r.d - r.c
        bal = net if r.balance_direction == "借" else -net
        rows.append(f"  {r.account_code} {r.account_name} | 借 {r.d:,.2f} | 贷 {r.c:,.2f} | 余额 {bal:,.2f}")

    sess["intent"] = None
    return {
        "reply": f"📒 **总账**（{p_from} ~ {p_to}）\n\n" + "\n".join(rows) + (
            f"\n\n... 仅显示前 15 个科目。查看完整总账请打开侧边栏。"
            if len(results) > 15 else ""
        ),
        "session_id": sid,
        "action": None
    }


# ──── 明细账查询 ────

def handle_query_detail(sess, msg, db, sid):
    # 提取科目
    acc_match = re.search(r"(科目|account)[：:]*\s*(\S+)", msg, re.IGNORECASE)
    if acc_match:
        account = acc_match.group(2)
    else:
        words = msg.strip().split()
        # 排除常见词
        skip = {"明细账", "明细", "查看", "查询", "查"}
        account = next((w for w in words if w not in skip), None)

    if not account:
        sess["intent"] = "query_detail_ledger"
        sess["step"] = 1
        return {"reply": "📄 请告诉我你要查哪个科目的明细账，例如：\n• `1002 银行存款`\n• 科目 1403\n\n或说「取消」返回。", "session_id": sid, "action": None}

    acc = db.query(Account).filter(
        or_(Account.code == account, Account.name.contains(account))
    ).first()
    if not acc:
        return {"reply": f"⚠️ 未找到科目「{account}」，请重试。", "session_id": sid, "action": None}

    today = date.today().strftime("%Y-%m")
    p_from = p_to = today
    periods = re.findall(r"(\d{4}-\d{2})", msg)
    if len(periods) >= 2: p_from, p_to = periods[0], periods[1]
    elif len(periods) == 1: p_from = p_to = periods[0]

    results = db.query(
        Voucher.voucher_date, Voucher.voucher_no, VoucherDetail.summary,
        VoucherDetail.debit_amount, VoucherDetail.credit_amount
    ).join(VoucherDetail).filter(
        VoucherDetail.account_code == acc.code,
        Voucher.period >= p_from, Voucher.period <= p_to
    ).order_by(Voucher.voucher_date, Voucher.voucher_no).all()

    if not results:
        sess["intent"] = None
        return {"reply": f"📄 {acc.code} {acc.name} 在 {p_from}~{p_to} 期间无明细。", "session_id": sid, "action": None}

    bal = 0.0
    rows = []
    for r in results[:10]:
        if acc.balance_direction == "借":
            bal += r.debit_amount - r.credit_amount
        else:
            bal += r.credit_amount - r.debit_amount
        rows.append(f"  {r.voucher_date} {r.voucher_no} | 借 {r.debit_amount:,.2f} | 贷 {r.credit_amount:,.2f} | 余额 {bal:,.2f}")

    sess["intent"] = None
    return {
        "reply": f"📄 **{acc.code} {acc.name}** 明细账\n\n" + "\n".join(rows) + (
            f"\n\n... 仅显示前 10 笔。" if len(results) > 10 else ""
        ),
        "session_id": sid,
        "action": None
    }


# ──── 凭证列表 ────

def handle_list_vouchers(msg, db, sid):
    period = date.today().strftime("%Y-%m")
    periods = re.findall(r"(\d{4}-\d{2})", msg)
    if periods: period = periods[0]
    vouchers = db.query(Voucher).filter(Voucher.period == period).order_by(Voucher.voucher_date.desc()).limit(10).all()
    if not vouchers:
        return {"reply": f"📋 {period} 期间暂无凭证。试试「录入凭证」？", "session_id": sid, "action": None}
    lines = "\n".join([
        f"  {v.voucher_no} {v.voucher_date} {v.summary[:20]} | ¥{v.total_debit:,.2f} | {v.status}"
        for v in vouchers
    ])
    return {"reply": f"📋 **{period} 凭证列表**\n\n{lines}\n\n💡 打开侧边栏「记账凭证」查看完整列表。", "session_id": sid, "action": None}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
