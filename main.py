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
    get_db, init_db, init_company_data,
    Company, Department, Employee, Customer, Supplier,
    Account, Voucher, VoucherDetail, Period,
    FixedAsset, FixedAssetDepreciation,
    IntangibleAsset, IntangibleAssetAmortization,
    InventoryItem, InventoryTransaction, InventoryBalance,
    Contract, ContractPayment,
    CompanyShareholder, CompanyDirector, CompanySupervisor, CompanyFinanceContact,
    Payment,
    SalesInvoice, PurchaseInvoice,
    BankConfig, BankTransaction,
    InputVATDeduction, ColumnTemplate
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
class CompanyUpdate(BaseModel):
    uscc: Optional[str] = None
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
    id_card: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    salary: Optional[float] = None
    entry_date: Optional[date] = None
    leave_date: Optional[date] = None
    is_active: Optional[bool] = None

# 客户
class CustomerCreate(BaseModel):
    code: str
    name: str
    uscc: Optional[str] = None
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
    uscc: Optional[str] = None
    contact: Optional[str] = None
    phone: Optional[str] = None
    credit_limit: Optional[float] = None
    is_active: Optional[bool] = None

# 供应商
class SupplierCreate(BaseModel):
    code: str
    name: str
    uscc: Optional[str] = None
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
    uscc: Optional[str] = None
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
def get_company(company_id: int = Query(1), db: Session = Depends(get_db)):
    info = db.query(Company).filter(Company.id == company_id).first()
    if not info:
        return {"company_name": "", "uscc": "", "tax_no": "", "address": "", "phone": "",
                "bank_name": "", "bank_account": "", "legal_representative": "",
                "registered_capital": "", "established_date": None, "business_scope": ""}
    # 股东
    shareholders = db.query(CompanyShareholder).filter(CompanyShareholder.company_id == company_id).all()
    # 董事
    directors = db.query(CompanyDirector).filter(CompanyDirector.company_id == company_id).all()
    # 监事
    supervisors = db.query(CompanySupervisor).filter(CompanySupervisor.company_id == company_id).all()
    # 财务负责人
    finance_contacts = db.query(CompanyFinanceContact).filter(CompanyFinanceContact.company_id == company_id).all()

    return {
        "id": info.id,
        "uscc": info.uscc or "",
        "company_name": info.name,
        "tax_no": info.tax_no,
        "address": info.address,
        "phone": info.phone,
        "bank_name": info.bank_name,
        "bank_account": info.bank_account,
        "legal_representative": info.legal_representative,
        "legal_representative_id": info.legal_representative_id or "",
        "registered_capital": info.registered_capital,
        "established_date": str(info.established_date) if info.established_date else None,
        "business_scope": info.business_scope,
        "shareholders": [{"id": s.id, "name": s.name, "id_number": s.id_number or "", "type": s.shareholder_type or "自然人", "share_ratio": s.share_ratio or 0} for s in shareholders],
        "directors": [{"id": d.id, "name": d.name, "id_number": d.id_number or ""} for d in directors],
        "supervisors": [{"id": s.id, "name": s.name, "id_number": s.id_number or ""} for s in supervisors],
        "finance_contacts": [{"id": f.id, "name": f.name, "id_number": f.id_number or ""} for f in finance_contacts],
    }

@app.put("/api/company")
def update_company(data: CompanyUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    info = db.query(Company).filter(Company.id == company_id).first()
    if not info:
        info = Company(id=company_id, name=data.company_name or "")
        db.add(info)
        db.flush()
    # 校验统一社会信用代码
    if data.uscc:
        ok, msg = validate_uscc(data.uscc)
        if not ok:
            raise HTTPException(400, detail=f"公司统一社会信用代码：{msg}")
    for k, v in data.model_dump(exclude_unset=True).items():
        if k == 'established_date' and v:
            try:
                v = date.fromisoformat(v)
            except ValueError:
                v = None
        if k == 'company_name':
            info.name = v
        else:
            setattr(info, k, v)
    info.updated_at = datetime.now()
    db.commit()
    return {"message": "保存成功"}


class CompanyFullUpdate(BaseModel):
    company_name: Optional[str] = None
    uscc: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    legal_representative: Optional[str] = None
    legal_representative_id: Optional[str] = None
    registered_capital: Optional[str] = None
    established_date: Optional[str] = None
    business_scope: Optional[str] = None
    shareholders: Optional[list] = None
    directors: Optional[list] = None
    supervisors: Optional[list] = None
    finance_contacts: Optional[list] = None


@app.put("/api/company/full")
def update_company_full(data: CompanyFullUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    """保存公司完整信息，包括股东/董事/监事/财务负责人"""
    info = db.query(Company).filter(Company.id == company_id).first()
    if not info:
        info = Company(id=company_id, name=data.company_name or "")
        db.add(info)
        db.flush()

    # 更新基本信息
    for k, v in data.model_dump(exclude_unset=True).items():
        if k in ('shareholders', 'directors', 'supervisors', 'finance_contacts'):
            continue
        if k == 'established_date' and v:
            try:
                v = date.fromisoformat(v)
            except ValueError:
                v = None
        if k == 'company_name':
            info.name = v
        elif v is not None:
            setattr(info, k, v)
    info.updated_at = datetime.now()

    # 更新股东
    if data.shareholders is not None:
        db.query(CompanyShareholder).filter(CompanyShareholder.company_id == company_id).delete()
        for s in data.shareholders:
            if s.get("name"):
                db.add(CompanyShareholder(
                    company_id=company_id,
                    name=s["name"],
                    id_number=s.get("id_number", ""),
                    shareholder_type=s.get("type", "自然人"),
                    share_ratio=s.get("share_ratio", 0)
                ))

    # 更新董事
    if data.directors is not None:
        db.query(CompanyDirector).filter(CompanyDirector.company_id == company_id).delete()
        for d in data.directors:
            if d.get("name"):
                db.add(CompanyDirector(
                    company_id=company_id,
                    name=d["name"],
                    id_number=d.get("id_number", "")
                ))

    # 更新监事
    if data.supervisors is not None:
        db.query(CompanySupervisor).filter(CompanySupervisor.company_id == company_id).delete()
        for s in data.supervisors:
            if s.get("name"):
                db.add(CompanySupervisor(
                    company_id=company_id,
                    name=s["name"],
                    id_number=s.get("id_number", "")
                ))

    # 更新财务负责人
    if data.finance_contacts is not None:
        db.query(CompanyFinanceContact).filter(CompanyFinanceContact.company_id == company_id).delete()
        for f in data.finance_contacts:
            if f.get("name"):
                db.add(CompanyFinanceContact(
                    company_id=company_id,
                    name=f["name"],
                    id_number=f.get("id_number", "")
                ))

    db.commit()
    return {"message": "保存成功"}


# ==================== 部门档案 ====================

@app.get("/api/departments")
def list_departments(
    keyword: Optional[str] = None,
    company_id: int = Query(1),
    db: Session = Depends(get_db)
):
    q = db.query(Department).filter(Department.company_id == company_id)
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
def create_department(data: DepartmentCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    if db.query(Department).filter(Department.company_id == company_id, Department.code == data.code).first():
        raise HTTPException(400, detail=f"部门编码 {data.code} 已存在")
    d = Department(**data.model_dump())
    db.add(d)
    db.commit()
    return {"message": "新增成功"}

@app.put("/api/departments/{dept_id}")
def update_department(dept_id: int, data: DepartmentUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    d = db.query(Department).filter(Department.company_id == company_id, Department.id == dept_id).first()
    if not d:
        raise HTTPException(404, detail="部门不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    db.commit()
    return {"message": "更新成功"}

@app.delete("/api/departments/{dept_id}")
def delete_department(dept_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    d = db.query(Department).filter(Department.company_id == company_id, Department.id == dept_id).first()
    if not d:
        raise HTTPException(404, detail="部门不存在")
    # 检查是否有员工关联
    emp = db.query(Employee).filter(Employee.company_id == company_id, Employee.department_code == d.code).first()
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
    company_id: int = Query(1),
    db: Session = Depends(get_db)
):
    q = db.query(Employee).filter(Employee.company_id == company_id)
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
def create_employee(data: EmployeeCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    if db.query(Employee).filter(Employee.company_id == company_id, Employee.code == data.code).first():
        raise HTTPException(400, detail=f"工号 {data.code} 已存在")
    # 校验部门是否存在
    if data.department_code:
        dept = db.query(Department).filter(Department.company_id == company_id, Department.code == data.department_code).first()
        if not dept:
            raise HTTPException(400, detail=f"部门 {data.department_code} 不存在")
    e = Employee(**data.model_dump())
    db.add(e)
    db.commit()
    return {"message": "新增成功"}

@app.put("/api/employees/{emp_id}")
def update_employee(emp_id: int, data: EmployeeUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    e = db.query(Employee).filter(Employee.company_id == company_id, Employee.id == emp_id).first()
    if not e:
        raise HTTPException(404, detail="员工不存在")
    if data.department_code:
        dept = db.query(Department).filter(Department.company_id == company_id, Department.code == data.department_code).first()
        if not dept:
            raise HTTPException(400, detail=f"部门 {data.department_code} 不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(e, k, v)
    db.commit()
    return {"message": "更新成功"}

@app.delete("/api/employees/{emp_id}")
def delete_employee(emp_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    e = db.query(Employee).filter(Employee.company_id == company_id, Employee.id == emp_id).first()
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
    company_id: int = Query(1),
    db: Session = Depends(get_db)
):
    q = db.query(Customer).filter(Customer.company_id == company_id)
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
            "uscc": c.uscc or "",  # ← 新增
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
def create_customer(data: CustomerCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    if db.query(Customer).filter(Customer.company_id == company_id, Customer.code == data.code).first():
        raise HTTPException(400, detail=f"客户编码 {data.code} 已存在")
    # 校验统一社会信用代码
    if data.uscc:
        ok, msg = validate_uscc(data.uscc)
        if not ok:
            raise HTTPException(400, detail=f"客户统一社会信用代码：{msg}")
    c = Customer(**data.model_dump())
    db.add(c)
    db.commit()
    return {"message": "新增成功"}

@app.put("/api/customers/{cust_id}")
def update_customer(cust_id: int, data: CustomerUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    c = db.query(Customer).filter(Customer.company_id == company_id, Customer.id == cust_id).first()
    if not c:
        raise HTTPException(404, detail="客户不存在")
    if data.uscc:
        ok, msg = validate_uscc(data.uscc)
        if not ok:
            raise HTTPException(400, detail=f"客户统一社会信用代码：{msg}")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    return {"message": "更新成功"}

@app.delete("/api/customers/{cust_id}")
def delete_customer(cust_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    c = db.query(Customer).filter(Customer.company_id == company_id, Customer.id == cust_id).first()
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
    company_id: int = Query(1),
    db: Session = Depends(get_db)
):
    q = db.query(Supplier).filter(Supplier.company_id == company_id)
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
            "uscc": s.uscc or "",  # ← 新增
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
def create_supplier(data: SupplierCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    if db.query(Supplier).filter(Supplier.company_id == company_id, Supplier.code == data.code).first():
        raise HTTPException(400, detail=f"供应商编码 {data.code} 已存在")
    if data.uscc:
        ok, msg = validate_uscc(data.uscc)
        if not ok:
            raise HTTPException(400, detail=f"供应商统一社会信用代码：{msg}")
    s = Supplier(**data.model_dump())
    db.add(s)
    db.commit()
    return {"message": "新增成功"}

@app.put("/api/suppliers/{supp_id}")
def update_supplier(supp_id: int, data: SupplierUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.company_id == company_id, Supplier.id == supp_id).first()
    if not s:
        raise HTTPException(404, detail="供应商不存在")
    if data.uscc:
        ok, msg = validate_uscc(data.uscc)
        if not ok:
            raise HTTPException(400, detail=f"供应商统一社会信用代码：{msg}")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    return {"message": "更新成功"}

@app.delete("/api/suppliers/{supp_id}")
def delete_supplier(supp_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.company_id == company_id, Supplier.id == supp_id).first()
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
    q = db.query(Account).filter(Account.company_id == company_id)
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
def create_account(data: dict, company_id: int = Query(1), db: Session = Depends(get_db)):
    from pydantic import ValidationError
    code = data.get("code")
    name = data.get("name")
    category = data.get("category")
    balance_direction = data.get("balance_direction")
    level = data.get("level", 1)
    parent_code = data.get("parent_code")
    if not code or not name:
        raise HTTPException(400, detail="科目编码和名称不能为空")
    if db.query(Account).filter(Account.company_id == company_id, Account.code == code).first():
        raise HTTPException(400, detail=f"科目编码 {code} 已存在")
    acc = Account(code=code, name=name, category=category,
                  balance_direction=balance_direction, level=level, parent_code=parent_code)
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return {"id": acc.id, "code": acc.code, "name": acc.name, "message": "创建成功"}


@app.put("/api/accounts/{account_id}")
def update_account(account_id: int, data: dict, company_id: int = Query(1), db: Session = Depends(get_db)):
    acc = db.query(Account).filter(Account.company_id == company_id, Account.id == account_id).first()
    if not acc:
        raise HTTPException(404, detail="科目不存在")
    if "name" in data and data["name"] is not None:
        acc.name = data["name"]
    if "is_active" in data and data["is_active"] is not None:
        acc.is_active = data["is_active"]
    db.commit()
    return {"message": "更新成功"}


@app.delete("/api/accounts/{account_id}")
def delete_account(account_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    acc = db.query(Account).filter(Account.company_id == company_id, Account.id == account_id).first()
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
    q = db.query(Voucher).filter(Voucher.company_id == company_id)
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
def get_voucher(voucher_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
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
def create_voucher(data: VoucherCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
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
        acc = db.query(Account).filter(Account.company_id == company_id, Account.code == d.account_code).first()
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
def audit_voucher(voucher_id: int, checker: str = "审核员", company_id: int = Query(1), db: Session = Depends(get_db)):
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
def delete_voucher(voucher_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
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
         .filter(Voucher.company_id == company_id) \
     .filter(Voucher.company_id == company_id) \
         .filter(Voucher.company_id == company_id) \
     .filter(Voucher.company_id == company_id) \
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

    acc = db.query(Account).filter(Account.company_id == company_id, Account.code == account_code).first()
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
def profit_loss_report(period_from: str, period_to: str, company_id: int = Query(1), db: Session = Depends(get_db)):
    """利润表"""
    def get_amount(codes_prefix: list):
        total = 0.0
        for code in codes_prefix:
            r = db.query(
                func.sum(VoucherDetail.debit_amount).label("d"),
                func.sum(VoucherDetail.credit_amount).label("c")
            ).join(Voucher, VoucherDetail.voucher_id == Voucher.id) \
         .filter(Voucher.company_id == company_id) \
     .filter(Voucher.company_id == company_id) \
         .filter(Voucher.company_id == company_id) \
     .filter(Voucher.company_id == company_id) \
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
         .filter(Voucher.company_id == company_id) \
     .filter(Voucher.company_id == company_id) \
         .filter(Voucher.company_id == company_id) \
     .filter(Voucher.company_id == company_id) \
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
def balance_sheet(period: str, company_id: int = Query(1), db: Session = Depends(get_db)):
    """资产负债表"""
    def get_balance(code_prefix: str, direction: str):
        r = db.query(
            func.sum(VoucherDetail.debit_amount).label("d"),
            func.sum(VoucherDetail.credit_amount).label("c")
        ).join(Voucher, VoucherDetail.voucher_id == Voucher.id) \
         .filter(Voucher.company_id == company_id) \
     .filter(Voucher.company_id == company_id) \
         .filter(Voucher.company_id == company_id) \
     .filter(Voucher.company_id == company_id) \
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


# ==================== 科目余额表 ====================

@app.get("/api/reports/account-balance")
def account_balance(period: str, company_id: int = Query(1), db: Session = Depends(get_db)):
    """科目余额表（所有科目，含期初/本期/期末）"""
    # 取所有激活科目
    accounts = db.query(Account).filter(Account.company_id == company_id, Account.is_active == True).order_by(Account.code).all()
    # 期初 = 截至上期的余额
    # 本期 = 当期的借/贷发生额
    def calc_balance(acc_code: str, up_to_period: str):
        r = db.query(
            func.sum(VoucherDetail.debit_amount).label("d"),
            func.sum(VoucherDetail.credit_amount).label("c")
        ).join(Voucher, VoucherDetail.voucher_id == Voucher.id) \
         .filter(Voucher.company_id == company_id) \
     .filter(Voucher.company_id == company_id) \
         .filter(Voucher.company_id == company_id) \
     .filter(Voucher.company_id == company_id) \
         .filter(
            VoucherDetail.account_code.startswith(acc_code),
            Voucher.period <= up_to_period,
            Voucher.status.in_(["已审核", "已过账"])
        ).first()
        d = r.d or 0
        c = r.c or 0
        acc = db.query(Account).filter(Account.company_id == company_id, Account.code == acc_code).first()
        direction = acc.balance_direction if acc else "借"
        if direction == "借":
            return round(d - c, 2)
        else:
            return round(c - d, 2)

    def calc_period(acc_code: str, period_str: str):
        r = db.query(
            func.sum(VoucherDetail.debit_amount).label("d"),
            func.sum(VoucherDetail.credit_amount).label("c")
        ).join(Voucher, VoucherDetail.voucher_id == Voucher.id) \
         .filter(Voucher.company_id == company_id) \
     .filter(Voucher.company_id == company_id) \
         .filter(Voucher.company_id == company_id) \
     .filter(Voucher.company_id == company_id) \
         .filter(
            VoucherDetail.account_code.startswith(acc_code),
            Voucher.period == period_str,
            Voucher.status.in_(["已审核", "已过账"])
        ).first()
        return (r.d or 0, r.c or 0)

    rows = []
    for acc in accounts:
        # 上级科目跳过（由明细科目汇总）
        has_child = db.query(Account).filter(Account.company_id == company_id, Account.parent_code == acc.code).first()
        if has_child:
            continue
        direction = acc.balance_direction
        # 期初余额
        prev_period = period
        y, m = int(period[:4]), int(period[5:7])
        if m == 1:
            prev_period = f"{y-1}-12"
        else:
            prev_period = f"{y}-{str(m-1).zfill(2)}"
        begin_bal = calc_balance(acc.code, prev_period)
        # 本期发生额
        debit_amt, credit_amt = calc_period(acc.code, period)
        # 期末余额
        end_bal = calc_balance(acc.code, period)
        rows.append({
            "code": acc.code,
            "name": acc.name,
            "direction": direction,
            "begin_balance": begin_bal,
            "debit_amount": round(debit_amt, 2),
            "credit_amount": round(credit_amt, 2),
            "end_balance": end_bal,
        })

    return {"period": period, "rows": rows}


# ==================== 期间管理（原有，保留）====================

@app.get("/api/periods")
def list_periods(company_id: int = Query(1), db: Session = Depends(get_db)):
    periods = db.query(Period).order_by(Period.period.desc()).all()
    return [{"period": p.period, "status": p.status} for p in periods]


@app.post("/api/periods/{period}/close")
def close_period(period: str, company_id: int = Query(1), db: Session = Depends(get_db)):
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
def dashboard(period: Optional[str] = None, company_id: int = Query(1), db: Session = Depends(get_db)):
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


# ==================== 公司账套管理 ====================

class CompanyCreate(BaseModel):
    name: str
    uscc: Optional[str] = None
    tax_no: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    legal_representative: Optional[str] = None
    legal_representative_id: Optional[str] = None
    registered_capital: Optional[str] = None
    business_scope: Optional[str] = None
    # 股东（可多人）
    shareholders: Optional[List[dict]] = []
    # 董事（可多人）
    directors: Optional[List[dict]] = []
    # 监事（可多人）
    supervisors: Optional[List[dict]] = []
    # 财务负责人（可多人）
    finance_contacts: Optional[List[dict]] = []

class CompanyUpdateModel(BaseModel):
    name: Optional[str] = None
    uscc: Optional[str] = None
    tax_no: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    legal_representative: Optional[str] = None
    registered_capital: Optional[str] = None
    established_date: Optional[str] = None
    business_scope: Optional[str] = None
    is_active: Optional[bool] = None


@app.get("/api/companies")
def list_companies(db: Session = Depends(get_db)):
    """获取公司列表（账套选择）"""
    companies = db.query(Company).filter(Company.is_active == True).order_by(Company.id).all()
    return [{"id": c.id, "name": c.name, "uscc": c.uscc or "", "created_at": str(c.created_at.date()) if c.created_at else ""} for c in companies]


@app.post("/api/companies")
def create_company(data: CompanyCreate, db: Session = Depends(get_db)):
    """创建新公司/账套"""
    if db.query(Company).filter(Company.name == data.name, Company.is_active == True).first():
        raise HTTPException(400, detail=f"公司 '{data.name}' 已存在")
    if data.uscc:
        ok, msg = validate_uscc(data.uscc)
        if not ok:
            raise HTTPException(400, detail=f"统一社会信用代码：{msg}")

    company = Company(
        name=data.name, uscc=data.uscc, tax_no=data.tax_no,
        address=data.address, phone=data.phone,
        legal_representative=data.legal_representative,
        legal_representative_id=data.legal_representative_id,
        registered_capital=data.registered_capital,
        business_scope=data.business_scope
    )
    db.add(company)
    db.flush()

    # 写入股东信息
    for s in (data.shareholders or []):
        if s.get("name"):
            db.add(CompanyShareholder(
                company_id=company.id,
                name=s["name"],
                id_number=s.get("id_number", ""),
                shareholder_type=s.get("type", "自然人"),
                share_ratio=float(s["share_ratio"]) if s.get("share_ratio") not in (None, "") else None
            ))
    # 写入董事信息
    for d in (data.directors or []):
        if d.get("name"):
            db.add(CompanyDirector(
                company_id=company.id,
                name=d["name"],
                id_number=d.get("id_number", "")
            ))
    # 写入监事信息
    for s in (data.supervisors or []):
        if s.get("name"):
            db.add(CompanySupervisor(
                company_id=company.id,
                name=s["name"],
                id_number=s.get("id_number", "")
            ))
    # 写入财务负责人信息
    for f in (data.finance_contacts or []):
        if f.get("name"):
            db.add(CompanyFinanceContact(
                company_id=company.id,
                name=f["name"],
                id_number=f.get("id_number", "")
            ))

    # 初始化公司基础数据（科目表、部门、期间）
    init_company_data(db, company.id)
    db.commit()
    db.refresh(company)

    return {"id": company.id, "name": company.name, "message": f"公司 '{company.name}' 创建成功，已初始化科目表和基础档案"}


@app.put("/api/companies/{company_id}")
def update_company_detail(company_id: int, data: CompanyUpdateModel, db: Session = Depends(get_db)):
    """更新公司信息"""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, detail="公司不存在")
    if data.uscc:
        ok, msg = validate_uscc(data.uscc)
        if not ok:
            raise HTTPException(400, detail=f"统一社会信用代码：{msg}")
    for k, v in data.model_dump(exclude_unset=True).items():
        if k == 'established_date' and v:
            try:
                v = date.fromisoformat(v)
            except ValueError:
                v = None
        setattr(company, k, v)
    company.updated_at = datetime.now()
    db.commit()
    return {"message": "更新成功"}


@app.delete("/api/companies/{company_id}")
def delete_company(company_id: int, db: Session = Depends(get_db)):
    """删除公司（软删除）"""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, detail="公司不存在")
    company.is_active = False
    db.commit()
    return {"message": f"公司 '{company.name}' 已停用"}


# ==================== 固定资产 ====================

class FixedAssetCreate(BaseModel):
    code: str
    name: str
    category: str = "机器设备"
    spec: Optional[str] = None
    unit: Optional[str] = "台"
    dept_code: Optional[str] = None
    location: Optional[str] = None
    purchase_date: Optional[date] = None
    original_value: float = 0.0
    residual_value: float = 0.0
    useful_life_months: int = 60
    depreciation_method: str = "直线法"
    supplier: Optional[str] = None
    warranty_expiry: Optional[date] = None
    remark: Optional[str] = None


class FixedAssetUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    dept_code: Optional[str] = None
    location: Optional[str] = None
    original_value: Optional[float] = None
    residual_value: Optional[float] = None
    useful_life_months: Optional[int] = None
    depreciation_method: Optional[str] = None
    status: Optional[str] = None
    remark: Optional[str] = None


@app.get("/api/fixed-assets")
def list_fixed_assets(
    company_id: int = Query(1),
    category: Optional[str] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(FixedAsset).filter(FixedAsset.company_id == company_id)
    if category:
        q = q.filter(FixedAsset.category == category)
    if status:
        q = q.filter(FixedAsset.status == status)
    if keyword:
        q = q.filter(or_(FixedAsset.code.contains(keyword), FixedAsset.name.contains(keyword)))
    assets = q.order_by(FixedAsset.code).all()
    return [{
        "id": a.id, "code": a.code, "name": a.name, "category": a.category,
        "spec": a.spec, "unit": a.unit, "dept_code": a.dept_code,
        "location": a.location, "purchase_date": str(a.purchase_date) if a.purchase_date else "",
        "original_value": a.original_value, "residual_value": a.residual_value,
        "useful_life_months": a.useful_life_months,
        "accumulated_depreciation": a.accumulated_depreciation,
        "monthly_depreciation": a.monthly_depreciation,
        "depreciation_method": a.depreciation_method,
        "status": a.status, "supplier": a.supplier,
        "net_value": round(a.original_value - a.accumulated_depreciation, 2),
        "net_rate": round((a.original_value - a.accumulated_depreciation) / a.original_value * 100, 1) if a.original_value > 0 else 0,
        "remark": a.remark
    } for a in assets]


@app.post("/api/fixed-assets")
def create_fixed_asset(data: FixedAssetCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    if db.query(FixedAsset).filter(FixedAsset.company_id == company_id, FixedAsset.code == data.code).first():
        raise HTTPException(400, detail=f"资产编码 {data.code} 已存在")
    # 计算月折旧额（直线法）
    monthly = 0.0
    if data.useful_life_months > 0:
        monthly = round((data.original_value - data.residual_value) / data.useful_life_months, 2)
    fa = FixedAsset(
        company_id=company_id, code=data.code, name=data.name,
        category=data.category, spec=data.spec, unit=data.unit,
        dept_code=data.dept_code, location=data.location,
        purchase_date=data.purchase_date, original_value=data.original_value,
        residual_value=data.residual_value, useful_life_months=data.useful_life_months,
        monthly_depreciation=monthly, depreciation_method=data.depreciation_method,
        supplier=data.supplier, warranty_expiry=data.warranty_expiry,
        remark=data.remark
    )
    db.add(fa)
    db.commit()
    db.refresh(fa)
    return {"id": fa.id, "code": fa.code, "message": "固定资产新增成功"}


@app.put("/api/fixed-assets/{fa_id}")
def update_fixed_asset(fa_id: int, data: FixedAssetUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    fa = db.query(FixedAsset).filter(FixedAsset.company_id == company_id, FixedAsset.id == fa_id).first()
    if not fa:
        raise HTTPException(404, detail="资产不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(fa, k, v)
    # 重新计算月折旧额
    if data.original_value is not None or data.residual_value is not None or data.useful_life_months is not None:
        if fa.useful_life_months > 0:
            fa.monthly_depreciation = round((fa.original_value - fa.residual_value) / fa.useful_life_months, 2)
    fa.updated_at = datetime.now()
    db.commit()
    return {"message": "更新成功"}


@app.post("/api/fixed-assets/{fa_id}/depreciate")
def depreciate_asset(fa_id: int, period: str = Query(...), company_id: int = Query(1), db: Session = Depends(get_db)):
    """计提单月折旧"""
    fa = db.query(FixedAsset).filter(FixedAsset.company_id == company_id, FixedAsset.id == fa_id).first()
    if not fa:
        raise HTTPException(404, detail="资产不存在")
    if fa.status != "在用":
        raise HTTPException(400, detail=f"资产状态为'{fa.status}'，不能计提折旧")
    # 检查是否已折旧
    existing = db.query(FixedAssetDepreciation).filter(
        FixedAssetDepreciation.company_id == company_id,
        FixedAssetDepreciation.asset_id == fa_id,
        FixedAssetDepreciation.period == period
    ).first()
    if existing:
        raise HTTPException(400, detail=f"该资产在 {period} 期间已计提折旧")
    # 累计折旧不能超过（原值-残值）
    if fa.accumulated_depreciation + fa.monthly_depreciation > fa.original_value - fa.residual_value:
        dep_amount = fa.original_value - fa.residual_value - fa.accumulated_depreciation
    else:
        dep_amount = fa.monthly_depreciation
    if dep_amount <= 0:
        raise HTTPException(400, detail="该资产已提足折旧")
    acc_before = fa.accumulated_depreciation
    fa.accumulated_depreciation += dep_amount
    fa.updated_at = datetime.now()
    rec = FixedAssetDepreciation(
        company_id=company_id, asset_id=fa_id, period=period,
        depreciation_amount=dep_amount, accumulated_before=acc_before,
        accumulated_after=fa.accumulated_depreciation,
        net_value=round(fa.original_value - fa.accumulated_depreciation, 2)
    )
    db.add(rec)
    db.commit()
    return {"message": f"计提折旧 ¥{dep_amount:.2f}，累计折旧 ¥{fa.accumulated_depreciation:.2f}"}


@app.get("/api/fixed-assets/{fa_id}/depreciations")
def get_asset_depreciations(fa_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    recs = db.query(FixedAssetDepreciation).filter(
        FixedAssetDepreciation.company_id == company_id,
        FixedAssetDepreciation.asset_id == fa_id
    ).order_by(FixedAssetDepreciation.period).all()
    return [{
        "id": r.id, "period": r.period, "depreciation_amount": r.depreciation_amount,
        "accumulated_before": r.accumulated_before, "accumulated_after": r.accumulated_after,
        "net_value": r.net_value
    } for r in recs]


@app.delete("/api/fixed-assets/{fa_id}")
def delete_fixed_asset(fa_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    fa = db.query(FixedAsset).filter(FixedAsset.company_id == company_id, FixedAsset.id == fa_id).first()
    if not fa:
        raise HTTPException(404, detail="资产不存在")
    if fa.status == "在用":
        raise HTTPException(400, detail="在用资产不能删除，请先变更为闲置或报废")
    db.delete(fa)
    db.commit()
    return {"message": "删除成功"}


# ==================== 无形资产 ====================

class IntangibleAssetCreate(BaseModel):
    code: str
    name: str
    category: str = "专利权"
    purchase_date: Optional[date] = None
    original_value: float = 0.0
    useful_life_months: int = 120
    residual_value: float = 0.0
    remark: Optional[str] = None


class IntangibleAssetUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    original_value: Optional[float] = None
    residual_value: Optional[float] = None
    useful_life_months: Optional[int] = None
    status: Optional[str] = None
    remark: Optional[str] = None


@app.get("/api/intangible-assets")
def list_intangible_assets(
    company_id: int = Query(1),
    category: Optional[str] = None,
    keyword: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(IntangibleAsset).filter(IntangibleAsset.company_id == company_id)
    if category:
        q = q.filter(IntangibleAsset.category == category)
    if keyword:
        q = q.filter(or_(IntangibleAsset.code.contains(keyword), IntangibleAsset.name.contains(keyword)))
    assets = q.order_by(IntangibleAsset.code).all()
    return [{
        "id": a.id, "code": a.code, "name": a.name, "category": a.category,
        "purchase_date": str(a.purchase_date) if a.purchase_date else "",
        "original_value": a.original_value, "residual_value": a.residual_value,
        "useful_life_months": a.useful_life_months,
        "accumulated_amortization": a.accumulated_amortization,
        "monthly_amortization": a.monthly_amortization,
        "status": a.status,
        "net_value": round(a.original_value - a.accumulated_amortization, 2),
        "remark": a.remark
    } for a in assets]


@app.post("/api/intangible-assets")
def create_intangible_asset(data: IntangibleAssetCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    if db.query(IntangibleAsset).filter(IntangibleAsset.company_id == company_id, IntangibleAsset.code == data.code).first():
        raise HTTPException(400, detail=f"资产编码 {data.code} 已存在")
    monthly = round((data.original_value - data.residual_value) / data.useful_life_months, 2) if data.useful_life_months > 0 else 0
    ia = IntangibleAsset(
        company_id=company_id, code=data.code, name=data.name,
        category=data.category, purchase_date=data.purchase_date,
        original_value=data.original_value, useful_life_months=data.useful_life_months,
        residual_value=data.residual_value, monthly_amortization=monthly,
        remark=data.remark
    )
    db.add(ia)
    db.commit()
    db.refresh(ia)
    return {"id": ia.id, "code": ia.code, "message": "无形资产新增成功"}


@app.put("/api/intangible-assets/{ia_id}")
def update_intangible_asset(ia_id: int, data: IntangibleAssetUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    ia = db.query(IntangibleAsset).filter(IntangibleAsset.company_id == company_id, IntangibleAsset.id == ia_id).first()
    if not ia:
        raise HTTPException(404, detail="资产不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(ia, k, v)
    if ia.useful_life_months > 0:
        ia.monthly_amortization = round((ia.original_value - ia.residual_value) / ia.useful_life_months, 2)
    ia.updated_at = datetime.now()
    db.commit()
    return {"message": "更新成功"}


@app.post("/api/intangible-assets/{ia_id}/amortize")
def amortize_asset(ia_id: int, period: str = Query(...), company_id: int = Query(1), db: Session = Depends(get_db)):
    """计提单月摊销"""
    ia = db.query(IntangibleAsset).filter(IntangibleAsset.company_id == company_id, IntangibleAsset.id == ia_id).first()
    if not ia:
        raise HTTPException(404, detail="资产不存在")
    if ia.status != "在用":
        raise HTTPException(400, detail=f"资产状态为'{ia.status}'，不能摊销")
    existing = db.query(IntangibleAssetAmortization).filter(
        IntangibleAssetAmortization.company_id == company_id,
        IntangibleAssetAmortization.asset_id == ia_id,
        IntangibleAssetAmortization.period == period
    ).first()
    if existing:
        raise HTTPException(400, detail=f"该资产在 {period} 期间已摊销")
    if ia.accumulated_amortization + ia.monthly_amortization > ia.original_value - ia.residual_value:
        amt = ia.original_value - ia.residual_value - ia.accumulated_amortization
    else:
        amt = ia.monthly_amortization
    if amt <= 0:
        raise HTTPException(400, detail="该资产已摊销完毕")
    acc_before = ia.accumulated_amortization
    ia.accumulated_amortization += amt
    ia.updated_at = datetime.now()
    rec = IntangibleAssetAmortization(
        company_id=company_id, asset_id=ia_id, period=period,
        amortization_amount=amt, accumulated_before=acc_before,
        accumulated_after=ia.accumulated_amortization,
        net_value=round(ia.original_value - ia.accumulated_amortization, 2)
    )
    db.add(rec)
    db.commit()
    return {"message": f"摊销 ¥{amt:.2f}，累计摊销 ¥{ia.accumulated_amortization:.2f}"}


@app.delete("/api/intangible-assets/{ia_id}")
def delete_intangible_asset(ia_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    ia = db.query(IntangibleAsset).filter(IntangibleAsset.company_id == company_id, IntangibleAsset.id == ia_id).first()
    if not ia:
        raise HTTPException(404, detail="资产不存在")
    db.delete(ia)
    db.commit()
    return {"message": "删除成功"}


# ==================== 库存管理 ====================

class InventoryItemCreate(BaseModel):
    code: str
    name: str
    spec: Optional[str] = None
    unit: Optional[str] = "个"
    category: Optional[str] = "原材料"
    warehouse: Optional[str] = None
    safety_stock: float = 0.0
    cost_price: float = 0.0
    sale_price: float = 0.0
    account_code: Optional[str] = None
    remark: Optional[str] = None

class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    spec: Optional[str] = None
    category: Optional[str] = None
    warehouse: Optional[str] = None
    safety_stock: Optional[float] = None
    cost_price: Optional[float] = None
    sale_price: Optional[float] = None
    is_active: Optional[bool] = None
    remark: Optional[str] = None

class InventoryTransactionCreate(BaseModel):
    transaction_date: date
    trans_type: str  # 入库/出库/调拨入/调拨出/盘盈/盘亏/其他
    item_code: str
    quantity: float
    unit_price: float = 0.0
    warehouse: Optional[str] = None
    warehouse_to: Optional[str] = None
    voucher_no: Optional[str] = None
    reference_no: Optional[str] = None
    operator: Optional[str] = "管理员"
    remark: Optional[str] = None


@app.get("/api/inventory-items")
def list_inventory_items(
    company_id: int = Query(1),
    category: Optional[str] = None,
    keyword: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(InventoryItem).filter(InventoryItem.company_id == company_id, InventoryItem.is_active == True)
    if category:
        q = q.filter(InventoryItem.category == category)
    if keyword:
        q = q.filter(or_(InventoryItem.code.contains(keyword), InventoryItem.name.contains(keyword)))
    items = q.order_by(InventoryItem.code).all()
    return [{
        "id": i.id, "code": i.code, "name": i.name, "spec": i.spec,
        "unit": i.unit, "category": i.category, "warehouse": i.warehouse,
        "safety_stock": i.safety_stock, "current_stock": i.current_stock,
        "cost_price": i.cost_price, "sale_price": i.sale_price,
        "stock_value": round(i.current_stock * i.cost_price, 2),
        "account_code": i.account_code, "remark": i.remark
    } for i in items]


@app.post("/api/inventory-items")
def create_inventory_item(data: InventoryItemCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    if db.query(InventoryItem).filter(InventoryItem.company_id == company_id, InventoryItem.code == data.code).first():
        raise HTTPException(400, detail=f"商品编码 {data.code} 已存在")
    item = InventoryItem(company_id=company_id, **data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "code": item.code, "message": "新增成功"}


@app.put("/api/inventory-items/{item_id}")
def update_inventory_item(item_id: int, data: InventoryItemUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.company_id == company_id, InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(404, detail="商品不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    item.updated_at = datetime.now()
    db.commit()
    return {"message": "更新成功"}


@app.get("/api/inventory-transactions")
def list_inventory_transactions(
    company_id: int = Query(1),
    item_code: Optional[str] = None,
    trans_type: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    q = db.query(InventoryTransaction).filter(InventoryTransaction.company_id == company_id)
    if item_code:
        q = q.filter(InventoryTransaction.item_code == item_code)
    if trans_type:
        q = q.filter(InventoryTransaction.trans_type == trans_type)
    items = q.order_by(InventoryTransaction.transaction_date.desc(), InventoryTransaction.id.desc()).limit(limit).all()
    return [{
        "id": t.id, "item_code": t.item_code, "transaction_date": str(t.transaction_date),
        "trans_type": t.trans_type, "quantity": t.quantity, "unit_price": t.unit_price,
        "total_amount": t.total_amount, "warehouse": t.warehouse, "warehouse_to": t.warehouse_to,
        "voucher_no": t.voucher_no, "reference_no": t.reference_no,
        "operator": t.operator, "remark": t.remark, "created_at": str(t.created_at.date()) if t.created_at else ""
    } for t in items]


@app.post("/api/inventory-transactions")
def create_inventory_transaction(data: InventoryTransactionCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    # 校验商品存在
    item = db.query(InventoryItem).filter(InventoryItem.company_id == company_id, InventoryItem.code == data.item_code).first()
    if not item:
        raise HTTPException(400, detail=f"商品 {data.item_code} 不存在")
    qty = data.quantity
    total = round(abs(qty) * data.unit_price, 2)
    trans = InventoryTransaction(
        company_id=company_id, item_code=data.item_code,
        transaction_date=data.transaction_date, trans_type=data.trans_type,
        quantity=qty, unit_price=data.unit_price, total_amount=total,
        warehouse=data.warehouse, warehouse_to=data.warehouse_to,
        voucher_no=data.voucher_no, reference_no=data.reference_no,
        operator=data.operator, remark=data.remark
    )
    db.add(trans)
    # 更新库存
    if data.trans_type in ("入库", "调拨入", "盘盈", "其他"):
        item.current_stock += qty
    elif data.trans_type in ("出库", "调拨出", "盘亏"):
        item.current_stock -= qty
        if item.current_stock < 0:
            item.current_stock += qty
            raise HTTPException(400, detail=f"库存不足，当前库存: {item.current_stock}")
    item.updated_at = datetime.now()
    db.commit()
    db.refresh(trans)
    return {"id": trans.id, "message": f"{data.trans_type}成功，当前库存: {item.current_stock}"}


# ==================== 合同管理 ====================

class ContractCreate(BaseModel):
    contract_no: str
    name: str
    contract_type: str
    party_a: Optional[str] = None
    party_b: Optional[str] = None
    amount: float = 0.0
    signing_date: Optional[date] = None
    effective_date: Optional[date] = None
    expiry_date: Optional[date] = None
    status: str = "起草中"
    responsible_person: Optional[str] = None
    dept_code: Optional[str] = None
    content_summary: Optional[str] = None
    remark: Optional[str] = None


class ContractUpdate(BaseModel):
    name: Optional[str] = None
    contract_type: Optional[str] = None
    party_a: Optional[str] = None
    party_b: Optional[str] = None
    amount: Optional[float] = None
    signing_date: Optional[date] = None
    effective_date: Optional[date] = None
    expiry_date: Optional[date] = None
    status: Optional[str] = None
    responsible_person: Optional[str] = None
    content_summary: Optional[str] = None
    remark: Optional[str] = None


class ContractPaymentCreate(BaseModel):
    payment_no: int = 1
    payment_type: str
    amount: float
    due_date: Optional[date] = None
    remark: Optional[str] = None


@app.get("/api/contracts")
def list_contracts(
    company_id: int = Query(1),
    contract_type: Optional[str] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(Contract).filter(Contract.company_id == company_id)
    if contract_type:
        q = q.filter(Contract.contract_type == contract_type)
    if status:
        q = q.filter(Contract.status == status)
    if keyword:
        q = q.filter(or_(Contract.contract_no.contains(keyword), Contract.name.contains(keyword)))
    contracts = q.order_by(Contract.signing_date.desc()).all()
    return [{
        "id": c.id, "contract_no": c.contract_no, "name": c.name,
        "contract_type": c.contract_type, "party_a": c.party_a, "party_b": c.party_b,
        "amount": c.amount, "signing_date": str(c.signing_date) if c.signing_date else "",
        "effective_date": str(c.effective_date) if c.effective_date else "",
        "expiry_date": str(c.expiry_date) if c.expiry_date else "",
        "status": c.status, "responsible_person": c.responsible_person,
        "dept_code": c.dept_code, "content_summary": c.content_summary, "remark": c.remark
    } for c in contracts]


@app.post("/api/contracts")
def create_contract(data: ContractCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    if db.query(Contract).filter(Contract.company_id == company_id, Contract.contract_no == data.contract_no).first():
        raise HTTPException(400, detail=f"合同编号 {data.contract_no} 已存在")
    contract = Contract(company_id=company_id, **data.model_dump())
    db.add(contract)
    db.commit()
    db.refresh(contract)
    return {"id": contract.id, "contract_no": contract.contract_no, "message": "合同创建成功"}


@app.put("/api/contracts/{contract_id}")
def update_contract(contract_id: int, data: ContractUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    c = db.query(Contract).filter(Contract.company_id == company_id, Contract.id == contract_id).first()
    if not c:
        raise HTTPException(404, detail="合同不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    c.updated_at = datetime.now()
    db.commit()
    return {"message": "更新成功"}


@app.delete("/api/contracts/{contract_id}")
def delete_contract(contract_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    c = db.query(Contract).filter(Contract.company_id == company_id, Contract.id == contract_id).first()
    if not c:
        raise HTTPException(404, detail="合同不存在")
    if c.status in ("履行中", "已签署"):
        raise HTTPException(400, detail=f"合同状态为'{c.status}'，不能删除")
    db.delete(c)
    db.commit()
    return {"message": "删除成功"}


@app.get("/api/contracts/{contract_id}/payments")
def get_contract_payments(contract_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    payments = db.query(ContractPayment).filter(
        ContractPayment.company_id == company_id,
        ContractPayment.contract_id == contract_id
    ).order_by(ContractPayment.payment_no).all()
    return [{
        "id": p.id, "payment_no": p.payment_no, "payment_type": p.payment_type,
        "amount": p.amount, "due_date": str(p.due_date) if p.due_date else "",
        "paid_date": str(p.paid_date) if p.paid_date else "",
        "paid_amount": p.paid_amount, "status": p.status, "remark": p.remark
    } for p in payments]


@app.post("/api/contracts/{contract_id}/payments")
def add_contract_payment(contract_id: int, data: ContractPaymentCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    c = db.query(Contract).filter(Contract.company_id == company_id, Contract.id == contract_id).first()
    if not c:
        raise HTTPException(404, detail="合同不存在")
    payment = ContractPayment(
        company_id=company_id, contract_id=contract_id,
        payment_no=data.payment_no, payment_type=data.payment_type,
        amount=data.amount, due_date=data.due_date, remark=data.remark
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return {"id": payment.id, "message": "付款计划添加成功"}


# ==================== 付款管理 ====================

class PaymentCreate(BaseModel):
    payment_type: str = "外部单位"
    scenario: Optional[str] = None
    payment_no: str
    payment_date: date
    employee_id: Optional[int] = None
    employee_name: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    contract_id: Optional[int] = None
    contract_no: Optional[str] = None
    amount: float
    payment_method: str = "银行转账"
    payee: Optional[str] = None
    payee_account: Optional[str] = None
    payee_bank: Optional[str] = None
    department: Optional[str] = None
    purpose: Optional[str] = None
    remark: Optional[str] = None


class PaymentUpdate(BaseModel):
    payment_type: Optional[str] = None
    scenario: Optional[str] = None
    employee_id: Optional[int] = None
    employee_name: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    contract_id: Optional[int] = None
    contract_no: Optional[str] = None
    amount: Optional[float] = None
    payment_method: Optional[str] = None
    payee: Optional[str] = None
    payee_account: Optional[str] = None
    payee_bank: Optional[str] = None
    status: Optional[str] = None
    approved_by: Optional[str] = None
    department: Optional[str] = None
    purpose: Optional[str] = None
    remark: Optional[str] = None


@app.get("/api/payments")
def list_payments(
    company_id: int = Query(1),
    payment_type: Optional[str] = None,
    status: Optional[str] = None,
    supplier_id: Optional[int] = None,
    keyword: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(Payment).filter(Payment.company_id == company_id)
    if payment_type:
        q = q.filter(Payment.payment_type == payment_type)
    if status:
        q = q.filter(Payment.status == status)
    if supplier_id:
        q = q.filter(Payment.supplier_id == supplier_id)
    if keyword:
        q = q.filter(or_(
            Payment.payment_no.contains(keyword),
            Payment.supplier_name.contains(keyword),
            Payment.employee_name.contains(keyword),
            Payment.payee.contains(keyword),
            Payment.purpose.contains(keyword)
        ))
    payments = q.order_by(Payment.payment_date.desc()).all()
    return [{
        "id": p.id, "payment_type": p.payment_type, "scenario": p.scenario or "",
        "payment_no": p.payment_no,
        "payment_date": str(p.payment_date) if p.payment_date else "",
        "employee_id": p.employee_id, "employee_name": p.employee_name or "",
        "supplier_id": p.supplier_id, "supplier_name": p.supplier_name or "",
        "contract_id": p.contract_id, "contract_no": p.contract_no or "",
        "amount": p.amount, "payment_method": p.payment_method,
        "payee": p.payee or "", "payee_account": p.payee_account or "",
        "payee_bank": p.payee_bank or "", "status": p.status,
        "approved_by": p.approved_by or "",
        "approved_at": str(p.approved_at) if p.approved_at else "",
        "paid_at": str(p.paid_at) if p.paid_at else "",
        "department": p.department or "", "purpose": p.purpose or "",
        "remark": p.remark or "",
        "created_at": str(p.created_at) if p.created_at else ""
    } for p in payments]


@app.post("/api/payments")
def create_payment(data: PaymentCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    if db.query(Payment).filter(Payment.company_id == company_id, Payment.payment_no == data.payment_no).first():
        raise HTTPException(400, detail=f"付款单号 {data.payment_no} 已存在")
    payment = Payment(company_id=company_id, **data.model_dump())
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return {"id": payment.id, "payment_no": payment.payment_no, "message": "付款单创建成功"}


@app.get("/api/payments/stats")
def payment_stats(company_id: int = Query(1), db: Session = Depends(get_db)):
    """付款统计"""
    base = db.query(Payment).filter(Payment.company_id == company_id)
    total_count = base.count()
    total_amount = base.with_entities(func.sum(Payment.amount)).scalar() or 0
    
    # 按类型统计
    internal_base = base.filter(Payment.payment_type == "内部人员")
    internal_count = internal_base.count()
    internal_amount = internal_base.with_entities(func.sum(Payment.amount)).scalar() or 0
    
    external_base = base.filter(Payment.payment_type == "外部单位")
    external_count = external_base.count()
    external_amount = external_base.with_entities(func.sum(Payment.amount)).scalar() or 0
    
    pending_count = base.filter(Payment.status == "待审批").count()
    pending_amount = base.filter(Payment.status == "待审批").with_entities(func.sum(Payment.amount)).scalar() or 0
    approved_count = base.filter(Payment.status == "已审批").count()
    paid_count = base.filter(Payment.status == "已付款").count()
    paid_amount = base.filter(Payment.status == "已付款").with_entities(func.sum(Payment.amount)).scalar() or 0
    return {
        "total_count": total_count, "total_amount": total_amount,
        "internal_count": internal_count, "internal_amount": internal_amount,
        "external_count": external_count, "external_amount": external_amount,
        "pending_count": pending_count, "pending_amount": pending_amount,
        "approved_count": approved_count, "paid_count": paid_count,
        "paid_amount": paid_amount
    }


@app.put("/api/payments/{payment_id}")
def update_payment(payment_id: int, data: PaymentUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    p = db.query(Payment).filter(Payment.company_id == company_id, Payment.id == payment_id).first()
    if not p:
        raise HTTPException(404, detail="付款单不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    p.updated_at = datetime.now()
    # 如果状态改为"已付款"，记录付款时间
    if data.status == "已付款":
        p.paid_at = datetime.now()
    db.commit()
    return {"message": "更新成功"}


@app.delete("/api/payments/{payment_id}")
def delete_payment(payment_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    p = db.query(Payment).filter(Payment.company_id == company_id, Payment.id == payment_id).first()
    if not p:
        raise HTTPException(404, detail="付款单不存在")
    if p.status in ("已审批", "已付款"):
        raise HTTPException(400, detail=f"付款单状态为'{p.status}'，不能删除")
    db.delete(p)
    db.commit()
    return {"message": "删除成功"}


# ==================== 开具发票（销售发票）====================

class SalesInvoiceCreate(BaseModel):
    invoice_code: Optional[str] = None
    invoice_no: str
    digital_invoice_no: Optional[str] = None
    seller_tax_no: Optional[str] = None
    seller_name: Optional[str] = None
    buyer_tax_no: Optional[str] = None
    buyer_name: Optional[str] = None
    invoice_date: date
    tax_category_code: Optional[str] = None
    specific_business_type: Optional[str] = None
    goods_name: Optional[str] = None
    spec: Optional[str] = None
    unit: Optional[str] = None
    quantity: Optional[float] = 0
    unit_price: Optional[float] = 0
    amount: float = 0.0
    tax_rate: Optional[float] = 0.0
    tax_amount: Optional[float] = 0.0
    total_amount: Optional[float] = 0.0
    invoice_source: Optional[str] = None
    invoice_category: str = "增值税专用发票"
    status: str = "正常"
    is_positive: Optional[bool] = True
    invoice_risk_level: Optional[str] = None
    issuer: Optional[str] = None
    remark: Optional[str] = None


class SalesInvoiceUpdate(BaseModel):
    invoice_code: Optional[str] = None
    digital_invoice_no: Optional[str] = None
    seller_tax_no: Optional[str] = None
    seller_name: Optional[str] = None
    buyer_tax_no: Optional[str] = None
    buyer_name: Optional[str] = None
    invoice_date: Optional[date] = None
    tax_category_code: Optional[str] = None
    specific_business_type: Optional[str] = None
    goods_name: Optional[str] = None
    spec: Optional[str] = None
    unit: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    amount: Optional[float] = None
    tax_rate: Optional[float] = None
    tax_amount: Optional[float] = None
    total_amount: Optional[float] = None
    invoice_source: Optional[str] = None
    invoice_category: Optional[str] = None
    status: Optional[str] = None
    is_positive: Optional[bool] = None
    invoice_risk_level: Optional[str] = None
    issuer: Optional[str] = None
    remark: Optional[str] = None


@app.get("/api/sales-invoices")
def list_sales_invoices(
    company_id: int = Query(1),
    invoice_category: Optional[str] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(SalesInvoice).filter(SalesInvoice.company_id == company_id)
    if invoice_category:
        q = q.filter(SalesInvoice.invoice_category == invoice_category)
    if status:
        q = q.filter(SalesInvoice.status == status)
    if date_from:
        q = q.filter(SalesInvoice.invoice_date >= date_from)
    if date_to:
        q = q.filter(SalesInvoice.invoice_date <= date_to)
    if keyword:
        q = q.filter(or_(
            SalesInvoice.invoice_no.contains(keyword),
            SalesInvoice.invoice_code.contains(keyword),
            SalesInvoice.digital_invoice_no.contains(keyword),
            SalesInvoice.buyer_name.contains(keyword),
            SalesInvoice.goods_name.contains(keyword)
        ))
    invoices = q.order_by(SalesInvoice.invoice_date.desc()).all()
    return [{
        "id": inv.id,
        "invoice_code": inv.invoice_code or "",
        "invoice_no": inv.invoice_no,
        "digital_invoice_no": inv.digital_invoice_no or "",
        "seller_tax_no": inv.seller_tax_no or "",
        "seller_name": inv.seller_name or "",
        "buyer_tax_no": inv.buyer_tax_no or "",
        "buyer_name": inv.buyer_name or "",
        "invoice_date": str(inv.invoice_date) if inv.invoice_date else "",
        "tax_category_code": inv.tax_category_code or "",
        "specific_business_type": inv.specific_business_type or "",
        "goods_name": inv.goods_name or "",
        "spec": inv.spec or "",
        "unit": inv.unit or "",
        "quantity": inv.quantity or 0,
        "unit_price": inv.unit_price or 0,
        "amount": inv.amount or 0,
        "tax_rate": inv.tax_rate or 0,
        "tax_amount": inv.tax_amount or 0,
        "total_amount": inv.total_amount or 0,
        "invoice_source": inv.invoice_source or "",
        "invoice_category": inv.invoice_category or "增值税专用发票",
        "status": inv.status,
        "is_positive": inv.is_positive if inv.is_positive is not None else True,
        "invoice_risk_level": inv.invoice_risk_level or "",
        "issuer": inv.issuer or "",
        "remark": inv.remark or "",
        "created_at": str(inv.created_at) if inv.created_at else ""
    } for inv in invoices]


@app.post("/api/sales-invoices")
def create_sales_invoice(data: SalesInvoiceCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    if db.query(SalesInvoice).filter(SalesInvoice.company_id == company_id, SalesInvoice.invoice_no == data.invoice_no).first():
        raise HTTPException(400, detail=f"发票号码 {data.invoice_no} 已存在")
    inv = SalesInvoice(company_id=company_id, **data.model_dump())
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return {"id": inv.id, "invoice_no": inv.invoice_no, "message": "开具发票创建成功"}


@app.get("/api/sales-invoices/stats")
def sales_invoice_stats(company_id: int = Query(1), db: Session = Depends(get_db)):
    base = db.query(SalesInvoice).filter(SalesInvoice.company_id == company_id)
    total_count = base.count()
    total_amount = base.with_entities(func.sum(SalesInvoice.total_amount)).scalar() or 0
    total_tax = base.with_entities(func.sum(SalesInvoice.tax_amount)).scalar() or 0
    normal_count = base.filter(SalesInvoice.status == "正常").count()
    void_count = base.filter(SalesInvoice.status == "作废").count()
    red_count = base.filter(SalesInvoice.status == "红冲").count()
    return {
        "total_count": total_count, "total_amount": round(total_amount, 2),
        "total_tax": round(total_tax, 2),
        "normal_count": normal_count, "void_count": void_count,
        "red_count": red_count
    }


@app.get("/api/sales-invoices/{invoice_id}")
def get_sales_invoice(invoice_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    inv = db.query(SalesInvoice).filter(SalesInvoice.company_id == company_id, SalesInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, detail="发票不存在")
    return {
        "id": inv.id,
        "invoice_code": inv.invoice_code or "",
        "invoice_no": inv.invoice_no,
        "digital_invoice_no": inv.digital_invoice_no or "",
        "seller_tax_no": inv.seller_tax_no or "",
        "seller_name": inv.seller_name or "",
        "buyer_tax_no": inv.buyer_tax_no or "",
        "buyer_name": inv.buyer_name or "",
        "invoice_date": str(inv.invoice_date) if inv.invoice_date else "",
        "tax_category_code": inv.tax_category_code or "",
        "specific_business_type": inv.specific_business_type or "",
        "goods_name": inv.goods_name or "",
        "spec": inv.spec or "",
        "unit": inv.unit or "",
        "quantity": inv.quantity or 0,
        "unit_price": inv.unit_price or 0,
        "amount": inv.amount or 0,
        "tax_rate": inv.tax_rate or 0,
        "tax_amount": inv.tax_amount or 0,
        "total_amount": inv.total_amount or 0,
        "invoice_source": inv.invoice_source or "",
        "invoice_category": inv.invoice_category or "增值税专用发票",
        "status": inv.status,
        "is_positive": inv.is_positive if inv.is_positive is not None else True,
        "invoice_risk_level": inv.invoice_risk_level or "",
        "issuer": inv.issuer or "",
        "remark": inv.remark or "",
        "created_at": str(inv.created_at) if inv.created_at else "",
        "updated_at": str(inv.updated_at) if inv.updated_at else ""
    }


@app.put("/api/sales-invoices/{invoice_id}")
def update_sales_invoice(invoice_id: int, data: SalesInvoiceUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    inv = db.query(SalesInvoice).filter(SalesInvoice.company_id == company_id, SalesInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, detail="发票不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(inv, k, v)
    inv.updated_at = datetime.now()
    db.commit()
    return {"message": "更新成功"}


@app.delete("/api/sales-invoices/{invoice_id}")
def delete_sales_invoice(invoice_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    inv = db.query(SalesInvoice).filter(SalesInvoice.company_id == company_id, SalesInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, detail="发票不存在")
    db.delete(inv)
    db.commit()
    return {"message": "删除成功"}


# ==================== 取得发票（采购发票）====================

class PurchaseInvoiceCreate(BaseModel):
    invoice_code: Optional[str] = None
    invoice_no: str
    digital_invoice_no: Optional[str] = None
    seller_tax_no: Optional[str] = None
    seller_name: Optional[str] = None
    buyer_tax_no: Optional[str] = None
    buyer_name: Optional[str] = None
    invoice_date: date
    tax_category_code: Optional[str] = None
    specific_business_type: Optional[str] = None
    goods_name: Optional[str] = None
    spec: Optional[str] = None
    unit: Optional[str] = None
    quantity: Optional[float] = 0
    unit_price: Optional[float] = 0
    amount: float = 0.0
    tax_rate: Optional[float] = 0.0
    tax_amount: Optional[float] = 0.0
    total_amount: Optional[float] = 0.0
    invoice_source: Optional[str] = None
    invoice_category: str = "增值税专用发票"
    status: str = "正常"
    is_positive: Optional[bool] = True
    invoice_risk_level: Optional[str] = None
    issuer: Optional[str] = None
    certification_status: str = "未认证"
    certification_date: Optional[date] = None
    deduction_period: Optional[str] = None
    remark: Optional[str] = None


class PurchaseInvoiceUpdate(BaseModel):
    invoice_code: Optional[str] = None
    digital_invoice_no: Optional[str] = None
    seller_tax_no: Optional[str] = None
    seller_name: Optional[str] = None
    buyer_tax_no: Optional[str] = None
    buyer_name: Optional[str] = None
    invoice_date: Optional[date] = None
    tax_category_code: Optional[str] = None
    specific_business_type: Optional[str] = None
    goods_name: Optional[str] = None
    spec: Optional[str] = None
    unit: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    amount: Optional[float] = None
    tax_rate: Optional[float] = None
    tax_amount: Optional[float] = None
    total_amount: Optional[float] = None
    invoice_source: Optional[str] = None
    invoice_category: Optional[str] = None
    status: Optional[str] = None
    is_positive: Optional[bool] = None
    invoice_risk_level: Optional[str] = None
    issuer: Optional[str] = None
    certification_status: Optional[str] = None
    certification_date: Optional[date] = None
    deduction_period: Optional[str] = None
    remark: Optional[str] = None


@app.get("/api/purchase-invoices")
def list_purchase_invoices(
    company_id: int = Query(1),
    invoice_category: Optional[str] = None,
    certification_status: Optional[str] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(PurchaseInvoice).filter(PurchaseInvoice.company_id == company_id)
    if invoice_category:
        q = q.filter(PurchaseInvoice.invoice_category == invoice_category)
    if certification_status:
        q = q.filter(PurchaseInvoice.certification_status == certification_status)
    if status:
        q = q.filter(PurchaseInvoice.status == status)
    if date_from:
        q = q.filter(PurchaseInvoice.invoice_date >= date_from)
    if date_to:
        q = q.filter(PurchaseInvoice.invoice_date <= date_to)
    if keyword:
        q = q.filter(or_(
            PurchaseInvoice.invoice_no.contains(keyword),
            PurchaseInvoice.invoice_code.contains(keyword),
            PurchaseInvoice.digital_invoice_no.contains(keyword),
            PurchaseInvoice.seller_name.contains(keyword),
            PurchaseInvoice.goods_name.contains(keyword)
        ))
    invoices = q.order_by(PurchaseInvoice.invoice_date.desc()).all()
    return [{
        "id": inv.id,
        "invoice_code": inv.invoice_code or "",
        "invoice_no": inv.invoice_no,
        "digital_invoice_no": inv.digital_invoice_no or "",
        "seller_tax_no": inv.seller_tax_no or "",
        "seller_name": inv.seller_name or "",
        "buyer_tax_no": inv.buyer_tax_no or "",
        "buyer_name": inv.buyer_name or "",
        "invoice_date": str(inv.invoice_date) if inv.invoice_date else "",
        "tax_category_code": inv.tax_category_code or "",
        "specific_business_type": inv.specific_business_type or "",
        "goods_name": inv.goods_name or "",
        "spec": inv.spec or "",
        "unit": inv.unit or "",
        "quantity": inv.quantity or 0,
        "unit_price": inv.unit_price or 0,
        "amount": inv.amount or 0,
        "tax_rate": inv.tax_rate or 0,
        "tax_amount": inv.tax_amount or 0,
        "total_amount": inv.total_amount or 0,
        "invoice_source": inv.invoice_source or "",
        "invoice_category": inv.invoice_category or "增值税专用发票",
        "status": inv.status,
        "is_positive": inv.is_positive if inv.is_positive is not None else True,
        "invoice_risk_level": inv.invoice_risk_level or "",
        "issuer": inv.issuer or "",
        "certification_status": inv.certification_status,
        "certification_date": str(inv.certification_date) if inv.certification_date else "",
        "deduction_period": inv.deduction_period or "",
        "remark": inv.remark or "",
        "created_at": str(inv.created_at) if inv.created_at else ""
    } for inv in invoices]


@app.post("/api/purchase-invoices")
def create_purchase_invoice(data: PurchaseInvoiceCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    if db.query(PurchaseInvoice).filter(PurchaseInvoice.company_id == company_id, PurchaseInvoice.invoice_no == data.invoice_no).first():
        raise HTTPException(400, detail=f"发票号码 {data.invoice_no} 已存在")
    inv = PurchaseInvoice(company_id=company_id, **data.model_dump())
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return {"id": inv.id, "invoice_no": inv.invoice_no, "message": "取得发票创建成功"}


@app.get("/api/purchase-invoices/stats")
def purchase_invoice_stats(company_id: int = Query(1), db: Session = Depends(get_db)):
    base = db.query(PurchaseInvoice).filter(PurchaseInvoice.company_id == company_id)
    total_count = base.count()
    total_amount = base.with_entities(func.sum(PurchaseInvoice.total_amount)).scalar() or 0
    total_tax = base.with_entities(func.sum(PurchaseInvoice.tax_amount)).scalar() or 0
    uncertified_count = base.filter(PurchaseInvoice.certification_status == "未认证").count()
    certified_count = base.filter(PurchaseInvoice.certification_status == "已认证").count()
    deducted_count = base.filter(PurchaseInvoice.certification_status == "已抵扣").count()
    return {
        "total_count": total_count, "total_amount": round(total_amount, 2),
        "total_tax": round(total_tax, 2),
        "uncertified_count": uncertified_count,
        "certified_count": certified_count,
        "deducted_count": deducted_count
    }


@app.get("/api/purchase-invoices/{invoice_id}")
def get_purchase_invoice(invoice_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    inv = db.query(PurchaseInvoice).filter(PurchaseInvoice.company_id == company_id, PurchaseInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, detail="发票不存在")
    return {
        "id": inv.id,
        "invoice_code": inv.invoice_code or "",
        "invoice_no": inv.invoice_no,
        "digital_invoice_no": inv.digital_invoice_no or "",
        "seller_tax_no": inv.seller_tax_no or "",
        "seller_name": inv.seller_name or "",
        "buyer_tax_no": inv.buyer_tax_no or "",
        "buyer_name": inv.buyer_name or "",
        "invoice_date": str(inv.invoice_date) if inv.invoice_date else "",
        "tax_category_code": inv.tax_category_code or "",
        "specific_business_type": inv.specific_business_type or "",
        "goods_name": inv.goods_name or "",
        "spec": inv.spec or "",
        "unit": inv.unit or "",
        "quantity": inv.quantity or 0,
        "unit_price": inv.unit_price or 0,
        "amount": inv.amount or 0,
        "tax_rate": inv.tax_rate or 0,
        "tax_amount": inv.tax_amount or 0,
        "total_amount": inv.total_amount or 0,
        "invoice_source": inv.invoice_source or "",
        "invoice_category": inv.invoice_category or "增值税专用发票",
        "status": inv.status,
        "is_positive": inv.is_positive if inv.is_positive is not None else True,
        "invoice_risk_level": inv.invoice_risk_level or "",
        "issuer": inv.issuer or "",
        "certification_status": inv.certification_status,
        "certification_date": str(inv.certification_date) if inv.certification_date else "",
        "deduction_period": inv.deduction_period or "",
        "remark": inv.remark or "",
        "created_at": str(inv.created_at) if inv.created_at else "",
        "updated_at": str(inv.updated_at) if inv.updated_at else ""
    }


@app.put("/api/purchase-invoices/{invoice_id}")
def update_purchase_invoice(invoice_id: int, data: PurchaseInvoiceUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    inv = db.query(PurchaseInvoice).filter(PurchaseInvoice.company_id == company_id, PurchaseInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, detail="发票不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(inv, k, v)
    inv.updated_at = datetime.now()
    db.commit()
    return {"message": "更新成功"}


@app.delete("/api/purchase-invoices/{invoice_id}")
def delete_purchase_invoice(invoice_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    inv = db.query(PurchaseInvoice).filter(PurchaseInvoice.company_id == company_id, PurchaseInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, detail="发票不存在")
    db.delete(inv)
    db.commit()
    return {"message": "删除成功"}


import json

# ==================== 银行配置 ====================

class BankConfigCreate(BaseModel):
    bank_name: str
    account_number: Optional[str] = None
    account_name: Optional[str] = None
    column_mapping: Optional[str] = None  # JSON string

class BankConfigUpdate(BaseModel):
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_name: Optional[str] = None
    column_mapping: Optional[str] = None
    is_active: Optional[bool] = None


@app.get("/api/bank-configs")
def list_bank_configs(company_id: int = Query(1), db: Session = Depends(get_db)):
    configs = db.query(BankConfig).filter(
        BankConfig.company_id == company_id, BankConfig.is_active == True
    ).order_by(BankConfig.bank_name).all()
    return [{
        "id": c.id, "bank_name": c.bank_name,
        "account_number": c.account_number or "",
        "account_name": c.account_name or "",
        "column_mapping": c.column_mapping or "{}",
        "created_at": str(c.created_at) if c.created_at else ""
    } for c in configs]


@app.post("/api/bank-configs")
def create_bank_config(data: BankConfigCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    cfg = BankConfig(company_id=company_id, **data.model_dump())
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return {"id": cfg.id, "message": "银行配置创建成功"}


@app.put("/api/bank-configs/{config_id}")
def update_bank_config(config_id: int, data: BankConfigUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    cfg = db.query(BankConfig).filter(BankConfig.company_id == company_id, BankConfig.id == config_id).first()
    if not cfg:
        raise HTTPException(404, detail="银行配置不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(cfg, k, v)
    cfg.updated_at = datetime.now()
    db.commit()
    return {"message": "更新成功"}


@app.delete("/api/bank-configs/{config_id}")
def delete_bank_config(config_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    cfg = db.query(BankConfig).filter(BankConfig.company_id == company_id, BankConfig.id == config_id).first()
    if not cfg:
        raise HTTPException(404, detail="银行配置不存在")
    cfg.is_active = False
    db.commit()
    return {"message": "已停用"}


# ==================== 银行流水 ====================

class BankTransactionCreate(BaseModel):
    bank_config_id: Optional[int] = None
    transaction_date: date
    amount: float = 0.0
    balance: Optional[float] = 0.0
    counterparty_name: Optional[str] = None
    counterparty_account: Optional[str] = None
    counterparty_bank: Optional[str] = None
    summary: Optional[str] = None
    transaction_type: str = "支出"
    payment_method: Optional[str] = None
    voucher_no: Optional[str] = None
    reference_no: Optional[str] = None
    raw_data: Optional[str] = None
    remark: Optional[str] = None


class BankTransactionUpdate(BaseModel):
    bank_config_id: Optional[int] = None
    transaction_date: Optional[date] = None
    amount: Optional[float] = None
    balance: Optional[float] = None
    counterparty_name: Optional[str] = None
    counterparty_account: Optional[str] = None
    counterparty_bank: Optional[str] = None
    summary: Optional[str] = None
    transaction_type: Optional[str] = None
    payment_method: Optional[str] = None
    voucher_no: Optional[str] = None
    reference_no: Optional[str] = None
    raw_data: Optional[str] = None
    remark: Optional[str] = None


@app.get("/api/bank-transactions")
def list_bank_transactions(
    company_id: int = Query(1),
    bank_config_id: Optional[int] = None,
    transaction_type: Optional[str] = None,
    keyword: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(BankTransaction).filter(BankTransaction.company_id == company_id)
    if bank_config_id:
        q = q.filter(BankTransaction.bank_config_id == bank_config_id)
    if transaction_type:
        q = q.filter(BankTransaction.transaction_type == transaction_type)
    if date_from:
        q = q.filter(BankTransaction.transaction_date >= date_from)
    if date_to:
        q = q.filter(BankTransaction.transaction_date <= date_to)
    if keyword:
        q = q.filter(or_(
            BankTransaction.counterparty_name.contains(keyword),
            BankTransaction.summary.contains(keyword),
            BankTransaction.reference_no.contains(keyword)
        ))
    txs = q.order_by(BankTransaction.transaction_date.desc(), BankTransaction.id.desc()).all()
    return [{
        "id": tx.id, "bank_config_id": tx.bank_config_id,
        "transaction_date": str(tx.transaction_date) if tx.transaction_date else "",
        "amount": tx.amount or 0, "balance": tx.balance or 0,
        "counterparty_name": tx.counterparty_name or "",
        "counterparty_account": tx.counterparty_account or "",
        "counterparty_bank": tx.counterparty_bank or "",
        "summary": tx.summary or "",
        "transaction_type": tx.transaction_type,
        "payment_method": tx.payment_method or "",
        "voucher_no": tx.voucher_no or "",
        "reference_no": tx.reference_no or "",
        "raw_data": tx.raw_data or "{}",
        "remark": tx.remark or "",
        "created_at": str(tx.created_at) if tx.created_at else ""
    } for tx in txs]


@app.post("/api/bank-transactions")
def create_bank_transaction(data: BankTransactionCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    tx = BankTransaction(company_id=company_id, **data.model_dump())
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return {"id": tx.id, "message": "银行流水创建成功"}


@app.get("/api/bank-transactions/stats")
def bank_transaction_stats(
    company_id: int = Query(1),
    bank_config_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    base = db.query(BankTransaction).filter(BankTransaction.company_id == company_id)
    if bank_config_id:
        base = base.filter(BankTransaction.bank_config_id == bank_config_id)
    if date_from:
        base = base.filter(BankTransaction.transaction_date >= date_from)
    if date_to:
        base = base.filter(BankTransaction.transaction_date <= date_to)

    total_count = base.count()
    income_base = base.filter(BankTransaction.transaction_type == "收入")
    expense_base = base.filter(BankTransaction.transaction_type == "支出")

    total_income = income_base.with_entities(func.sum(BankTransaction.amount)).scalar() or 0
    total_expense = expense_base.with_entities(func.sum(func.abs(BankTransaction.amount))).scalar() or 0
    income_count = income_base.count()
    expense_count = expense_base.count()

    # 最新余额（取最后一条）
    last_tx = base.order_by(BankTransaction.transaction_date.desc(), BankTransaction.id.desc()).first()
    last_balance = last_tx.balance if last_tx else 0

    return {
        "total_count": total_count,
        "total_income": round(total_income, 2),
        "total_expense": round(total_expense, 2),
        "income_count": income_count,
        "expense_count": expense_count,
        "last_balance": round(last_balance, 2)
    }


@app.get("/api/bank-transactions/{tx_id}")
def get_bank_transaction(tx_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    tx = db.query(BankTransaction).filter(BankTransaction.company_id == company_id, BankTransaction.id == tx_id).first()
    if not tx:
        raise HTTPException(404, detail="流水记录不存在")
    return {
        "id": tx.id, "bank_config_id": tx.bank_config_id,
        "transaction_date": str(tx.transaction_date) if tx.transaction_date else "",
        "amount": tx.amount or 0, "balance": tx.balance or 0,
        "counterparty_name": tx.counterparty_name or "",
        "counterparty_account": tx.counterparty_account or "",
        "counterparty_bank": tx.counterparty_bank or "",
        "summary": tx.summary or "",
        "transaction_type": tx.transaction_type,
        "payment_method": tx.payment_method or "",
        "voucher_no": tx.voucher_no or "",
        "reference_no": tx.reference_no or "",
        "raw_data": tx.raw_data or "{}",
        "remark": tx.remark or "",
        "created_at": str(tx.created_at) if tx.created_at else ""
    }


@app.put("/api/bank-transactions/{tx_id}")
def update_bank_transaction(tx_id: int, data: BankTransactionUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    tx = db.query(BankTransaction).filter(BankTransaction.company_id == company_id, BankTransaction.id == tx_id).first()
    if not tx:
        raise HTTPException(404, detail="流水记录不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(tx, k, v)
    db.commit()
    return {"message": "更新成功"}


@app.delete("/api/bank-transactions/{tx_id}")
def delete_bank_transaction(tx_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    tx = db.query(BankTransaction).filter(BankTransaction.company_id == company_id, BankTransaction.id == tx_id).first()
    if not tx:
        raise HTTPException(404, detail="流水记录不存在")
    db.delete(tx)
    db.commit()
    return {"message": "删除成功"}


# ==================== 进项抵扣 ====================

class InputVATDeductionCreate(BaseModel):
    purchase_invoice_id: Optional[int] = None
    invoice_no: Optional[str] = None
    invoice_code: Optional[str] = None
    invoice_date: Optional[date] = None
    seller_name: Optional[str] = None
    goods_name: Optional[str] = None
    total_amount: float = 0.0
    tax_amount: float = 0.0
    tax_rate: Optional[float] = 0.0
    deductible_tax_amount: float = 0.0
    deducted_tax_amount: Optional[float] = 0.0
    deduction_period: Optional[str] = None
    deduction_status: str = "待抵扣"
    certification_date: Optional[date] = None
    deduction_date: Optional[date] = None
    deduction_method: str = "凭票抵扣"
    voucher_no: Optional[str] = None
    remark: Optional[str] = None


class InputVATDeductionUpdate(BaseModel):
    deductible_tax_amount: Optional[float] = None
    deducted_tax_amount: Optional[float] = None
    deduction_period: Optional[str] = None
    deduction_status: Optional[str] = None
    certification_date: Optional[date] = None
    deduction_date: Optional[date] = None
    deduction_method: Optional[str] = None
    voucher_no: Optional[str] = None
    remark: Optional[str] = None


@app.get("/api/input-vat-deductions")
def list_input_vat_deductions(
    company_id: int = Query(1),
    deduction_status: Optional[str] = None,
    deduction_period: Optional[str] = None,
    keyword: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(InputVATDeduction).filter(InputVATDeduction.company_id == company_id)
    if deduction_status:
        q = q.filter(InputVATDeduction.deduction_status == deduction_status)
    if deduction_period:
        q = q.filter(InputVATDeduction.deduction_period == deduction_period)
    if date_from:
        q = q.filter(InputVATDeduction.invoice_date >= date_from)
    if date_to:
        q = q.filter(InputVATDeduction.invoice_date <= date_to)
    if keyword:
        q = q.filter(or_(
            InputVATDeduction.invoice_no.contains(keyword),
            InputVATDeduction.seller_name.contains(keyword),
            InputVATDeduction.goods_name.contains(keyword)
        ))
    items = q.order_by(InputVATDeduction.deduction_period.desc(), InputVATDeduction.invoice_date.desc()).all()
    return [{
        "id": it.id, "purchase_invoice_id": it.purchase_invoice_id,
        "invoice_no": it.invoice_no or "", "invoice_code": it.invoice_code or "",
        "invoice_date": str(it.invoice_date) if it.invoice_date else "",
        "seller_name": it.seller_name or "", "goods_name": it.goods_name or "",
        "total_amount": it.total_amount or 0, "tax_amount": it.tax_amount or 0,
        "tax_rate": it.tax_rate or 0,
        "deductible_tax_amount": it.deductible_tax_amount or 0,
        "deducted_tax_amount": it.deducted_tax_amount or 0,
        "deduction_period": it.deduction_period or "",
        "deduction_status": it.deduction_status,
        "certification_date": str(it.certification_date) if it.certification_date else "",
        "deduction_date": str(it.deduction_date) if it.deduction_date else "",
        "deduction_method": it.deduction_method,
        "voucher_no": it.voucher_no or "", "remark": it.remark or "",
        "created_at": str(it.created_at) if it.created_at else ""
    } for it in items]


@app.post("/api/input-vat-deductions")
def create_input_vat_deduction(data: InputVATDeductionCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    item = InputVATDeduction(company_id=company_id, **data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "message": "进项抵扣记录创建成功"}


@app.get("/api/input-vat-deductions/stats")
def input_vat_deduction_stats(company_id: int = Query(1), db: Session = Depends(get_db)):
    base = db.query(InputVATDeduction).filter(InputVATDeduction.company_id == company_id)
    total_count = base.count()
    total_tax = base.with_entities(func.sum(InputVATDeduction.tax_amount)).scalar() or 0
    total_deductible = base.with_entities(func.sum(InputVATDeduction.deductible_tax_amount)).scalar() or 0
    total_deducted = base.with_entities(func.sum(InputVATDeduction.deducted_tax_amount)).scalar() or 0
    pending_count = base.filter(InputVATDeduction.deduction_status.in_(["待认证", "待抵扣"])).count()
    deducted_count = base.filter(InputVATDeduction.deduction_status == "已抵扣").count()
    not_deductible_count = base.filter(InputVATDeduction.deduction_status == "不得抵扣").count()
    return {
        "total_count": total_count,
        "total_tax": round(total_tax, 2),
        "total_deductible": round(total_deductible, 2),
        "total_deducted": round(total_deducted, 2),
        "pending_count": pending_count,
        "deducted_count": deducted_count,
        "not_deductible_count": not_deductible_count
    }


@app.get("/api/input-vat-deductions/{item_id}")
def get_input_vat_deduction(item_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    it = db.query(InputVATDeduction).filter(InputVATDeduction.company_id == company_id, InputVATDeduction.id == item_id).first()
    if not it:
        raise HTTPException(404, detail="抵扣记录不存在")
    return {
        "id": it.id, "purchase_invoice_id": it.purchase_invoice_id,
        "invoice_no": it.invoice_no or "", "invoice_code": it.invoice_code or "",
        "invoice_date": str(it.invoice_date) if it.invoice_date else "",
        "seller_name": it.seller_name or "", "goods_name": it.goods_name or "",
        "total_amount": it.total_amount or 0, "tax_amount": it.tax_amount or 0,
        "tax_rate": it.tax_rate or 0,
        "deductible_tax_amount": it.deductible_tax_amount or 0,
        "deducted_tax_amount": it.deducted_tax_amount or 0,
        "deduction_period": it.deduction_period or "",
        "deduction_status": it.deduction_status,
        "certification_date": str(it.certification_date) if it.certification_date else "",
        "deduction_date": str(it.deduction_date) if it.deduction_date else "",
        "deduction_method": it.deduction_method,
        "voucher_no": it.voucher_no or "", "remark": it.remark or "",
        "created_at": str(it.created_at) if it.created_at else "",
        "updated_at": str(it.updated_at) if it.updated_at else ""
    }


@app.put("/api/input-vat-deductions/{item_id}")
def update_input_vat_deduction(item_id: int, data: InputVATDeductionUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    it = db.query(InputVATDeduction).filter(InputVATDeduction.company_id == company_id, InputVATDeduction.id == item_id).first()
    if not it:
        raise HTTPException(404, detail="抵扣记录不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(it, k, v)
    it.updated_at = datetime.now()
    db.commit()
    return {"message": "更新成功"}


@app.delete("/api/input-vat-deductions/{item_id}")
def delete_input_vat_deduction(item_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    it = db.query(InputVATDeduction).filter(InputVATDeduction.company_id == company_id, InputVATDeduction.id == item_id).first()
    if not it:
        raise HTTPException(404, detail="抵扣记录不存在")
    db.delete(it)
    db.commit()
    return {"message": "删除成功"}


# ==================== 列映射模板 ====================

class ColumnTemplateCreate(BaseModel):
    module: str
    template_name: str
    bank_config_id: Optional[int] = None
    column_mapping: Optional[str] = None
    is_default: bool = False


class ColumnTemplateUpdate(BaseModel):
    template_name: Optional[str] = None
    column_mapping: Optional[str] = None
    is_default: Optional[bool] = None


@app.get("/api/column-templates")
def list_column_templates(
    company_id: int = Query(1),
    module: Optional[str] = None,
    bank_config_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    q = db.query(ColumnTemplate).filter(ColumnTemplate.company_id == company_id)
    if module:
        q = q.filter(ColumnTemplate.module == module)
    if bank_config_id is not None:
        q = q.filter(ColumnTemplate.bank_config_id == bank_config_id)
    templates = q.order_by(ColumnTemplate.module, ColumnTemplate.template_name).all()
    return [{
        "id": t.id, "module": t.module, "template_name": t.template_name,
        "bank_config_id": t.bank_config_id,
        "column_mapping": t.column_mapping or "{}",
        "is_default": t.is_default,
        "created_at": str(t.created_at) if t.created_at else ""
    } for t in templates]


@app.post("/api/column-templates")
def create_column_template(data: ColumnTemplateCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    tpl = ColumnTemplate(company_id=company_id, **data.model_dump())
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return {"id": tpl.id, "message": "模板创建成功"}


@app.put("/api/column-templates/{tpl_id}")
def update_column_template(tpl_id: int, data: ColumnTemplateUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    tpl = db.query(ColumnTemplate).filter(ColumnTemplate.company_id == company_id, ColumnTemplate.id == tpl_id).first()
    if not tpl:
        raise HTTPException(404, detail="模板不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(tpl, k, v)
    tpl.updated_at = datetime.now()
    db.commit()
    return {"message": "更新成功"}


@app.delete("/api/column-templates/{tpl_id}")
def delete_column_template(tpl_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    tpl = db.query(ColumnTemplate).filter(ColumnTemplate.company_id == company_id, ColumnTemplate.id == tpl_id).first()
    if not tpl:
        raise HTTPException(404, detail="模板不存在")
    db.delete(tpl)
    db.commit()
    return {"message": "删除成功"}


# ==================== 文件上传 - 表头分析 ====================

@app.post("/api/file/analyze-headers")
async def analyze_file_headers(
    file: UploadFile = File(...),
    module: str = Form("bank-transaction"),
    bank_config_id: Optional[int] = Form(None)
):
    """上传文件，返回表头列表供用户做列映射"""
    try:
        content_bytes = await file.read()
        fname = file.filename or "unknown"
        ext = os.path.splitext(fname)[1].lower()

        headers = []
        preview_rows = []

        if ext in (".xlsx", ".xls"):
            wb = openpyxl.load_workbook(io.BytesIO(content_bytes), data_only=True)
            ws = wb.active
            # 第一行作为表头
            for col in range(1, ws.max_column + 1):
                cell = ws.cell(row=1, column=col)
                headers.append(str(cell.value).strip() if cell.value is not None else f"列{col}")
            # 预览前3行
            for row in range(2, min(ws.max_row + 1, 5)):
                vals = {}
                for col in range(1, ws.max_column + 1):
                    cell = ws.cell(row=row, column=col)
                    vals[headers[col - 1]] = str(cell.value) if cell.value is not None else ""
                preview_rows.append(vals)
            total_rows = ws.max_row - 1
        elif ext == ".csv":
            text = content_bytes.decode("utf-8-sig")
            reader = csv.reader(io.StringIO(text))
            rows = list(reader)
            if rows:
                headers = [h.strip() for h in rows[0]]
                for row in rows[1:4]:
                    vals = {}
                    for i, h in enumerate(headers):
                        vals[h] = row[i] if i < len(row) else ""
                    preview_rows.append(vals)
                total_rows = len(rows) - 1
            else:
                headers, total_rows = [], 0
        else:
            return {"error": f"不支持的文件格式：{ext}。请上传 xlsx 或 csv 文件。"}

        # 获取已知的列映射模板
        field_groups = {}
        if module == "sales-invoice":
            field_groups = {
                "发票信息": ["invoice_code", "invoice_no", "digital_invoice_no", "invoice_date", "invoice_category", "status", "is_positive", "invoice_risk_level", "invoice_source"],
                "销方信息": ["seller_tax_no", "seller_name"],
                "购方信息": ["buyer_tax_no", "buyer_name"],
                "分类": ["tax_category_code", "specific_business_type"],
                "货物明细": ["goods_name", "spec", "unit", "quantity", "unit_price"],
                "金额": ["amount", "tax_rate", "tax_amount", "total_amount"],
                "其他": ["issuer", "remark"]
            }
        elif module == "purchase-invoice":
            field_groups = {
                "发票信息": ["invoice_code", "invoice_no", "digital_invoice_no", "invoice_date", "invoice_category", "status", "is_positive", "invoice_risk_level", "invoice_source"],
                "销方信息": ["seller_tax_no", "seller_name"],
                "购方信息": ["buyer_tax_no", "buyer_name"],
                "分类": ["tax_category_code", "specific_business_type"],
                "货物明细": ["goods_name", "spec", "unit", "quantity", "unit_price"],
                "金额": ["amount", "tax_rate", "tax_amount", "total_amount"],
                "认证信息": ["certification_status", "certification_date", "deduction_period"],
                "其他": ["issuer", "remark"]
            }
        elif module == "bank-transaction":
            field_groups = {
                "核心字段": ["transaction_date", "amount", "balance", "summary", "transaction_type"],
                "对方信息": ["counterparty_name", "counterparty_account", "counterparty_bank"],
                "交易信息": ["payment_method", "reference_no", "voucher_no"],
                "其他": ["remark"]
            }

        return {
            "file_name": fname,
            "headers": headers,
            "preview_rows": preview_rows,
            "total_rows": total_rows,
            "module": module,
            "field_groups": field_groups
        }
    except Exception as e:
        return {"error": f"文件分析失败：{str(e)}"}


@app.post("/api/file/import-with-mapping")
async def import_file_with_mapping(
    file: UploadFile = File(...),
    module: str = Form("bank-transaction"),
    bank_config_id: Optional[int] = Form(None),
    column_mapping: str = Form(...),  # JSON: {标准字段: 文件列名}
    company_id: int = Form(1),
    db: Session = Depends(get_db)
):
    """根据列映射导入文件数据"""
    try:
        content_bytes = await file.read()
        ext = os.path.splitext(file.filename or "unknown")[1].lower()
        mapping = json.loads(column_mapping)

        # 读取数据行
        rows_data = []
        if ext in (".xlsx", ".xls"):
            wb = openpyxl.load_workbook(io.BytesIO(content_bytes), data_only=True)
            ws = wb.active
            headers_file = []
            for col in range(1, ws.max_column + 1):
                cell = ws.cell(row=1, column=col)
                headers_file.append(str(cell.value).strip() if cell.value is not None else f"列{col}")
            for row in range(2, ws.max_row + 1):
                row_dict = {}
                for col in range(1, ws.max_column + 1):
                    cell = ws.cell(row=row, column=col)
                    row_dict[headers_file[col - 1]] = str(cell.value) if cell.value is not None else ""
                # 跳过完全空行
                if any(v.strip() for v in row_dict.values()):
                    rows_data.append(row_dict)
        elif ext == ".csv":
            text = content_bytes.decode("utf-8-sig")
            reader = csv.reader(io.StringIO(text))
            all_rows = list(reader)
            if all_rows:
                headers_file = [h.strip() for h in all_rows[0]]
                for row in all_rows[1:]:
                    row_dict = {}
                    for i, h in enumerate(headers_file):
                        row_dict[h] = row[i] if i < len(row) else ""
                    if any(v.strip() for v in row_dict.values()):
                        rows_data.append(row_dict)

        # 根据映射转换并导入
        imported = 0
        errors = []
        for i, row in enumerate(rows_data):
            try:
                mapped = {}
                extra = {}
                for std_field, file_col in mapping.items():
                    if file_col and file_col in row:
                        mapped[std_field] = row[file_col].strip()

                # 收集额外列（未映射的）
                for col_name, val in row.items():
                    if col_name not in mapping.values():
                        extra[col_name] = val.strip()

                if module == "bank-transaction":
                    # 解析日期
                    tx_date = None
                    date_str = mapped.get("transaction_date", "")
                    if date_str:
                        for fmt in ["%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y%m%d", "%m/%d/%Y"]:
                            try:
                                tx_date = datetime.strptime(date_str, fmt).date()
                                break
                            except: pass
                    if not tx_date:
                        errors.append(f"第{i+2}行: 无法解析日期")
                        continue

                    # 解析金额
                    amount = 0.0
                    amt_str = mapped.get("amount", "0").replace(",", "").replace("￥", "").replace("¥", "")
                    try: amount = float(amt_str) if amt_str else 0.0
                    except: amount = 0.0

                    tx_type = mapped.get("transaction_type", "支出")
                    if tx_type in ("收入", "贷", "credit", "CR", "入账"):
                        tx_type = "收入"
                    else:
                        tx_type = "支出"

                    bal_str = mapped.get("balance", "0").replace(",", "").replace("￥", "").replace("¥", "")
                    balance = 0.0
                    try: balance = float(bal_str) if bal_str else 0.0
                    except: pass

                    tx = BankTransaction(
                        company_id=company_id,
                        bank_config_id=bank_config_id,
                        transaction_date=tx_date,
                        amount=amount,
                        balance=balance,
                        counterparty_name=mapped.get("counterparty_name", ""),
                        counterparty_account=mapped.get("counterparty_account", ""),
                        counterparty_bank=mapped.get("counterparty_bank", ""),
                        summary=mapped.get("summary", ""),
                        transaction_type=tx_type,
                        payment_method=mapped.get("payment_method", ""),
                        reference_no=mapped.get("reference_no", ""),
                        raw_data=json.dumps(extra, ensure_ascii=False) if extra else "{}",
                        remark=mapped.get("remark", "")
                    )
                    db.add(tx)

                elif module in ("sales-invoice", "purchase-invoice"):
                    inv_date = None
                    date_str = mapped.get("invoice_date", "")
                    if date_str:
                        for fmt in ["%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y%m%d"]:
                            try:
                                inv_date = datetime.strptime(date_str, fmt).date()
                                break
                            except: pass
                    if not inv_date:
                        errors.append(f"第{i+2}行: 无法解析开票日期")
                        continue

                    inv_no = mapped.get("invoice_no", "")
                    if not inv_no:
                        errors.append(f"第{i+2}行: 缺少发票号码")
                        continue

                    amt = float(mapped.get("amount", "0").replace(",", "")) if mapped.get("amount") else 0.0
                    tax_amt = float(mapped.get("tax_amount", "0").replace(",", "")) if mapped.get("tax_amount") else 0.0
                    total = float(mapped.get("total_amount", "0").replace(",", "")) if mapped.get("total_amount") else 0.0
                    qty = float(mapped.get("quantity", "0").replace(",", "")) if mapped.get("quantity") else 0
                    uprice = float(mapped.get("unit_price", "0").replace(",", "")) if mapped.get("unit_price") else 0
                    tr = float(mapped.get("tax_rate", "0").replace(",", "")) if mapped.get("tax_rate") else 0.0

                    if module == "sales-invoice":
                        existing = db.query(SalesInvoice).filter(
                            SalesInvoice.company_id == company_id,
                            SalesInvoice.invoice_no == inv_no
                        ).first()
                        if existing:
                            errors.append(f"第{i+2}行: 发票号码 {inv_no} 已存在，跳过")
                            continue
                        inv = SalesInvoice(
                            company_id=company_id, invoice_no=inv_no,
                            invoice_code=mapped.get("invoice_code", ""),
                            digital_invoice_no=mapped.get("digital_invoice_no", ""),
                            seller_tax_no=mapped.get("seller_tax_no", ""),
                            seller_name=mapped.get("seller_name", ""),
                            buyer_tax_no=mapped.get("buyer_tax_no", ""),
                            buyer_name=mapped.get("buyer_name", ""),
                            invoice_date=inv_date,
                            tax_category_code=mapped.get("tax_category_code", ""),
                            specific_business_type=mapped.get("specific_business_type", ""),
                            goods_name=mapped.get("goods_name", ""),
                            spec=mapped.get("spec", ""),
                            unit=mapped.get("unit", ""),
                            quantity=qty, unit_price=uprice,
                            amount=amt, tax_rate=tr, tax_amount=tax_amt,
                            total_amount=total,
                            invoice_source=mapped.get("invoice_source", ""),
                            invoice_category=mapped.get("invoice_category", "增值税专用发票"),
                            status=mapped.get("status", "正常"),
                            is_positive=mapped.get("is_positive", "是") in ("是", "true", "True", "1", True),
                            invoice_risk_level=mapped.get("invoice_risk_level", ""),
                            issuer=mapped.get("issuer", ""),
                            remark=mapped.get("remark", "")
                        )
                        db.add(inv)
                    else:
                        existing = db.query(PurchaseInvoice).filter(
                            PurchaseInvoice.company_id == company_id,
                            PurchaseInvoice.invoice_no == inv_no
                        ).first()
                        if existing:
                            errors.append(f"第{i+2}行: 发票号码 {inv_no} 已存在，跳过")
                            continue
                        cert_date = None
                        cert_date_str = mapped.get("certification_date", "")
                        if cert_date_str:
                            for cfmt in ["%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y%m%d"]:
                                try:
                                    cert_date = datetime.strptime(cert_date_str, cfmt).date()
                                    break
                                except: pass
                        inv = PurchaseInvoice(
                            company_id=company_id, invoice_no=inv_no,
                            invoice_code=mapped.get("invoice_code", ""),
                            digital_invoice_no=mapped.get("digital_invoice_no", ""),
                            seller_tax_no=mapped.get("seller_tax_no", ""),
                            seller_name=mapped.get("seller_name", ""),
                            buyer_tax_no=mapped.get("buyer_tax_no", ""),
                            buyer_name=mapped.get("buyer_name", ""),
                            invoice_date=inv_date,
                            tax_category_code=mapped.get("tax_category_code", ""),
                            specific_business_type=mapped.get("specific_business_type", ""),
                            goods_name=mapped.get("goods_name", ""),
                            spec=mapped.get("spec", ""),
                            unit=mapped.get("unit", ""),
                            quantity=qty, unit_price=uprice,
                            amount=amt, tax_rate=tr, tax_amount=tax_amt,
                            total_amount=total,
                            invoice_source=mapped.get("invoice_source", ""),
                            invoice_category=mapped.get("invoice_category", "增值税专用发票"),
                            status=mapped.get("status", "正常"),
                            is_positive=mapped.get("is_positive", "是") in ("是", "true", "True", "1", True),
                            invoice_risk_level=mapped.get("invoice_risk_level", ""),
                            issuer=mapped.get("issuer", ""),
                            certification_status=mapped.get("certification_status", "未认证"),
                            certification_date=cert_date,
                            deduction_period=mapped.get("deduction_period", ""),
                            remark=mapped.get("remark", "")
                        )
                        db.add(inv)

                imported += 1
            except Exception as e:
                errors.append(f"第{i+2}行: {str(e)}")

        db.commit()

        return {
            "imported": imported,
            "total": len(rows_data),
            "errors": errors[:20],  # 最多返回20条错误
            "message": f"成功导入 {imported}/{len(rows_data)} 条记录"
        }
    except Exception as e:
        db.rollback()
        return {"error": f"导入失败：{str(e)}"}


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


# ==================== 信息真实性校验 ====================

def validate_uscc(code: str) -> tuple:
    """校验统一社会信用代码 (GB 32100-2015)"""
    if not code or not code.strip():
        return True, ""
    code = code.strip().upper()
    if len(code) != 18:
        return False, "统一社会信用代码必须为18位"
    if not re.match(r'^[0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10}$', code):
        return False, "统一社会信用代码格式不正确（应为：2位登记管理机关+6位组织机构代码+9位主体标识码+1位校验码）"
    char_map = '0123456789ABCDEFGHJKLMNPQRTUWXY'
    weights = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28]
    total = sum(char_map.index(code[i]) * weights[i] for i in range(17))
    check_idx = (31 - total % 31) % 31
    expected = char_map[check_idx]
    if code[17] != expected:
        return False, f"校验码不正确，应为 '{expected}'"
    return True, ""


def validate_id_card(card_no: str) -> tuple:
    """校验中国居民身份证号码 (GB 11643-1999)"""
    if not card_no or not card_no.strip():
        return True, ""
    card_no = card_no.strip().upper()
    if len(card_no) != 18:
        return False, "身份证号码必须为18位"
    if not re.match(r'^\d{17}[\dX]$', card_no):
        return False, "身份证号码前17位必须为数字，第18位为数字或X"
    try:
        birth_str = card_no[6:14]
        birth = date(int(birth_str[0:4]), int(birth_str[4:6]), int(birth_str[6:8]))
        if birth >= date.today():
            return False, "身份证号码中的出生日期不能晚于当前日期"
    except ValueError:
        return False, "身份证号码中的出生日期无效（应为YYYYMMDD格式）"
    weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
    check_chars = '10X98765432'
    total = sum(int(card_no[i]) * weights[i] for i in range(17))
    expected = check_chars[total % 11]
    if card_no[17] != expected:
        return False, f"身份证校验码不正确，应为 '{expected}'"
    return True, ""


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
def chat_endpoint(payload: ChatRequest, company_id: int = Query(1), db: Session = Depends(get_db)):
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
                accounts = db.query(Account).filter(Account.company_id == company_id, Account.is_active == True).order_by(Account.code).all()
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
        existing = db.query(Customer).filter(Customer.company_id == company_id, Customer.code == data.get("code", "")).first()
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
        if db.query(Supplier).filter(Supplier.company_id == company_id, Supplier.code == data.get("code", "")).first():
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
            d = db.query(Department).filter(Department.company_id == company_id, Department.name.contains(data["department_name"])).first()
            if d: dept_code = d.code
        if db.query(Employee).filter(Employee.company_id == company_id, Employee.code == data.get("code", "")).first():
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
