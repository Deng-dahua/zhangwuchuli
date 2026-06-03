"""
中小制造业账务处理系统 - 后端 API
"""
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
import os
import csv
import io
import re
import uuid
import openpyxl
import json
from pypdf import PdfReader

from database import (
    get_db, init_db, init_company_data,
    Company, Department, Employee, Customer, Supplier,
    Account, Period,
    FixedAsset, FixedAssetDepreciation,
    IntangibleAsset, IntangibleAssetAmortization,
    InventoryItem, InventoryTransaction, InventoryBalance,
    Contract, ContractPayment,
    Payment,
    SalesInvoice, PurchaseInvoice,
    BankConfig, BankTransaction,
    InputVATDeduction, ColumnTemplate, JournalEntry,
    CompanyShareholder, CompanyDirector, CompanySupervisor, CompanyFinanceContact,
    auto_generate_single_invoice,
    auto_generate_input_vat_for_period, auto_generate_input_vat_journals
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
    company_name: Optional[str] = None
    uscc: Optional[str] = None
    registered_capital: Optional[float] = None
    established_date: Optional[date] = None
    legal_representative: Optional[str] = None
    legal_representative_id: Optional[str] = None
    address: Optional[str] = None
    business_scope: Optional[str] = None
    shareholders: Optional[List[dict]] = None
    directors: Optional[List[dict]] = None
    supervisors: Optional[List[dict]] = None
    finance_contacts: Optional[List[dict]] = None

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
    id_card: Optional[str] = None
    email: Optional[str] = None
    salary: Optional[float] = 0.0

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    id_card: Optional[str] = None
    email: Optional[str] = None
    salary: Optional[float] = None
    leave_date: Optional[date] = None

# 客户
class BatchDelete(BaseModel):
    ids: list[int]

class CustomerCreate(BaseModel):
    code: str
    name: str
    uscc: Optional[str] = None
    tax_no: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    remark: Optional[str] = None

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    uscc: Optional[str] = None
    tax_no: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    is_active: Optional[bool] = None
    remark: Optional[str] = None

# 供应商
class SupplierCreate(BaseModel):
    code: str
    name: str
    uscc: Optional[str] = None
    tax_no: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    remark: Optional[str] = None

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    uscc: Optional[str] = None
    tax_no: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    is_active: Optional[bool] = None
    remark: Optional[str] = None



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
        return {"company_name": "", "uscc": ""}
    return {
        "id": info.id,
        "company_name": info.name,
        "uscc": info.uscc or "",
        "registered_capital": info.registered_capital,
        "established_date": str(info.established_date) if info.established_date else "",
        "legal_representative": info.legal_representative or "",
        "legal_representative_id": info.legal_representative_id or "",
        "address": info.address or "",
        "business_scope": info.business_scope or "",
        "shareholders": [{"name": s.name, "id_number": s.id_number or "", "ratio": s.ratio, "contribution_amount": s.contribution_amount} for s in info.shareholders],
        "directors": [{"name": d.name, "id_number": d.id_number or ""} for d in info.directors],
        "supervisors": [{"name": s.name, "id_number": s.id_number or ""} for s in info.supervisors],
        "finance_contacts": [{"name": f.name, "id_number": f.id_number or "", "phone": f.phone or ""} for f in info.finance_contacts],
    }

@app.put("/api/company")
def update_company(data: CompanyUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    info = db.query(Company).filter(Company.id == company_id).first()
    if not info:
        info = Company(id=company_id, name=data.company_name or "")
        db.add(info)
        db.flush()
    if data.uscc:
        ok, msg = validate_uscc(data.uscc)
        if not ok:
            raise HTTPException(400, detail=f"公司统一社会信用代码：{msg}")
    # 更新主表字段
    main_fields = {k: v for k, v in data.model_dump(exclude_unset=True).items()
                   if k not in ("shareholders", "directors", "supervisors", "finance_contacts")}
    for k, v in main_fields.items():
        if k == 'company_name':
            info.name = v
        else:
            setattr(info, k, v)
    # 更新子表
    _update_company_subtable(db, info, CompanyShareholder, data.shareholders)
    _update_company_subtable(db, info, CompanyDirector, data.directors)
    _update_company_subtable(db, info, CompanySupervisor, data.supervisors)
    _update_company_subtable(db, info, CompanyFinanceContact, data.finance_contacts)
    db.commit()
    return {"message": "保存成功"}


def _update_company_subtable(db, company, model, items):
    """更新公司子表：清空旧数据，写入新数据"""
    if items is None:
        return
    db.query(model).filter(model.company_id == company.id).delete()
    for item in items:
        db.add(model(company_id=company.id, **item))


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
    d = Department(company_id=company_id, **data.model_dump())
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
    db.delete(d)
    db.commit()
    return {"message": "删除成功"}

class DeptBatchDelete(BaseModel):
    ids: list[int]

@app.post("/api/departments/batch-delete")
def batch_delete_departments(req: DeptBatchDelete, company_id: int = Query(1), db: Session = Depends(get_db)):
    deleted = db.query(Department).filter(
        Department.company_id == company_id,
        Department.id.in_(req.ids)
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": f"成功删除 {deleted} 个部门", "count": deleted}

@app.post("/api/departments/import")
async def import_departments(
    file: UploadFile = File(...),
    company_id: int = Query(1),
    db: Session = Depends(get_db)
):
    """从 CSV/XLSX 导入部门（编码+名称），编码为空时自动生成 BM001 格式"""
    ext = os.path.splitext(file.filename or "unknown")[1].lower()
    content_bytes = await file.read()

    rows = []
    if ext in (".xlsx", ".xls"):
        try:
            wb = openpyxl.load_workbook(io.BytesIO(content_bytes), data_only=True)
            ws = wb.active
            for r in ws.iter_rows(values_only=True):
                rows.append([str(c) if c is not None else "" for c in r])
        except Exception as e:
            raise HTTPException(400, f"无法解析 Excel 文件: {e}")
    elif ext == ".csv":
        try:
            text = content_bytes.decode("utf-8-sig")
            rows = list(csv.reader(io.StringIO(text)))
        except UnicodeDecodeError as e:
            raise HTTPException(400, f"文件编码错误，请使用 UTF-8 编码的 CSV: {e}")
    else:
        raise HTTPException(400, f"不支持的文件格式: {ext}，请上传 .csv 或 .xlsx")

    if not rows:
        raise HTTPException(400, "文件为空")
    headers = [h.strip() for h in rows[0]]
    ci = next((i for i, h in enumerate(headers) if h in ("编码", "code")), None)
    ni = next((i for i, h in enumerate(headers) if h in ("名称", "name", "部门名称")), 1)

    # 全行指纹去重：加载已有指纹
    def row_fingerprint(values_dict):
        return tuple(sorted((str(k), str(v)) for k, v in values_dict.items()))

    existing_fps = set()
    for rec in db.query(Department._fingerprint).filter(
        Department.company_id == company_id,
        Department._fingerprint.isnot(None)
    ).all():
        try:
            existing_fps.add(tuple(tuple(x) for x in json.loads(rec[0])))
        except: pass
    used_fps = {}

    # 获取当前最大编码（仅匹配 BM 前缀，提取数字部分）
    existing_codes = db.query(Department.code).filter(
        Department.company_id == company_id,
        Department.code.like('BM%')
    ).all()
    code_counter = 0
    for c in existing_codes:
        try:
            num = int(c[0][2:])
            if num > code_counter:
                code_counter = num
        except: pass

    imported = 0
    skipped = 0
    for row in rows[1:]:
        # 跳过完全空行
        if not any(str(c).strip() for c in row):
            continue
        code = row[ci].strip() if (ci is not None and ci < len(row)) else ""
        name = row[ni].strip() if ni < len(row) else ""
        if not name:
            continue

        # 指纹去重
        row_data = {"code": code, "name": name}
        fp = row_fingerprint(row_data)
        if fp in used_fps:
            skipped += 1
            continue
        if fp in existing_fps:
            skipped += 1
            continue

        # 编码为空时自动生成 BM001 格式
        if not code:
            code_counter += 1
            code = f"BM{code_counter:03d}"

        existing = db.query(Department).filter(
            Department.company_id == company_id, Department.code == code
        ).first()
        if existing:
            existing.name = name
            existing._fingerprint = json.dumps(list(fp))
        else:
            db.add(Department(
                company_id=company_id, code=code, name=name,
                _fingerprint=json.dumps(list(fp))
            ))
        used_fps[fp] = True
        imported += 1
    db.commit()
    msg = f"成功导入 {imported} 条部门"
    if skipped > 0:
        msg += f"，跳过 {skipped} 条重复"
    return {"message": msg, "count": imported, "skipped": skipped}


# ==================== 人员档案 ====================

@app.get("/api/employees")
def list_employees(
    keyword: Optional[str] = None,
    company_id: int = Query(1),
    db: Session = Depends(get_db)
):
    q = db.query(Employee).filter(Employee.company_id == company_id)
    if keyword:
        q = q.filter(or_(
            Employee.code.contains(keyword),
            Employee.name.contains(keyword)
        ))
    emps = q.order_by(Employee.code).all()
    return [
        {
            "id": e.id, "code": e.code, "name": e.name,
            "id_card": e.id_card or "",
            "email": e.email or "", "salary": e.salary or 0,
        } for e in emps
    ]

@app.post("/api/employees")
def create_employee(data: EmployeeCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    if db.query(Employee).filter(Employee.company_id == company_id, Employee.code == data.code).first():
        raise HTTPException(400, detail=f"工号 {data.code} 已存在")
    e = Employee(company_id=company_id, **data.model_dump())
    db.add(e)
    db.commit()
    return {"message": "新增成功"}

@app.put("/api/employees/{emp_id}")
def update_employee(emp_id: int, data: EmployeeUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    e = db.query(Employee).filter(Employee.company_id == company_id, Employee.id == emp_id).first()
    if not e:
        raise HTTPException(404, detail="员工不存在")
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

@app.post("/api/employees/batch-delete")
def batch_delete_employees(data: dict, company_id: int = Query(1), db: Session = Depends(get_db)):
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(400, detail="请选择要删除的记录")
    deleted = db.query(Employee).filter(Employee.company_id == company_id, Employee.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    return {"message": f"成功删除 {deleted} 条人员记录"}


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
            "uscc": c.uscc or "",
            "tax_no": c.tax_no,
            "bank_name": c.bank_name,
            "bank_account": c.bank_account,
            "is_active": c.is_active,
            "remark": c.remark
        } for c in items
    ]

@app.post("/api/customers")
def create_customer(data: CustomerCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    # 去重：编码/名称/统一社会信用代码 任一重复即拦截
    conds = [Customer.code == data.code, Customer.name == data.name]
    if data.uscc:
        conds.append(Customer.uscc == data.uscc)
    dup = db.query(Customer).filter(Customer.company_id == company_id, or_(*conds))
    if dup.first():
        raise HTTPException(400, detail="客户编码、名称或统一社会信用代码已存在，请勿重复录入")
    if data.uscc:
        ok, msg = validate_uscc(data.uscc)
        if not ok:
            raise HTTPException(400, detail=f"客户统一社会信用代码：{msg}")
    c = Customer(company_id=company_id, **data.model_dump())
    db.add(c)
    db.commit()
    return {"message": "新增成功"}

@app.put("/api/customers/{cust_id}")
def update_customer(cust_id: int, data: CustomerUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    c = db.query(Customer).filter(Customer.company_id == company_id, Customer.id == cust_id).first()
    if not c:
        raise HTTPException(404, detail="客户不存在")
    # 去重：编码/名称/统一社会信用代码 任一重复即拦截（排除自身）
    name = data.name if data.name is not None else c.name
    uscc = data.uscc if data.uscc is not None else c.uscc
    code = data.code if data.code is not None else c.code
    conds = [Customer.code == code, Customer.name == name]
    if uscc:
        conds.append(Customer.uscc == uscc)
    dup = db.query(Customer).filter(Customer.company_id == company_id, Customer.id != cust_id, or_(*conds))
    if dup.first():
        raise HTTPException(400, detail="客户编码、名称或统一社会信用代码已存在，请勿重复录入")
    if data.uscc:
        ok, msg = validate_uscc(data.uscc)
        if not ok:
            raise HTTPException(400, detail=f"客户统一社会信用代码：{msg}")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    return {"message": "更新成功"}

@app.post("/api/customers/batch-delete")
def batch_delete_customers(
    body: BatchDelete,
    company_id: int = Query(1),
    db: Session = Depends(get_db)
):
    deleted = db.query(Customer).filter(
        Customer.company_id == company_id,
        Customer.id.in_(body.ids)
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": f"成功删除 {deleted} 条客户"}

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
            Supplier.name.contains(keyword)
        ))
    if is_active is not None:
        q = q.filter(Supplier.is_active == is_active)
    items = q.order_by(Supplier.code).all()
    return [
        {
            "id": s.id, "code": s.code, "name": s.name,
            "uscc": s.uscc or "",
            "tax_no": s.tax_no,
            "bank_name": s.bank_name,
            "bank_account": s.bank_account,
            "is_active": s.is_active,
            "remark": s.remark
        } for s in items
    ]

@app.post("/api/suppliers")
def create_supplier(data: SupplierCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    # 去重：编码/名称/统一社会信用代码 任一重复即拦截
    conds = [Supplier.code == data.code, Supplier.name == data.name]
    if data.uscc:
        conds.append(Supplier.uscc == data.uscc)
    dup = db.query(Supplier).filter(Supplier.company_id == company_id, or_(*conds))
    if dup.first():
        raise HTTPException(400, detail="供应商编码、名称或统一社会信用代码已存在，请勿重复录入")
    if data.uscc:
        ok, msg = validate_uscc(data.uscc)
        if not ok:
            raise HTTPException(400, detail=f"供应商统一社会信用代码：{msg}")
    s = Supplier(company_id=company_id, **data.model_dump())
    db.add(s)
    db.commit()
    return {"message": "新增成功"}

@app.put("/api/suppliers/{supp_id}")
def update_supplier(supp_id: int, data: SupplierUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.company_id == company_id, Supplier.id == supp_id).first()
    if not s:
        raise HTTPException(404, detail="供应商不存在")
    # 去重：编码/名称/统一社会信用代码 任一重复即拦截（排除自身）
    name = data.name if data.name is not None else s.name
    uscc = data.uscc if data.uscc is not None else s.uscc
    code = data.code if data.code is not None else s.code
    conds = [Supplier.code == code, Supplier.name == name]
    if uscc:
        conds.append(Supplier.uscc == uscc)
    dup = db.query(Supplier).filter(Supplier.company_id == company_id, Supplier.id != supp_id, or_(*conds))
    if dup.first():
        raise HTTPException(400, detail="供应商编码、名称或统一社会信用代码已存在，请勿重复录入")
    if data.uscc:
        ok, msg = validate_uscc(data.uscc)
        if not ok:
            raise HTTPException(400, detail=f"供应商统一社会信用代码：{msg}")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    return {"message": "更新成功"}

@app.post("/api/suppliers/batch-delete")
def batch_delete_suppliers(
    body: BatchDelete,
    company_id: int = Query(1),
    db: Session = Depends(get_db)
):
    deleted = db.query(Supplier).filter(
        Supplier.company_id == company_id,
        Supplier.id.in_(body.ids)
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": f"成功删除 {deleted} 条供应商"}

@app.delete("/api/suppliers/{supp_id}")
def delete_supplier(supp_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.company_id == company_id, Supplier.id == supp_id).first()
    if not s:
        raise HTTPException(404, detail="供应商不存在")
    db.delete(s)
    db.commit()
    return {"message": "删除成功"}


# ==================== 会计科目（原有，保留）====================

def _build_account_hierarchy(db: Session, company_id: int) -> dict:
    """构建科目编码→全级次名称的映射"""
    all_accounts = db.query(Account).filter(Account.company_id == company_id).all()
    code_map = {a.code: a for a in all_accounts}

    def get_full_name(acct):
        parts = []
        current = acct
        visited = set()
        while current and current.code not in visited:
            visited.add(current.code)
            parts.append(f"{current.code} {current.name}")
            current = code_map.get(current.parent_code) if current.parent_code else None
        parts.reverse()
        return " / ".join(parts)

    return {a.code: get_full_name(a) for a in all_accounts}


@app.get("/api/accounts")
def list_accounts(
    category: Optional[str] = None,
    keyword: Optional[str] = None,
    level: Optional[int] = None,
    leaf_only: Optional[str] = None,
    company_id: int = Query(1),
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

    # 末级科目过滤：排除那些是其他科目parent_code的科目
    if leaf_only and leaf_only.lower() in ("1", "true", "yes"):
        all_codes = {a.code for a in accounts}
        parent_codes = {a.parent_code for a in accounts if a.parent_code}
        accounts = [a for a in accounts if a.code not in parent_codes]

    # 构建全级次名称映射
    hierarchy = _build_account_hierarchy(db, company_id)

    return [
        {
            "id": a.id, "code": a.code, "name": a.name,
            "full_name": hierarchy.get(a.code, f"{a.code} {a.name}"),
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
    acc = Account(company_id=company_id, code=code, name=name, category=category,
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
    db.delete(acc)
    db.commit()
    return {"message": "删除成功"}


# ==================== 期间管理 ====================

@app.get("/api/periods")
def list_periods(company_id: int = Query(1), db: Session = Depends(get_db)):
    periods = db.query(Period).filter(Period.company_id == company_id).order_by(Period.period.desc()).all()
    return [{"period": p.period, "status": p.status} for p in periods]


@app.post("/api/periods/{period}/close")
def close_period(period: str, company_id: int = Query(1), db: Session = Depends(get_db)):
    p = db.query(Period).filter(Period.company_id == company_id, Period.period == period).first()
    if not p:
        raise HTTPException(404, detail="期间不存在")
    if p.status == "已结账":
        raise HTTPException(400, detail="该期间已结账")
    p.status = "已结账"
    p.closed_at = datetime.now()

    # 自动创建下期
    year, month = int(period[:4]), int(period[5:])
    if month == 12:
        next_period = f"{year + 1}-01"
    else:
        next_period = f"{year}-{str(month + 1).zfill(2)}"
    existing = db.query(Period).filter(Period.company_id == company_id, Period.period == next_period).first()
    if not existing:
        db.add(Period(company_id=company_id, period=next_period))

    db.commit()
    return {"message": f"{period} 结账成功，已自动创建 {next_period} 期间"}


# ==================== 统计看板（原有，保留）====================

@app.get("/api/dashboard")
def dashboard(company_id: int = Query(1), db: Session = Depends(get_db)):
    """统计看板 - 基础档案统计"""
    from datetime import date
    period = date.today().strftime("%Y-%m")

    customer_count = db.query(Customer).filter(Customer.company_id == company_id).count()
    supplier_count = db.query(Supplier).filter(Supplier.company_id == company_id).count()
    employee_count = db.query(Employee).filter(Employee.company_id == company_id).count()
    account_count = db.query(Account).filter(Account.company_id == company_id, Account.is_active == True).count()

    # 本月发票数量
    si_count = db.query(SalesInvoice).filter(SalesInvoice.company_id == company_id).count()
    pi_count = db.query(PurchaseInvoice).filter(PurchaseInvoice.company_id == company_id).count()

    return {
        "period": period,
        "customer_count": customer_count,
        "supplier_count": supplier_count,
        "employee_count": employee_count,
        "account_count": account_count,
        "sales_invoice_count": si_count,
        "purchase_invoice_count": pi_count,
    }


# ==================== 公司账套管理 ====================

class CompanyCreate(BaseModel):
    name: str
    uscc: Optional[str] = None
    registered_capital: Optional[float] = None
    established_date: Optional[date] = None
    legal_representative: Optional[str] = None
    legal_representative_id: Optional[str] = None
    address: Optional[str] = None
    business_scope: Optional[str] = None
    shareholders: Optional[List[dict]] = None
    directors: Optional[List[dict]] = None
    supervisors: Optional[List[dict]] = None
    finance_contacts: Optional[List[dict]] = None

class CompanyUpdateModel(BaseModel):
    name: Optional[str] = None
    uscc: Optional[str] = None
    registered_capital: Optional[float] = None
    established_date: Optional[date] = None
    legal_representative: Optional[str] = None
    legal_representative_id: Optional[str] = None
    address: Optional[str] = None
    business_scope: Optional[str] = None
    shareholders: Optional[List[dict]] = None
    directors: Optional[List[dict]] = None
    supervisors: Optional[List[dict]] = None
    finance_contacts: Optional[List[dict]] = None


@app.get("/api/companies")
def list_companies(db: Session = Depends(get_db)):
    """获取公司列表（账套选择）"""
    companies = db.query(Company).order_by(Company.id).all()
    return [{
        "id": c.id, "name": c.name, "uscc": c.uscc or "",
        "registered_capital": c.registered_capital,
        "established_date": str(c.established_date) if c.established_date else "",
        "legal_representative": c.legal_representative or "",
        "legal_representative_id": c.legal_representative_id or "",
        "address": c.address or "",
        "business_scope": c.business_scope or "",
        "created_at": str(c.created_at.date()) if c.created_at else "",
        "shareholders": [{"name": s.name, "id_number": s.id_number or "", "ratio": s.ratio, "contribution_amount": s.contribution_amount} for s in c.shareholders],
        "directors": [{"name": d.name, "id_number": d.id_number or ""} for d in c.directors],
        "supervisors": [{"name": s.name, "id_number": s.id_number or ""} for s in c.supervisors],
        "finance_contacts": [{"name": f.name, "id_number": f.id_number or "", "phone": f.phone or ""} for f in c.finance_contacts],
    } for c in companies]


@app.post("/api/companies")
def create_company(data: CompanyCreate, db: Session = Depends(get_db)):
    """创建新公司/账套"""
    if db.query(Company).filter(Company.name == data.name).first():
        raise HTTPException(400, detail=f"公司 '{data.name}' 已存在")
    if data.uscc:
        ok, msg = validate_uscc(data.uscc)
        if not ok:
            raise HTTPException(400, detail=f"统一社会信用代码：{msg}")

    main_fields = {k: v for k, v in data.model_dump(exclude_unset=True).items()
                   if k not in ("shareholders", "directors", "supervisors", "finance_contacts")}
    company = Company(**main_fields)
    db.add(company)
    db.flush()

    # 子表
    _update_company_subtable(db, company, CompanyShareholder, data.shareholders)
    _update_company_subtable(db, company, CompanyDirector, data.directors)
    _update_company_subtable(db, company, CompanySupervisor, data.supervisors)
    _update_company_subtable(db, company, CompanyFinanceContact, data.finance_contacts)

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
    main_fields = {k: v for k, v in data.model_dump(exclude_unset=True).items()
                   if k not in ("shareholders", "directors", "supervisors", "finance_contacts")}
    for k, v in main_fields.items():
        setattr(company, k, v)
    _update_company_subtable(db, company, CompanyShareholder, data.shareholders)
    _update_company_subtable(db, company, CompanyDirector, data.directors)
    _update_company_subtable(db, company, CompanySupervisor, data.supervisors)
    _update_company_subtable(db, company, CompanyFinanceContact, data.finance_contacts)
    db.commit()
    return {"message": "更新成功"}


@app.delete("/api/companies/{company_id}")
def delete_company(company_id: int, db: Session = Depends(get_db)):
    """删除公司"""
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, detail="公司不存在")
    db.delete(company)
    db.commit()
    return {"message": "删除成功"}


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
    invoice_no: Optional[str] = None
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
    # 构建凭证号映射（销项发票 → 序时账，通过摘要+借方金额+科目1122判重）
    voucher_map = {}
    for inv in invoices:
        buyer = inv.buyer_name or "客户"
        goods = inv.goods_name or ""
        summary = f"销售{goods or '货物'}给{buyer}"
        je = db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.summary == summary,
            JournalEntry.debit_amount == inv.total_amount,
            JournalEntry.account_code == "1122"
        ).first()
        if je:
            voucher_map[inv.id] = f"{je.voucher_word}-{je.voucher_no}"
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
        "journal_voucher_no": voucher_map.get(inv.id, ""),
        "created_at": str(inv.created_at) if inv.created_at else ""
    } for inv in invoices]


@app.post("/api/sales-invoices")
def create_sales_invoice(data: SalesInvoiceCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    if data.invoice_no and db.query(SalesInvoice).filter(SalesInvoice.company_id == company_id, SalesInvoice.invoice_no == data.invoice_no).first():
        raise HTTPException(400, detail=f"发票号码 {data.invoice_no} 已存在")
    inv = SalesInvoice(company_id=company_id, **data.model_dump())
    db.add(inv)
    db.commit()
    db.refresh(inv)
    # 自动生成序时账凭证
    auto_generate_single_invoice(db, inv)
    return {"id": inv.id, "invoice_no": inv.invoice_no, "message": "开具发票创建成功"}


@app.get("/api/sales-invoices/stats")
def sales_invoice_stats(company_id: int = Query(1), db: Session = Depends(get_db)):
    base = db.query(SalesInvoice).filter(SalesInvoice.company_id == company_id)
    total_count = base.count()
    # SQLAlchemy func.sum().scalar() 在SQLite下有时返回None，改用Python求和
    total_amt = sum(a[0] or 0 for a in base.with_entities(SalesInvoice.amount).all())
    total_amount = sum(a[0] or 0 for a in base.with_entities(SalesInvoice.total_amount).all())
    total_tax = sum(a[0] or 0 for a in base.with_entities(SalesInvoice.tax_amount).all())
    normal_count = base.filter(SalesInvoice.status == "正常").count()
    void_count = base.filter(SalesInvoice.status.like("%作废%")).count()
    red_count = base.filter(SalesInvoice.status.like("%红冲%")).count()
    return {
        "total_count": total_count, "total_amt": round(total_amt, 2),
        "total_amount": round(total_amount, 2),
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
    db.refresh(inv)
    # 状态改为非作废/红冲时自动生成凭证（先删旧再生成，确保金额一致）
    db.query(JournalEntry).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.source == "开具发票",
        JournalEntry.ref_id == invoice_id
    ).delete(synchronize_session=False)
    db.flush()
    auto_generate_single_invoice(db, inv)
    return {"message": "更新成功"}


@app.delete("/api/sales-invoices/{invoice_id}")
def delete_sales_invoice(invoice_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    inv = db.query(SalesInvoice).filter(SalesInvoice.company_id == company_id, SalesInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, detail="发票不存在")
    db.delete(inv)
    db.commit()
    return {"message": "删除成功"}


@app.post("/api/sales-invoices/batch-delete")
def batch_delete_sales_invoices(ids: list[int], company_id: int = Query(1), db: Session = Depends(get_db)):
    deleted = db.query(SalesInvoice).filter(
        SalesInvoice.company_id == company_id,
        SalesInvoice.id.in_(ids)
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": f"成功删除 {deleted} 条记录", "deleted": deleted}




# ==================== 取得发票（采购发票）====================

class PurchaseInvoiceCreate(BaseModel):
    invoice_code: Optional[str] = None
    invoice_no: Optional[str] = None
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
    deduction_rate: Optional[float] = 100.0
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
    deduction_rate: Optional[float] = None
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
    # 构建凭证号映射（进项发票 → 进项抵扣 → 序时账，按期间匹配 source="进项抵扣" 汇总凭证）
    invoice_nos = [inv.invoice_no for inv in invoices if inv.invoice_no]
    ded_period_map = {}
    if invoice_nos:
        for ded in db.query(InputVATDeduction).filter(
            InputVATDeduction.company_id == company_id,
            InputVATDeduction.invoice_no.in_(invoice_nos)
        ).all():
            if ded.deduction_period:
                ded_period_map[ded.invoice_no] = ded.deduction_period
    period_vouchers = {}
    periods_set = list(set(ded_period_map.values()))
    if periods_set:
        for je in db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.source == "进项抵扣",
            JournalEntry.period.in_(periods_set),
            JournalEntry.account_code == "221001002"
        ).all():
            period_vouchers[je.period] = f"{je.voucher_word}-{je.voucher_no}"
    voucher_map = {}
    for inv in invoices:
        period = ded_period_map.get(inv.invoice_no)
        if period and period in period_vouchers:
            voucher_map[inv.id] = period_vouchers[period]
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
        "deduction_rate": inv.deduction_rate if inv.deduction_rate is not None else 100.0,
        "remark": inv.remark or "",
        "journal_voucher_no": voucher_map.get(inv.id, ""),
        "created_at": str(inv.created_at) if inv.created_at else ""
    } for inv in invoices]


@app.post("/api/purchase-invoices")
def create_purchase_invoice(data: PurchaseInvoiceCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    if data.invoice_no and db.query(PurchaseInvoice).filter(PurchaseInvoice.company_id == company_id, PurchaseInvoice.invoice_no == data.invoice_no).first():
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
    total_amt = sum(a[0] or 0 for a in base.with_entities(PurchaseInvoice.amount).all())
    total_amount = sum(a[0] or 0 for a in base.with_entities(PurchaseInvoice.total_amount).all())
    # 可抵扣税额：tax_amount * deduction_rate / 100，仅统计专票 + 铁路电子客票
    deductible_invoices = db.query(PurchaseInvoice).filter(
        PurchaseInvoice.company_id == company_id,
        PurchaseInvoice.tax_amount > 0,
        PurchaseInvoice.invoice_category.in_(["数电发票（增值税专用发票）", "数电发票（铁路电子客票）"])
    ).all()
    total_tax = round(sum(
        (inv.tax_amount or 0) * ((inv.deduction_rate if inv.deduction_rate is not None else 100.0) / 100.0)
        for inv in deductible_invoices
    ), 2)
    normal_count = base.filter(PurchaseInvoice.status == "正常").count()
    void_count = base.filter(PurchaseInvoice.status.like("%作废%")).count()
    red_count = base.filter(PurchaseInvoice.status.like("%红冲%")).count()
    uncertified_count = base.filter(PurchaseInvoice.certification_status == "未认证").count()
    certified_count = base.filter(PurchaseInvoice.certification_status == "已认证").count()
    deducted_count = base.filter(PurchaseInvoice.certification_status == "已抵扣").count()
    return {
        "total_count": total_count, "total_amt": round(total_amt, 2),
        "total_amount": round(total_amount, 2),
        "total_tax": total_tax,
        "normal_count": normal_count, "void_count": void_count,
        "red_count": red_count,
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
        "deduction_rate": inv.deduction_rate if inv.deduction_rate is not None else 100.0,
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


@app.post("/api/purchase-invoices/batch-delete")
def batch_delete_purchase_invoices(ids: list[int], company_id: int = Query(1), db: Session = Depends(get_db)):
    deleted = db.query(PurchaseInvoice).filter(
        PurchaseInvoice.company_id == company_id,
        PurchaseInvoice.id.in_(ids)
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": f"成功删除 {deleted} 条记录", "deleted": deleted}


@app.post("/api/purchase-invoices/{invoice_id}/to-journal")
def purchase_invoice_to_journal(invoice_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    """将单张取得发票生成进项抵扣记录并生成凭证"""
    inv = db.query(PurchaseInvoice).filter(
        PurchaseInvoice.id == invoice_id,
        PurchaseInvoice.company_id == company_id
    ).first()
    if not inv:
        raise HTTPException(404, "发票不存在")

    period = inv.invoice_date.strftime("%Y-%m") if inv.invoice_date else datetime.now().strftime("%Y-%m")

    # 查找或创建进项抵扣记录
    ded = db.query(InputVATDeduction).filter(
        InputVATDeduction.company_id == company_id,
        InputVATDeduction.invoice_no == inv.invoice_no
    ).first()

    if not ded:
        ded = InputVATDeduction(
            company_id=company_id,
            purchase_invoice_id=inv.id,
            invoice_code=inv.invoice_code or "",
            invoice_no=inv.invoice_no or "",
            invoice_date=inv.invoice_date,
            seller_name=inv.seller_name or "",
            seller_tax_id=inv.seller_tax_no or "",
            amount=inv.amount or 0,
            tax_amount=inv.tax_amount or 0,
            deductible_tax_amount=inv.tax_amount or 0,
            total_amount=inv.total_amount or 0,
            invoice_category=inv.invoice_category or "增值税专用发票",
            goods_name=inv.goods_name or "",
            deduction_period=period,
            deduction_status="待抵扣",
        )
        db.add(ded)
    else:
        if not ded.deduction_period:
            ded.deduction_period = period
        if not ded.deduction_status:
            ded.deduction_status = "待抵扣"

    db.flush()

    # 按月汇总生成进项抵扣凭证
    count = auto_generate_input_vat_for_period(db, company_id, period)
    db.commit()
    return {"message": f"已为 {period} 生成进项抵扣凭证 ({count} 条)", "period": period}




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
    transaction_time: Optional[str] = None
    application_date: Optional[date] = None
    voucher_no: Optional[str] = None
    debit_amount: Optional[float] = 0.0
    credit_amount: Optional[float] = 0.0
    balance: Optional[float] = 0.0
    counterparty_name: Optional[str] = None
    counterparty_account: Optional[str] = None
    counterparty_bank: Optional[str] = None
    transaction_serial_no: Optional[str] = None
    voucher_seq: Optional[str] = None
    record_status: Optional[str] = None
    summary: Optional[str] = None
    transaction_remark: Optional[str] = None
    account_type: Optional[str] = None
    # 旧字段（向后兼容）
    amount: Optional[float] = 0.0
    transaction_type: Optional[str] = "支出"
    payment_method: Optional[str] = None
    reference_no: Optional[str] = None
    raw_data: Optional[str] = None
    remark: Optional[str] = None


class BankTransactionUpdate(BaseModel):
    bank_config_id: Optional[int] = None
    transaction_date: Optional[date] = None
    transaction_time: Optional[str] = None
    application_date: Optional[date] = None
    voucher_no: Optional[str] = None
    debit_amount: Optional[float] = None
    credit_amount: Optional[float] = None
    balance: Optional[float] = None
    counterparty_name: Optional[str] = None
    counterparty_account: Optional[str] = None
    counterparty_bank: Optional[str] = None
    transaction_serial_no: Optional[str] = None
    voucher_seq: Optional[str] = None
    record_status: Optional[str] = None
    summary: Optional[str] = None
    transaction_remark: Optional[str] = None
    account_type: Optional[str] = None
    # 旧字段（向后兼容）
    amount: Optional[float] = None
    transaction_type: Optional[str] = None
    payment_method: Optional[str] = None
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
        "transaction_time": str(tx.transaction_time) if tx.transaction_time else "",
        "application_date": str(tx.application_date) if tx.application_date else "",
        "voucher_no": tx.voucher_no or "",
        "debit_amount": tx.debit_amount or 0,
        "credit_amount": tx.credit_amount or 0,
        "balance": tx.balance or 0,
        "counterparty_account": tx.counterparty_account or "",
        "counterparty_name": tx.counterparty_name or "",
        "counterparty_bank": tx.counterparty_bank or "",
        "transaction_serial_no": tx.transaction_serial_no or "",
        "voucher_seq": tx.voucher_seq or "",
        "record_status": tx.record_status or "",
        "summary": tx.summary or "",
        "transaction_remark": tx.transaction_remark or "",
        "account_type": tx.account_type or "",
        # 旧字段（向后兼容）
        "amount": tx.amount or 0,
        "transaction_type": tx.transaction_type,
        "payment_method": tx.payment_method or "",
        "reference_no": tx.reference_no or "",
        "raw_data": tx.raw_data or "{}",
        "remark": tx.remark or "",
        "journal_voucher_no": tx.journal_voucher_no or "",
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

    total_income = income_base.with_entities(func.sum(BankTransaction.credit_amount)).scalar() or 0
    total_expense = expense_base.with_entities(func.sum(BankTransaction.debit_amount)).scalar() or 0
    # 新字段口径：借方=支出, 贷方=收入
    total_debit = base.with_entities(func.sum(BankTransaction.debit_amount)).scalar() or 0
    total_credit = base.with_entities(func.sum(BankTransaction.credit_amount)).scalar() or 0
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


class BatchDeleteRequest(BaseModel):
    ids: List[int]


@app.post("/api/bank-transactions/batch-delete")
def batch_delete_bank_transactions(req: BatchDeleteRequest, company_id: int = Query(1), db: Session = Depends(get_db)):
    deleted = db.query(BankTransaction).filter(
        BankTransaction.company_id == company_id,
        BankTransaction.id.in_(req.ids)
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": f"成功删除 {deleted} 条流水记录", "count": deleted}


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


@app.post("/api/bank-transactions/{tx_id}/to-journal")
def bank_transaction_to_journal(tx_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    """为单条银行流水生成记账凭证"""
    tx = db.query(BankTransaction).filter(
        BankTransaction.id == tx_id,
        BankTransaction.company_id == company_id
    ).first()
    if not tx:
        raise HTTPException(404, "流水记录不存在")

    # 已有凭证则跳过
    if tx.journal_voucher_no:
        raise HTTPException(400, "该流水已生成凭证：" + tx.journal_voucher_no)

    period = tx.transaction_date.strftime("%Y-%m") if tx.transaction_date else datetime.now().strftime("%Y-%m")
    max_no = db.query(JournalEntry.voucher_no).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period == period,
        JournalEntry.voucher_word == "记"
    ).order_by(JournalEntry.voucher_no.desc()).first()
    next_voucher_no = (max_no[0] + 1) if max_no and max_no[0] else 1

    date_str = tx.transaction_date.strftime("%Y-%m-%d") if tx.transaction_date else period + "-01"
    counterparty = tx.counterparty_name or tx.summary or "银行流水"
    # 确保1002银行存款科目存在
    if not db.query(Account).filter(Account.company_id == company_id, Account.code == "1002").first():
        db.add(Account(
            company_id=company_id, code="1002", name="银行存款",
            category="资产", balance_direction="借", level=1, parent_code="1",
        ))
        db.flush()

    is_debit = tx.debit_amount and tx.debit_amount > 0
    amount = (tx.debit_amount or 0) if is_debit else (tx.credit_amount or 0)

    entry = JournalEntry(
        company_id=company_id,
        entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
        period=period,
        voucher_word="记",
        voucher_no=next_voucher_no,
        summary=f"银行流水-{counterparty}",
        account_code="1002",
        account_name="银行存款",
        debit_amount=amount if is_debit else 0,
        credit_amount=0 if is_debit else amount,
        contact_project=counterparty,
        source="手动录入",
    )
    db.add(entry)

    voucher_str = f"记-{next_voucher_no}"
    tx.journal_voucher_no = voucher_str
    db.commit()
    return {"message": f"已生成凭证，凭证号：{voucher_str}", "voucher_no": voucher_str, "period": period}


# ==================== 序时账 ====================

class JournalEntryCreate(BaseModel):
    entry_date: date
    period: str
    voucher_word: str = "记"
    voucher_no: int
    attach_count: Optional[int] = 0
    summary: Optional[str] = None
    account_code: str
    account_name: Optional[str] = None
    debit_amount: Optional[float] = 0.0
    credit_amount: Optional[float] = 0.0
    prepared_by: Optional[str] = None
    reviewed_by: Optional[str] = None
    is_reviewed: Optional[bool] = False
    remark: Optional[str] = None
    contact_project: Optional[str] = None
    spec_model: Optional[str] = None
    quantity: Optional[float] = 0.0
    unit: Optional[str] = None
    unit_price: Optional[float] = 0.0


class JournalEntryUpdate(BaseModel):
    entry_date: Optional[date] = None
    period: Optional[str] = None
    voucher_word: Optional[str] = None
    voucher_no: Optional[int] = None
    attach_count: Optional[int] = None
    summary: Optional[str] = None
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    debit_amount: Optional[float] = None
    credit_amount: Optional[float] = None
    prepared_by: Optional[str] = None
    reviewed_by: Optional[str] = None
    is_reviewed: Optional[bool] = None
    remark: Optional[str] = None
    contact_project: Optional[str] = None
    spec_model: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    unit_price: Optional[float] = None


@app.get("/api/journal-entries")
def list_journal_entries(
    company_id: int = Query(1),
    period: Optional[str] = None,
    voucher_word: Optional[str] = None,
    keyword: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    is_reviewed: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    q = db.query(JournalEntry).filter(JournalEntry.company_id == company_id)
    if period:
        q = q.filter(JournalEntry.period == period)
    if voucher_word:
        q = q.filter(JournalEntry.voucher_word == voucher_word)
    if is_reviewed is not None:
        q = q.filter(JournalEntry.is_reviewed == is_reviewed)
    if date_from:
        q = q.filter(JournalEntry.entry_date >= date_from)
    if date_to:
        q = q.filter(JournalEntry.entry_date <= date_to)
    if keyword:
        q = q.filter(or_(
            JournalEntry.summary.contains(keyword),
            JournalEntry.account_name.contains(keyword),
            JournalEntry.account_code.contains(keyword),
        ))
    entries = q.order_by(JournalEntry.voucher_no.asc(), JournalEntry.id.asc()).all()
    hierarchy = _build_account_hierarchy(db, company_id)
    return [{
        "id": e.id, "entry_date": str(e.entry_date), "period": e.period,
        "voucher_word": e.voucher_word, "voucher_no": e.voucher_no,
        "attach_count": e.attach_count or 0, "summary": e.summary or "",
        "account_code": e.account_code, "account_name": e.account_name or "",
        "account_full_name": hierarchy.get(e.account_code, e.account_name or ""),
        "debit_amount": e.debit_amount or 0, "credit_amount": e.credit_amount or 0,
        "prepared_by": e.prepared_by or "", "reviewed_by": e.reviewed_by or "",
        "is_reviewed": e.is_reviewed, "remark": e.remark or "",
        "contact_project": e.contact_project or "",
        "spec_model": e.spec_model or "",
        "quantity": e.quantity or 0, "unit": e.unit or "",
        "unit_price": e.unit_price or 0,
        "source": e.source or "手动录入",
        "created_at": str(e.created_at) if e.created_at else None,
    } for e in entries]


@app.get("/api/journal-entries/stats")
def journal_entry_stats(
    company_id: int = Query(1),
    period: Optional[str] = None,
    db: Session = Depends(get_db)
):
    base = db.query(JournalEntry).filter(JournalEntry.company_id == company_id)
    if period:
        base = base.filter(JournalEntry.period == period)
    total_count = base.count()
    total_debit = base.with_entities(func.sum(JournalEntry.debit_amount)).scalar() or 0
    total_credit = base.with_entities(func.sum(JournalEntry.credit_amount)).scalar() or 0
    reviewed_count = base.filter(JournalEntry.is_reviewed == True).count()
    unreviewed_count = base.filter(JournalEntry.is_reviewed == False).count()
    period_count = base.with_entities(func.count(func.distinct(JournalEntry.period))).scalar() or 0
    return {
        "total_count": total_count,
        "total_debit": round(total_debit, 2),
        "total_credit": round(total_credit, 2),
        "reviewed_count": reviewed_count,
        "unreviewed_count": unreviewed_count,
        "period_count": period_count,
    }


# ==================== 公用余额计算函数 ====================

def _prev_period(period: str) -> str:
    """计算上一个会计期间。'2025-03' → '2025-02'，'2025-01' → '2024-12'"""
    y, m = map(int, period.split("-"))
    m -= 1
    if m == 0:
        m = 12
        y -= 1
    return f"{y:04d}-{m:02d}"


def _compute_period_balances(company_id: int, period_from, period_to, db) -> dict:
    """
    公用函数：计算指定期间范围内的科目借贷方发生额。
    单数据源：所有报表均通过此函数从序时账取数，避免重复查询。
    period_from: str 如 '2025-01' 或 None（无下限）
    period_to:   str 如 '2025-12' 或 None（无上限）
    返回: {account_code: {"debit": float, "credit": float}}
    """
    q = db.query(JournalEntry).filter(JournalEntry.company_id == company_id)
    if period_from is not None:
        q = q.filter(JournalEntry.period >= period_from)
    if period_to is not None:
        q = q.filter(JournalEntry.period <= period_to)
    result = {}
    for e in q.all():
        c = result.setdefault(e.account_code, {"debit": 0.0, "credit": 0.0})
        c["debit"] += e.debit_amount or 0
        c["credit"] += e.credit_amount or 0
    return result


def _build_trial_balance_tree(company_id, period_raw, cum_raw, db):
    """
    公用函数：基于 period_raw / cum_raw，构建科目余额表的树形汇总结果列表。
    与科目余额表前端返回格式一致。
    """
    accounts = db.query(Account).filter(
        Account.company_id == company_id,
        Account.is_active == True
    ).order_by(Account.code).all()
    acc_map = {a.code: a for a in accounts}

    children_map = {}
    for a in accounts:
        if a.parent_code:
            children_map.setdefault(a.parent_code, []).append(a.code)

    def aggregate(code, data_map):
        total = dict(data_map.get(code, {"debit": 0.0, "credit": 0.0}))
        for child in children_map.get(code, []):
            child_data = aggregate(child, data_map)
            total["debit"] += child_data["debit"]
            total["credit"] += child_data["credit"]
        return total

    period_agg = {a.code: aggregate(a.code, period_raw) for a in accounts}
    cum_agg = {a.code: aggregate(a.code, cum_raw) for a in accounts}

    display_codes = set()
    for a in accounts:
        pt = period_agg[a.code]
        ct = cum_agg[a.code]
        if pt["debit"] != 0 or pt["credit"] != 0 or ct["debit"] != 0 or ct["credit"] != 0:
            current = a.code
            while current:
                display_codes.add(current)
                parent = acc_map[current].parent_code if current in acc_map else None
                current = parent if parent else None

    result = []
    for acc in accounts:
        if acc.code not in display_codes:
            continue
        pt = period_agg[acc.code]
        ct = cum_agg[acc.code]
        pdr = round(pt["debit"], 2)
        pcr = round(pt["credit"], 2)
        cdr = round(ct["debit"], 2)
        ccr = round(ct["credit"], 2)
        direction = acc.balance_direction
        if direction == "借":
            net = cdr - ccr
            end_debit = round(net, 2) if net >= 0 else 0
            end_credit = round(-net, 2) if net < 0 else 0
        else:
            net = ccr - cdr
            end_credit = round(net, 2) if net >= 0 else 0
            end_debit = round(-net, 2) if net < 0 else 0
        result.append({
            "account_code": acc.code,
            "account_name": acc.name,
            "category": acc.category,
            "balance_direction": direction,
            "level": acc.level,
            "parent_code": acc.parent_code,
            "begin_debit": 0,
            "begin_credit": 0,
            "period_debit": pdr,
            "period_credit": pcr,
            "cumulative_debit": cdr,
            "cumulative_credit": ccr,
            "end_debit": end_debit,
            "end_credit": end_credit,
        })
    return result


# ==================== 科目余额表 ====================
@app.get("/api/trial-balance")
def trial_balance(
    company_id: int = Query(1),
    period: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """科目余额表：调用统一计算函数"""
    # 本期发生额
    period_raw = _compute_period_balances(company_id, period, period, db)
    # 累计发生额（年初 → 当前期间）
    cum_raw = {}
    if period:
        year = period.split("-")[0]
        cum_raw = _compute_period_balances(company_id, f"{year}-01", period, db)
    else:
        cum_raw = dict(period_raw)

    return _build_trial_balance_tree(company_id, period_raw, cum_raw, db)


# ==================== 总账 ====================
@app.get("/api/ledger/general")
def general_ledger(
    company_id: int = Query(1),
    period_from: str = Query(...),
    period_to: str = Query(...),
    db: Session = Depends(get_db)
):
    """总账：调用统一余额计算函数，树形汇总显示全级次"""
    prev = _prev_period(period_from)
    period_raw  = _compute_period_balances(company_id, period_from, period_to, db)
    cum_raw    = _compute_period_balances(company_id, None, period_to, db)
    open_raw   = _compute_period_balances(company_id, None, prev, db)

    accounts = db.query(Account).filter(
        Account.company_id == company_id,
        Account.is_active == True
    ).order_by(Account.code).all()
    acc_map = {a.code: a for a in accounts}

    # 构建层级名称链（纯名称，不带科目编码）
    def _get_name_chain(acct):
        parts = [acct.name]
        cur = acct
        while cur.parent_code and cur.parent_code in acc_map:
            cur = acc_map[cur.parent_code]
            parts.append(cur.name)
        parts.reverse()
        return " / ".join(parts)
    name_map = {a.code: _get_name_chain(a) for a in accounts}

    # 树形汇总：父级 = 自身 + 所有子级合计
    children_map = {}
    for a in accounts:
        if a.parent_code:
            children_map.setdefault(a.parent_code, []).append(a.code)

    def aggregate(code, data_map):
        total = dict(data_map.get(code, {"debit": 0.0, "credit": 0.0}))
        for child in children_map.get(code, []):
            child_data = aggregate(child, data_map)
            total["debit"] += child_data["debit"]
            total["credit"] += child_data["credit"]
        return total

    period_agg = {a.code: aggregate(a.code, period_raw) for a in accounts}
    cum_agg = {a.code: aggregate(a.code, cum_raw) for a in accounts}

    # 全级次过滤：聚合后有数据的科目 + 其所有父级链
    display_codes = set()
    for a in accounts:
        pt = period_agg[a.code]
        ct = cum_agg[a.code]
        if pt["debit"] != 0 or pt["credit"] != 0 or ct["debit"] != 0 or ct["credit"] != 0:
            current = a.code
            while current:
                display_codes.add(current)
                parent = acc_map[current].parent_code if current in acc_map else None
                current = parent if parent else None

    result = []
    for acc in accounts:
        if acc.code not in display_codes:
            continue
        p = period_agg[acc.code]
        c = cum_agg[acc.code]
        o = open_raw.get(acc.code, {"debit": 0.0, "credit": 0.0})
        direction = acc.balance_direction or "借"
        # 期初余额暂设为0
        ob = 0.0
        # 期末余额
        if direction == "借":
            balance = round(c["debit"] - c["credit"], 2)
        else:
            balance = round(c["credit"] - c["debit"], 2)
        # 期初方向：余额>0与科目方向一致，<0相反
        if ob >= 0:
            opening_direction = direction
        else:
            opening_direction = "贷" if direction == "借" else "借"
        result.append({
            "account_code": acc.code,
            "account_name": name_map.get(acc.code, acc.name),
            "level": acc.level,
            "opening_balance": round(ob, 2),
            "opening_direction": opening_direction,
            "total_debit": round(p["debit"], 2),
            "total_credit": round(p["credit"], 2),
            "end_balance": balance,
            "end_direction": direction,
        })
    return result


# ==================== 明细账 ====================
@app.get("/api/ledger/detail")
def detail_ledger(
    company_id: int = Query(1),
    account_code: str = Query(...),
    period_from: str = Query(...),
    period_to: str = Query(...),
    db: Session = Depends(get_db)
):
    """明细账：调用统一余额计算函数获取期初余额，交易明细仍从序时账取"""
    account = db.query(Account).filter(
        Account.company_id == company_id,
        Account.code == account_code
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="科目不存在")

    # 期初余额 = 截止上期期末的累计净额
    prev = _prev_period(period_from)
    opening_raw = _compute_period_balances(company_id, None, prev, db)
    ob = opening_raw.get(account_code, {"debit": 0.0, "credit": 0.0})
    if account.balance_direction == "借":
        opening_balance = round(ob["debit"] - ob["credit"], 2)
    else:
        opening_balance = round(ob["credit"] - ob["debit"], 2)

    # 本期交易明细（仍需逐笔，无法从余额表获取）
    entries = db.query(JournalEntry).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.account_code == account_code,
        JournalEntry.period >= period_from,
        JournalEntry.period <= period_to
    ).order_by(JournalEntry.entry_date, JournalEntry.voucher_no, JournalEntry.id).all()

    rows = []
    balance = opening_balance
    for e in entries:
        dr = e.debit_amount or 0
        cr = e.credit_amount or 0
        if account.balance_direction == "借":
            balance += dr - cr
        else:
            balance += cr - dr
        rows.append({
            "voucher_date": str(e.entry_date) if e.entry_date else "",
            "voucher_no": f"{e.voucher_word or '记'}-{str(e.voucher_no).zfill(4)}" if e.voucher_no else "",
            "summary": e.summary or "",
            "debit_amount": dr,
            "credit_amount": cr,
            "balance": round(balance, 2),
        })

    return {
        "account_code": account.code,
        "account_name": account.name,
        "balance_direction": account.balance_direction,
        "opening_balance": round(opening_balance, 2),
        "rows": rows,
    }


# ==================== 利润表（企业会计准则一般企业—会企02号） ====================
def _pl_net(balances, code_prefix, is_credit_nature=True):
    """汇总指定前缀科目的净额：收入/收益类=贷-借，费用/损失类=借-贷"""
    total_dr = 0.0; total_cr = 0.0
    for code, bal in balances.items():
        if code.startswith(code_prefix):
            total_dr += bal["debit"]; total_cr += bal["credit"]
    return round(total_cr - total_dr, 2) if is_credit_nature else round(total_dr - total_cr, 2)

def _pl_row(label, current=0.0, prior=0.0, bold=False, highlight=False, indent=0):
    return {"label": label, "current": current, "prior": prior, "bold": bold, "highlight": highlight, "indent": indent}

def _build_pl(company_id, from_period, to_period, db):
    """构建单期利润表数据"""
    b = _compute_period_balances(company_id, from_period, to_period, db)
    # 一、营业收入
    rev = _pl_net(b, "6001") + _pl_net(b, "6051")
    cost = _pl_net(b, "6401", False) + _pl_net(b, "6402", False)
    tax_sur = _pl_net(b, "6403", False)
    sell_exp = _pl_net(b, "6601", False)
    admin_exp = _pl_net(b, "6602", False)
    rd_exp = _pl_net(b, "6604", False)
    fin_exp = _pl_net(b, "6603", False)
    fin_inc = _pl_net(b, "660301")  # 利息收入
    fin_cost = _pl_net(b, "660302", False)  # 利息费用
    inv_inc = _pl_net(b, "6111")
    credit_loss = _pl_net(b, "6701", False)
    asset_impair = _pl_net(b, "6702", False)
    asset_disp = _pl_net(b, "6712")  # 资产处置收益（贷余）
    other_inc = _pl_net(b, "6301")
    other_exp = _pl_net(b, "6711", False)
    income_tax = _pl_net(b, "6801", False)
    # 中间计算
    gross_p = round(rev - cost - tax_sur, 2)
    # 营业利润 = 毛利 - 期间费用 + 投资收益 + 资产处置收益 - 减值损失
    # 注：营业外收入(6301)/营业外支出(6711)不属于营业利润，在利润总额中加减
    op_p = round(gross_p - sell_exp - admin_exp - rd_exp - fin_exp + inv_inc + fin_inc + asset_disp - credit_loss - asset_impair, 2)
    total_p = round(op_p + other_inc - other_exp, 2)
    net_p = round(total_p - income_tax, 2)
    items = [
        _pl_row("一、营业收入", rev, bold=True),
        _pl_row("  减：营业成本", cost, indent=1),
        _pl_row("  减：税金及附加", tax_sur, indent=1),
        _pl_row("  减：销售费用", sell_exp, indent=1),
        _pl_row("  减：管理费用", admin_exp, indent=1),
        _pl_row("  减：研发费用", rd_exp, indent=1),
        _pl_row("  减：财务费用", fin_exp, indent=1),
        _pl_row("    其中：利息费用", fin_cost, indent=2),
        _pl_row("        利息收入", fin_inc, indent=2),
        _pl_row("  加：其他收益", 0.0, indent=1),
        _pl_row("  加：投资收益", inv_inc, indent=1),
        _pl_row("  加：资产处置收益", asset_disp, indent=1),
        _pl_row("  减：信用减值损失", credit_loss, indent=1),
        _pl_row("  减：资产减值损失", asset_impair, indent=1),
        _pl_row("二、营业利润", op_p, bold=True, highlight=True),
        _pl_row("  加：营业外收入", other_inc, indent=1),
        _pl_row("  减：营业外支出", other_exp, indent=1),
        _pl_row("三、利润总额", total_p, bold=True, highlight=True),
        _pl_row("  减：所得税费用", income_tax, indent=1),
        _pl_row("四、净利润", net_p, bold=True, highlight=True),
        _pl_row("五、其他综合收益的税后净额", 0.0, bold=True),
        _pl_row("六、综合收益总额", net_p, bold=True, highlight=True),
        _pl_row("七、每股收益", 0.0, bold=True),
        _pl_row("  （一）基本每股收益", 0.0, indent=1),
        _pl_row("  （二）稀释每股收益", 0.0, indent=1),
    ]
    return items

def _prior_same_period(period_from: str, period_to: str):
    """计算上年同期：如 2026-01→2026-03 → 2025-01→2025-03"""
    yf, mf = map(int, period_from.split("-"))
    yt, mt = map(int, period_to.split("-"))
    return f"{yf-1}-{mf:02d}", f"{yt-1}-{mt:02d}"

@app.get("/api/reports/profit-loss")
def profit_loss_report(
    company_id: int = Query(1),
    period_from: str = Query(...),
    period_to: str = Query(...),
    db: Session = Depends(get_db)
):
    """利润表（会企02号）：本期金额 + 上期金额"""
    current_items = _build_pl(company_id, period_from, period_to, db)
    prior_from, prior_to = _prior_same_period(period_from, period_to)
    prior_items = _build_pl(company_id, prior_from, prior_to, db)
    prior_map = {it["label"]: it["current"] for it in prior_items}
    for it in current_items:
        it["prior"] = prior_map.get(it["label"], 0.0)
    return {"items": current_items, "period_from": period_from, "period_to": period_to}


# ==================== 资产负债表（企业会计准则一般企业—会企01号） ====================
def _bs_year_begin(period: str):
    """年初期间：2026-03 → 2025-12"""
    y = int(period.split("-")[0])
    return f"{y-1}-12"

def _bs_net(balances, code_prefix, is_debit_nature=True):
    """资产类=借-贷，负债/权益类=贷-借"""
    total_dr = 0.0; total_cr = 0.0
    for code, bal in balances.items():
        if code.startswith(code_prefix):
            total_dr += bal["debit"]; total_cr += bal["credit"]
    return round(total_dr - total_cr, 2) if is_debit_nature else round(total_cr - total_dr, 2)

def _bs_row(label, end=0.0, begin=0.0, bold=False, highlight=False, indent=0):
    return {"label": label, "end": end, "begin": begin, "bold": bold, "highlight": highlight, "indent": indent}

def _build_bs_side(balances, side):
    """构建资产负债表一侧（资产 或 负债+权益）"""
    r = _bs_row
    b = balances
    if side == "assets":
        # 流动资产
        cash = _bs_net(b, "1001") + _bs_net(b, "1002") + _bs_net(b, "1003")
        fin_asset = _bs_net(b, "1101")
        notes_recv = _bs_net(b, "1121")
        ar = _bs_net(b, "1122")
        ar_fin = _bs_net(b, "1124")
        prepay = _bs_net(b, "1123")
        other_recv = _bs_net(b, "1221")
        inventory = _bs_net(b, "1403") + _bs_net(b, "1405") + _bs_net(b, "1406") + _bs_net(b, "1408") + _bs_net(b, "1411")
        contract_asset = _bs_net(b, "1401")
        held_for_sale_a = _bs_net(b, "1501")
        noncurr_due_1y = _bs_net(b, "1502")
        other_current_a = _bs_net(b, "1503")
        total_current = round(cash + fin_asset + notes_recv + ar + ar_fin + prepay + other_recv + inventory + contract_asset + held_for_sale_a + noncurr_due_1y + other_current_a, 2)
        # 非流动资产
        debt_inv = _bs_net(b, "1504")
        other_debt_inv = _bs_net(b, "1505")
        lt_recv = _bs_net(b, "1511")
        lt_equity = _bs_net(b, "1512")
        other_equity = _bs_net(b, "1513")
        other_nc_fin = _bs_net(b, "1514")
        invest_prop = _bs_net(b, "1521")
        fixed_asset = _bs_net(b, "1601")
        accum_depr = _bs_net(b, "1602", False)
        cip = _bs_net(b, "1604")
        bio_asset = _bs_net(b, "1621")
        oil_gas = _bs_net(b, "1631")
        rou_asset = _bs_net(b, "1641")
        intangible = _bs_net(b, "1701")
        dev_exp = _bs_net(b, "1702")
        goodwill = _bs_net(b, "1711")
        lt_deferred = _bs_net(b, "1801")
        def_tax_asset = _bs_net(b, "1811")
        other_nc_a = _bs_net(b, "1901")
        total_nc = round(debt_inv + other_debt_inv + lt_recv + lt_equity + other_equity + other_nc_fin + invest_prop + fixed_asset + accum_depr + cip + bio_asset + oil_gas + rou_asset + intangible + dev_exp + goodwill + lt_deferred + def_tax_asset + other_nc_a, 2)
        total_assets = round(total_current + total_nc, 2)
        return [
            r("流动资产：", bold=True),
            r("  货币资金", cash, indent=1), r("  交易性金融资产", fin_asset, indent=1),
            r("  应收票据", notes_recv, indent=1), r("  应收账款", ar, indent=1),
            r("  应收款项融资", ar_fin, indent=1), r("  预付款项", prepay, indent=1),
            r("  其他应收款", other_recv, indent=1), r("  存货", inventory, indent=1),
            r("  合同资产", contract_asset, indent=1), r("  持有待售资产", held_for_sale_a, indent=1),
            r("  一年内到期的非流动资产", noncurr_due_1y, indent=1), r("  其他流动资产", other_current_a, indent=1),
            r("流动资产合计", total_current, bold=True, highlight=True),
            r("非流动资产：", bold=True),
            r("  债权投资", debt_inv, indent=1), r("  其他债权投资", other_debt_inv, indent=1),
            r("  长期应收款", lt_recv, indent=1), r("  长期股权投资", lt_equity, indent=1),
            r("  其他权益工具投资", other_equity, indent=1), r("  其他非流动金融资产", other_nc_fin, indent=1),
            r("  投资性房地产", invest_prop, indent=1),
            r("  固定资产", round(fixed_asset + accum_depr, 2) if fixed_asset else 0.0, indent=1),
            r("  在建工程", cip, indent=1), r("  生产性生物资产", bio_asset, indent=1),
            r("  使用权资产", rou_asset, indent=1), r("  无形资产", intangible, indent=1),
            r("  开发支出", dev_exp, indent=1), r("  商誉", goodwill, indent=1),
            r("  长期待摊费用", lt_deferred, indent=1), r("  递延所得税资产", def_tax_asset, indent=1),
            r("  其他非流动资产", other_nc_a, indent=1),
            r("", 0), r("", 0),
            r("非流动资产合计", total_nc, bold=True, highlight=True),
            r("资产总计", total_assets, bold=True, highlight=True),
        ]
    else:
        # 流动负债
        st_loan = _bs_net(b, "2001", False)
        fin_liab = _bs_net(b, "2101", False)
        notes_pay = _bs_net(b, "2201", False)
        ap = _bs_net(b, "2202", False)
        advance_rcv = _bs_net(b, "2203", False)
        contract_liab = _bs_net(b, "2204", False)
        payroll = _bs_net(b, "2211", False)
        taxes = _bs_net(b, "2221", False)
        other_pay = _bs_net(b, "2241", False)
        held_for_sale_l = _bs_net(b, "2242", False)
        nc_due_1y_l = _bs_net(b, "2243", False)
        other_current_l = _bs_net(b, "2244", False)
        total_current_l = round(st_loan + fin_liab + notes_pay + ap + advance_rcv + contract_liab + payroll + taxes + other_pay + held_for_sale_l + nc_due_1y_l + other_current_l, 2)
        # 非流动负债
        lt_loan = _bs_net(b, "2501", False)
        bonds_pay = _bs_net(b, "2502", False)
        lease_liab = _bs_net(b, "2601", False)
        lt_pay = _bs_net(b, "2701", False)
        estimated_liab = _bs_net(b, "2801", False)
        deferred_inc = _bs_net(b, "2901", False)
        def_tax_liab = _bs_net(b, "2902", False)
        other_nc_l = _bs_net(b, "2903", False)
        total_nc_l = round(lt_loan + bonds_pay + lease_liab + lt_pay + estimated_liab + deferred_inc + def_tax_liab + other_nc_l, 2)
        total_liab = round(total_current_l + total_nc_l, 2)
        # 所有者权益
        paid_in = _bs_net(b, "4001", False)
        other_equity_instr = _bs_net(b, "4002", False)
        capital_surplus = _bs_net(b, "4003", False)
        treasury_stock = _bs_net(b, "4004")
        oci = _bs_net(b, "4005", False)
        special_reserve = _bs_net(b, "4101", False)
        surplus = _bs_net(b, "4103", False)
        retained = _bs_net(b, "4104", False)
        total_equity = round(paid_in + other_equity_instr + capital_surplus - treasury_stock + oci + special_reserve + surplus + retained, 2)
        total_right = round(total_liab + total_equity, 2)
        return [
            r("流动负债：", bold=True),
            r("  短期借款", st_loan, indent=1), r("  交易性金融负债", fin_liab, indent=1),
            r("  应付票据", notes_pay, indent=1), r("  应付账款", ap, indent=1),
            r("  预收款项", advance_rcv, indent=1), r("  合同负债", contract_liab, indent=1),
            r("  应付职工薪酬", payroll, indent=1), r("  应交税费", taxes, indent=1),
            r("  其他应付款", other_pay, indent=1), r("  持有待售负债", held_for_sale_l, indent=1),
            r("  一年内到期的非流动负债", nc_due_1y_l, indent=1), r("  其他流动负债", other_current_l, indent=1),
            r("流动负债合计", total_current_l, bold=True, highlight=True),
            r("非流动负债：", bold=True),
            r("  长期借款", lt_loan, indent=1), r("  应付债券", bonds_pay, indent=1),
            r("  租赁负债", lease_liab, indent=1), r("  长期应付款", lt_pay, indent=1),
            r("  预计负债", estimated_liab, indent=1), r("  递延收益", deferred_inc, indent=1),
            r("  递延所得税负债", def_tax_liab, indent=1), r("  其他非流动负债", other_nc_l, indent=1),
            r("非流动负债合计", total_nc_l, bold=True, highlight=True),
            r("负债合计", total_liab, bold=True, highlight=True),
            r("所有者权益（或股东权益）：", bold=True),
            r("  实收资本（或股本）", paid_in, indent=1), r("  其他权益工具", other_equity_instr, indent=1),
            r("  资本公积", capital_surplus, indent=1), r("  减：库存股", treasury_stock, indent=1),
            r("  其他综合收益", oci, indent=1), r("  专项储备", special_reserve, indent=1),
            r("  盈余公积", surplus, indent=1), r("  未分配利润", retained, indent=1),
            r("所有者权益合计", total_equity, bold=True, highlight=True),
            r("负债和所有者权益总计", total_right, bold=True, highlight=True),
        ]

@app.get("/api/reports/balance-sheet")
def balance_sheet_report(
    company_id: int = Query(1),
    period: str = Query(...),
    db: Session = Depends(get_db)
):
    """资产负债表（会企01号）：期末余额 + 年初余额"""
    end_balances = _compute_period_balances(company_id, None, period, db)
    yb = _bs_year_begin(period)
    begin_balances = _compute_period_balances(company_id, None, yb, db) if yb else {}
    def _fill_bs(rows, bb):
        for r in rows:
            r["begin"] = bb.get(r["label"], 0.0) if isinstance(bb, dict) else 0.0
        return rows
    assets = _build_bs_side(end_balances, "assets")
    liab_eq = _build_bs_side(end_balances, "liab_eq")
    # 年初余额单独计算
    assets_begin = _build_bs_side(begin_balances, "assets") if begin_balances else assets
    liab_eq_begin = _build_bs_side(begin_balances, "liab_eq") if begin_balances else liab_eq
    begin_map_a = {r["label"]: r["end"] for r in assets_begin}
    begin_map_le = {r["label"]: r["end"] for r in liab_eq_begin}
    for r in assets:
        r["begin"] = begin_map_a.get(r["label"], 0.0)
    for r in liab_eq:
        r["begin"] = begin_map_le.get(r["label"], 0.0)
    return {"assets": assets, "liabilities_equity": liab_eq, "period": period}


# ==================== 现金流量表（企业会计准则一般企业—会企03号） ====================
def _prior_period_year(period: str):
    """上年同期：2026 → 2025"""
    y = int(period.split("-")[0])
    return str(y - 1)

def _cf_net_cash_by_accounts(company_id, period_from, period_to, cash_codes, db, inflow=True):
    """计算涉及现金科目的对方科目发生额（直接法）"""
    entries = db.query(JournalEntry).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period >= period_from,
        JournalEntry.period <= period_to,
    ).all()
    # 按凭证号分组
    vouchers = {}
    for e in entries:
        vouchers.setdefault(e.voucher_no, []).append(e)
    total = 0.0
    for vno, lines in vouchers.items():
        has_cash = any(l.account_code and any(l.account_code.startswith(c) for c in cash_codes) for l in lines)
        if not has_cash:
            continue
        # 此凭证涉及现金 → 对方科目汇总
        for l in lines:
            if l.account_code and any(l.account_code.startswith(c) for c in cash_codes):
                if inflow:
                    total += (l.credit_amount or 0)  # 现金流入：贷现金
                else:
                    total += (l.debit_amount or 0)  # 现金流出：借现金
    return round(total, 2)


@app.get("/api/reports/cash-flow")
def cash_flow_report(
    company_id: int = Query(1),
    period_from: str = Query(...),
    period_to: str = Query(...),
    db: Session = Depends(get_db)
):
    """现金流量表（会企03号）：直接法"""
    cash_codes = ["1001", "1002", "1003"]  # 库存现金、银行存款、其他货币资金

    def cf_row(label, current=0.0, prior=0.0, bold=False, highlight=False, indent=0):
        return {"label": label, "current": current, "prior": prior, "bold": bold, "highlight": highlight, "indent": indent}

    # 期初/期末现金余额
    begin_period = period_from[:4] + "-01"
    balances_end = _compute_period_balances(company_id, None, period_to, db)
    balances_begin = _compute_period_balances(company_id, None, _prev_period(begin_period), db)
    cash_end = sum(_bs_net(balances_end, c) for c in cash_codes)
    cash_begin = sum(_bs_net(balances_begin, c) for c in cash_codes)

    # 经营活动
    op_inflow1 = _cf_net_cash_by_accounts(company_id, period_from, period_to, cash_codes, db, inflow=True)
    op_outflow1 = _cf_net_cash_by_accounts(company_id, period_from, period_to, cash_codes, db, inflow=False)
    op_net = round(op_inflow1 - op_outflow1, 2)

    items = [
        cf_row("一、经营活动产生的现金流量：", bold=True),
        cf_row("  销售商品、提供劳务收到的现金", op_inflow1, indent=1),
        cf_row("  收到的税费返还", 0.0, indent=1),
        cf_row("  收到其他与经营活动有关的现金", 0.0, indent=1),
        cf_row("经营活动现金流入小计", op_inflow1, bold=True, highlight=True),
        cf_row("  购买商品、接受劳务支付的现金", op_outflow1, indent=1),
        cf_row("  支付给职工以及为职工支付的现金", 0.0, indent=1),
        cf_row("  支付的各项税费", 0.0, indent=1),
        cf_row("  支付其他与经营活动有关的现金", 0.0, indent=1),
        cf_row("经营活动现金流出小计", op_outflow1, bold=True, highlight=True),
        cf_row("经营活动产生的现金流量净额", op_net, bold=True, highlight=True),
        cf_row("二、投资活动产生的现金流量：", bold=True),
        cf_row("  收回投资收到的现金", 0.0, indent=1),
        cf_row("  取得投资收益收到的现金", 0.0, indent=1),
        cf_row("  处置固定资产、无形资产收回的现金净额", 0.0, indent=1),
        cf_row("  处置子公司及其他营业单位收到的现金净额", 0.0, indent=1),
        cf_row("  收到其他与投资活动有关的现金", 0.0, indent=1),
        cf_row("投资活动现金流入小计", 0.0, bold=True, highlight=True),
        cf_row("  购建固定资产、无形资产支付的现金", 0.0, indent=1),
        cf_row("  投资支付的现金", 0.0, indent=1),
        cf_row("  取得子公司及其他营业单位支付的现金净额", 0.0, indent=1),
        cf_row("  支付其他与投资活动有关的现金", 0.0, indent=1),
        cf_row("投资活动现金流出小计", 0.0, bold=True, highlight=True),
        cf_row("投资活动产生的现金流量净额", 0.0, bold=True, highlight=True),
        cf_row("三、筹资活动产生的现金流量：", bold=True),
        cf_row("  吸收投资收到的现金", 0.0, indent=1),
        cf_row("  取得借款收到的现金", 0.0, indent=1),
        cf_row("  收到其他与筹资活动有关的现金", 0.0, indent=1),
        cf_row("筹资活动现金流入小计", 0.0, bold=True, highlight=True),
        cf_row("  偿还债务支付的现金", 0.0, indent=1),
        cf_row("  分配股利、利润或偿付利息支付的现金", 0.0, indent=1),
        cf_row("  支付其他与筹资活动有关的现金", 0.0, indent=1),
        cf_row("筹资活动现金流出小计", 0.0, bold=True, highlight=True),
        cf_row("筹资活动产生的现金流量净额", 0.0, bold=True, highlight=True),
        cf_row("四、汇率变动对现金的影响", 0.0),
        cf_row("五、现金及现金等价物净增加额", op_net, bold=True, highlight=True),
        cf_row("  加：期初现金及现金等价物余额", cash_begin, indent=1),
        cf_row("六、期末现金及现金等价物余额", cash_end, bold=True, highlight=True),
    ]
    return {"items": items, "period_from": period_from, "period_to": period_to, "cash_begin": cash_begin, "cash_end": cash_end}


# ==================== 所有者权益变动表（企业会计准则一般企业—会企04号） ====================
ZERO9 = [0.0]*9           # 9 列零值
def _eq9(*indices_vals):  # (idx, val, ...) → 9 列数组
    a = [0.0]*9
    for i in range(0, len(indices_vals), 2):
        a[indices_vals[i]] = round(indices_vals[i+1], 2)
    return a

@app.get("/api/reports/equity-changes")
def equity_changes_report(
    company_id: int = Query(1),
    period: str = Query(...),
    db: Session = Depends(get_db)
):
    """所有者权益变动表（会企04号标准格式）"""
    yb = _bs_year_begin(period)
    begin_b = _compute_period_balances(company_id, None, yb, db)
    end_b = _compute_period_balances(company_id, None, period, db)

    py = period.split("-")[0]
    pl_items = _build_pl(company_id, f"{py}-01", period, db)
    net_profit = next((it["current"] for it in pl_items if it["label"] == "四、净利润"), 0.0)

    def eq_val(balances, prefix):
        d = sum(v["debit"] for code, v in balances.items() if code.startswith(prefix))
        c = sum(v["credit"] for code, v in balances.items() if code.startswith(prefix))
        return round(c - d, 2)  # 权益类：贷-借

    prefixes = ["4001", "4002", "4003", "4004", "4005", "4101", "4103", "4104"]
    begin_each = [eq_val(begin_b, p) if p else 0.0 for p in prefixes]
    end_each = [eq_val(end_b, p) if p else 0.0 for p in prefixes]
    # 未分配利润期末 = 年初 + 净利润
    end_each[7] = round(begin_each[7] + net_profit, 2)
    # 合计辅助
    def total9(arr): return round(sum(arr), 2)
    begin9 = begin_each + [total9(begin_each)]
    end9 = end_each + [total9(end_each)]
    chg9 = [round(end9[i] - begin9[i], 2) for i in range(9)]

    cols = ["实收资本", "其他权益工具", "资本公积", "库存股", "其他综合收益", "专项储备", "盈余公积", "未分配利润", "所有者权益合计"]

    # 净利润只影响 未分配利润(7) 和 合计(8)
    np9 = [0.0]*9; np9[7] = net_profit; np9[8] = net_profit

    items = [
        {"label": "一、上年年末余额", "vals": begin9, "bold": True, "indent": 0, "highlight": False},
        {"label": "  加：会计政策变更", "vals": ZERO9, "bold": False, "indent": 1, "highlight": False},
        {"label": "  前期差错更正", "vals": ZERO9, "bold": False, "indent": 1, "highlight": False},
        {"label": "  其他", "vals": ZERO9, "bold": False, "indent": 1, "highlight": False},
        {"label": "二、本年年初余额", "vals": begin9, "bold": True, "indent": 0, "highlight": False},
        {"label": "三、本年增减变动金额（减少以\"-\"号填列）", "vals": chg9, "bold": True, "indent": 0, "highlight": False},
        {"label": "  （一）综合收益总额", "vals": np9, "bold": False, "indent": 1, "highlight": True},
        {"label": "  （二）所有者投入和减少资本", "vals": ZERO9, "bold": False, "indent": 1, "highlight": False},
        {"label": "    1. 所有者投入的普通股", "vals": ZERO9, "bold": False, "indent": 2, "highlight": False},
        {"label": "    2. 其他权益工具持有者投入资本", "vals": ZERO9, "bold": False, "indent": 2, "highlight": False},
        {"label": "    3. 股份支付计入所有者权益的金额", "vals": ZERO9, "bold": False, "indent": 2, "highlight": False},
        {"label": "    4. 其他", "vals": ZERO9, "bold": False, "indent": 2, "highlight": False},
        {"label": "  （三）利润分配", "vals": ZERO9, "bold": False, "indent": 1, "highlight": False},
        {"label": "    1. 提取盈余公积", "vals": ZERO9, "bold": False, "indent": 2, "highlight": False},
        {"label": "    2. 对所有者（或股东）的分配", "vals": ZERO9, "bold": False, "indent": 2, "highlight": False},
        {"label": "    3. 其他", "vals": ZERO9, "bold": False, "indent": 2, "highlight": False},
        {"label": "  （四）所有者权益内部结转", "vals": ZERO9, "bold": False, "indent": 1, "highlight": False},
        {"label": "    1. 资本公积转增资本（或股本）", "vals": ZERO9, "bold": False, "indent": 2, "highlight": False},
        {"label": "    2. 盈余公积转增资本（或股本）", "vals": ZERO9, "bold": False, "indent": 2, "highlight": False},
        {"label": "    3. 盈余公积弥补亏损", "vals": ZERO9, "bold": False, "indent": 2, "highlight": False},
        {"label": "    4. 设定受益计划变动额结转留存收益", "vals": ZERO9, "bold": False, "indent": 2, "highlight": False},
        {"label": "    5. 其他综合收益结转留存收益", "vals": ZERO9, "bold": False, "indent": 2, "highlight": False},
        {"label": "    6. 其他", "vals": ZERO9, "bold": False, "indent": 2, "highlight": False},
        {"label": "  （五）专项储备", "vals": ZERO9, "bold": False, "indent": 1, "highlight": False},
        {"label": "    1. 本期提取", "vals": ZERO9, "bold": False, "indent": 2, "highlight": False},
        {"label": "    2. 本期使用", "vals": ZERO9, "bold": False, "indent": 2, "highlight": False},
        {"label": "  （六）其他", "vals": ZERO9, "bold": False, "indent": 1, "highlight": False},
        {"label": "四、本年年末余额", "vals": end9, "bold": True, "indent": 0, "highlight": True},
    ]
    return {"columns": cols, "items": items, "period": period}


@app.post("/api/journal-entries")
def create_journal_entry(data: JournalEntryCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    e = JournalEntry(company_id=company_id, **data.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    return {"id": e.id, "message": "序时账记录创建成功"}


@app.get("/api/journal-entries/{entry_id}")
def get_journal_entry(entry_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    e = db.query(JournalEntry).filter(JournalEntry.company_id == company_id, JournalEntry.id == entry_id).first()
    if not e:
        raise HTTPException(404, detail="记录不存在")
    return {
        "id": e.id, "entry_date": str(e.entry_date), "period": e.period,
        "voucher_word": e.voucher_word, "voucher_no": e.voucher_no,
        "attach_count": e.attach_count or 0, "summary": e.summary or "",
        "account_code": e.account_code, "account_name": e.account_name or "",
        "debit_amount": e.debit_amount or 0, "credit_amount": e.credit_amount or 0,
        "prepared_by": e.prepared_by or "", "reviewed_by": e.reviewed_by or "",
        "is_reviewed": e.is_reviewed, "remark": e.remark or "",
        "contact_project": e.contact_project or "",
        "spec_model": e.spec_model or "",
        "quantity": e.quantity or 0, "unit": e.unit or "",
        "unit_price": e.unit_price or 0,
        "created_at": str(e.created_at) if e.created_at else None,
    }


@app.put("/api/journal-entries/{entry_id}")
def update_journal_entry(entry_id: int, data: JournalEntryUpdate, company_id: int = Query(1), db: Session = Depends(get_db)):
    e = db.query(JournalEntry).filter(JournalEntry.company_id == company_id, JournalEntry.id == entry_id).first()
    if not e:
        raise HTTPException(404, detail="记录不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(e, k, v)
    db.commit()
    return {"message": "更新成功"}


@app.delete("/api/journal-entries/{entry_id}")
def delete_journal_entry(entry_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    e = db.query(JournalEntry).filter(JournalEntry.company_id == company_id, JournalEntry.id == entry_id).first()
    if not e:
        raise HTTPException(404, detail="记录不存在")
    period, vw = e.period, e.voucher_word
    db.delete(e)
    db.flush()
    _renumber_vouchers(db, company_id, period, vw)
    db.commit()
    return {"message": "删除成功"}


def _renumber_vouchers(db, company_id, period, voucher_word):
    """删除后自动重排同一期间+凭证字下的凭证号"""
    entries = db.query(JournalEntry).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period == period,
        JournalEntry.voucher_word == voucher_word,
    ).order_by(JournalEntry.voucher_no.asc(), JournalEntry.id.asc()).all()
    # 按 voucher_no 分组保持完整性，逐组重编号
    seen = set()
    groups = []
    for e in entries:
        if e.voucher_no not in seen:
            seen.add(e.voucher_no)
            groups.append(e.voucher_no)
    # 重新分配 voucher_no: 按原有顺序从1开始
    new_no = 1
    for old_no in groups:
        db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.period == period,
            JournalEntry.voucher_word == voucher_word,
            JournalEntry.voucher_no == old_no,
        ).update({JournalEntry.voucher_no: new_no}, synchronize_session=False)
        new_no += 1


@app.post("/api/journal-entries/batch-delete")
def batch_delete_journal_entries(req: BatchDeleteRequest, company_id: int = Query(1), db: Session = Depends(get_db)):
    # 先查出被删记录的 (period, voucher_word) 组合
    deleted_records = db.query(JournalEntry).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.id.in_(req.ids)
    ).all()
    combos = set((e.period, e.voucher_word) for e in deleted_records)
    deleted = db.query(JournalEntry).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.id.in_(req.ids)
    ).delete(synchronize_session=False)
    db.flush()
    for period, vw in combos:
        _renumber_vouchers(db, company_id, period, vw)
    db.commit()
    return {"message": f"成功删除 {deleted} 条记录", "count": deleted}


@app.post("/api/sales-invoices/{invoice_id}/to-journal")
def sales_invoice_to_journal(invoice_id: int, company_id: int = Query(1), db=Depends(get_db)):
    """将单张销项发票生成记账凭证（分录）到序时账（允许重新生成，先删旧凭证）"""
    inv = db.query(SalesInvoice).filter(SalesInvoice.company_id == company_id, SalesInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(404, "发票不存在")
    def get_full_name(code):
        """构建科目的全级次名称，如 221001001 → 应交税费/应交增值税/销项税额"""
        parts = []
        cur = code
        while cur:
            acc = db.query(Account).filter(
                Account.company_id == inv.company_id,
                Account.code == cur
            ).first()
            if not acc:
                break
            parts.insert(0, acc.name)
            cur = acc.parent_code
        return "/".join(parts) if parts else code

    def ensure_revenue_sub(goods_name):
        """确保主营业务收入下存在对应货物的子科目，返回 (code, full_name)"""
        if not goods_name:
            return ("6001", get_full_name("6001"))
        existing = db.query(Account).filter(
            Account.company_id == inv.company_id,
            Account.parent_code == "6001",
            Account.name == goods_name
        ).first()
        if existing:
            return (existing.code, get_full_name(existing.code))
        max_sub = db.query(Account.code).filter(
            Account.company_id == inv.company_id,
            Account.parent_code == "6001"
        ).order_by(Account.code.desc()).first()
        next_num = int(max_sub[0][4:]) + 1 if (max_sub and max_sub[0]) else 1
        new_code = f"6001{next_num:03d}"
        new_acc = Account(
            company_id=inv.company_id,
            code=new_code,
            name=goods_name,
            category="收入",
            balance_direction="贷",
            level=2,
            parent_code="6001",
        )
        db.add(new_acc)
        db.flush()
        return (new_code, get_full_name(new_code))

    period = inv.invoice_date.strftime("%Y-%m") if inv.invoice_date else datetime.now().strftime("%Y-%m")

    max_no = db.query(JournalEntry.voucher_no).filter(
        JournalEntry.company_id == inv.company_id,
        JournalEntry.period == period,
        JournalEntry.voucher_word == "记"
    ).order_by(JournalEntry.voucher_no.desc()).first()
    next_voucher_no = (max_no[0] + 1) if max_no and max_no[0] else 1

    date_str = inv.invoice_date.strftime("%Y-%m-%d") if inv.invoice_date else period + "-01"
    buyer = inv.buyer_name or "客户"
    goods = inv.goods_name or ""
    summary = f"销售{goods or '货物'}给{buyer}"

    # 先删旧凭证（允许重新生成）
    db.query(JournalEntry).filter(
        JournalEntry.company_id == inv.company_id,
        JournalEntry.source == "开具发票",
        JournalEntry.ref_id == inv.id
    ).delete(synchronize_session=False)
    db.flush()

    rev_code, rev_name = ensure_revenue_sub(goods)

    entries = [
        JournalEntry(
            company_id=inv.company_id,
            entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
            period=period,
            voucher_word="记",
            voucher_no=next_voucher_no,
            summary=summary,
            account_code="1122",
            account_name=get_full_name("1122"),
            debit_amount=inv.total_amount,
            credit_amount=0,
            contact_project=buyer,
            spec_model=inv.spec or "",
            quantity=inv.quantity or 0,
            unit=inv.unit or "",
            unit_price=inv.unit_price or 0,
            source="开具发票", ref_id=inv.id,
        ),
        JournalEntry(
            company_id=inv.company_id,
            entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
            period=period,
            voucher_word="记",
            voucher_no=next_voucher_no,
            summary=summary,
            account_code=rev_code,
            account_name=rev_name,
            debit_amount=0,
            credit_amount=inv.amount,
            contact_project="",
            spec_model=inv.spec or "",
            quantity=inv.quantity or 0,
            unit=inv.unit or "",
            unit_price=inv.unit_price or 0,
            source="开具发票", ref_id=inv.id,
        ),
        JournalEntry(
            company_id=inv.company_id,
            entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
            period=period,
            voucher_word="记",
            voucher_no=next_voucher_no,
            summary=f"{summary}（增值税）",
            account_code="221001001",
            account_name=get_full_name("221001001"),
            debit_amount=0,
            credit_amount=inv.tax_amount,
            contact_project="",
            spec_model=inv.spec or "",
            quantity=inv.quantity or 0,
            unit=inv.unit or "",
            unit_price=inv.unit_price or 0,
            source="开具发票", ref_id=inv.id,
        ),
    ]
    for e in entries:
        db.add(e)
    db.commit()
    return {"message": f"已生成凭证，凭证号：记-{next_voucher_no}", "voucher_no": next_voucher_no, "period": period}


# ==================== 进项抵扣 ====================

class InputVATDeductionCreate(BaseModel):
    purchase_invoice_id: Optional[int] = None
    check_status: Optional[str] = "未勾选"
    invoice_source: Optional[str] = None
    domestic_sale_cert_no: Optional[str] = None
    digital_invoice_no: Optional[str] = None
    invoice_code: Optional[str] = None
    invoice_no: Optional[str] = None
    invoice_date: Optional[date] = None
    seller_tax_id: Optional[str] = None
    seller_name: Optional[str] = None
    amount: float = 0.0
    tax_amount: float = 0.0
    deductible_tax_amount: float = 0.0
    invoice_category: Optional[str] = None
    invoice_category_label: Optional[str] = None
    invoice_status: Optional[str] = "正常"
    check_time: Optional[datetime] = None
    risk_level: Optional[str] = "正常"
    # 保留字段
    goods_name: Optional[str] = None
    total_amount: float = 0.0
    tax_rate: Optional[float] = 0.0
    deducted_tax_amount: Optional[float] = 0.0
    deduction_period: Optional[str] = None
    deduction_status: str = "待抵扣"
    certification_date: Optional[date] = None
    deduction_date: Optional[date] = None
    deduction_method: str = "凭票抵扣"
    voucher_no: Optional[str] = None
    remark: Optional[str] = None


class InputVATDeductionUpdate(BaseModel):
    check_status: Optional[str] = None
    invoice_source: Optional[str] = None
    domestic_sale_cert_no: Optional[str] = None
    digital_invoice_no: Optional[str] = None
    invoice_code: Optional[str] = None
    invoice_no: Optional[str] = None
    invoice_date: Optional[date] = None
    seller_tax_id: Optional[str] = None
    seller_name: Optional[str] = None
    amount: Optional[float] = None
    tax_amount: Optional[float] = None
    deductible_tax_amount: Optional[float] = None
    invoice_category: Optional[str] = None
    invoice_category_label: Optional[str] = None
    invoice_status: Optional[str] = None
    check_time: Optional[datetime] = None
    risk_level: Optional[str] = None
    # 保留字段
    goods_name: Optional[str] = None
    total_amount: Optional[float] = None
    tax_rate: Optional[float] = None
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
    invoice_status: Optional[str] = None,
    check_status: Optional[str] = None,
    risk_level: Optional[str] = None,
    deduction_period: Optional[str] = None,
    keyword: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(InputVATDeduction).filter(InputVATDeduction.company_id == company_id)
    if invoice_status:
        q = q.filter(InputVATDeduction.invoice_status == invoice_status)
    if check_status:
        q = q.filter(InputVATDeduction.check_status == check_status)
    if risk_level:
        q = q.filter(InputVATDeduction.risk_level == risk_level)
    if deduction_period:
        q = q.filter(InputVATDeduction.deduction_period == deduction_period)
    if date_from:
        q = q.filter(InputVATDeduction.invoice_date >= date_from)
    if date_to:
        q = q.filter(InputVATDeduction.invoice_date <= date_to)
    if keyword:
        q = q.filter(or_(
            InputVATDeduction.invoice_no.contains(keyword),
            InputVATDeduction.digital_invoice_no.contains(keyword),
            InputVATDeduction.invoice_code.contains(keyword),
            InputVATDeduction.seller_name.contains(keyword),
            InputVATDeduction.seller_tax_id.contains(keyword),
        ))
    items = q.order_by(InputVATDeduction.invoice_date.desc(), InputVATDeduction.check_time.desc()).all()
    # 构建凭证号映射（进项抵扣 → 序时账，按期间匹配 source="进项抵扣" 的汇总凭证）
    periods_set = list(set(it.deduction_period for it in items if it.deduction_period))
    period_vouchers = {}
    if periods_set:
        for je in db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.source == "进项抵扣",
            JournalEntry.period.in_(periods_set),
            JournalEntry.account_code == "221001002"
        ).all():
            period_vouchers[je.period] = f"{je.voucher_word}-{je.voucher_no}"
    voucher_map = {}
    for it in items:
        if it.deduction_period and it.deduction_period in period_vouchers:
            voucher_map[it.id] = period_vouchers[it.deduction_period]
    return [{
        "id": it.id, "purchase_invoice_id": it.purchase_invoice_id,
        "check_status": it.check_status or "未勾选",
        "invoice_source": it.invoice_source or "",
        "domestic_sale_cert_no": it.domestic_sale_cert_no or "",
        "digital_invoice_no": it.digital_invoice_no or "",
        "invoice_code": it.invoice_code or "",
        "invoice_no": it.invoice_no or "",
        "invoice_date": str(it.invoice_date) if it.invoice_date else "",
        "seller_tax_id": it.seller_tax_id or "",
        "seller_name": it.seller_name or "",
        "amount": it.amount or 0,
        "tax_amount": it.tax_amount or 0,
        "deductible_tax_amount": it.deductible_tax_amount or 0,
        "invoice_category": it.invoice_category or "",
        "invoice_category_label": it.invoice_category_label or "",
        "invoice_status": it.invoice_status or "正常",
        "check_time": str(it.check_time) if it.check_time else "",
        "risk_level": it.risk_level or "正常",
        "goods_name": it.goods_name or "",
        "total_amount": it.total_amount or 0,
        "tax_rate": it.tax_rate or 0,
        "deducted_tax_amount": it.deducted_tax_amount or 0,
        "deduction_period": it.deduction_period or "",
        "deduction_status": it.deduction_status or "",
        "certification_date": str(it.certification_date) if it.certification_date else "",
        "deduction_date": str(it.deduction_date) if it.deduction_date else "",
        "deduction_method": it.deduction_method or "",
        "voucher_no": it.voucher_no or "", "remark": it.remark or "",
        "journal_voucher_no": voucher_map.get(it.id, ""),
        "created_at": str(it.created_at) if it.created_at else ""
    } for it in items]


@app.post("/api/input-vat-deductions")
def create_input_vat_deduction(data: InputVATDeductionCreate, company_id: int = Query(1), db: Session = Depends(get_db)):
    item = InputVATDeduction(company_id=company_id, **data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    # 自动生成序时账凭证（按期间汇总）
    try:
        period = item.deduction_period
        if not period:
            period = item.invoice_date.strftime("%Y-%m") if item.invoice_date else datetime.now().strftime("%Y-%m")
        auto_generate_input_vat_for_period(db, company_id, period)
    except Exception as e:
        db.rollback()
    return {"id": item.id, "message": "进项抵扣记录创建成功"}


@app.get("/api/input-vat-deductions/stats")
def input_vat_deduction_stats(company_id: int = Query(1), db: Session = Depends(get_db)):
    base = db.query(InputVATDeduction).filter(InputVATDeduction.company_id == company_id)
    total_count = base.count()
    total_tax = base.with_entities(func.sum(InputVATDeduction.tax_amount)).scalar() or 0
    total_deductible = base.with_entities(func.sum(InputVATDeduction.deductible_tax_amount)).scalar() or 0
    total_amount = base.with_entities(func.sum(InputVATDeduction.amount)).scalar() or 0
    unchecked_count = base.filter(InputVATDeduction.check_status == "未勾选").count()
    checked_count = base.filter(InputVATDeduction.check_status == "已勾选").count()
    abnormal_count = base.filter(InputVATDeduction.risk_level.in_(["疑点", "异常", "失控"])).count()
    return {
        "total_count": total_count,
        "total_amount": round(total_amount, 2),
        "total_tax": round(total_tax, 2),
        "total_deductible": round(total_deductible, 2),
        "unchecked_count": unchecked_count,
        "checked_count": checked_count,
        "abnormal_count": abnormal_count
    }


@app.get("/api/input-vat-deductions/{item_id}")
def get_input_vat_deduction(item_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    it = db.query(InputVATDeduction).filter(InputVATDeduction.company_id == company_id, InputVATDeduction.id == item_id).first()
    if not it:
        raise HTTPException(404, detail="抵扣记录不存在")
    return {
        "id": it.id, "purchase_invoice_id": it.purchase_invoice_id,
        "check_status": it.check_status or "未勾选",
        "invoice_source": it.invoice_source or "",
        "domestic_sale_cert_no": it.domestic_sale_cert_no or "",
        "digital_invoice_no": it.digital_invoice_no or "",
        "invoice_code": it.invoice_code or "",
        "invoice_no": it.invoice_no or "",
        "invoice_date": str(it.invoice_date) if it.invoice_date else "",
        "seller_tax_id": it.seller_tax_id or "",
        "seller_name": it.seller_name or "",
        "amount": it.amount or 0,
        "tax_amount": it.tax_amount or 0,
        "deductible_tax_amount": it.deductible_tax_amount or 0,
        "invoice_category": it.invoice_category or "",
        "invoice_category_label": it.invoice_category_label or "",
        "invoice_status": it.invoice_status or "正常",
        "check_time": str(it.check_time) if it.check_time else "",
        "risk_level": it.risk_level or "正常",
        "goods_name": it.goods_name or "",
        "total_amount": it.total_amount or 0,
        "tax_rate": it.tax_rate or 0,
        "deducted_tax_amount": it.deducted_tax_amount or 0,
        "deduction_period": it.deduction_period or "",
        "deduction_status": it.deduction_status or "",
        "certification_date": str(it.certification_date) if it.certification_date else "",
        "deduction_date": str(it.deduction_date) if it.deduction_date else "",
        "deduction_method": it.deduction_method or "",
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
    # 自动更新序时账凭证（按期间汇总）
    try:
        period = it.deduction_period
        if not period:
            period = it.invoice_date.strftime("%Y-%m") if it.invoice_date else datetime.now().strftime("%Y-%m")
        auto_generate_input_vat_for_period(db, company_id, period)
    except Exception as e:
        db.rollback()
    return {"message": "更新成功"}


@app.delete("/api/input-vat-deductions/{item_id}")
def delete_input_vat_deduction(item_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    it = db.query(InputVATDeduction).filter(InputVATDeduction.company_id == company_id, InputVATDeduction.id == item_id).first()
    if not it:
        raise HTTPException(404, detail="抵扣记录不存在")
    db.delete(it)
    db.commit()
    return {"message": "删除成功"}


@app.post("/api/input-vat-deductions/batch-delete")
def batch_delete_input_vat_deductions(ids: list[int], company_id: int = Query(1), db: Session = Depends(get_db)):
    deleted = db.query(InputVATDeduction).filter(
        InputVATDeduction.company_id == company_id,
        InputVATDeduction.id.in_(ids)
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": f"已删除 {deleted} 条记录", "deleted": deleted}


@app.post("/api/input-vat-deductions/batch-certify")
def batch_certify_input_vat_deductions(ids: list[int], company_id: int = Query(1), db: Session = Depends(get_db)):
    """批量认证：将选中记录标记为已勾选，设置勾选时间/认证日期"""
    now = datetime.now()
    today = date.today()
    
    items = db.query(InputVATDeduction).filter(
        InputVATDeduction.company_id == company_id,
        InputVATDeduction.id.in_(ids)
    ).all()
    
    if not items:
        raise HTTPException(400, detail="未找到可认证记录")
    
    certified = 0
    affected_periods = set()
    for it in items:
        changed = False
        if it.check_status != "已勾选":
            it.check_status = "已勾选"
            it.check_time = now
            changed = True
        if not it.certification_date:
            it.certification_date = today
            changed = True
        if it.deduction_status in (None, "", "待认证"):
            it.deduction_status = "待抵扣"
            changed = True
        if changed:
            it.updated_at = now
            certified += 1
            period = it.deduction_period
            if not period and it.invoice_date:
                period = it.invoice_date.strftime("%Y-%m")
            if period:
                affected_periods.add(period)
    
    db.commit()
    
    # 为受影响的期间重新生成进项抵扣凭证
    voucher_count = 0
    for period in affected_periods:
        try:
            voucher_count += auto_generate_input_vat_for_period(db, company_id, period)
        except Exception:
            pass
    db.commit()
    
    return {
        "message": f"已认证 {certified} 条记录" + (f"，生成 {voucher_count} 笔汇总凭证" if voucher_count else ""),
        "certified": certified,
        "voucher_count": voucher_count
    }


@app.post("/api/input-vat-deductions/{item_id}/to-journal")
def input_vat_deduction_to_journal(item_id: int, company_id: int = Query(1), db: Session = Depends(get_db)):
    """为进项抵扣记录所在期间重新生成凭证"""
    it = db.query(InputVATDeduction).filter(
        InputVATDeduction.id == item_id,
        InputVATDeduction.company_id == company_id
    ).first()
    if not it:
        raise HTTPException(404, "抵扣记录不存在")

    period = it.deduction_period or (it.invoice_date.strftime("%Y-%m") if it.invoice_date else datetime.now().strftime("%Y-%m"))
    count = auto_generate_input_vat_for_period(db, company_id, period)
    db.commit()
    return {"message": f"已为 {period} 生成进项抵扣凭证 ({count} 条)", "period": period}


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
        field_order = None
        if module == "sales-invoice":
            # 严格按开具发票表头26列顺序，一一平铺
            field_order = [
                "invoice_code", "invoice_no", "digital_invoice_no",
                "seller_tax_no", "seller_name",
                "buyer_tax_no", "buyer_name",
                "invoice_date", "tax_category_code", "specific_business_type",
                "goods_name", "spec", "unit", "quantity", "unit_price",
                "amount", "tax_rate", "tax_amount", "total_amount",
                "invoice_source", "invoice_category", "status", "is_positive", "invoice_risk_level",
                "issuer", "remark"
            ]
        elif module == "purchase-invoice":
            # 取得发票26列
            field_order = [
                "invoice_code", "invoice_no", "digital_invoice_no",
                "seller_tax_no", "seller_name",
                "buyer_tax_no", "buyer_name",
                "invoice_date", "tax_category_code", "specific_business_type",
                "goods_name", "spec", "unit", "quantity", "unit_price",
                "amount", "tax_rate", "tax_amount", "total_amount",
                "invoice_source", "invoice_category", "status", "is_positive", "invoice_risk_level",
                "issuer", "remark"
            ]
        elif module == "bank-transaction":
            field_order = [
                "transaction_date", "transaction_time", "application_date",
                "voucher_no", "debit_amount", "credit_amount", "balance",
                "counterparty_account", "counterparty_name", "counterparty_bank",
                "transaction_serial_no", "voucher_seq", "record_status",
                "summary", "transaction_remark", "account_type"
            ]
        elif module == "input-vat-deduction":
            field_order = [
                "check_status", "invoice_source", "domestic_sale_cert_no",
                "digital_invoice_no", "invoice_code", "invoice_no",
                "invoice_date", "seller_tax_id", "seller_name",
                "amount", "tax_amount", "deductible_tax_amount",
                "invoice_category", "invoice_category_label", "invoice_status",
                "check_time", "risk_level"
            ]
        elif module == "employee":
            field_order = [
                "name", "id_card"
            ]
        elif module == "customer":
            field_order = [
                "name", "uscc"
            ]
        elif module == "supplier":
            field_order = [
                "name", "uscc"
            ]
        elif module == "department":
            field_order = [
                "code", "name"
            ]

        return {
            "file_name": fname,
            "headers": headers,
            "preview_rows": preview_rows,
            "total_rows": total_rows,
            "module": module,
            "field_groups": field_groups,
            "field_order": field_order
        }
    except Exception as e:
        return {"error": f"文件分析失败：{str(e)}"}


@app.post("/api/file/import-with-mapping")
async def import_file_with_mapping(  # v2026-06-01-fix: 空发票号码不拦截
    file: UploadFile = File(...),
    module: str = Form("bank-transaction"),
    bank_config_id: Optional[int] = Form(None),
    column_mapping: str = Form(...),  # JSON: {标准字段: 文件列名}
    company_id: int = Form(1),
    force: Optional[str] = Form(None),  # 强制导入（忽略去重）
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
                    if cell.value is None:
                        row_dict[headers_file[col - 1]] = ""
                    elif isinstance(cell.value, datetime):
                        row_dict[headers_file[col - 1]] = cell.value.strftime("%Y-%m-%d %H:%M:%S")
                    elif isinstance(cell.value, (int, float)):
                        # 数字直接转字符串（openpyxl data_only=True 已自动把真正的日期转 datetime，
                        # 此处 int/float 就是纯数字如金额、数量，误当日期序列号会销毁金额数据）
                        row_dict[headers_file[col - 1]] = str(cell.value)
                    else:
                        row_dict[headers_file[col - 1]] = str(cell.value).strip()
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

        force_import = (force == "true")
        # 根据映射转换并导入
        imported = 0
        errors = []
        infos = []  # 非错误提示（如自动创建客户档案）

        # 全行指纹去重：比对整行所有列数据，而非单一字段
        def row_fingerprint(values_dict):
            """生成全行指纹：所有列名+值排序后组成元组，可哈希对比"""
            return tuple(sorted((str(k), str(v)) for k, v in values_dict.items()))

        used_fingerprints = {} if not force_import else None  # fp -> 行号，同批次去重；None时跳过

        # 跨批次数据库查重：始终加载，防止 force 导入时重复入库已有记录
        existing_fingerprints = set()
        if module == "bank-transaction":
            for rec in db.query(BankTransaction._fingerprint).filter(
                BankTransaction.company_id == company_id,
                BankTransaction._fingerprint.isnot(None)
            ).all():
                try:
                    existing_fingerprints.add(tuple(tuple(x) for x in json.loads(rec[0])))
                except: pass
        elif module == "sales-invoice":
            for rec in db.query(SalesInvoice._fingerprint).filter(
                SalesInvoice.company_id == company_id,
                SalesInvoice._fingerprint.isnot(None)
            ).all():
                try:
                    existing_fingerprints.add(tuple(tuple(x) for x in json.loads(rec[0])))
                except: pass
        elif module == "purchase-invoice":
            for rec in db.query(PurchaseInvoice._fingerprint).filter(
                PurchaseInvoice.company_id == company_id,
                PurchaseInvoice._fingerprint.isnot(None)
            ).all():
                try:
                    existing_fingerprints.add(tuple(tuple(x) for x in json.loads(rec[0])))
                except: pass
        elif module == "input-vat-deduction":
            for rec in db.query(InputVATDeduction._fingerprint).filter(
                InputVATDeduction.company_id == company_id,
                InputVATDeduction._fingerprint.isnot(None)
            ).all():
                try:
                    existing_fingerprints.add(tuple(tuple(x) for x in json.loads(rec[0])))
                except: pass
        elif module == "employee":
            for rec in db.query(Employee._fingerprint).filter(
                Employee.company_id == company_id,
                Employee._fingerprint.isnot(None)
            ).all():
                try:
                    existing_fingerprints.add(tuple(tuple(x) for x in json.loads(rec[0])))
                except: pass
        elif module == "customer":
            for rec in db.query(Customer._fingerprint).filter(
                Customer.company_id == company_id,
                Customer._fingerprint.isnot(None)
            ).all():
                try:
                    existing_fingerprints.add(tuple(tuple(x) for x in json.loads(rec[0])))
                except: pass
        elif module == "supplier":
            for rec in db.query(Supplier._fingerprint).filter(
                Supplier.company_id == company_id,
                Supplier._fingerprint.isnot(None)
            ).all():
                try:
                    existing_fingerprints.add(tuple(tuple(x) for x in json.loads(rec[0])))
                except: pass
        elif module == "department":
            for rec in db.query(Department._fingerprint).filter(
                Department.company_id == company_id,
                Department._fingerprint.isnot(None)
            ).all():
                try:
                    existing_fingerprints.add(tuple(tuple(x) for x in json.loads(rec[0])))
                except: pass

        new_customers = {}  # {(tax_no, name): True} — 自动添加客户档案
        new_invoices = []  # 收集新创建的发票，导入完成后自动生成凭证
        new_deductions = []  # 收集新创建的进项抵扣，导入完成后自动生成凭证
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
                        for fmt in ["%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y%m%d", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S"]:
                            try:
                                tx_date = datetime.strptime(date_str, fmt).date()
                                break
                            except: pass
                    if not tx_date:
                        errors.append(f"第{i+2}行: 无法解析日期")
                        continue

                    # 解析交易时间
                    tx_time = None
                    time_str = mapped.get("transaction_time", "")
                    if time_str:
                        for tf in ["%H:%M:%S", "%H:%M", "%H:%M:%S.%f"]:
                            try:
                                tx_time = datetime.strptime(time_str, tf).time()
                                break
                            except: pass

                    # 解析申请日期
                    app_date = None
                    app_date_str = mapped.get("application_date", "")
                    if app_date_str:
                        for fmt in ["%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y%m%d"]:
                            try:
                                app_date = datetime.strptime(app_date_str, fmt).date()
                                break
                            except: pass

                    # 解析借方/贷方金额
                    def parse_amt(key):
                        v = mapped.get(key, "0").replace(",", "").replace("￥", "").replace("¥", "")
                        try: return float(v) if v else 0.0
                        except: return 0.0
                    debit_amount = parse_amt("debit_amount")
                    credit_amount = parse_amt("credit_amount")

                    # 余额
                    bal_str = mapped.get("balance", "0").replace(",", "").replace("￥", "").replace("¥", "")
                    balance = 0.0
                    try: balance = float(bal_str) if bal_str else 0.0
                    except: pass

                    # 去重：全线指纹 — mapped+extra 全部参与比对，有一列不同就不是重复
                    fp = row_fingerprint({**mapped, **extra})
                    if used_fingerprints is not None and fp in used_fingerprints:
                        errors.append(f"第{i+2}行: 与第{used_fingerprints[fp]}行完全重复，跳过")
                        continue
                    if existing_fingerprints is not None and fp in existing_fingerprints:
                        errors.append(f"第{i+2}行: 与数据库中已有记录完全重复，跳过")
                        continue

                    tx = BankTransaction(
                        company_id=company_id,
                        bank_config_id=bank_config_id,
                        transaction_date=tx_date,
                        transaction_time=tx_time,
                        application_date=app_date,
                        voucher_no=mapped.get("voucher_no", ""),
                        debit_amount=debit_amount,
                        credit_amount=credit_amount,
                        balance=balance,
                        counterparty_account=mapped.get("counterparty_account", ""),
                        counterparty_name=mapped.get("counterparty_name", ""),
                        counterparty_bank=mapped.get("counterparty_bank", ""),
                        transaction_serial_no=mapped.get("transaction_serial_no", ""),
                        voucher_seq=mapped.get("voucher_seq", ""),
                        record_status=mapped.get("record_status", ""),
                        summary=mapped.get("summary", ""),
                        transaction_remark=mapped.get("transaction_remark", ""),
                        account_type=mapped.get("account_type", ""),
                        # 旧字段兼容
                        amount=credit_amount - debit_amount,
                        transaction_type="收入" if credit_amount > 0 else "支出",
                        raw_data=json.dumps(extra, ensure_ascii=False) if extra else "{}",
                        _fingerprint=json.dumps(list(fp)),
                        remark=mapped.get("remark", "")
                    )
                    db.add(tx)
                    if used_fingerprints is not None:
                        used_fingerprints[fp] = i+2

                elif module in ("sales-invoice", "purchase-invoice"):
                    inv_date = None
                    date_str = mapped.get("invoice_date", "")
                    if date_str:
                        for fmt in ["%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y%m%d",
                                    "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S",
                                    "%Y-%m-%d %H:%M", "%Y/%m/%d %H:%M"]:
                            try:
                                inv_date = datetime.strptime(date_str, fmt).date()
                                break
                            except: pass

                    # 空值保留为 None，不拦截
                    inv_no = mapped.get("invoice_no", "") or None

                    # 去重：全线指纹 — mapped+extra 全部参与比对，有一列不同就不是重复
                    fp = row_fingerprint({**mapped, **extra})
                    if used_fingerprints is not None and fp in used_fingerprints:
                        dup_row = used_fingerprints[fp]
                        key_info = f"发票号={mapped.get('invoice_no','无')}, 金额={mapped.get('amount','无')}, 货物={mapped.get('goods_name','无')[:20]}"
                        errors.append(f"第{i+2}行: 与第{dup_row}行完全重复（{key_info}），跳过")
                        continue
                    if existing_fingerprints is not None and fp in existing_fingerprints:
                        key_info = f"发票号={mapped.get('invoice_no','无')}, 金额={mapped.get('amount','无')}, 货物={mapped.get('goods_name','无')[:20]}"
                        errors.append(f"第{i+2}行: 与数据库中已有记录完全重复（{key_info}），跳过")
                        continue

                    # 安全转浮点数——兼容千分位/百分号/空值/文本
                    # nullable=True 时源文件为空则返回 None，保留空白不填 0
                    def safe_float(val, default=0.0, nullable=False):
                        if val is None or str(val).strip() == "":
                            return None if nullable else default
                        s = str(val).strip().replace(",", "").replace("%", "").replace("￥", "").replace("¥", "").replace("元", "").replace(" ", "")
                        try:
                            return float(s)
                        except:
                            return None if nullable else default

                    amt = safe_float(mapped.get("amount"))
                    tax_amt = safe_float(mapped.get("tax_amount"), nullable=True)
                    total = safe_float(mapped.get("total_amount"), nullable=True)
                    # 三个字段互推：任意两个有值就能算出第三个
                    if amt is not None and tax_amt is not None and total is None:
                        total = round(amt + tax_amt, 2)
                    elif amt is not None and total is not None and tax_amt is None:
                        tax_amt = round(total - amt, 2)
                    elif tax_amt is not None and total is not None and amt is None:
                        amt = round(total - tax_amt, 2)
                    if total is None:
                        total = 0.0
                    if tax_amt is None:
                        tax_amt = 0.0
                    if amt is None:
                        amt = 0.0
                    qty = safe_float(mapped.get("quantity"), 0, nullable=True)
                    uprice = safe_float(mapped.get("unit_price"), 0, nullable=True)
                    tr = safe_float(mapped.get("tax_rate"))

                    if module == "sales-invoice":
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
                            remark=mapped.get("remark", ""),
                            raw_data=json.dumps(extra) if extra else None,
                            _fingerprint=json.dumps(list(fp))
                        )
                        db.add(inv)
                        if used_fingerprints is not None:
                            used_fingerprints[fp] = i+2
                        new_invoices.append(inv)
                        # 收集购买方信息，导入后自动添加客户档案
                        buyer_nm = mapped.get("buyer_name", "").strip()
                        buyer_tn = mapped.get("buyer_tax_no", "").strip()
                        if buyer_nm:
                            new_customers[(buyer_tn, buyer_nm)] = True
                    else:
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
                            remark=mapped.get("remark", ""),
                            raw_data=json.dumps(extra) if extra else None,
                            _fingerprint=json.dumps(list(fp))
                        )
                    db.add(inv)
                    if used_fingerprints is not None:
                        used_fingerprints[fp] = i+2

                elif module == "input-vat-deduction":
                    # 进项抵扣导入：解析日期
                    inv_date = None
                    date_str = mapped.get("invoice_date", "")
                    if date_str:
                        for fmt in ["%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y%m%d",
                                    "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S"]:
                            try:
                                inv_date = datetime.strptime(date_str, fmt).date()
                                break
                            except: pass

                    check_time = None
                    ct_str = mapped.get("check_time", "")
                    if ct_str:
                        for fmt in ["%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M",
                                    "%Y/%m/%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"]:
                            try:
                                check_time = datetime.strptime(ct_str, fmt)
                                break
                            except: pass

                    amt = mapped.get("amount", "0").replace(",", "").replace("￥", "").replace("¥", "")
                    try: amt = float(amt) if amt else 0.0
                    except: amt = 0.0
                    tax_amt = mapped.get("tax_amount", "0").replace(",", "").replace("￥", "").replace("¥", "")
                    try: tax_amt = float(tax_amt) if tax_amt else 0.0
                    except: tax_amt = 0.0
                    deductible = mapped.get("deductible_tax_amount", "0").replace(",", "").replace("￥", "").replace("¥", "")
                    try: deductible = float(deductible) if deductible else 0.0
                    except: deductible = 0.0

                    # 去重：全线指纹 — mapped+extra 全部参与比对，有一列不同就不是重复
                    fp = row_fingerprint({**mapped, **extra})
                    if used_fingerprints is not None and fp in used_fingerprints:
                        errors.append(f"第{i+2}行: 与第{used_fingerprints[fp]}行完全重复，跳过")
                        continue
                    if existing_fingerprints is not None and fp in existing_fingerprints:
                        errors.append(f"第{i+2}行: 与数据库中已有记录完全重复，跳过")
                        continue

                    inv = InputVATDeduction(
                        company_id=company_id,
                        check_status=mapped.get("check_status", "未勾选"),
                        invoice_source=mapped.get("invoice_source", ""),
                        domestic_sale_cert_no=mapped.get("domestic_sale_cert_no", ""),
                        digital_invoice_no=mapped.get("digital_invoice_no", ""),
                        invoice_code=mapped.get("invoice_code", ""),
                        invoice_no=mapped.get("invoice_no", ""),
                        invoice_date=inv_date,
                        seller_tax_id=mapped.get("seller_tax_id", ""),
                        seller_name=mapped.get("seller_name", ""),
                        amount=amt,
                        tax_amount=tax_amt,
                        deductible_tax_amount=deductible,
                        invoice_category=mapped.get("invoice_category", ""),
                        invoice_category_label=mapped.get("invoice_category_label", ""),
                        invoice_status=mapped.get("invoice_status", "正常"),
                        check_time=check_time,
                        risk_level=mapped.get("risk_level", "正常"),
                        remark=mapped.get("remark", ""),
                        raw_data=json.dumps(extra) if extra else None,
                        _fingerprint=json.dumps(list(fp))
                    )
                    db.add(inv)
                    new_deductions.append(inv)
                    if used_fingerprints is not None:
                        used_fingerprints[fp] = i+2

                elif module == "employee":
                    name = mapped.get("name", "").strip()
                    if not name:
                        errors.append(f"第{i+2}行: 姓名不能为空")
                        continue
                    # 全行指纹去重
                    fp = row_fingerprint({**mapped, **extra})
                    if used_fingerprints is not None and fp in used_fingerprints:
                        errors.append(f"第{i+2}行: 与第{used_fingerprints[fp]}行完全重复，跳过")
                        continue
                    if existing_fingerprints is not None and fp in existing_fingerprints:
                        errors.append(f"第{i+2}行: 与数据库中已有记录完全重复（姓名={name}），跳过")
                        continue
                    # 编码自动生成 RY001 格式：首次查DB取最大code，后续内存递增
                    if 'emp_code_counter' not in locals():
                        existing_codes = db.query(Employee.code).filter(
                            Employee.company_id == company_id,
                            Employee.code.like('RY%')
                        ).all()
                        emp_code_counter = 0
                        for c in existing_codes:
                            try:
                                num = int(c[0][2:])
                                if num > emp_code_counter:
                                    emp_code_counter = num
                            except: pass
                    emp_code_counter += 1
                    code = f"RY{emp_code_counter:03d}"
                    emp = Employee(
                        company_id=company_id, code=code, name=name,
                        id_card=mapped.get("id_card", "") or None,
                        _fingerprint=json.dumps(list(fp))
                    )
                    db.add(emp)
                    db.flush()
                    if used_fingerprints is not None:
                        used_fingerprints[fp] = i+2

                elif module == "customer":
                    name = mapped.get("name", "").strip()
                    if not name:
                        errors.append(f"第{i+2}行: 客户名称不能为空")
                        continue
                    # 全行指纹去重
                    fp = row_fingerprint({**mapped, **extra})
                    if used_fingerprints is not None and fp in used_fingerprints:
                        errors.append(f"第{i+2}行: 与第{used_fingerprints[fp]}行完全重复，跳过")
                        continue
                    if existing_fingerprints is not None and fp in existing_fingerprints:
                        errors.append(f"第{i+2}行: 与数据库中已有记录完全重复（客户={name}），跳过")
                        continue
                    # 编码自动生成 KH001 格式：首次查DB取最大code，后续内存递增
                    if 'cust_code_counter' not in locals():
                        existing_codes = db.query(Customer.code).filter(
                            Customer.company_id == company_id,
                            Customer.code.like('KH%')
                        ).all()
                        cust_code_counter = 0
                        for c in existing_codes:
                            try:
                                num = int(c[0][2:])
                                if num > cust_code_counter:
                                    cust_code_counter = num
                            except: pass
                    cust_code_counter += 1
                    code = f"KH{cust_code_counter:03d}"
                    uscc = mapped.get("uscc", "") or None
                    cust = Customer(
                        company_id=company_id, code=code, name=name,
                        uscc=uscc,
                        _fingerprint=json.dumps(list(fp))
                    )
                    db.add(cust)
                    db.flush()
                    if used_fingerprints is not None:
                        used_fingerprints[fp] = i+2

                elif module == "supplier":
                    name = mapped.get("name", "").strip()
                    if not name:
                        errors.append(f"第{i+2}行: 供应商名称不能为空")
                        continue
                    # 全行指纹去重
                    fp = row_fingerprint({**mapped, **extra})
                    if used_fingerprints is not None and fp in used_fingerprints:
                        errors.append(f"第{i+2}行: 与第{used_fingerprints[fp]}行完全重复，跳过")
                        continue
                    if existing_fingerprints is not None and fp in existing_fingerprints:
                        errors.append(f"第{i+2}行: 与数据库中已有记录完全重复（供应商={name}），跳过")
                        continue
                    # 编码自动生成 GYS001 格式：首次查DB取最大code，后续内存递增
                    if 'supp_code_counter' not in locals():
                        existing_codes = db.query(Supplier.code).filter(
                            Supplier.company_id == company_id,
                            Supplier.code.like('GYS%')
                        ).all()
                        supp_code_counter = 0
                        for c in existing_codes:
                            try:
                                num = int(c[0][3:])
                                if num > supp_code_counter:
                                    supp_code_counter = num
                            except: pass
                    supp_code_counter += 1
                    code = f"GYS{supp_code_counter:03d}"
                    uscc = mapped.get("uscc", "") or None
                    supp = Supplier(
                        company_id=company_id, code=code, name=name,
                        uscc=uscc,
                        _fingerprint=json.dumps(list(fp))
                    )
                    db.add(supp)
                    db.flush()
                    if used_fingerprints is not None:
                        used_fingerprints[fp] = i+2

                elif module == "department":
                    name = mapped.get("name", "").strip()
                    if not name:
                        errors.append(f"第{i+2}行: 部门名称不能为空")
                        continue
                    # 全行指纹去重
                    fp = row_fingerprint({**mapped, **extra})
                    if used_fingerprints is not None and fp in used_fingerprints:
                        errors.append(f"第{i+2}行: 与第{used_fingerprints[fp]}行完全重复，跳过")
                        continue
                    if existing_fingerprints is not None and fp in existing_fingerprints:
                        errors.append(f"第{i+2}行: 与数据库中已有记录完全重复（部门={name}），跳过")
                        continue
                    # 编码：优先用导入的编码，为空则自动生成 BM001 格式
                    code = mapped.get("code", "").strip()
                    if not code:
                        if 'dept_code_counter' not in locals():
                            existing_codes = db.query(Department.code).filter(
                                Department.company_id == company_id,
                                Department.code.like('BM%')
                            ).all()
                            dept_code_counter = 0
                            for c in existing_codes:
                                try:
                                    num = int(c[0][2:])
                                    if num > dept_code_counter:
                                        dept_code_counter = num
                                except: pass
                        dept_code_counter += 1
                        code = f"BM{dept_code_counter:03d}"
                    # 编码去重：同编码覆盖更新
                    existing = db.query(Department).filter(
                        Department.company_id == company_id, Department.code == code
                    ).first()
                    if existing:
                        existing.name = name
                        existing._fingerprint = json.dumps(list(fp))
                    else:
                        db.add(Department(
                            company_id=company_id, code=code, name=name,
                            _fingerprint=json.dumps(list(fp))
                        ))
                    db.flush()
                    if used_fingerprints is not None:
                        used_fingerprints[fp] = i+2

                imported += 1
            except Exception as e:
                errors.append(f"第{i+2}行: {str(e)}")

        # 自动添加客户档案（仅开具发票导入时）
        if module == "sales-invoice" and new_customers:
            customer_added = 0
            for (tax_no, name) in new_customers:
                # 先按税号匹配，再按名称匹配
                existing = None
                if tax_no:
                    existing = db.query(Customer).filter(
                        Customer.company_id == company_id,
                        Customer.tax_no == tax_no
                    ).first()
                if not existing:
                    existing = db.query(Customer).filter(
                        Customer.company_id == company_id,
                        Customer.name == name
                    ).first()
                if not existing:
                    # 自动生成编码（用局部变量递增，避免同事务内重复）
                    if 'next_cust_idx' not in locals():
                        existing_count = db.query(Customer).filter(
                            Customer.company_id == company_id
                        ).count()
                        next_cust_idx = existing_count + 1
                    code = f"KH{next_cust_idx:03d}"
                    next_cust_idx += 1
                    cust = Customer(
                        company_id=company_id,
                        code=code,
                        name=name,
                        uscc=tax_no or None,   # 购方识别号 → 统一社会信用代码
                        tax_no=tax_no or None
                    )
                    db.add(cust)
                    customer_added += 1
            if customer_added > 0:
                infos.append(f"自动新增 {customer_added} 个客户到客户档案")

        try:
            db.commit()
        except IntegrityError as e:
            db.rollback()
            errors.append("数据重复，已跳过已存在的记录")
            imported = 0

        # 开具发票导入后自动生成序时账凭证
        if module == "sales-invoice" and new_invoices:
            try:
                import_count = 0
                for inv in new_invoices:
                    auto_generate_single_invoice(db, inv)
                    import_count += 1
                if import_count > 0:
                    infos.append(f"自动生成 {import_count} 条序时账凭证")
            except Exception as e:
                db.rollback()
                infos.append(f"凭证生成失败: {str(e)}")

        # 进项抵扣导入后自动生成序时账凭证（按期间汇总）
        if module == "input-vat-deduction" and new_deductions:
            try:
                from sqlalchemy import distinct as sqldistinct
                periods_affected = db.query(sqldistinct(InputVATDeduction.deduction_period)).filter(
                    InputVATDeduction.company_id == company_id,
                    InputVATDeduction.deduction_period.isnot(None),
                    InputVATDeduction.deduction_period != ""
                ).all()
                ded_count = 0
                for (period,) in periods_affected:
                    ded_count += auto_generate_input_vat_for_period(db, company_id, period)
                if ded_count > 0:
                    infos.append(f"自动生成 {ded_count} 号进项汇总凭证")
            except Exception as e:
                db.rollback()
                infos.append(f"进项凭证生成失败: {str(e)}")

        return {
            "imported": imported,
            "total": len(rows_data),
            "skipped": len(rows_data) - imported,
            "errors": errors[:20],  # 最多返回20条错误
            "infos": infos[:20],    # 非错误提示
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
                data["code"] = f"KH{db.query(Customer).filter(Customer.company_id == company_id).count() + 1:03d}"
            sess["data"] = data
            sess["step"] = 2
            return {"reply": f"👤 客户名称：**{data['name']}**\n📋 编码：**{data['code']}**\n\n还需要添加其他信息吗？可以直接告诉我：\n• 联系人\n• 电话\n• 信用额度\n\n或说「**完成**」直接保存。", "session_id": sid, "action": None}

        return {"reply": "👤 好的，新增客户。\n\n请告诉我**客户名称**和**编码**（可选），例如：\n• 「广州钢材贸易有限公司」\n• 「编码 KH001 广州钢材贸易有限公司」", "session_id": sid, "action": None}

    elif step == 1:
        # 补充名称
        data["name"] = msg.strip()
        if not data.get("code"):
            data["code"] = f"KH{db.query(Customer).filter(Customer.company_id == company_id).count() + 1:03d}"
        sess["data"] = data
        sess["step"] = 2
        return {"reply": f"👤 客户名称：**{data['name']}**\n📋 编码：**{data['code']}**\n\n还需要添加其他信息吗？可以告诉我联系人、电话、地址等。\n或说「**完成**」直接保存。", "session_id": sid, "action": None}

    elif step >= 2:
        if re.search(r"^(完成|好了|结束|确认|提交|保存|ok|done)$", msg.strip(), re.IGNORECASE):
            return save_customer(data, db, sess, sid, company_id)
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


def save_customer(data, db, sess, sid, company_id):
    try:
        name = data.get("name", "")
        code = data.get("code", "")
        # 去重：编码/名称/统一社会信用代码 任一重复即拦截
        dup_q = db.query(Customer).filter(Customer.company_id == company_id)
        conds = [Customer.code == code, Customer.name == name]
        uscc = data.get("uscc")
        if uscc:
            conds.append(Customer.uscc == uscc)
        dup_q = dup_q.filter(or_(*conds))
        if dup_q.first():
            return {"reply": "⚠️ 客户编码、名称或统一社会信用代码已存在，请勿重复录入。", "session_id": sid, "action": None}
        c = Customer(
            company_id=company_id,
            code=data.get("code", ""),
            name=name or "未命名客户",
            uscc=data.get("uscc"),
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
            if not data.get("code"): data["code"] = f"GYS{db.query(Supplier).filter(Supplier.company_id == company_id).count() + 1:03d}"
            sess["data"] = data; sess["step"] = 2
            return {"reply": f"📦 供应商：**{data['name']}**（{data['code']}）\n\n需要补充其他信息吗？或说「**完成**」直接保存。", "session_id": sid, "action": None}
        return {"reply": "📦 新增供应商。请告诉我**供应商名称**，例如：\n「广州钢铁供应链有限公司」", "session_id": sid, "action": None}

    elif step == 1:
        data["name"] = msg.strip()
        if not data.get("code"): data["code"] = f"GYS{db.query(Supplier).filter(Supplier.company_id == company_id).count() + 1:03d}"
        sess["data"] = data; sess["step"] = 2
        return {"reply": f"📦 供应商：**{data['name']}**（{data['code']}）\n\n需要补充其他信息吗？或说「**完成**」保存。", "session_id": sid, "action": None}

    elif step >= 2:
        if re.search(r"^(完成|好了|结束|确认|提交|保存|ok|done)$", msg.strip(), re.IGNORECASE):
            return save_supplier(data, db, sess, sid, company_id)
        sess["data"] = data
        lines = [f"  {k}：{v}" for k, v in data.items() if v and k in ("name", "code")]
        return {"reply": "已更新：\n" + "\n".join(lines) + "\n\n说「**完成**」保存。", "session_id": sid, "action": None}

    return {"reply": "请继续...", "session_id": sid, "action": None}


def save_supplier(data, db, sess, sid, company_id):
    try:
        name = data.get("name", "")
        code = data.get("code", "")
        uscc = data.get("uscc")
        # 去重：编码/名称/统一社会信用代码 任一重复即拦截
        dup_q = db.query(Supplier).filter(Supplier.company_id == company_id)
        conds = [Supplier.code == code, Supplier.name == name]
        if uscc:
            conds.append(Supplier.uscc == uscc)
        dup_q = dup_q.filter(or_(*conds))
        if dup_q.first():
            return {"reply": "⚠️ 供应商编码、名称或统一社会信用代码已存在，请勿重复录入。", "session_id": sid, "action": None}
        s = Supplier(company_id=company_id, code=data.get("code", ""), name=name, uscc=uscc)
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
            if not data.get("code"): data["code"] = f"RY{db.query(Employee).filter(Employee.company_id == company_id).count() + 1:03d}"
            sess["data"] = data; sess["step"] = 2
            return {"reply": f"👤 员工：**{data['name']}**（{data['code']}）\n\n还需要补充部门、职位、电话吗？或说「**完成**」保存。", "session_id": sid, "action": None}
        return {"reply": "👤 新增员工。请告诉我**姓名**，例如：「张三」", "session_id": sid, "action": None}

    elif step == 1:
        data["name"] = msg.strip()
        if not data.get("code"): data["code"] = f"RY{db.query(Employee).filter(Employee.company_id == company_id).count() + 1:03d}"
        sess["data"] = data; sess["step"] = 2
        return {"reply": f"👤 员工：**{data['name']}**\n\n需要补充部门、职位、电话吗？或说「**完成**」保存。", "session_id": sid, "action": None}

    elif step >= 2:
        if re.search(r"^(完成|好了|结束|确认|ok|done)$", msg.strip(), re.IGNORECASE):
            return save_employee(data, db, sess, sid, company_id)
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


def save_employee(data, db, sess, sid, company_id):
    try:
        if db.query(Employee).filter(Employee.company_id == company_id, Employee.code == data.get("code", "")).first():
            return {"reply": f"⚠️ 工号 {data['code']} 已存在。", "session_id": sid, "action": None}
        e = Employee(company_id=company_id, code=data.get("code", ""), name=data.get("name", ""), id_card=data.get("id_card"), email=data.get("email"))
        db.add(e); db.commit()
        sess["intent"] = None; sess["step"] = 0; sess["data"] = {}
        return {"reply": f"🎉 员工 **{e.name}** 添加成功！", "session_id": sid, "action": {"type": "reload", "page": "employees"}}
    except Exception as e:
        return {"reply": f"❌ {e}", "session_id": sid, "action": None}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
