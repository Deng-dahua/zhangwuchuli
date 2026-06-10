"""
中小制造业账务处理系统 - 数据库模型（多公司账套版本）
"""
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Numeric, Date, Time, DateTime,
    Text, Boolean, ForeignKey, inspect, text as TextClause, Index,
    func, distinct, or_, and_
)
from sqlalchemy.orm import declarative_base, relationship, Session, sessionmaker
from typing import Optional, List
from datetime import datetime, date

SQLALCHEMY_DATABASE_URL = "sqlite:///./accounting.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI 依赖注入：生成数据库会话，请求完成后自动关闭"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==================== 公司账套 ====================

class Company(Base):
    """公司主表 - 每一行代表一个独立的账套"""
    __tablename__ = "companies"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, comment="公司全称")
    uscc = Column(String(50), comment="统一社会信用代码")
    registered_capital = Column(Numeric(18, 2), comment="注册资本")
    established_date = Column(Date, comment="成立日期")
    legal_representative = Column(String(50), comment="法定代表人")
    legal_representative_id = Column(String(30), comment="法定代表人身份证")
    address = Column(String(200), comment="注册地址")
    business_scope = Column(Text, comment="经营范围")
    company_type = Column(String(20), comment="公司类型")
    created_at = Column(DateTime, default=datetime.now)

    shareholders = relationship("CompanyShareholder", back_populates="company", cascade="all, delete-orphan")
    directors = relationship("CompanyDirector", back_populates="company", cascade="all, delete-orphan")
    supervisors = relationship("CompanySupervisor", back_populates="company", cascade="all, delete-orphan")
    finance_contacts = relationship("CompanyFinanceContact", back_populates="company", cascade="all, delete-orphan")
    bank_rules = relationship("BankRule", back_populates="company", cascade="all, delete-orphan")
    vat_declarations = relationship("VATDeclaration", back_populates="company", cascade="all, delete-orphan")
    social_security_declarations = relationship("SocialSecurityDeclaration", back_populates="company", cascade="all, delete-orphan")
    housing_fund_details = relationship("HousingFundDetail", back_populates="company", cascade="all, delete-orphan")
    housing_fund_declarations = relationship("HousingFundDeclaration", back_populates="company", cascade="all, delete-orphan")
    departments = relationship("Department", back_populates="company", cascade="all, delete-orphan")
    employees = relationship("Employee", back_populates="company", cascade="all, delete-orphan")
    customers = relationship("Customer", back_populates="company", cascade="all, delete-orphan")
    suppliers = relationship("Supplier", back_populates="company", cascade="all, delete-orphan")
    accounts = relationship("Account", back_populates="company", cascade="all, delete-orphan")
    periods = relationship("Period", back_populates="company")
    fixed_assets = relationship("FixedAsset", back_populates="company", cascade="all, delete-orphan")
    fixed_asset_depreciations = relationship("FixedAssetDepreciation", back_populates="company")
    intangible_assets = relationship("IntangibleAsset", back_populates="company", cascade="all, delete-orphan")
    intangible_asset_amortizations = relationship("IntangibleAssetAmortization", back_populates="company")
    inventory_items = relationship("InventoryItem", back_populates="company", cascade="all, delete-orphan")
    inventory_transactions = relationship("InventoryTransaction", back_populates="company")
    inventory_balances = relationship("InventoryBalance", back_populates="company")
    contracts = relationship("Contract", back_populates="company", cascade="all, delete-orphan")
    contract_payments = relationship("ContractPayment", back_populates="company")
    payments = relationship("Payment", back_populates="company")
    sales_invoices = relationship("SalesInvoice", back_populates="company")
    purchase_invoices = relationship("PurchaseInvoice", back_populates="company")
    bookkeeping_invoices = relationship("BookkeepingInvoice", back_populates="company")
    bank_configs = relationship("BankConfig", back_populates="company", cascade="all, delete-orphan")
    bank_transactions = relationship("BankTransaction", back_populates="company")
    input_vat_deductions = relationship("InputVATDeduction", back_populates="company")
    column_templates = relationship("ColumnTemplate", back_populates="company", cascade="all, delete-orphan")
    journal_entries = relationship("JournalEntry", back_populates="company")
    salary_records = relationship("SalaryRecord", back_populates="company", cascade="all, delete-orphan")
    cultural_construction_fee_declarations = relationship("CulturalConstructionFeeDeclaration", back_populates="company", cascade="all, delete-orphan")


class CompanyShareholder(Base):
    __tablename__ = "company_shareholders"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    name = Column(String(50), nullable=False, comment="股东姓名")
    id_number = Column(String(30), comment="身份证号")
    ratio = Column(Numeric(18, 2), comment="持股比例(%)")
    contribution_amount = Column(Numeric(18, 2), comment="认缴出资额")
    company = relationship("Company", back_populates="shareholders")


class CompanyDirector(Base):
    __tablename__ = "company_directors"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    name = Column(String(50), nullable=False, comment="董事姓名")
    id_number = Column(String(30), comment="身份证号")
    company = relationship("Company", back_populates="directors")


class CompanySupervisor(Base):
    __tablename__ = "company_supervisors"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    name = Column(String(50), nullable=False, comment="监事姓名")
    id_number = Column(String(30), comment="身份证号")
    company = relationship("Company", back_populates="supervisors")


class CompanyFinanceContact(Base):
    __tablename__ = "company_finance_contacts"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    name = Column(String(50), nullable=False, comment="财务负责人姓名")
    id_number = Column(String(30), comment="身份证号")
    phone = Column(String(20), comment="联系电话")
    company = relationship("Company", back_populates="finance_contacts")


# ==================== 部门档案 ====================

class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    code = Column(String(20), nullable=False, comment="部门编码")
    name = Column(String(50), nullable=False, comment="部门名称")
    parent_code = Column(String(20), nullable=True, comment="上级部门编码")
    manager = Column(String(50), comment="部门负责人")
    description = Column(String(200), comment="部门说明")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="departments")


# ==================== 人员档案 ====================

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    code = Column(String(20), nullable=False, comment="工号")
    name = Column(String(50), nullable=False, comment="姓名")
    id_card = Column(String(30), comment="身份证号")
    email = Column(String(100), comment="邮箱")
    salary = Column(Numeric(18, 2), default=0.0, comment="基本工资")
    leave_date = Column(Date, comment="离职日期")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="employees")


# ==================== 客户档案 ====================

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    code = Column(String(20), nullable=False, comment="客户编码")
    name = Column(String(100), nullable=False, comment="客户名称")
    tax_no = Column(String(50), comment="税号")
    contact = Column(String(50), comment="联系人")
    phone = Column(String(30), comment="联系电话")
    address = Column(String(200), comment="地址")
    credit_limit = Column(Numeric(18, 2), default=0.0, comment="信用额度")
    payment_terms = Column(Integer, default=30, comment="账期（天）")
    bank_name = Column(String(100), comment="开户银行")
    bank_account = Column(String(50), comment="银行账号")
    uscc = Column(String(50), comment="统一社会信用代码")
    is_active = Column(Boolean, default=True)
    remark = Column(String(200), comment="备注")
    _fingerprint = Column(String(64), comment="全行指纹（去重用）")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="customers")


# ==================== 供应商档案 ====================

class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    code = Column(String(20), nullable=False, comment="供应商编码")
    name = Column(String(100), nullable=False, comment="供应商名称")
    tax_no = Column(String(50), comment="税号")
    bank_name = Column(String(100), comment="开户银行")
    bank_account = Column(String(50), comment="银行账号")
    uscc = Column(String(50), comment="统一社会信用代码")
    is_active = Column(Boolean, default=True)
    remark = Column(String(200), comment="备注")
    _fingerprint = Column(String(64), comment="全行指纹（去重用）")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="suppliers")


# ==================== 会计科目 ====================

class Account(Base):
    """会计科目 - 每个公司有独立的科目表"""
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    code = Column(String(20), nullable=False, comment="科目编码")
    name = Column(String(100), nullable=False, comment="科目名称")
    category = Column(String(20), nullable=False, comment="科目类别：资产/负债/权益/收入/费用/成本")
    balance_direction = Column(String(10), nullable=False, comment="余额方向：借/贷")
    level = Column(Integer, default=1, comment="科目级次")
    parent_code = Column(String(20), nullable=True, comment="上级科目编码")
    is_active = Column(Boolean, default=True)
    opening_balance = Column(Numeric(18, 2), default=0.0, comment="期初金额")
    created_at = Column(DateTime, default=datetime.now)
    company = relationship("Company", back_populates="accounts")


# ==================== 会计期间 ====================

class Period(Base):
    """会计期间 - 每个公司独立管理期间"""
    __tablename__ = "periods"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    period = Column(String(7), nullable=False, comment="YYYY-MM")
    status = Column(String(20), default="开放", comment="开放/已结账")
    closed_at = Column(DateTime, nullable=True)
    company = relationship("Company", back_populates="periods")


# ==================== 固定资产 ====================

class FixedAsset(Base):
    """固定资产卡片"""
    __tablename__ = "fixed_assets"
    __table_args__ = (
        Index('idx_fa_company_status', 'company_id', 'status'),
        Index('idx_fa_company_dept', 'company_id', 'dept_code'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    code = Column(String(30), nullable=False, comment="资产编码")
    name = Column(String(100), nullable=False, comment="资产名称")
    category = Column(String(30), nullable=False, comment="资产类别：房屋建筑物/机器设备/运输工具/电子设备/办公设备/其他")
    spec = Column(String(100), comment="规格型号")
    unit = Column(String(10), comment="计量单位")
    dept_code = Column(String(20), comment="使用部门编码")
    location = Column(String(100), comment="存放地点")
    purchase_date = Column(Date, comment="购入日期")
    original_value = Column(Numeric(18, 2), default=0.0, comment="原值")
    residual_value = Column(Numeric(18, 2), default=0.0, comment="预计净残值")
    useful_life_months = Column(Integer, default=60, comment="使用年限（月）")
    accumulated_depreciation = Column(Numeric(18, 2), default=0.0, comment="累计折旧")
    monthly_depreciation = Column(Numeric(18, 2), default=0.0, comment="月折旧额")
    depreciation_method = Column(String(20), default="直线法", comment="折旧方法：直线法/双倍余额递减法/年数总和法")
    status = Column(String(20), default="在用", comment="状态：在用/闲置/报废/出售")
    supplier = Column(String(100), comment="供应商")
    warranty_expiry = Column(Date, comment="保修到期日")
    voucher_no = Column(String(30), comment="入账凭证号")
    disposal_voucher_no = Column(String(30), comment="处置凭证号")
    disposal_date = Column(Date, comment="处置日期")
    disposal_amount = Column(Numeric(18, 2), default=0.0, comment="处置收入")
    remark = Column(Text, comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="fixed_assets")


class FixedAssetDepreciation(Base):
    """固定资产折旧明细"""
    __tablename__ = "fa_depreciations"
    __table_args__ = (
        Index('idx_fad_asset_period', 'asset_id', 'period'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    asset_id = Column(Integer, ForeignKey("fixed_assets.id"), nullable=False)
    period = Column(String(7), nullable=False, comment="折旧期间 YYYY-MM")
    depreciation_amount = Column(Numeric(18, 2), default=0.0, comment="本期折旧额")
    accumulated_before = Column(Numeric(18, 2), default=0.0, comment="折旧前累计")
    accumulated_after = Column(Numeric(18, 2), default=0.0, comment="折旧后累计")
    net_value = Column(Numeric(18, 2), default=0.0, comment="折旧后净值")
    remark = Column(String(200), comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    company = relationship("Company", back_populates="fixed_asset_depreciations")


# ==================== 无形资产 ====================

class IntangibleAsset(Base):
    """无形资产卡片"""
    __tablename__ = "intangible_assets"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    code = Column(String(30), nullable=False, comment="资产编码")
    name = Column(String(100), nullable=False, comment="资产名称")
    category = Column(String(30), nullable=False, comment="类别：专利权/商标权/著作权/土地使用权/软件/特许权/其他")
    purchase_date = Column(Date, comment="取得日期")
    original_value = Column(Numeric(18, 2), default=0.0, comment="原值")
    useful_life_months = Column(Integer, default=120, comment="摊销期限（月）")
    accumulated_amortization = Column(Numeric(18, 2), default=0.0, comment="累计摊销")
    monthly_amortization = Column(Numeric(18, 2), default=0.0, comment="月摊销额")
    residual_value = Column(Numeric(18, 2), default=0.0, comment="预计残值")
    status = Column(String(20), default="在用", comment="状态：在用/处置")
    voucher_no = Column(String(30), comment="入账凭证号")
    disposal_voucher_no = Column(String(30), comment="处置凭证号")
    disposal_date = Column(Date, comment="处置日期")
    disposal_amount = Column(Numeric(18, 2), default=0.0, comment="处置收入")
    remark = Column(Text, comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="intangible_assets")


class IntangibleAssetAmortization(Base):
    """无形资产摊销明细"""
    __tablename__ = "ia_amortizations"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    asset_id = Column(Integer, ForeignKey("intangible_assets.id"), nullable=False)
    period = Column(String(7), nullable=False, comment="摊销期间")
    amortization_amount = Column(Numeric(18, 2), default=0.0, comment="本期摊销额")
    accumulated_before = Column(Numeric(18, 2), default=0.0, comment="摊销前累计")
    accumulated_after = Column(Numeric(18, 2), default=0.0, comment="摊销后累计")
    net_value = Column(Numeric(18, 2), default=0.0, comment="摊销后净值")
    remark = Column(String(200), comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    company = relationship("Company", back_populates="intangible_asset_amortizations")


# ==================== 库存管理 ====================

class InventoryItem(Base):
    """库存商品/物料档案"""
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    code = Column(String(30), nullable=False, comment="商品编码")
    name = Column(String(100), nullable=False, comment="商品名称")
    spec = Column(String(100), comment="规格型号")
    unit = Column(String(10), comment="计量单位")
    category = Column(String(30), comment="分类：原材料/半成品/产成品/周转材料/低值易耗品")
    warehouse = Column(String(50), comment="仓库")
    safety_stock = Column(Numeric(18, 2), default=0.0, comment="安全库存量")
    current_stock = Column(Numeric(18, 2), default=0.0, comment="当前库存量")
    cost_price = Column(Numeric(18, 2), default=0.0, comment="参考成本价")
    sale_price = Column(Numeric(18, 2), default=0.0, comment="参考售价")
    account_code = Column(String(20), comment="关联会计科目编码")
    is_active = Column(Boolean, default=True)
    remark = Column(String(200), comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="inventory_items")


class InventoryTransaction(Base):
    """库存流水"""
    __tablename__ = "inventory_transactions"
    __table_args__ = (
        Index('idx_it_company_item', 'company_id', 'item_code'),
        Index('idx_it_company_date', 'company_id', 'transaction_date'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    item_code = Column(String(30), nullable=False, comment="商品编码")
    transaction_date = Column(Date, nullable=False, comment="业务日期")
    trans_type = Column(String(20), nullable=False, comment="类型：入库/出库/调拨入/调拨出/盘盈/盘亏/其他")
    quantity = Column(Numeric(18, 2), nullable=False, comment="数量（+入库/-出库）")
    unit_price = Column(Numeric(18, 2), default=0.0, comment="单价")
    total_amount = Column(Numeric(18, 2), default=0.0, comment="金额")
    warehouse = Column(String(50), comment="仓库")
    warehouse_to = Column(String(50), comment="调入仓库（调拨用）")
    voucher_no = Column(String(30), comment="关联凭证号")
    reference_no = Column(String(50), comment="单据号（入库单/出库单等）")
    operator = Column(String(50), comment="操作人")
    remark = Column(Text, comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    company = relationship("Company", back_populates="inventory_transactions")


class InventoryBalance(Base):
    """库存余额快照（按期计算）"""
    __tablename__ = "inventory_balances"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    item_code = Column(String(30), nullable=False, comment="商品编码")
    period = Column(String(7), nullable=False, comment="期间 YYYY-MM")
    begin_quantity = Column(Numeric(18, 2), default=0.0, comment="期初数量")
    in_quantity = Column(Numeric(18, 2), default=0.0, comment="本期入库数量")
    out_quantity = Column(Numeric(18, 2), default=0.0, comment="本期出库数量")
    end_quantity = Column(Numeric(18, 2), default=0.0, comment="期末数量")
    total_amount = Column(Numeric(18, 2), default=0.0, comment="期末金额")
    created_at = Column(DateTime, default=datetime.now)
    company = relationship("Company", back_populates="inventory_balances")


# ==================== 合同管理 ====================

class Contract(Base):
    """合同台账"""
    __tablename__ = "contracts"
    __table_args__ = (
        Index('idx_contract_company_status', 'company_id', 'status'),
        Index('idx_contract_company_type', 'company_id', 'contract_type'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    contract_no = Column(String(50), nullable=False, comment="合同编号")
    name = Column(String(200), nullable=False, comment="合同名称")
    contract_type = Column(String(20), nullable=False, comment="类型：采购/销售/服务/租赁/其他")
    party_a = Column(String(100), comment="甲方")
    party_b = Column(String(100), comment="乙方")
    amount = Column(Numeric(18, 2), default=0.0, comment="合同金额")
    signing_date = Column(Date, comment="签订日期")
    effective_date = Column(Date, comment="生效日期")
    expiry_date = Column(Date, comment="到期日期")
    status = Column(String(20), default="起草中", comment="状态：起草中/已签署/履行中/已完成/已终止")
    responsible_person = Column(String(50), comment="负责人")
    dept_code = Column(String(20), comment="部门编码")
    content_summary = Column(Text, comment="内容摘要")
    remark = Column(Text, comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="contracts")


class ContractPayment(Base):
    """合同收付款计划"""
    __tablename__ = "contract_payments"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    payment_no = Column(Integer, default=1, comment="期次")
    payment_type = Column(String(10), nullable=False, comment="收款/付款")
    amount = Column(Numeric(18, 2), nullable=False, comment="金额")
    due_date = Column(Date, comment="到期日期")
    paid_date = Column(Date, comment="实际收付日期")
    paid_amount = Column(Numeric(18, 2), default=0.0, comment="实收/实付金额")
    status = Column(String(20), default="未付", comment="状态：未付/部分已付/已付清")
    remark = Column(String(200), comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="contract_payments")


# ==================== 付款管理 ====================

class Payment(Base):
    """付款记录"""
    __tablename__ = "payments"
    __table_args__ = (
        Index('idx_payment_company_status', 'company_id', 'status'),
        Index('idx_payment_company_supplier', 'company_id', 'supplier_id'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    payment_type = Column(String(10), nullable=False, default="外部单位", comment="类型：内部人员/外部单位")
    scenario = Column(String(20), comment="情形：备用金/报销/借支（内部人员）或 预付款/应付款（外部单位）")
    payment_no = Column(String(50), nullable=False, comment="付款单号")
    payment_date = Column(Date, nullable=False, comment="付款日期")
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True, comment="内部人员ID")
    employee_name = Column(String(50), comment="内部人员姓名")
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True, comment="供应商ID（外部单位）")
    supplier_name = Column(String(100), comment="供应商名称")
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=True, comment="关联合同ID")
    contract_no = Column(String(50), comment="关联合同编号")
    amount = Column(Numeric(18, 2), nullable=False, comment="金额")
    payment_method = Column(String(20), nullable=False, default="银行转账", comment="付款方式：银行转账/现金/支票/其他")
    payee = Column(String(100), comment="收款方")
    payee_account = Column(String(50), comment="收款账号")
    payee_bank = Column(String(100), comment="收款银行")
    status = Column(String(20), default="待审批", comment="状态：待审批/已审批/已付款/已驳回")
    approved_by = Column(String(50), comment="审批人")
    approved_at = Column(DateTime, comment="审批时间")
    paid_at = Column(DateTime, comment="实际付款时间")
    department = Column(String(50), comment="所属部门")
    purpose = Column(String(200), comment="用途说明")
    remark = Column(Text, comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="payments")


# ==================== 开具发票（销售发票）====================

class SalesInvoice(Base):
    """开具发票 - 企业开出的销售发票"""
    __tablename__ = "sales_invoices"
    __table_args__ = (
        Index('idx_si_company_date', 'company_id', 'invoice_date'),
        Index('idx_si_company_buyer', 'company_id', 'buyer_name'),
        Index('idx_si_company_status', 'company_id', 'status'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    # 发票基本信息
    invoice_code = Column(String(30), comment="发票代码")
    invoice_no = Column(String(30), comment="发票号码")
    digital_invoice_no = Column(String(50), comment="数电发票号码")
    # 销方信息
    seller_tax_no = Column(String(50), comment="销方识别号")
    seller_name = Column(String(100), nullable=False, comment="销方名称")
    # 购方信息
    buyer_tax_no = Column(String(50), comment="购方识别号")
    buyer_name = Column(String(100), nullable=False, comment="购买方名称")
    # 发票日期与分类
    invoice_date = Column(Date, nullable=False, comment="开票日期")
    tax_category_code = Column(String(30), comment="税收分类编码")
    specific_business_type = Column(String(50), comment="特定业务类型")
    # 货物明细
    goods_name = Column(String(200), comment="货物或应税劳务名称")
    spec = Column(String(100), comment="规格型号")
    unit = Column(String(10), comment="单位")
    quantity = Column(Numeric(18, 2), default=0, comment="数量")
    unit_price = Column(Numeric(18, 2), default=0, comment="单价")
    # 金额信息
    amount = Column(Numeric(18, 2), nullable=False, default=0.0, comment="金额（不含税）")
    tax_rate = Column(Numeric(18, 2), nullable=False, default=0.0, comment="税率（%）")
    tax_amount = Column(Numeric(18, 2), nullable=False, default=0.0, comment="税额")
    total_amount = Column(Numeric(18, 2), nullable=False, default=0.0, comment="价税合计")
    # 发票属性
    invoice_source = Column(String(20), comment="发票来源")
    invoice_category = Column(String(20), nullable=False, default="增值税专用发票", comment="发票票种：增值税专用发票/增值税普通发票/电子普通发票/其他")
    status = Column(String(20), nullable=False, default="正常", comment="发票状态：正常/作废/红冲")
    is_positive = Column(Boolean, default=True, comment="是否正数发票")
    invoice_risk_level = Column(String(10), comment="发票风险等级")
    # 其他
    issuer = Column(String(30), comment="开票人")
    remark = Column(Text, comment="备注")
    raw_data = Column(Text, comment="导入时的额外列数据JSON")
    _fingerprint = Column(String(64), comment="全行指纹（去重用）")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="sales_invoices")

# ==================== 取得发票（采购发票）====================

class PurchaseInvoice(Base):
    """取得发票 - 企业收到的采购发票"""
    __tablename__ = "purchase_invoices"
    __table_args__ = (
        Index('idx_pi_company_date', 'company_id', 'invoice_date'),
        Index('idx_pi_company_seller', 'company_id', 'seller_name'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    # 发票基本信息
    invoice_code = Column(String(30), comment="发票代码")
    invoice_no = Column(String(30), comment="发票号码")
    digital_invoice_no = Column(String(50), comment="数电发票号码")
    # 销方信息
    seller_tax_no = Column(String(50), comment="销方识别号")
    seller_name = Column(String(100), nullable=False, comment="销方名称")
    # 购方信息
    buyer_tax_no = Column(String(50), comment="购方识别号")
    buyer_name = Column(String(100), nullable=False, comment="购买方名称")
    # 发票日期与分类
    invoice_date = Column(Date, nullable=False, comment="开票日期")
    tax_category_code = Column(String(30), comment="税收分类编码")
    specific_business_type = Column(String(50), comment="特定业务类型")
    # 货物明细
    goods_name = Column(String(200), comment="货物或应税劳务名称")
    spec = Column(String(100), comment="规格型号")
    unit = Column(String(10), comment="单位")
    quantity = Column(Numeric(18, 2), default=0, comment="数量")
    unit_price = Column(Numeric(18, 2), default=0, comment="单价")
    # 金额信息
    amount = Column(Numeric(18, 2), nullable=False, default=0.0, comment="金额（不含税）")
    tax_rate = Column(Numeric(18, 2), nullable=False, default=0.0, comment="税率（%）")
    tax_amount = Column(Numeric(18, 2), nullable=False, default=0.0, comment="税额")
    total_amount = Column(Numeric(18, 2), nullable=False, default=0.0, comment="价税合计")
    # 发票属性
    invoice_source = Column(String(20), comment="发票来源")
    invoice_category = Column(String(20), nullable=False, default="增值税专用发票", comment="发票票种：增值税专用发票/增值税普通发票/电子普通发票/其他")
    status = Column(String(20), nullable=False, default="正常", comment="发票状态：正常/作废/红冲")
    is_positive = Column(Boolean, default=True, comment="是否正数发票")
    invoice_risk_level = Column(String(10), comment="发票风险等级")
    # 其他
    issuer = Column(String(30), comment="开票人")
    remark = Column(Text, comment="备注")
    raw_data = Column(Text, comment="导入时的额外列数据JSON")
    _fingerprint = Column(String(64), comment="全行指纹（去重用）")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="purchase_invoices")


class BookkeepingInvoice(Base):
    """记账发票 - 企业收到的普通发票/收据等（不入进项抵扣体系）"""
    __tablename__ = "bookkeeping_invoices"
    __table_args__ = (
        Index('idx_bi_company_date', 'company_id', 'invoice_date'),
        Index('idx_bi_company_seller', 'company_id', 'seller_name'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    # 发票基本信息
    invoice_code = Column(String(30), comment="发票代码")
    invoice_no = Column(String(30), comment="发票号码")
    digital_invoice_no = Column(String(50), comment="数电发票号码")
    # 销方信息
    seller_tax_no = Column(String(50), comment="销方识别号")
    seller_name = Column(String(100), nullable=False, comment="销方名称")
    # 购方信息
    buyer_tax_no = Column(String(50), comment="购方识别号")
    buyer_name = Column(String(100), nullable=False, comment="购买方名称")
    # 发票日期与分类
    invoice_date = Column(Date, nullable=False, comment="开票日期")
    tax_category_code = Column(String(30), comment="税收分类编码")
    specific_business_type = Column(String(50), comment="特定业务类型")
    # 货物明细
    goods_name = Column(String(200), comment="货物或应税劳务名称")
    spec = Column(String(100), comment="规格型号")
    unit = Column(String(10), comment="单位")
    quantity = Column(Numeric(18, 2), default=0, comment="数量")
    unit_price = Column(Numeric(18, 2), default=0, comment="单价")
    # 金额信息
    amount = Column(Numeric(18, 2), nullable=False, default=0.0, comment="金额（不含税）")
    tax_rate = Column(Numeric(18, 2), nullable=False, default=0.0, comment="税率（%）")
    tax_amount = Column(Numeric(18, 2), nullable=False, default=0.0, comment="税额")
    total_amount = Column(Numeric(18, 2), nullable=False, default=0.0, comment="价税合计")
    # 发票属性
    invoice_source = Column(String(20), comment="发票来源")
    invoice_category = Column(String(20), nullable=False, default="增值税普通发票", comment="发票票种")
    status = Column(String(20), nullable=False, default="正常", comment="发票状态：正常/作废/红冲")
    is_positive = Column(Boolean, default=True, comment="是否正数发票")
    invoice_risk_level = Column(String(10), comment="发票风险等级")
    # 其他
    issuer = Column(String(30), comment="开票人")
    remark = Column(Text, comment="备注")
    raw_data = Column(Text, comment="导入时的额外列数据JSON")
    _fingerprint = Column(String(64), comment="全行指纹（去重用）")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="bookkeeping_invoices")


# ==================== 银行配置（不同银行不同列映射）====================

class BankConfig(Base):
    """银行配置 - 每个银行账号的列映射模板"""
    __tablename__ = "bank_configs"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    bank_name = Column(String(100), nullable=False, comment="银行名称，如：中国工商银行")
    account_number = Column(String(50), comment="银行账号")
    account_name = Column(String(100), comment="账户名称")
    column_mapping = Column(Text, comment="列映射JSON：{标准字段: 银行文件列名}")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="bank_configs")


# ==================== 银行流水 ====================

class BankTransaction(Base):
    """银行流水 - 归一化核心字段 + raw_data JSON 存额外列"""
    __tablename__ = "bank_transactions"
    __table_args__ = (
        Index('idx_bt_company_date', 'company_id', 'transaction_date'),
        Index('idx_bt_company_bank', 'company_id', 'bank_config_id'),
        Index('idx_bt_company_type', 'company_id', 'transaction_type'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    bank_config_id = Column(Integer, ForeignKey("bank_configs.id"), nullable=True, comment="关联银行配置")
    transaction_date = Column(Date, nullable=False, comment="交易日期")
    transaction_time = Column(Time, nullable=True, comment="交易时间")
    application_date = Column(Date, nullable=True, comment="申请日期")
    voucher_no = Column(String(30), comment="凭证号")
    debit_amount = Column(Numeric(18, 2), default=0.0, comment="借方金额")
    credit_amount = Column(Numeric(18, 2), default=0.0, comment="贷方金额")
    balance = Column(Numeric(18, 2), default=0.0, comment="余额")
    counterparty_account = Column(String(50), comment="对方账号")
    counterparty_name = Column(String(100), comment="对方户名")
    counterparty_bank = Column(String(100), comment="对方行名")
    transaction_serial_no = Column(String(50), comment="交易流水号")
    voucher_seq = Column(String(30), comment="传票序号")
    record_status = Column(String(20), comment="记录状态")
    summary = Column(String(300), comment="摘要/用途")
    transaction_remark = Column(Text, comment="交易附言")
    account_type = Column(String(30), comment="客户账户类型")
    # === 旧字段（保留向后兼容） ===
    amount = Column(Numeric(18, 2), default=0.0, comment="交易金额（旧：收入为正/支出为负）")
    transaction_type = Column(String(20), default="支出", comment="类型（旧）")
    payment_method = Column(String(30), comment="结算方式（旧）")
    reference_no = Column(String(50), comment="银行流水号（旧）")
    raw_data = Column(Text, comment="原始数据JSON（旧）")
    journal_voucher_no = Column(String(30), comment="关联序时账凭证号")
    remark = Column(Text, comment="备注（旧）")
    _fingerprint = Column(String(64), comment="全行指纹（去重用）")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="bank_transactions")


# ==================== 进项抵扣 ====================

class InputVATDeduction(Base):
    """进项抵扣管理 - 进项发票认证抵扣台账"""
    __tablename__ = "input_vat_deductions"
    __table_args__ = (
        Index('idx_ivd_company_check_time', 'company_id', 'check_time'),
        Index('idx_ivd_company_invoice', 'company_id', 'purchase_invoice_id'),
        Index('idx_ivd_status', 'company_id', 'invoice_status'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    purchase_invoice_id = Column(Integer, ForeignKey("purchase_invoices.id"), nullable=True, comment="关联取得发票ID")
    # 核心发票信息
    check_status = Column(String(10), comment="勾选状态：已勾选/未勾选")
    invoice_source = Column(String(50), comment="发票来源，如：勾选平台/扫描认证/手工录入")
    domestic_sale_cert_no = Column(String(50), comment="转内销证明编号")
    digital_invoice_no = Column(String(50), comment="数电发票号码")
    invoice_code = Column(String(30), comment="发票代码")
    invoice_no = Column(String(30), comment="发票号码")
    invoice_date = Column(Date, comment="开票日期")
    seller_tax_id = Column(String(30), comment="销售方纳税人识别号")
    seller_name = Column(String(100), comment="销方名称")
    amount = Column(Numeric(18, 2), default=0.0, comment="金额（不含税）")
    tax_amount = Column(Numeric(18, 2), default=0.0, comment="税额")
    deductible_tax_amount = Column(Numeric(18, 2), default=0.0, comment="有效抵扣税额")
    # 票种信息
    invoice_category = Column(String(50), comment="票种，如：数电发票（增值税专用发票）")
    invoice_category_label = Column(String(30), comment="票种标签")
    invoice_status = Column(String(20), default="正常", comment="发票状态：正常/作废/红冲")
    # 勾选与风险
    check_time = Column(DateTime, comment="勾选时间")
    risk_level = Column(String(20), default="正常", comment="发票风险等级：正常/疑点/异常/失控")
    # 保留字段（历史兼容）
    goods_name = Column(String(200), comment="货物名称")
    total_amount = Column(Numeric(18, 2), default=0.0, comment="价税合计")
    tax_rate = Column(Numeric(18, 2), default=0.0, comment="税率（%）")
    deducted_tax_amount = Column(Numeric(18, 2), default=0.0, comment="已抵扣税额")
    deduction_period = Column(String(7), comment="抵扣所属期 YYYY-MM")
    deduction_status = Column(String(20), default="待抵扣", comment="抵扣状态：待认证/待抵扣/已抵扣/部分抵扣/不得抵扣")
    certification_date = Column(Date, comment="认证日期")
    deduction_date = Column(Date, comment="抵扣日期")
    deduction_method = Column(String(30), default="凭票抵扣", comment="抵扣方式：凭票抵扣/计算抵扣/核定抵扣")
    voucher_no = Column(String(30), comment="关联凭证号")
    remark = Column(Text, comment="备注")
    raw_data = Column(Text, comment="导入时的额外列数据JSON")
    import_batch_id = Column(String(36), comment="导入批次ID，同一次导入共享")
    _fingerprint = Column(String(64), comment="全行指纹（去重用）")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="input_vat_deductions")


# ==================== 列映射模板（动态表头）====================

class ColumnTemplate(Base):
    """列映射模板 - 保存各模块上传文件的列对应关系"""
    __tablename__ = "column_templates"
    __table_args__ = (
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    module = Column(String(30), nullable=False, comment="模块：sales-invoice/purchase-invoice/bank-transaction")
    template_name = Column(String(100), nullable=False, comment="模板名称，如：工行流水模板")
    bank_config_id = Column(Integer, ForeignKey("bank_configs.id"), nullable=True, comment="关联银行配置（银行流水专用）")
    column_mapping = Column(Text, comment="列映射JSON：{标准字段: 文件列名}")
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="column_templates")


class JournalEntry(Base):
    """序时账 - 按日期顺序记录所有会计分录"""
    __tablename__ = "journal_entries"
    __table_args__ = (
        Index('idx_je_company_date', 'company_id', 'entry_date'),
        Index('idx_je_company_period', 'company_id', 'period'),
        Index('idx_je_company_voucher', 'company_id', 'voucher_word', 'voucher_no'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    entry_date = Column(Date, nullable=False, comment="日期")
    period = Column(String(7), nullable=False, comment="会计期间 YYYY-MM")
    voucher_word = Column(String(10), nullable=False, default="记", comment="凭证字：记/收/付/转")
    voucher_no = Column(Integer, nullable=False, comment="凭证号")
    attach_count = Column(Integer, default=0, comment="附单据数")
    summary = Column(Text, comment="摘要")
    account_code = Column(String(20), nullable=False, comment="科目编码")
    account_name = Column(String(100), comment="科目名称")
    debit_amount = Column(Numeric(18, 2), default=0.0, comment="借方金额")
    credit_amount = Column(Numeric(18, 2), default=0.0, comment="贷方金额")
    prepared_by = Column(String(50), comment="制单人")
    reviewed_by = Column(String(50), comment="复核人")
    is_reviewed = Column(Boolean, default=False, comment="是否复核")
    reviewed_at = Column(DateTime, comment="复核时间")
    remark = Column(Text, comment="备注")
    contact_project = Column(String(100), comment="往来项目")
    spec_model = Column(String(100), comment="规格型号")
    quantity = Column(Numeric(18, 2), default=0.0, comment="数量")
    unit = Column(String(20), comment="单位")
    unit_price = Column(Numeric(18, 2), default=0.0, comment="单价")
    source = Column(String(50), default="手动录入", comment="凭证来源：手动录入/销项发票/进项抵扣/银行流水")
    ref_id = Column(Integer, comment="关联业务ID（销项发票=SalesInvoice.id, 进项抵扣=InputVATDeduction.id）")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    company = relationship("Company", back_populates="journal_entries")


# ==================== 数据库迁移与初始化 ====================

def migrate_schema(db):
    """迁移旧数据库到多公司架构"""
    inspector = inspect(engine)

    # ── 1. 创建 companies 表（如果不存在） ──
    if "companies" not in inspector.get_table_names():
        Base.metadata.create_all(bind=engine, tables=[Company.__table__])

    # ── 1.5. 为 companies 补充新增字段（必须在查询 Company 之前） ──
    if "companies" in inspector.get_table_names():
        existing_cols = {c["name"] for c in inspector.get_columns("companies")}
        company_new_cols = {
            "registered_capital": "ALTER TABLE companies ADD COLUMN registered_capital FLOAT",
            "established_date": "ALTER TABLE companies ADD COLUMN established_date DATE",
            "legal_representative": "ALTER TABLE companies ADD COLUMN legal_representative VARCHAR(50)",
            "legal_representative_id": "ALTER TABLE companies ADD COLUMN legal_representative_id VARCHAR(30)",
            "address": "ALTER TABLE companies ADD COLUMN address VARCHAR(200)",
            "business_scope": "ALTER TABLE companies ADD COLUMN business_scope TEXT",
        }
        for col_name, sql in company_new_cols.items():
            if col_name not in existing_cols:
                try:
                    db.execute(TextClause(sql))
                    db.commit()
                    print(f"已为 companies 添加 {col_name} 列")
                except Exception as e:
                    db.rollback()
                    print(f"companies 添加 {col_name} 列失败: {e}")
        # 创建子表
        for sub_table in [CompanyShareholder.__table__, CompanyDirector.__table__,
                          CompanySupervisor.__table__, CompanyFinanceContact.__table__]:
            table_name = sub_table.name
            if table_name not in inspector.get_table_names():
                try:
                    sub_table.create(bind=engine)
                    db.commit()
                    print(f"已创建子表 {table_name}")
                except Exception as e:
                    db.rollback()
                    print(f"创建子表 {table_name} 失败: {e}")

    # ── 2. 给所有表增加 company_id 列 ──
    migrations = {
        "departments": "ALTER TABLE departments ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1",
        "employees": "ALTER TABLE employees ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1",
        "customers": "ALTER TABLE customers ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1",
        "suppliers": "ALTER TABLE suppliers ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1",
        "accounts": "ALTER TABLE accounts ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1",
        "periods": "ALTER TABLE periods ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1",
    }

    for table_name, sql in migrations.items():
        try:
            existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
            if "company_id" not in existing_cols:
                db.execute(TextClause(sql))
                db.commit()
                print(f"已为 {table_name} 添加 company_id 列")
        except Exception as e:
            db.rollback()
            print(f"迁移 {table_name} 跳过（可能已存在）: {e}")

    # ── 4. 补充 uscc 列 ──
    extra_cols = {
        "company_info": "ALTER TABLE company_info ADD COLUMN uscc VARCHAR(50)",
        "customers": "ALTER TABLE customers ADD COLUMN uscc VARCHAR(50)",
        "suppliers": "ALTER TABLE suppliers ADD COLUMN uscc VARCHAR(50)",
    }
    for table_name, sql in extra_cols.items():
        try:
            if table_name in inspector.get_table_names():
                existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
                if "uscc" not in existing_cols:
                    db.execute(TextClause(sql))
                    db.commit()
        except Exception:
            db.rollback()

    # ── 6. 付款管理：重命名 payment_type 值 + 添加 scenario 列 ──
    if "payments" in inspector.get_table_names():
        existing_cols = {c["name"] for c in inspector.get_columns("payments")}
        # 添加 scenario 列
        if "scenario" not in existing_cols:
            try:
                db.execute(TextClause("ALTER TABLE payments ADD COLUMN scenario VARCHAR(20)"))
                db.commit()
                print("已为 payments 添加 scenario 列")
            except Exception as e:
                db.rollback()
                print(f"payments 添加 scenario 列失败: {e}")
        # 重命名内部报销 → 内部人员
        try:
            db.execute(TextClause("UPDATE payments SET payment_type = '内部人员' WHERE payment_type = '内部报销'"))
            db.commit()
        except Exception as e:
            db.rollback()
        # 重命名外部支付 → 外部单位
        try:
            db.execute(TextClause("UPDATE payments SET payment_type = '外部单位' WHERE payment_type = '外部支付'"))
            db.commit()
        except Exception as e:
            db.rollback()

    # ── 7.1 客户档案 _fingerprint 字段扩展 ──
    if "customers" in inspector.get_table_names():
        existing_cols = {c["name"] for c in inspector.get_columns("customers")}
        new_cust_cols = {
            "_fingerprint": "ALTER TABLE customers ADD COLUMN _fingerprint VARCHAR(64)",
        }
        for col, sql in new_cust_cols.items():
            if col not in existing_cols:
                try:
                    db.execute(TextClause(sql))
                    db.commit()
                    print(f"已为 customers 添加字段: {col}")
                except Exception as e:
                    db.rollback()
                    print(f"customers 添加字段 {col} 失败（可能已存在）: {e}")

    # ── 7.2 销售发票字段扩展（数电发票、销方、风险等级等） ──
    if "sales_invoices" in inspector.get_table_names():
        existing_cols = {c["name"] for c in inspector.get_columns("sales_invoices")}
        new_si_cols = {
            "digital_invoice_no": "ALTER TABLE sales_invoices ADD COLUMN digital_invoice_no VARCHAR(50)",
            "seller_tax_no": "ALTER TABLE sales_invoices ADD COLUMN seller_tax_no VARCHAR(50)",
            "seller_name": "ALTER TABLE sales_invoices ADD COLUMN seller_name VARCHAR(100)",
            "tax_category_code": "ALTER TABLE sales_invoices ADD COLUMN tax_category_code VARCHAR(30)",
            "specific_business_type": "ALTER TABLE sales_invoices ADD COLUMN specific_business_type VARCHAR(50)",
            "invoice_source": "ALTER TABLE sales_invoices ADD COLUMN invoice_source VARCHAR(20)",
            "is_positive": "ALTER TABLE sales_invoices ADD COLUMN is_positive BOOLEAN DEFAULT 1",
            "invoice_risk_level": "ALTER TABLE sales_invoices ADD COLUMN invoice_risk_level VARCHAR(10)",
            "issuer": "ALTER TABLE sales_invoices ADD COLUMN issuer VARCHAR(30)",
            "invoice_category": "ALTER TABLE sales_invoices ADD COLUMN invoice_category VARCHAR(20)",
            "_fingerprint": "ALTER TABLE sales_invoices ADD COLUMN _fingerprint VARCHAR(64)",
        }
        for col, sql in new_si_cols.items():
            if col not in existing_cols:
                try:
                    db.execute(TextClause(sql))
                    db.commit()
                    print(f"已为 sales_invoices 添加字段: {col}")
                except Exception as e:
                    db.rollback()
                    print(f"sales_invoices 添加字段 {col} 失败（可能已存在）: {e}")
        # 将旧 invoice_type 数据迁移到 invoice_category
        if "invoice_type" in existing_cols and "invoice_category" in existing_cols or "invoice_category" not in existing_cols:
            pass
        if "invoice_type" in existing_cols:
            try:
                db.execute(TextClause("UPDATE sales_invoices SET invoice_category = invoice_type WHERE invoice_category IS NULL"))
                db.commit()
                print("已迁移 sales_invoices.invoice_type → invoice_category")
            except Exception as e:
                db.rollback()

    # ── 8. 取得发票字段扩展（数电发票、购方、风险等级等） ──
    if "purchase_invoices" in inspector.get_table_names():
        existing_cols = {c["name"] for c in inspector.get_columns("purchase_invoices")}
        new_pi_cols = {
            "digital_invoice_no": "ALTER TABLE purchase_invoices ADD COLUMN digital_invoice_no VARCHAR(50)",
            "buyer_tax_no": "ALTER TABLE purchase_invoices ADD COLUMN buyer_tax_no VARCHAR(50)",
            "buyer_name": "ALTER TABLE purchase_invoices ADD COLUMN buyer_name VARCHAR(100)",
            "tax_category_code": "ALTER TABLE purchase_invoices ADD COLUMN tax_category_code VARCHAR(30)",
            "specific_business_type": "ALTER TABLE purchase_invoices ADD COLUMN specific_business_type VARCHAR(50)",
            "invoice_source": "ALTER TABLE purchase_invoices ADD COLUMN invoice_source VARCHAR(20)",
            "is_positive": "ALTER TABLE purchase_invoices ADD COLUMN is_positive BOOLEAN DEFAULT 1",
            "invoice_risk_level": "ALTER TABLE purchase_invoices ADD COLUMN invoice_risk_level VARCHAR(10)",
            "issuer": "ALTER TABLE purchase_invoices ADD COLUMN issuer VARCHAR(30)",
            "invoice_category": "ALTER TABLE purchase_invoices ADD COLUMN invoice_category VARCHAR(20)",
            "_fingerprint": "ALTER TABLE purchase_invoices ADD COLUMN _fingerprint VARCHAR(64)",
        }
        for col, sql in new_pi_cols.items():
            if col not in existing_cols:
                try:
                    db.execute(TextClause(sql))
                    db.commit()
                    print(f"已为 purchase_invoices 添加字段: {col}")
                except Exception as e:
                    db.rollback()
                    print(f"purchase_invoices 添加字段 {col} 失败（可能已存在）: {e}")
        # 将旧 invoice_type 数据迁移到 invoice_category
        if "invoice_type" in existing_cols:
            try:
                db.execute(TextClause("UPDATE purchase_invoices SET invoice_category = invoice_type WHERE invoice_category IS NULL"))
                db.commit()
                print("已迁移 purchase_invoices.invoice_type → invoice_category")
            except Exception as e:
                db.rollback()

    # ── 8.05 记账发票表（复刻取得发票，独立建表） ──
    if "bookkeeping_invoices" not in inspector.get_table_names():
        try:
            db.execute(TextClause("""
                CREATE TABLE bookkeeping_invoices (
                    id INTEGER NOT NULL,
                    company_id INTEGER NOT NULL,
                    invoice_code VARCHAR(30),
                    invoice_no VARCHAR(30),
                    digital_invoice_no VARCHAR(50),
                    seller_tax_no VARCHAR(50),
                    seller_name VARCHAR(100),
                    buyer_tax_no VARCHAR(50),
                    buyer_name VARCHAR(100),
                    invoice_date DATE,
                    tax_category_code VARCHAR(30),
                    specific_business_type VARCHAR(50),
                    goods_name VARCHAR(200),
                    spec VARCHAR(100),
                    unit VARCHAR(10),
                    quantity NUMERIC(18,2) DEFAULT 0,
                    unit_price NUMERIC(18,2) DEFAULT 0,
                    amount NUMERIC(18,2) NOT NULL DEFAULT 0.0,
                    tax_rate NUMERIC(18,2) NOT NULL DEFAULT 0.0,
                    tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0.0,
                    total_amount NUMERIC(18,2) NOT NULL DEFAULT 0.0,
                    invoice_source VARCHAR(20),
                    invoice_category VARCHAR(20) NOT NULL DEFAULT '增值税普通发票',
                    status VARCHAR(20) NOT NULL DEFAULT '正常',
                    is_positive BOOLEAN DEFAULT 1,
                    invoice_risk_level VARCHAR(10),
                    issuer VARCHAR(30),
                    remark TEXT,
                    raw_data TEXT,
                    _fingerprint VARCHAR(64),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    FOREIGN KEY (company_id) REFERENCES companies (id)
                )
            """))
            db.commit()
            print("已创建 bookkeeping_invoices 表")
        except Exception as e:
            db.rollback()
            print(f"创建 bookkeeping_invoices 表失败: {e}")

    # ── 8.06 取得发票：删除认证/抵扣字段（认证状态、认证日期、抵扣期间、抵扣率） ──
    if "purchase_invoices" in inspector.get_table_names():
        existing_cols = {c["name"] for c in inspector.get_columns("purchase_invoices")}
        for col in ["certification_status", "certification_date", "deduction_period", "deduction_rate"]:
            if col in existing_cols:
                try:
                    db.execute(TextClause(f"ALTER TABLE purchase_invoices DROP COLUMN {col}"))
                    db.commit()
                    print(f"已删除 purchase_invoices.{col}")
                except Exception as e:
                    db.rollback()
                    print(f"删除 purchase_invoices.{col} 失败（可能不支持 DROP COLUMN）: {e}")

    # ── 8.1 银行流水 _fingerprint 字段 ──
    if "bank_transactions" in inspector.get_table_names():
        existing_cols = {c["name"] for c in inspector.get_columns("bank_transactions")}
        bt_new_cols = {
            "_fingerprint": "ALTER TABLE bank_transactions ADD COLUMN _fingerprint VARCHAR(64)",
        }
        for col, sql in bt_new_cols.items():
            if col not in existing_cols:
                try:
                    db.execute(TextClause(sql))
                    db.commit()
                    print(f"已为 bank_transactions 添加字段: {col}")
                except Exception as e:
                    db.rollback()
                    print(f"bank_transactions 添加字段 {col} 失败（可能已存在）: {e}")

    # ── 8.2 进项抵扣 _fingerprint 字段 ──
    if "input_vat_deductions" in inspector.get_table_names():
        existing_cols = {c["name"] for c in inspector.get_columns("input_vat_deductions")}
        ivd_new_cols = {
            "_fingerprint": "ALTER TABLE input_vat_deductions ADD COLUMN _fingerprint VARCHAR(64)",
        }
        for col, sql in ivd_new_cols.items():
            if col not in existing_cols:
                try:
                    db.execute(TextClause(sql))
                    db.commit()
                    print(f"已为 input_vat_deductions 添加字段: {col}")
                except Exception as e:
                    db.rollback()
                    print(f"input_vat_deductions 添加字段 {col} 失败（可能已存在）: {e}")

    # ── 9. 发票号码和开票日期改为可空 ──
    for table_name in ("sales_invoices", "purchase_invoices"):
        if table_name in inspector.get_table_names():
            cols = {c["name"]: c for c in inspector.get_columns(table_name)}
            # 如果还需要修复，仅尝试 ALTER COLUMN（SQLite 不支持），
            # 实际情况是 create_all() 已按模型建表，无需重建
            # 清理可能残留的空备份表
            backup_table = f"{table_name}_bk"
            if backup_table in inspector.get_table_names():
                try:
                    db.execute(TextClause(f"DROP TABLE IF EXISTS {backup_table}"))
                    db.commit()
                    print(f"已清理残留备份表 {backup_table}")
                except Exception as e:
                    db.rollback()
                    print(f"清理 {backup_table} 跳过: {e}")


    # ── 11. JournalEntry 新增5个字段 ──
    if "journal_entries" in inspector.get_table_names():
        je_cols = {c["name"] for c in inspector.get_columns("journal_entries")}
        for col_name, col_def in [
            ("contact_project", "TEXT"),
            ("spec_model", "TEXT"),
            ("quantity", "REAL DEFAULT 0.0"),
            ("unit", "TEXT"),
            ("unit_price", "REAL DEFAULT 0.0"),
        ]:
            if col_name not in je_cols:
                try:
                    # safe: col_name/col_def 来自硬编码列表，无注入风险
                    db.execute(TextClause(f"ALTER TABLE journal_entries ADD COLUMN {col_name} {col_def}"))
                    db.commit()
                    print(f"  [OK] 已添加 journal_entries.{col_name}")
                except Exception as e:
                    db.rollback()
                    print(f"  [X] journal_entries.{col_name} 迁移失败: {e}")

    # ── 11.5. JournalEntry 新增 source 列 ──
    if "journal_entries" in inspector.get_table_names():
        je_cols = {c["name"] for c in inspector.get_columns("journal_entries")}
        if "source" not in je_cols:
            try:
                db.execute(TextClause("ALTER TABLE journal_entries ADD COLUMN source VARCHAR(50) DEFAULT '手动录入'"))
                db.commit()
                print("  [OK] 已添加 journal_entries.source")
            except Exception as e:
                db.rollback()
                print(f"  [X] journal_entries.source 迁移失败: {e}")
        if "ref_id" not in je_cols:
            try:
                db.execute(TextClause("ALTER TABLE journal_entries ADD COLUMN ref_id INTEGER"))
                db.commit()
                print("  [OK] 已添加 journal_entries.ref_id")
            except Exception as e:
                db.rollback()
                print(f"  [X] journal_entries.ref_id 迁移失败: {e}")

    # ── 12. 已有公司补充 销项税额 科目（221001001） ──
    if "accounts" in inspector.get_table_names():
        companies = db.query(Company).order_by(Company.id).all()
        for comp in companies:
            existing = db.query(Account).filter(
                Account.company_id == comp.id,
                Account.code == "221001001"
            ).first()
            if not existing:
                try:
                    db.add(Account(
                        company_id=comp.id,
                        code="221001001", name="销项税额",
                        category="负债", balance_direction="贷",
                        level=3, parent_code="221001"
                    ))
                    db.commit()
                    print(f"  [OK] 为 {comp.name} 添加科目 221001001 销项税额")
                except Exception as e:
                    db.rollback()
                    print(f"  [X] 221001001 销项税额 迁移失败: {e}")

    # ── 12.5. 已有公司补充 待认证进项税额 科目（221001003） ──
    if "accounts" in inspector.get_table_names():
        companies = db.query(Company).order_by(Company.id).all()
        for comp in companies:
            existing = db.query(Account).filter(
                Account.company_id == comp.id,
                Account.code == "221001003"
            ).first()
            if not existing:
                try:
                    db.add(Account(
                        company_id=comp.id,
                        code="221001003", name="待认证进项税额",
                        category="负债", balance_direction="贷",
                        level=3, parent_code="221001"
                    ))
                    db.commit()
                    print(f"  [OK] 为 {comp.name} 添加科目 221001003 待认证进项税额")
                except Exception as e:
                    db.rollback()
                    print(f"  [X] 221001003 待认证进项税额 迁移失败: {e}")


    # ── 12.7. 为档案表补充 updated_at 列 ──
    for tbl in ("departments", "employees", "customers", "suppliers", "bank_transactions"):
        if tbl in inspector.get_table_names():
            existing_cols = {c["name"] for c in inspector.get_columns(tbl)}
            if "updated_at" not in existing_cols:
                try:
                    db.execute(TextClause(f"ALTER TABLE {tbl} ADD COLUMN updated_at TIMESTAMP"))
                    db.commit()
                    print(f"  [OK] {tbl} 添加 updated_at 列")
                except Exception as e:
                    db.rollback()
                    print(f"  [X] {tbl} updated_at 迁移失败: {e}")


    # ── 13. 自动为"正常"状态的开具发票生成序时账凭证 ──
    if "sales_invoices" in inspector.get_table_names() and "journal_entries" in inspector.get_table_names():
        try:
            auto_generate_journals(db)
        except Exception as e:
            db.rollback()
            print(f"  [X] 开具发票→凭证自动生成失败: {e}")

    # ── 14. 自动为进项抵扣记录生成序时账凭证 ──
    if "input_vat_deductions" in inspector.get_table_names() and "journal_entries" in inspector.get_table_names():
        try:
            input_count = auto_generate_input_vat_journals(db)
            if input_count > 0:
                print(f"  [OK] 进项抵扣→凭证: 自动生成 {input_count} 笔")
        except Exception as e:
            db.rollback()
            print(f"  [X] 进项抵扣→凭证自动生成失败: {e}")

    # ── 15. 社保申报表──
    if "social_security_declarations" not in inspector.get_table_names():
        SocialSecurityDeclaration.__table__.create(bind=db.get_bind())
        db.commit()
        print("  [OK] 已创建 social_security_declarations 表")
    if "social_security_details" not in inspector.get_table_names():
        SocialSecurityDetail.__table__.create(bind=db.get_bind())
        db.commit()
        print("  [OK] 已创建 social_security_details 表")

    # ── 16. 公积金缴存表──
    if "housing_fund_declarations" not in inspector.get_table_names():
        HousingFundDeclaration.__table__.create(bind=db.get_bind())
        db.commit()
        print("  [OK] 已创建 housing_fund_declarations 表")

    # ── 18. 文化事业建设费申报表 ──
    if "cultural_construction_fee_declarations" not in inspector.get_table_names():
        CulturalConstructionFeeDeclaration.__table__.create(bind=db.get_bind())
        db.commit()
        print("  [OK] 已创建 cultural_construction_fee_declarations 表")
    if "cultural_construction_fee_deductions" not in inspector.get_table_names():
        CulturalConstructionFeeDeduction.__table__.create(bind=db.get_bind())
        db.commit()
        print("  [OK] 已创建 cultural_construction_fee_deductions 表")

    # ── 18.1 CCF 新增 50% 减征字段（财税〔2025〕7号） ──
    if "cultural_construction_fee_declarations" in inspector.get_table_names():
        ccf_cols = [c["name"] for c in inspector.get_columns("cultural_construction_fee_declarations")]
        if "row10a_fee_reduction_current" not in ccf_cols:
            db.execute(TextClause(
                "ALTER TABLE cultural_construction_fee_declarations ADD COLUMN row10a_fee_reduction_current NUMERIC(18,2) DEFAULT 0.0"
            ))
            db.commit()
            print("  [OK] CCF 新增 row10a_fee_reduction_current 列")
        if "row10a_fee_reduction_ytd" not in ccf_cols:
            db.execute(TextClause(
                "ALTER TABLE cultural_construction_fee_declarations ADD COLUMN row10a_fee_reduction_ytd NUMERIC(18,2) DEFAULT 0.0"
            ))
            db.commit()
            print("  [OK] CCF 新增 row10a_fee_reduction_ytd 列")
        if "fee_reduction_rate" not in ccf_cols:
            db.execute(TextClause(
                "ALTER TABLE cultural_construction_fee_declarations ADD COLUMN fee_reduction_rate NUMERIC(18,4) DEFAULT 0.5"
            ))
            db.commit()
            print("  [OK] CCF 新增 fee_reduction_rate 列")

    # ── 19. 补充索引与唯一约束 ──
    idx_defs = [
        ("idx_accounts_company", "accounts", "company_id"),
        ("idx_customers_company", "customers", "company_id"),
        ("idx_suppliers_company", "suppliers", "company_id"),
        ("idx_employees_company", "employees", "company_id"),
        ("idx_departments_company", "departments", "company_id"),
        ("idx_ss_details_company", "social_security_details", "company_id"),
        ("idx_hf_details_company", "housing_fund_details", "company_id"),
        ("idx_salary_company", "salary_records", "company_id"),
        ("idx_je_source", "journal_entries", "source"),
        ("idx_je_ref_id", "journal_entries", "ref_id"),
        ("idx_ivd_period", "input_vat_deductions", "period"),
    ]
    for idx_name, tbl, col in idx_defs:
        try:
            if tbl in inspector.get_table_names():
                db.execute(TextClause(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {tbl}({col})"))
                db.commit()
        except Exception:
            db.rollback()

    # Account(company_id, code) 唯一约束
    if "accounts" in inspector.get_table_names():
        try:
            db.execute(TextClause("CREATE UNIQUE INDEX IF NOT EXISTS uq_account_company_code ON accounts(company_id, code)"))
            db.commit()
        except Exception:
            db.rollback()

    # JournalEntry(source, ref_id) 索引（加速查询，非唯一约束：同一发票生成多行分录共享ref_id）
    if "journal_entries" in inspector.get_table_names():
        try:
            db.execute(TextClause(
                "CREATE INDEX IF NOT EXISTS idx_je_source_ref ON journal_entries(source, ref_id)"
            ))
            db.commit()
        except Exception:
            db.rollback()


    # ── 20. 发票表关键字段 NOT NULL 约束迁移 ──
    # SQLite 不支持 ALTER COLUMN，需要重建表
    _not_null_migrations = [
        ("sales_invoices", "invoice_date", "DATE", "2000-01-01"),
        ("sales_invoices", "seller_name", "VARCHAR(100)", "未知销方"),
        ("sales_invoices", "buyer_name", "VARCHAR(100)", "未知购方"),
        ("purchase_invoices", "invoice_date", "DATE", "2000-01-01"),
        ("purchase_invoices", "seller_name", "VARCHAR(100)", "未知销方"),
        ("purchase_invoices", "buyer_name", "VARCHAR(100)", "未知购方"),
        ("bookkeeping_invoices", "invoice_date", "DATE", "2000-01-01"),
        ("bookkeeping_invoices", "seller_name", "VARCHAR(100)", "未知销方"),
        ("bookkeeping_invoices", "buyer_name", "VARCHAR(100)", "未知购方"),
    ]
    for tbl, col, col_type, default_val in _not_null_migrations:
        if tbl not in inspector.get_table_names():
            continue
        existing_cols = {c["name"] for c in inspector.get_columns(tbl)}
        if col not in existing_cols:
            continue
        col_info = {c["name"]: c for c in inspector.get_columns(tbl)}[col]
        if not col_info.get("nullable", True):
            continue  # 已经 NOT NULL
        # Step1: 将 NULL 值更新为默认值
        try:
            db.execute(TextClause(f"UPDATE {tbl} SET {col} = :v WHERE {col} IS NULL"), {"v": default_val})
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"  [X] {tbl}.{col} NULL值更新失败: {e}")
            continue
        # Step2: 重建表以添加 NOT NULL 约束（SQLite 必须）
        try:
            db.execute(TextClause(f"ALTER TABLE {tbl} RENAME TO _bk_{tbl}"))
            db.commit()
            if tbl == "sales_invoices":
                SalesInvoice.__table__.create(bind=engine, checkfirst=True)
            elif tbl == "purchase_invoices":
                PurchaseInvoice.__table__.create(bind=engine, checkfirst=True)
            elif tbl == "bookkeeping_invoices":
                BookkeepingInvoice.__table__.create(bind=engine, checkfirst=True)
            db.execute(TextClause(f"INSERT INTO {tbl} SELECT * FROM _bk_{tbl}"))
            db.commit()
            db.execute(TextClause(f"DROP TABLE _bk_{tbl}"))
            db.commit()
            print(f"  [OK] {tbl}.{col} NOT NULL 约束已添加")
        except Exception as e:
            db.rollback()
            try:
                db.execute(TextClause(f"DROP TABLE IF EXISTS {tbl}"))
                db.execute(TextClause(f"ALTER TABLE _bk_{tbl} RENAME TO {tbl}"))
                db.commit()
            except Exception:
                pass
            print(f"  [X] {tbl}.{col} NOT NULL 迁移失败（已回滚）: {e}")


def _build_account_name_resolver(db, company_id):
    """预加载公司全部会计科目到内存dict，返回 (resolve函数, 科目dict)。
    
    避免 get_full_name 每次调用都查询 DB（N+1问题）。
    resolve(code) 返回科目全级次名称如 '应交税费/应交增值税/销项税额'。
    调用方在新增科目后应将其加入 dict：account_map[new_code] = new_acc。
    """
    accounts = db.query(Account).filter(Account.company_id == company_id).all()
    code_to_acc = {a.code: a for a in accounts}

    def get_full_name(code):
        parts = []
        cur = code
        while cur:
            acc = code_to_acc.get(cur)
            if not acc:
                break
            parts.insert(0, acc.name)
            cur = acc.parent_code
        return "/".join(parts) if parts else code

    return get_full_name, code_to_acc


def auto_generate_journals(db):
    """为所有"正常"状态的开具发票自动生成记账凭证（未生成过的）"""
    companies = db.query(Company).order_by(Company.id).all()
    total = 0
    for comp in companies:
        # ── 确保关键科目存在（销项发票进序时账必需的科目） ──
        _ensure_account(db, comp.id, "1122", "应收账款", "资产", "借")
        _ensure_account(db, comp.id, "2210", "应交税费", "负债", "贷")
        _ensure_account(db, comp.id, "221001", "应交增值税", "负债", "贷")
        _ensure_account(db, comp.id, "221001001", "销项税额", "负债", "贷")
        _ensure_account(db, comp.id, "6001", "主营业务收入", "收入", "贷")

        invoices = db.query(SalesInvoice).filter(
            SalesInvoice.company_id == comp.id,
            SalesInvoice.status == "正常",
            SalesInvoice.is_positive == True
        ).order_by(SalesInvoice.invoice_date.asc()).all()

        # 公司级别预加载科目解析器（所有发票共用）
        get_full_name, account_map = _build_account_name_resolver(db, comp.id)

        def ensure_revenue_sub(gn):
            """确保主营业务收入下存在对应货物的子科目"""
            if not gn:
                return ("6001", get_full_name("6001"))
            ext = db.query(Account).filter(
                Account.company_id == comp.id,
                Account.parent_code == "6001",
                Account.name == gn
            ).first()
            if ext:
                return (ext.code, get_full_name(ext.code))
            max_sub = db.query(Account.code).filter(
                Account.company_id == comp.id,
                Account.parent_code == "6001"
            ).order_by(Account.code.desc()).first()
            next_num = int(max_sub[0][4:6]) + 1 if (max_sub and max_sub[0]) else 1
            # 科目编码规则：6001 下级为 600101/600102/...（每张发票唯一货物子科目）
            new_code = f"6001{next_num:02d}"
            new_acc = Account(
                company_id=comp.id, code=new_code, name=gn,
                category="收入", balance_direction="贷",
                level=2, parent_code="6001",
            )
            db.add(new_acc)
            db.flush()
            account_map[new_code] = new_acc
            return (new_code, get_full_name(new_code))

        for inv in invoices:
            # 幂等检查：该发票已生成过凭证则跳过
            _existing = db.query(JournalEntry).filter(
                JournalEntry.company_id == comp.id,
                JournalEntry.source == "销项发票",
                JournalEntry.ref_id == inv.id
            ).first()
            if _existing:
                continue
            buyer = inv.buyer_name or "客户"
            goods = inv.goods_name or ""
            summary = f"销售{goods or '货物'}给{buyer}"

            period = inv.invoice_date.strftime("%Y-%m") if inv.invoice_date else datetime.now().strftime("%Y-%m")
            date_str = inv.invoice_date.strftime("%Y-%m-%d") if inv.invoice_date else period + "-01"

            # 计算下一个凭证号
            next_voucher_no = _next_voucher_no(db, comp.id, period, "记")

            rev_code, rev_name = ensure_revenue_sub(goods)

            entries = [
                JournalEntry(
                    company_id=comp.id,
                    entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                    period=period, voucher_word="记", voucher_no=next_voucher_no,
                    summary=summary, account_code="1122",
                    account_name=get_full_name("1122"),
                    debit_amount=inv.amount + (inv.tax_amount or 0), credit_amount=0,
                    contact_project=buyer,
                    spec_model=inv.spec or "", quantity=inv.quantity or 0,
                    unit=inv.unit or "", unit_price=inv.unit_price or 0,
                    source="销项发票", ref_id=inv.id,
                ),
                JournalEntry(
                    company_id=comp.id,
                    entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                    period=period, voucher_word="记", voucher_no=next_voucher_no,
                    summary=summary, account_code=rev_code, account_name=rev_name,
                    debit_amount=0, credit_amount=inv.amount,
                    contact_project="",
                    spec_model=inv.spec or "", quantity=inv.quantity or 0,
                    unit=inv.unit or "", unit_price=inv.unit_price or 0,
                    source="销项发票", ref_id=inv.id,
                ),
            ]
            # 仅在税额非零时生成增值税分录（含红字发票负税额）
            if (inv.tax_amount or 0) != 0:
                entries.append(
                    JournalEntry(
                        company_id=comp.id,
                        entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                        period=period, voucher_word="记", voucher_no=next_voucher_no,
                        summary=f"{summary}（增值税）",
                        account_code="221001001",
                        account_name=get_full_name("221001001"),
                        debit_amount=0, credit_amount=inv.tax_amount,
                        contact_project="",
                        spec_model=inv.spec or "", quantity=inv.quantity or 0,
                        unit=inv.unit or "", unit_price=inv.unit_price or 0,
                        source="销项发票", ref_id=inv.id,
                    )
                )
            for e in entries:
                db.add(e)
            db.flush()  # 让下一张发票能看到当前凭证号
            total += 1

    if total > 0:
        db.commit()
        print(f"  [OK] 自动为 {total} 张开具发票生成凭证")
    else:
        print(f"  [OK] 开具发票→凭证: 无需生成（均已存在或无发票）")


def auto_generate_single_invoice(db, inv):
    """为单张开具发票生成凭证（供创建发票API调用）"""

    buyer = inv.buyer_name or "客户"
    goods = inv.goods_name or ""
    summary = f"销售{goods or '货物'}给{buyer}"

    # 跳过已生成凭证的发票（按发票ID精确去重）
    existing = db.query(JournalEntry).filter(
        JournalEntry.company_id == inv.company_id,
        JournalEntry.source == "销项发票",
        JournalEntry.ref_id == inv.id
    ).first()
    if existing:
        return

    # ── 确保关键科目存在 ──
    _ensure_account(db, inv.company_id, "1122", "应收账款", "资产", "借")
    _ensure_account(db, inv.company_id, "2210", "应交税费", "负债", "贷")
    _ensure_account(db, inv.company_id, "221001", "应交增值税", "负债", "贷")
    _ensure_account(db, inv.company_id, "221001001", "销项税额", "负债", "贷")
    _ensure_account(db, inv.company_id, "6001", "主营业务收入", "收入", "贷")

    get_full_name, account_map = _build_account_name_resolver(db, inv.company_id)

    def ensure_revenue_sub(gn):
        if not gn:
            return ("6001", get_full_name("6001"))
        ext = db.query(Account).filter(
            Account.company_id == inv.company_id,
            Account.parent_code == "6001",
            Account.name == gn
        ).first()
        if ext:
            return (ext.code, get_full_name(ext.code))
        max_sub = db.query(Account.code).filter(
            Account.company_id == inv.company_id,
            Account.parent_code == "6001"
        ).order_by(Account.code.desc()).first()
        next_num = int(max_sub[0][4:6]) + 1 if (max_sub and max_sub[0]) else 1
        new_code = f"6001{next_num:02d}"
        new_acc = Account(
            company_id=inv.company_id, code=new_code, name=gn,
            category="收入", balance_direction="贷",
            level=2, parent_code="6001",
        )
        db.add(new_acc)
        db.flush()
        account_map[new_code] = new_acc
        return (new_code, get_full_name(new_code))

    period = inv.invoice_date.strftime("%Y-%m") if inv.invoice_date else datetime.now().strftime("%Y-%m")
    date_str = inv.invoice_date.strftime("%Y-%m-%d") if inv.invoice_date else period + "-01"

    next_voucher_no = _next_voucher_no(db, inv.company_id, period, "记")

    rev_code, rev_name = ensure_revenue_sub(goods)

    entries = [
        JournalEntry(
            company_id=inv.company_id,
            entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
            period=period, voucher_word="记", voucher_no=next_voucher_no,
            summary=summary, account_code="1122",
            account_name=get_full_name("1122"),
            debit_amount=inv.total_amount, credit_amount=0,
            contact_project=buyer,
            spec_model=inv.spec or "", quantity=inv.quantity or 0,
            unit=inv.unit or "", unit_price=inv.unit_price or 0,
            source="销项发票", ref_id=inv.id,
        ),
        JournalEntry(
            company_id=inv.company_id,
            entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
            period=period, voucher_word="记", voucher_no=next_voucher_no,
            summary=summary, account_code=rev_code, account_name=rev_name,
            debit_amount=0, credit_amount=inv.amount,
            contact_project="",
            spec_model=inv.spec or "", quantity=inv.quantity or 0,
            unit=inv.unit or "", unit_price=inv.unit_price or 0,
            source="销项发票", ref_id=inv.id,
        ),
    ]
    # 仅在税额非零时生成增值税分录（含红字发票负税额）
    if (inv.tax_amount or 0) != 0:
        entries.append(
            JournalEntry(
                company_id=inv.company_id,
                entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                period=period, voucher_word="记", voucher_no=next_voucher_no,
                summary=f"{summary}（增值税）",
                account_code="221001001",
                account_name=get_full_name("221001001"),
                debit_amount=0, credit_amount=inv.tax_amount,
                contact_project="",
                spec_model=inv.spec or "", quantity=inv.quantity or 0,
                unit=inv.unit or "", unit_price=inv.unit_price or 0,
                source="销项发票", ref_id=inv.id,
            )
        )
    for e in entries:
        db.add(e)
    db.commit()


def auto_generate_input_vat_for_period(db, company_id, period, total_tax=None):
    """为一个期间的进项抵扣汇总生成凭证（每月一笔认证汇总凭证）
    借：221001002 进项税额 = 贷：221001003 待认证进项税额
    
    如果 total_tax 为 None，自动从数据库汇总（优先用 deduction_period，为空则用 invoice_date 年月）
    """

    # 幂等检查：该期间已生成进项抵扣凭证且未被删除，跳过
    _existing = db.query(JournalEntry).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period == period,
        JournalEntry.source == "进项抵扣"
    ).first()
    if _existing:
        return 0

    # 汇总该期间所有进项抵扣的可抵扣税额
    if total_tax is None:
        # 匹配逻辑：deduction_period == period，或 deduction_period 为空但 invoice_date 年月 == period
        total_tax = db.query(func.coalesce(func.sum(InputVATDeduction.deductible_tax_amount), 0)).filter(
            InputVATDeduction.company_id == company_id,
            or_(
                InputVATDeduction.deduction_period == period,
                and_(
                    InputVATDeduction.deduction_period == None,
                    func.strftime('%Y-%m', InputVATDeduction.invoice_date) == period
                ),
                and_(
                    InputVATDeduction.deduction_period == "",
                    func.strftime('%Y-%m', InputVATDeduction.invoice_date) == period
                ),
            )
        ).scalar()

    if not total_tax or total_tax <= 0:
        return 0

    get_full_name, account_map = _build_account_name_resolver(db, company_id)

    # 确保 221001002 进项税额 科目存在
    acc_221001002 = db.query(Account).filter(Account.company_id == company_id, Account.code == "221001002").first()
    if not acc_221001002:
        acc_221001002 = Account(
            company_id=company_id, code="221001002", name="进项税额",
            category="负债", balance_direction="借", level=3, parent_code="221001",
        )
        db.add(acc_221001002)
        db.flush()
        account_map["221001002"] = acc_221001002

    # 确保 221001003 待认证进项税额 科目存在
    acc_221001003 = db.query(Account).filter(Account.company_id == company_id, Account.code == "221001003").first()
    if not acc_221001003:
        acc_221001003 = Account(
            company_id=company_id, code="221001003", name="待认证进项税额",
            category="负债", balance_direction="贷", level=3, parent_code="221001",
        )
        db.add(acc_221001003)
        db.flush()
        account_map["221001003"] = acc_221001003

    # 凭证号取 period 最大号+1
    entry_date = datetime.strptime(period + "-01", "%Y-%m-%d").date()
    next_voucher_no = _next_voucher_no(db, company_id, period, "记")

    summary = f"{period}月进项认证汇总"
    tax_name = get_full_name("221001002")
    pending_name = get_full_name("221001003")

    entries = [
        JournalEntry(
            company_id=company_id, entry_date=entry_date,
            period=period, voucher_word="记", voucher_no=next_voucher_no,
            summary=summary, account_code="221001002", account_name=tax_name,
            debit_amount=total_tax, credit_amount=0,
            contact_project="", source="进项抵扣",
        ),
        JournalEntry(
            company_id=company_id, entry_date=entry_date,
            period=period, voucher_word="记", voucher_no=next_voucher_no,
            summary=summary, account_code="221001003", account_name=pending_name,
            debit_amount=0, credit_amount=total_tax,
            contact_project="", source="进项抵扣",
        ),
    ]
    for e in entries:
        db.add(e)
    db.commit()

    return 1  # 返回生成的凭证数（1号 = 2条分录）


def _match_supplier(db, company_id, seller_name=None, seller_account=None):
    """综合供应商档案 + 银行流水，匹配取得发票中的供应商。
    
    匹配优先级：
      1. 供应商档案（name 精确 / _fingerprint 模糊）
      2. 银行流水付款方（counterparty_name）
    返回 (supplier_id, supplier_name) 或 (None, seller_name)。
    """
    if not seller_name:
        return None, None

    norm = _normalize_customer_name(seller_name)

    # 1. 供应商档案精确匹配
    for supp in db.query(Supplier).filter(Supplier.company_id == company_id).all():
        if supp.name and _normalize_customer_name(supp.name) == norm:
            return supp.id, supp.name
        if supp._fingerprint and supp._fingerprint == norm:
            return supp.id, supp.name

    # 2. 银行流水：查找相似付款方
    for tx in db.query(BankTransaction).filter(
        BankTransaction.company_id == company_id,
        BankTransaction.debit_amount > 0
    ).all():
        if tx.counterparty_name and _normalize_customer_name(tx.counterparty_name) == norm:
            # 找到银行流水中的付款记录，确认是供应商
            return None, tx.counterparty_name

    return None, seller_name


def _find_matching_payment(db, company_id, inv):
    """查找与取得发票对应的银行付款记录。
    
    匹配规则（按优先级）：
      1. 金额相等（允许 ±0.5 元误差）+ 对方户名相似
      2. 金额相等 + 日期在 ±7 天内
    返回 BankTransaction 对象或 None。
    """
    if not inv.invoice_date:
        return None

    seller_norm = _normalize_customer_name(inv.seller_name or "")
    from datetime import timedelta

    best, best_score = None, 999

    for tx in db.query(BankTransaction).filter(
        BankTransaction.company_id == company_id,
        BankTransaction.debit_amount > 0,
    ).all():
        # 金额匹配（允许 ±0.5 元误差）
        if abs(float(tx.debit_amount) - float(inv.total_amount or 0)) > 0.5:
            continue
        # 对方户名相似度
        if tx.counterparty_name:
            tx_norm = _normalize_customer_name(tx.counterparty_name)
            if tx_norm == seller_norm:
                return tx  # 精确匹配，直接返回
            if seller_norm in tx_norm or tx_norm in seller_norm:
                return tx  # 包含关系也算匹配
        # 日期在 ±7 天内
        if tx.transaction_date:
            try:
                delta = abs((tx.transaction_date - inv.invoice_date).days)
                if delta <= 7 and delta < best_score:
                    best = tx
                    best_score = delta
            except Exception:
                pass

    return best


def auto_generate_purchase_journal(db, company_id, invoice_id=None):
    """为取得发票生成采购入账凭证。

    借：1405 库存商品 = 不含税金额
    贷：2202 应付账款 / 供应商 = 不含税金额
    （若银行流水有对应付款，则贷方用 1002 银行存款）

    若 invoice_id 为 None，则为所有未取得凭证的取得发票生成凭证。
    若 invoice_id 不为 None，则仅为指定发票生成凭证。
    """
    get_full_name, account_map = _build_account_name_resolver(db, company_id)

    # 确保 2202 应付账款 科目存在
    acc_2202 = db.query(Account).filter(
        Account.company_id == company_id, Account.code == "2202"
    ).first()
    if not acc_2202:
        acc_2202 = Account(
            company_id=company_id, code="2202", name="应付账款",
            category="负债", balance_direction="贷", level=1,
        )
        db.add(acc_2202)
        db.flush()
        account_map["2202"] = acc_2202

    # 确保 1002 银行存款 科目存在
    acc_1002 = db.query(Account).filter(
        Account.company_id == company_id, Account.code == "1002"
    ).first()
    if not acc_1002:
        acc_1002 = Account(
            company_id=company_id, code="1002", name="银行存款",
            category="资产", balance_direction="借", level=1,
        )
        db.add(acc_1002)
        db.flush()
        account_map["1002"] = acc_1002

    # 确保 1405 库存商品 科目存在
    acc_1405 = db.query(Account).filter(
        Account.company_id == company_id, Account.code == "1405"
    ).first()
    if not acc_1405:
        acc_1405 = Account(
            company_id=company_id, code="1405", name="库存商品",
            category="资产", balance_direction="借", level=1,
        )
        db.add(acc_1405)
        db.flush()
        account_map["1405"] = acc_1405

    # 查询需要生成凭证的发票
    query = db.query(PurchaseInvoice).filter(
        PurchaseInvoice.company_id == company_id
    )
    if invoice_id is not None:
        query = query.filter(PurchaseInvoice.id == invoice_id)

    invoices = query.all()
    total = 0

    for inv in invoices:
        # 幂等检查：该发票已生成过凭证则跳过
        _existing = db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.source == "取得发票",
            JournalEntry.ref_id == inv.id
        ).first()
        if _existing:
            continue

        seller = inv.seller_name or "供应商"
        goods = inv.goods_name or ""
        summary = f"向{seller}采购{goods or '货物'}"

        # 兼容 invoice_date 为字符串或 date 对象两种情况
        if inv.invoice_date:
            if isinstance(inv.invoice_date, str):
                period = inv.invoice_date[:7] if len(inv.invoice_date) >= 7 else datetime.now().strftime("%Y-%m")
                date_str = inv.invoice_date if len(inv.invoice_date) >= 10 else (period + "-01")
            else:
                period = inv.invoice_date.strftime("%Y-%m")
                date_str = inv.invoice_date.strftime("%Y-%m-%d")
        else:
            period = datetime.now().strftime("%Y-%m")
            date_str = period + "-01"

        next_voucher_no = _next_voucher_no(db, company_id, period, "记")

        # 借：库存商品/费用（默认 1405 库存商品）
        debit_code = "1405"
        debit_name = get_full_name("1405") or "库存商品"

        # 贷：应付账款 或 银行存款（查银行流水是否有对应付款）
        credit_code, credit_name = "2202", get_full_name("2202") or "应付账款"
        tx = _find_matching_payment(db, company_id, inv)
        if tx:
            credit_code, credit_name = "1002", get_full_name("1002") or "银行存款"

        entries = [
            JournalEntry(
                company_id=company_id,
                entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                period=period, voucher_word="记", voucher_no=next_voucher_no,
                summary=summary, account_code=debit_code, account_name=debit_name,
                debit_amount=inv.amount, credit_amount=0,
                contact_project=seller,
                source="取得发票", ref_id=inv.id,
            ),
            JournalEntry(
                company_id=company_id,
                entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                period=period, voucher_word="记", voucher_no=next_voucher_no,
                summary=summary, account_code=credit_code, account_name=credit_name,
                debit_amount=0, credit_amount=inv.amount,
                contact_project=seller,
                source="取得发票", ref_id=inv.id,
            ),
        ]

        for e in entries:
            db.add(e)
        db.flush()
        total += 1

    return total


def auto_process_purchase_invoice(db, company_id, invoice_id):
    """取得发票导入后自动全流程处理（老邓 2026-06-10）：
    1. 自动创建供应商档案（含税号等核心字段）
    2. 自动生成采购凭证（借1405/贷2202，有银行支付则贷1002）
    3. 关联银行流水：已有该供应商付款的银行流水，若为 fallback 分类则升级
    返回 {"supplier": str, "journal": bool, "bank_linked": int}
    """
    inv = db.query(PurchaseInvoice).filter(
        PurchaseInvoice.id == invoice_id,
        PurchaseInvoice.company_id == company_id
    ).first()
    if not inv:
        return None

    result = {"supplier": None, "journal": False, "bank_linked": 0}
    seller = inv.seller_name
    if not seller:
        return result

    seller_norm = _normalize_customer_name(seller)

    # ── 1. 自动建档供应商 ──
    _NON_SUPP_KW = ('手续费', '金库', '公积金', '待处理', '税务', '国库', '国家金库')
    if len(seller.strip()) >= 2 and not any(kw in seller for kw in _NON_SUPP_KW):
        existing = db.query(Supplier).filter(
            Supplier.company_id == company_id,
            Supplier._fingerprint == seller_norm
        ).first()
        if not existing:
            # 生成供应商编码
            max_code = db.query(Supplier.code).filter(
                Supplier.company_id == company_id,
                Supplier.code.like('GYS%')
            ).order_by(Supplier.code.desc()).first()
            next_num = 1
            if max_code and max_code[0] and max_code[0].startswith('GYS'):
                try:
                    next_num = int(max_code[0][3:]) + 1
                except ValueError:
                    pass
            code = f"GYS{next_num:03d}"
            supp = Supplier(
                company_id=company_id, code=code,
                name=seller, _fingerprint=seller_norm,
                tax_no=inv.seller_tax_no or '',
                bank_name='', bank_account='', remark='',
                is_active=True,
            )
            db.add(supp)
            db.flush()
            result["supplier"] = code

    # ── 2. 自动生成采购凭证 ──
    count = auto_generate_purchase_journal(db, company_id, invoice_id)
    result["journal"] = count > 0

    # ── 3. 关联银行流水：查找已存在但为 supplier_fallback 的付款记录 ──
    matching_txs = []
    for tx in db.query(BankTransaction).filter(
        BankTransaction.company_id == company_id,
        BankTransaction.debit_amount > 0,
        BankTransaction.counterparty_name.isnot(None)
    ).all():
        tx_norm = _normalize_customer_name(tx.counterparty_name) if tx.counterparty_name else ""
        if tx_norm == seller_norm:
            matching_txs.append(tx)

    if matching_txs:
        # 重新检查这些银行流水的凭证是否需要升级
        for tx in matching_txs:
            # 查找已生成的银行流水凭证
            entries = db.query(JournalEntry).filter(
                JournalEntry.company_id == company_id,
                JournalEntry.source == "银行流水",
                JournalEntry.ref_id == tx.id,
            ).all()

            if not entries:
                # 尚未生成凭证 → 由 _generate_bank_journals 处理
                continue

            # 检查当前分类是否为 supplier_fallback
            has_fallback = any(
                e.account_code == "2202" and e.contact_project == tx.counterparty_name
                for e in entries
            )
            if has_fallback:
                # 已经是2202分类，无需改动，但 contact_project 应该确保是规范名称
                for e in entries:
                    if e.contact_project == tx.counterparty_name:
                        e.contact_project = seller  # 使用发票上的规范名称
                result["bank_linked"] += 1

    return result


def auto_generate_input_vat_journals(db):
    """为所有进项抵扣记录按月汇总生成凭证
    period 优先用 deduction_period，为空则用 invoice_date 的年月
    """
    companies = db.query(Company).order_by(Company.id).all()
    total = 0
    for comp in companies:
        deductions = db.query(InputVATDeduction).filter(
            InputVATDeduction.company_id == comp.id
        ).all()

        if not deductions:
            continue

        # 按期间分组（deduction_period 优先，否则用 invoice_date 年月）
        period_groups = {}
        for d in deductions:
            period = d.deduction_period
            if not period:
                if d.invoice_date:
                    period = d.invoice_date.strftime("%Y-%m")
                else:
                    from datetime import datetime, date
                    period = datetime.now().strftime("%Y-%m")
            if period not in period_groups:
                period_groups[period] = 0
            period_groups[period] += d.deductible_tax_amount or 0

        for period, total_tax in period_groups.items():
            try:
                total += auto_generate_input_vat_for_period(db, comp.id, period)
            except Exception as e:
                db.rollback()
                print(f"  [X] 进项抵扣→凭证({period})生成失败: {e}")

    return total


def _normalize_customer_name(name: str) -> str:
    """标准化客户名称：去空格、全角括号转半角，提高匹配率"""
    if not name:
        return ""
    name = name.strip()
    name = name.replace("\uff08", "(").replace("\uff09", ")")
    name = name.replace("\u3000", " ").replace("\xa0", " ")
    name = " ".join(name.split())
    return name


def _build_entity_index(db, company_id):
    """构建全实体匹配索引，供跨境匹配使用。
    返回：{personnel: {norm->{name,code}}, shareholders: set(norm), insiders: set(norm),
           customers: {norm->{name,code}}, suppliers: {norm->{name,code}},
           shareholder_as_customer: set(norm), shareholder_as_supplier: set(norm)}
    """
    idx = {
        'personnel': {},
        'shareholders': set(),
        'insiders': set(),
        'customers': {},
        'suppliers': {},
        'shareholder_as_customer': set(),   # 股东同时是客户（有销项发票）
        'shareholder_as_supplier': set(),   # 股东同时是供应商（有进项发票）
    }

    # --- 人员档案 ---
    for emp in db.query(Employee).filter(Employee.company_id == company_id).all():
        if emp.name:
            norm = _normalize_customer_name(emp.name)
            idx['personnel'][norm] = {'name': emp.name, 'code': emp.code}
            idx['insiders'].add(norm)

    # --- 股东 ---
    for sh in db.query(CompanyShareholder).filter(
        CompanyShareholder.company_id == company_id
    ).all():
        if sh.name:
            norm = _normalize_customer_name(sh.name)
            idx['shareholders'].add(norm)
            idx['insiders'].add(norm)

    # --- 公司内部人（法人/董事/监事/财务负责人） ---
    company = db.query(Company).filter(Company.id == company_id).first()
    if company:
        insiders_list = []
        if company.legal_representative:
            insiders_list.append(company.legal_representative)
        for d in company.directors:
            if d.name:
                insiders_list.append(d.name)
        for s in company.supervisors:
            if s.name:
                insiders_list.append(s.name)
        for fc in company.finance_contacts:
            if fc.name:
                insiders_list.append(fc.name)
        for name in insiders_list:
            idx['insiders'].add(_normalize_customer_name(name))

    # --- 客户档案（按 _fingerprint 匹配） ---
    for cust in db.query(Customer).filter(Customer.company_id == company_id).all():
        if cust._fingerprint:
            idx['customers'][cust._fingerprint] = {'name': cust.name, 'code': cust.code}
        elif cust.name:
            norm = _normalize_customer_name(cust.name)
            idx['customers'][norm] = {'name': cust.name, 'code': cust.code}

    # --- 供应商档案（按 _fingerprint 匹配） ---
    for supp in db.query(Supplier).filter(Supplier.company_id == company_id).all():
        if supp._fingerprint:
            idx['suppliers'][supp._fingerprint] = {'name': supp.name, 'code': supp.code}
        elif supp.name:
            norm = _normalize_customer_name(supp.name)
            idx['suppliers'][norm] = {'name': supp.name, 'code': supp.code}

    # --- 开具发票购方名称（补充客户索引） ---
    # 老邓 2026-06-10：银行流水匹配客户时，综合参考客户档案 + 开具发票购方
    si_buyers = db.query(SalesInvoice.buyer_name).filter(
        SalesInvoice.company_id == company_id,
        SalesInvoice.buyer_name.isnot(None)
    ).distinct().all()
    for (bn,) in si_buyers:
        if bn:
            norm = _normalize_customer_name(bn)
            if norm and norm not in idx['customers']:
                idx['customers'][norm] = {'name': bn, 'code': None}

    # --- 取得发票销方名称（补充供应商索引） ---
    # 老邓 2026-06-10：银行流水匹配供应商时，综合参考供应商档案 + 取得发票销方
    pi_sellers = db.query(PurchaseInvoice.seller_name).filter(
        PurchaseInvoice.company_id == company_id,
        PurchaseInvoice.seller_name.isnot(None)
    ).distinct().all()
    for (sn,) in pi_sellers:
        if sn:
            norm = _normalize_customer_name(sn)
            if norm and norm not in idx['suppliers']:
                idx['suppliers'][norm] = {'name': sn, 'code': None}

    # --- 股东与发票交叉比对：股东是否同时也是客户/供应商 ---
    buyer_norms = set()
    for (bn,) in db.query(SalesInvoice.buyer_name).filter(
        SalesInvoice.company_id == company_id,
        SalesInvoice.buyer_name.isnot(None)
    ).distinct().all():
        if bn:
            buyer_norms.add(_normalize_customer_name(bn))
    idx['shareholder_as_customer'] = idx['shareholders'] & buyer_norms

    seller_norms = set()
    for (sn,) in db.query(PurchaseInvoice.seller_name).filter(
        PurchaseInvoice.company_id == company_id,
        PurchaseInvoice.seller_name.isnot(None)
    ).distinct().all():
        if sn:
            seller_norms.add(_normalize_customer_name(sn))
    idx['shareholder_as_supplier'] = idx['shareholders'] & seller_norms

    return idx


def _match_entity(name, entity_index):
    """跨境匹配：在实体索引中查找名称。
    返回：(entity_type, entity_name, entity_code)
    entity_type: personnel | shareholder | insider | customer | supplier | unknown
    """
    norm = _normalize_customer_name(name) if name else ""
    if not norm:
        return ('unknown', name, None)

    if norm in entity_index['personnel']:
        info = entity_index['personnel'][norm]
        return ('personnel', info['name'], info['code'])

    if norm in entity_index['shareholders']:
        return ('shareholder', name, None)

    if norm in entity_index['insiders']:
        return ('insider', name, None)

    if norm in entity_index['customers']:
        info = entity_index['customers'][norm]
        return ('customer', info['name'], info['code'])

    if norm in entity_index['suppliers']:
        info = entity_index['suppliers'][norm]
        return ('supplier', info['name'], info['code'])

    return ('unknown', name, None)


def _match_customer(db: Session, company_id: int, counterparty_name: str = None, counterparty_account: str = None):
    """匹配客户档案：先按标准化名称匹配，再按银行账号匹配"""
    if counterparty_name:
        normalized = _normalize_customer_name(counterparty_name)
        customers = db.query(Customer).filter(
            Customer.company_id == company_id
        ).all()
        for c in customers:
            if _normalize_customer_name(c.name) == normalized:
                return c
    if counterparty_account:
        return db.query(Customer).filter(
            Customer.company_id == company_id,
            Customer.bank_account == counterparty_account
        ).first()
    return None


def _classify_bank_tx(db, company_id, tx, entity_index=None):
    """智能分类单条银行流水，返回 (other_side_code, other_side_name, match_type, contact_name)

    contact_name：人员匹配时为员工规范姓名，其余情况为 None（调用方使用原始 cp 名称）。

    新规则优先级（老邓 2026-06-06）：
    内部转账 > 规则匹配 > 税费识别 > 银行手续费 > 工资社保 > 跨实体匹配（股东/人员/客户/供应商） > 默认往来
    股东特判：先查发票（销项购方=也是客户/进项销方=也是供应商），再查摘要关键词（货款/服务费等），
    有业务证据→应收/应付，无证据→实收资本/股利
    """
    cp = tx.counterparty_name or tx.summary or ""
    full_text = (tx.summary or "") + " " + (tx.counterparty_name or "") + " " + (tx.transaction_remark or "")
    full_text_lower = full_text.lower()

    # 1. 内部转账识别
    if tx.counterparty_account:
        own_accounts = db.query(BankConfig).filter(
            BankConfig.company_id == company_id,
            BankConfig.is_active == 1,
        ).all()
        for bc in own_accounts:
            if bc.account_number and tx.counterparty_account.strip() == bc.account_number.strip():
                return ("1002", "银行存款-内部转账", "internal_transfer", None)

    is_debit = tx.debit_amount and tx.debit_amount > 0
    tx_type = "支出" if is_debit else "收入"

    # 2. 规则匹配
    rules = db.query(BankRule).filter(
        BankRule.company_id == company_id,
        BankRule.is_active == 1,
    ).order_by(BankRule.priority.desc(), BankRule.id.asc()).all()
    for rule in rules:
        if rule.keyword in full_text:
            if rule.transaction_type == "全部" or rule.transaction_type == tx_type:
                return (rule.account_code, rule.account_name or rule.account_code, "rule", None)

    # 3. 税费关键词
    tax_keywords = {
        "应交增值税": ("221001003", "待认证进项税额"),
        "未交增值税": ("221004", "未交增值税"),
        "增值税": ("221001003", "待认证进项税额"),
        "城建税": ("221005", "应交城市维护建设税"),
        "城市维护建设税": ("221005", "应交城市维护建设税"),
        "教育费附加": ("221006", "应交教育费附加"),
        "地方教育附加": ("221007", "应交地方教育附加"),
        "企业所得税": ("221002", "应交企业所得税"),
        "个人所得税": ("221003", "应交个人所得税"),
        "印花税": ("221008", "应交印花税"),
    }
    for kw, (code, name) in tax_keywords.items():
        if kw in full_text:
            return (code, name, "tax", None)

    # 3.5 银行手续费识别（老邓 2026-06-06 确认）
    # 综合对方户名、摘要、交易附言三字段判断
    fee_text = (tx.counterparty_name or "") + " " + (tx.summary or "") + " " + (tx.transaction_remark or "")
    _FEE_KEYWORDS = [
        "手续费", "工本费", "网银服务月费", "短信月费",
        "网上银行公司业务手续费收入",
        "及时语短信通知服务手续费收入",
        "结算业务委托书工本费",
        "待处理本币统一支付系统手续费款项",
    ]
    if any(kw in fee_text for kw in _FEE_KEYWORDS):
        return ("660301", "财务费用-手续费", "bank_fee", None)

    # 4. 工资薪金
    if any(kw in full_text for kw in ["工资", "薪资", "薪酬", "奖金", "绩效"]):
        return ("221101", "应付职工薪酬-工资", "salary", None)

    # 5. 社保公积金
    if any(kw in full_text for kw in ["社保", "社会保险", "养老", "医疗", "失业", "工伤", "生育"]):
        return ("221102", "社会保险费", "social_security", None)
    if any(kw in full_text for kw in ["公积金", "住房公积金"]):
        return ("221103", "住房公积金", "housing_fund", None)

    # 6. 费用类关键词
    expense_keywords = {
        "房租": ("660214", "租赁费"),
        "租金": ("660214", "租赁费"),
        "水电": ("660215", "水电费"),
        "办公": ("660201", "办公费"),
        "差旅": ("660202", "差旅费"),
        "招待": ("660216", "业务招待费"),
        "交通": ("660206", "交通费"),
        "通讯": ("660207", "通讯费"),
        "折旧": ("660203", "折旧费"),
        "摊销": ("660209", "摊销费"),
        "咨询": ("660210", "咨询费"),
        "培训": ("660211", "培训费"),
        "维修": ("660212", "维修费"),
    }
    for kw, (code, name) in expense_keywords.items():
        if kw in full_text:
            return (code, name, "expense", None)

    # ====== 7. 跨实体智能匹配（新规则核心） ======
    if entity_index is None:
        entity_index = _build_entity_index(db, company_id)

    entity_type, entity_name, entity_code = _match_entity(cp, entity_index) if cp else ('unknown', cp, None)
    norm = _normalize_customer_name(cp) if cp else ""

    # 7a. 股东 → 先判断是否有业务往来（股东也是客户/供应商），再决定
    if entity_type == 'shareholder':
        # 7a1. 发票证据：股东在销项发票中出现过 → 也是客户
        if norm in entity_index.get('shareholder_as_customer', set()):
            return ("1122", "应收账款", "shareholder_customer", None)
        # 7a2. 发票证据：股东在进项发票中出现过 → 也是供应商
        if norm in entity_index.get('shareholder_as_supplier', set()):
            return ("2202", "应付账款", "shareholder_supplier", None)

        # 7a3. 摘要关键词：业务往来信号
        biz_keywords = [
            "货款", "采购", "购买", "下单", "订单",
            "服务费", "咨询费", "技术服务", "技术开发",
            "租金", "物业", "工程", "施工",
            "合同", "协议", "结算", "对账",
            "往来款", "预付款", "保证金", "押金",
            "发票", "invoice", "报销",
        ]
        summary_lower = (tx.summary or "").lower()
        remark_lower = (tx.transaction_remark or "").lower()
        biz_text = summary_lower + " " + remark_lower
        if any(kw in biz_text for kw in biz_keywords):
            if is_debit:
                return ("2202", "应付账款", "shareholder_biz", None)
            else:
                return ("1122", "应收账款", "shareholder_biz", None)

        # 7a4. 无业务往来证据 → 投资款/分红
        if is_debit:
            return ("410401", "利润分配-应付股利", "dividend", None)
        else:
            return ("4001", "实收资本", "capital", None)

    # 7b. 人员/内部人 → 其他应收/其他应付
    # contact_name 传递员工规范姓名，使序时账 contact_project 正确指向人员档案
    if entity_type in ('personnel', 'insider'):
        emp_name = entity_name  # _match_entity 返回的规范姓名
        if is_debit:
            # 公司付款给员工（报销/借支/代垫）→ 借 1221 其他应收款
            return ("1221", "其他应收款", "personnel_payment", emp_name)
        else:
            # 员工还款/上缴给公司 → 贷 2241 其他应付款
            return ("2241", "其他应付款", "personnel_receipt", emp_name)

    # 7c. 客户 → 应收账款（含退款）
    if entity_type == 'customer':
        return ("1122", "应收账款", "customer", None)

    # 7d. 供应商 → 应付账款（含退款）
    if entity_type == 'supplier':
        return ("2202", "应付账款", "supplier", None)

    # 7e. 未知实体 → 兜底：直接查发票购方/销方（老邓 2026-06-10）
    # 银行流水收款 + 名称在开具发票购方中 → 客户
    if not is_debit:
        si_buyers = db.query(SalesInvoice.buyer_name).filter(
            SalesInvoice.company_id == company_id,
            SalesInvoice.buyer_name.isnot(None)
        ).distinct().all()
        for (bn,) in si_buyers:
            if bn and _normalize_customer_name(bn) == norm:
                return ("1122", "应收账款", "customer_invoice", None)
    # 银行流水付款 + 名称在取得发票销方中 → 供应商
    if is_debit:
        pi_sellers = db.query(PurchaseInvoice.seller_name).filter(
            PurchaseInvoice.company_id == company_id,
            PurchaseInvoice.seller_name.isnot(None)
        ).distinct().all()
        for (sn,) in pi_sellers:
            if sn and _normalize_customer_name(sn) == norm:
                return ("2202", "应付账款", "supplier_invoice", None)

    # 所有规则均未匹配 → 银行流水 fallback
    # 老邓 2026-06-10：摘要/附言方向修正 —— 仅靠借/贷方向不够，要结合业务语义
    _summary_text = ((tx.summary or "") + " " + (tx.transaction_remark or "")).lower()

    # 保证金类关键词 → 付款方是交保证金的一方，对方是招标方/合作方 → **客户**
    _DEPOSIT_KW = ['投标保证金', '履约保证金', '保证金', '押金', '质保金']

    if is_debit:
        # 付款 + 保证金信号 → 对方为客户（1221 其他应收款-保证金）
        if any(kw in _summary_text for kw in _DEPOSIT_KW):
            return ("1221", "其他应收款", "customer_deposit", None)
        # 付款 → 默认供应商
        return ("2202", "应付账款", "supplier_fallback", None)
    else:
        # 收款 → 默认客户
        return ("1122", "应收账款", "customer_fallback", None)


def _next_voucher_no(db, company_id, period, voucher_word="记"):
    """获取指定期间下一个凭证号（并发不安全，需外层加锁或事务）"""
    max_no = db.query(JournalEntry.voucher_no).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period == period,
        JournalEntry.voucher_word == voucher_word
    ).order_by(JournalEntry.voucher_no.desc()).first()
    return (max_no[0] + 1) if max_no and max_no[0] else 1


def _ensure_account(db, company_id, code, name, category, direction, parent_code=None):
    """确保科目存在，不存在则创建"""
    if not db.query(Account).filter(Account.company_id == company_id, Account.code == code).first():
        if parent_code is None:
            # 确定 parent_code（静态映射）
            parent_map = {
                "2211": None, "221101": "2211", "221102": "2211", "221103": "2211",
                "2221": None, "222101": "2221",
                "2210": None, "221001": "2210", "221001001": "221001", "221001002": "221001", "221001003": "221001",
                "221002": "2210", "221003": "2210", "221004": "2210", "221005": "2210",
                "221006": "2210", "221007": "2210", "221008": "2210",
                "6602": None, "660201": "6602", "660202": "6602", "660203": "6602",
                "660204": "6602", "660205": "6602", "660206": "6602", "660207": "6602",
                "660209": "6602", "660210": "6602", "660211": "6602", "660212": "6602",
                "660213": "6602", "660214": "6602", "660215": "6602", "660216": "6602",
                "6603": None, "660301": "6603",
                "2241": None,
                "1221": None,
                "1122": None,
                "1002": None,
                "6001": None,
            }
            parent_code = parent_map.get(code)
        level = 1
        if parent_code:
            parent_acc = db.query(Account).filter(Account.company_id == company_id, Account.code == parent_code).first()
            level = (parent_acc.level + 1) if parent_acc else 2
        db.add(Account(
            company_id=company_id, code=code, name=name,
            category=category, balance_direction=direction,
            level=level, parent_code=parent_code,
        ))
        db.flush()


def _ensure_personal_ar_account(db, company_id, employee_name: str) -> str:
    """返回其他应收款一级科目编码1221。
    员工姓名通过序时账的 contact_project 字段记录，不建立二级科目。
    """
    _ensure_account(db, company_id, "1221", "其他应收款", "资产", "借")
    return "1221"


def _generate_bank_journals(db: Session, company_id: int, tx_ids: Optional[List[int]] = None):
    """为银行流水批量生成双分录记账凭证（借贷必相等），支持智能分类。
    返回 {"generated": int, "skipped": int, "infos": [str], "errors": [str]}"""
    q = db.query(BankTransaction).filter(BankTransaction.company_id == company_id)
    if tx_ids:
        q = q.filter(BankTransaction.id.in_(tx_ids))
    txs = q.all()
    generated = 0
    skipped = 0
    infos = []
    errors = []

    # 确保所需科目存在
    _ensure_account(db, company_id, "1002", "银行存款", "资产", "借")
    _ensure_account(db, company_id, "1122", "应收账款", "资产", "借")
    _ensure_account(db, company_id, "2202", "应付账款", "负债", "贷")
    _ensure_account(db, company_id, "1221", "其他应收款", "资产", "借")
    _ensure_account(db, company_id, "2241", "其他应付款", "负债", "贷")
    _ensure_account(db, company_id, "2211", "应付职工薪酬", "负债", "贷")
    _ensure_account(db, company_id, "221101", "工资", "负债", "贷")
    _ensure_account(db, company_id, "221102", "社会保险费", "负债", "贷")
    _ensure_account(db, company_id, "221103", "住房公积金", "负债", "贷")
    # 应交税费 体系
    _ensure_account(db, company_id, "2210", "应交税费", "负债", "贷")
    _ensure_account(db, company_id, "221001", "应交增值税", "负债", "贷")
    _ensure_account(db, company_id, "221001001", "销项税额", "负债", "贷")
    _ensure_account(db, company_id, "221001002", "进项税额", "负债", "借")
    _ensure_account(db, company_id, "221001003", "待认证进项税额", "负债", "贷")
    _ensure_account(db, company_id, "221001004", "已交税金", "负债", "借")
    _ensure_account(db, company_id, "221001005", "转出未交增值税", "负债", "借")
    _ensure_account(db, company_id, "221001006", "转出多交增值税", "负债", "贷")
    _ensure_account(db, company_id, "221001007", "减免税款", "负债", "借")
    _ensure_account(db, company_id, "221001008", "出口抵减内销产品应纳税额", "负债", "借")
    _ensure_account(db, company_id, "221001009", "出口退税", "负债", "贷")
    _ensure_account(db, company_id, "221001010", "进项税额转出", "负债", "贷")
    _ensure_account(db, company_id, "221001011", "销项税额抵减", "负债", "借")
    _ensure_account(db, company_id, "221009", "预交增值税", "负债", "借")
    _ensure_account(db, company_id, "221010", "待抵扣进项税额", "负债", "借")
    _ensure_account(db, company_id, "221011", "待转销项税额", "负债", "贷")
    _ensure_account(db, company_id, "221012", "增值税留抵税额", "负债", "借")
    _ensure_account(db, company_id, "221013", "简易计税", "负债", "贷")
    _ensure_account(db, company_id, "221014", "转让金融商品应交增值税", "负债", "贷")
    _ensure_account(db, company_id, "221015", "代扣代交增值税", "负债", "贷")
    _ensure_account(db, company_id, "221002", "应交企业所得税", "负债", "贷")
    _ensure_account(db, company_id, "221003", "应交个人所得税", "负债", "贷")
    _ensure_account(db, company_id, "221004", "未交增值税", "负债", "贷")
    _ensure_account(db, company_id, "221005", "应交城市维护建设税", "负债", "贷")
    _ensure_account(db, company_id, "221006", "应交教育费附加", "负债", "贷")
    _ensure_account(db, company_id, "221007", "应交地方教育附加", "负债", "贷")
    _ensure_account(db, company_id, "221008", "应交印花税", "负债", "贷")
    # 其他应付款
    _ensure_account(db, company_id, "2221", "其他应付款", "负债", "贷")
    _ensure_account(db, company_id, "222101", "代扣社会保险费", "负债", "贷")
    # 管理费用
    _ensure_account(db, company_id, "6602", "管理费用", "损益", "借")
    _ensure_account(db, company_id, "660201", "办公费", "损益", "借")
    _ensure_account(db, company_id, "660202", "差旅费", "损益", "借")
    _ensure_account(db, company_id, "660203", "折旧费", "损益", "借")
    _ensure_account(db, company_id, "660204", "工资", "损益", "借")
    _ensure_account(db, company_id, "660205", "社保费", "损益", "借")
    _ensure_account(db, company_id, "660206", "交通费", "损益", "借")
    _ensure_account(db, company_id, "660207", "通讯费", "损益", "借")
    _ensure_account(db, company_id, "660209", "摊销费", "损益", "借")
    _ensure_account(db, company_id, "660210", "咨询费", "损益", "借")
    _ensure_account(db, company_id, "660211", "培训费", "损益", "借")
    _ensure_account(db, company_id, "660212", "维修费", "损益", "借")
    _ensure_account(db, company_id, "660213", "社会保险费", "损益", "借")
    _ensure_account(db, company_id, "660214", "租赁费", "损益", "借")
    _ensure_account(db, company_id, "660215", "水电费", "损益", "借")
    _ensure_account(db, company_id, "660216", "业务招待费", "损益", "借")
    # 财务费用
    _ensure_account(db, company_id, "6603", "财务费用", "损益", "借")
    _ensure_account(db, company_id, "660301", "手续费", "损益", "借")
    _ensure_account(db, company_id, "4001", "实收资本", "权益", "贷")
    _ensure_account(db, company_id, "410401", "应付股利", "权益", "贷")

    # 预建跨实体索引（一次查询，全循环复用）
    entity_index = _build_entity_index(db, company_id)

    # 老邓 2026-06-10：收集需要自动建档的供应商/客户名称
    _pending_suppliers = {}   # {norm: {'name': orig_name, 'source': str}}
    _pending_customers = {}   # {norm: {'name': orig_name, 'source': str}}
    _supp_norms = set(entity_index['suppliers'].keys())
    _cust_norms = set(entity_index['customers'].keys())
    _insider_norms = entity_index['insiders'] | entity_index['shareholders']

    for tx in txs:
        try:
            # 幂等检查：该流水已生成凭证，跳过（不重复生成）
            _existing = db.query(JournalEntry).filter(
                JournalEntry.company_id == company_id,
                JournalEntry.source == "银行流水",
                JournalEntry.ref_id == tx.id
            ).first()
            if _existing:
                skipped += 1
                continue

            cp = tx.counterparty_name or tx.summary or "银行流水"
            summary_tag = f"银行流水-#{tx.id}-{cp}"
            period = tx.transaction_date.strftime("%Y-%m") if tx.transaction_date else datetime.now().strftime("%Y-%m")
            next_voucher_no = _next_voucher_no(db, company_id, period, "记")
            date_str = tx.transaction_date.strftime("%Y-%m-%d") if tx.transaction_date else period + "-01"

            is_debit = tx.debit_amount and tx.debit_amount > 0
            amount = (tx.debit_amount or 0) if is_debit else (tx.credit_amount or 0)

            # 智能分类（传入预建索引）
            result = _classify_bank_tx(db, company_id, tx, entity_index)
            if result is None:
                skipped += 1
                continue
            other_code, other_name, match_type, contact_name = result

            # contact_project：人员匹配时用员工规范姓名，其余用原始对方名称
            contact_proj = contact_name if contact_name else cp

            # 确保对方科目存在
            acct = db.query(Account).filter(Account.company_id == company_id, Account.code == other_code).first()
            if acct:
                other_name = acct.name

            # 人员付款摘要更友好
            if match_type == "personnel_payment":
                summary_tag = f"银行流水-#{tx.id}-{contact_proj}（报销/借支）"
            elif match_type == "personnel_receipt":
                summary_tag = f"银行流水-#{tx.id}-{contact_proj}（还款/上缴）"
            elif match_type == "customer_deposit":
                summary_tag = f"银行流水-#{tx.id}-{contact_proj}（保证金）"

            if match_type == "internal_transfer":
                # 内部转账：借1002 贷1002（不同明细）
                entry1 = JournalEntry(
                    company_id=company_id, entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                    period=period, voucher_word="记", voucher_no=next_voucher_no,
                    summary=summary_tag + "（内部转账）", account_code="1002", account_name="银行存款",
                    debit_amount=amount, credit_amount=0, contact_project=contact_proj, source="银行流水", ref_id=tx.id,
                )
                entry2 = JournalEntry(
                    company_id=company_id, entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                    period=period, voucher_word="记", voucher_no=next_voucher_no,
                    summary=summary_tag + "（内部转账）", account_code="1002", account_name="银行存款",
                    debit_amount=0, credit_amount=amount, contact_project=contact_proj, source="银行流水", ref_id=tx.id,
                )
            elif is_debit:
                # 付款：借 other 贷 1002
                entry1 = JournalEntry(
                    company_id=company_id, entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                    period=period, voucher_word="记", voucher_no=next_voucher_no,
                    summary=summary_tag, account_code=other_code, account_name=other_name,
                    debit_amount=amount, credit_amount=0, contact_project=contact_proj, source="银行流水", ref_id=tx.id,
                )
                entry2 = JournalEntry(
                    company_id=company_id, entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                    period=period, voucher_word="记", voucher_no=next_voucher_no,
                    summary=summary_tag, account_code="1002", account_name="银行存款",
                    debit_amount=0, credit_amount=amount, contact_project=contact_proj, source="银行流水", ref_id=tx.id,
                )
            else:
                # 收款：借 1002 贷 other
                entry1 = JournalEntry(
                    company_id=company_id, entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                    period=period, voucher_word="记", voucher_no=next_voucher_no,
                    summary=summary_tag, account_code="1002", account_name="银行存款",
                    debit_amount=amount, credit_amount=0, contact_project=contact_proj, source="银行流水", ref_id=tx.id,
                )
                entry2 = JournalEntry(
                    company_id=company_id, entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                    period=period, voucher_word="记", voucher_no=next_voucher_no,
                    summary=summary_tag, account_code=other_code, account_name=other_name,
                    debit_amount=0, credit_amount=amount, contact_project=contact_proj, source="银行流水", ref_id=tx.id,
                )
            db.add(entry1)
            db.add(entry2)
            voucher_str = f"记-{next_voucher_no}"
            tx.journal_voucher_no = voucher_str
            db.flush()
            generated += 1

            # 老邓 2026-06-10：收集需要自动建档的供应商/客户名称
            if cp and cp.strip():
                norm = _normalize_customer_name(cp.strip())
                if norm and norm not in _insider_norms and len(cp.strip()) >= 2:
                    # 供应商非真实企业过滤（手续费/税费/政府机构等）
                    _NON_SUPP = ('手续费', '金库', '公积金', '待处理', '出售凭证', '业务收入', '国家金库', '税务', '国库')
                    _is_non_supplier = any(kw in cp for kw in _NON_SUPP)
                    if match_type in ('supplier', 'supplier_invoice', 'supplier_fallback'):
                        if not _is_non_supplier and norm not in _supp_norms and norm not in _pending_suppliers:
                            _pending_suppliers[norm] = {'name': cp.strip(), 'source': f'银行流水:#{tx.id}'}
                    elif match_type in ('customer', 'customer_invoice', 'customer_fallback', 'customer_deposit'):
                        if norm not in _cust_norms and norm not in _pending_customers:
                            _pending_customers[norm] = {'name': cp.strip(), 'source': f'银行流水:#{tx.id}'}

        except Exception as ex:
            errors.append(f"流水#{tx.id}: {str(ex)}")
            skipped += 1

    # 老邓 2026-06-10：自动建档供应商/客户（消除"有明细账无档案"的gap）
    for norm, info in _pending_suppliers.items():
        try:
            max_code = db.query(Supplier.code).filter(
                Supplier.company_id == company_id,
                Supplier.code.like('GYS%')
            ).order_by(Supplier.code.desc()).first()
            next_num = 1
            if max_code and max_code[0] and max_code[0].startswith('GYS'):
                try:
                    next_num = int(max_code[0][3:]) + 1
                except ValueError:
                    pass
            code = f"GYS{next_num:03d}"
            supp = Supplier(
                company_id=company_id, code=code,
                name=info['name'], _fingerprint=norm, is_active=True,
            )
            db.add(supp)
            db.flush()
            infos.append(f"自动建档供应商：{info['name']}（来源：{info['source']}）")
        except Exception as ex:
            infos.append(f"供应商建档失败({info['name']}): {str(ex)}")

    for norm, info in _pending_customers.items():
        try:
            max_code = db.query(Customer.code).filter(
                Customer.company_id == company_id,
                Customer.code.like('KH%')
            ).order_by(Customer.code.desc()).first()
            next_num = 1
            if max_code and max_code[0] and max_code[0].startswith('KH'):
                try:
                    next_num = int(max_code[0][2:]) + 1
                except ValueError:
                    pass
            code = f"KH{next_num:03d}"
            cust = Customer(
                company_id=company_id, code=code,
                name=info['name'], _fingerprint=norm, is_active=True,
            )
            db.add(cust)
            db.flush()
            infos.append(f"自动建档客户：{info['name']}（来源：{info['source']}）")
        except Exception as ex:
            infos.append(f"客户建档失败({info['name']}): {str(ex)}")

    return {"generated": generated, "skipped": skipped, "infos": infos, "errors": errors}


# ========== 社保申报 — 序时账自动生成 ==========

def _generate_ss_accrual_journals(db: Session, company_id: int, declaration_id: int):
    """社保计提凭证（新逻辑）：
    公司承担部分：借 管理费用/社会保险费
    个人承担部分：借 其他应收款/<员工姓名>（每人一行）
    贷：应付职工薪酬/社会保险费（公司+个人合计）

    都从公司直接付，人员承担部分先挂其他应收款，工资发放时扣回。
    """

    decl = db.query(SocialSecurityDeclaration).filter(
        SocialSecurityDeclaration.id == declaration_id,
        SocialSecurityDeclaration.company_id == company_id
    ).first()
    if not decl:
        return {"generated": 0, "message": "申报记录不存在"}

    details = db.query(SocialSecurityDetail).filter(
        SocialSecurityDetail.declaration_id == declaration_id
    ).all()
    if not details:
        return {"generated": 0, "message": "无明细数据"}

    period = decl.period
    summary_tag = f"社保计提-{period}"

    # 去重：已存在则删除旧凭证重新生成
    existing = db.query(JournalEntry).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.summary == summary_tag,
        JournalEntry.source == "社保计提",
    ).first()
    if existing:
        db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.voucher_no == existing.voucher_no,
            JournalEntry.period == period,
            JournalEntry.source == "社保计提",
        ).delete()
        db.flush()

    # 确保父科目
    _ensure_account(db, company_id, "6602", "管理费用", "损益", "借")
    _ensure_account(db, company_id, "660212", "社会保险费", "损益", "借")
    _ensure_account(db, company_id, "2211", "应付职工薪酬", "负债", "贷")
    _ensure_account(db, company_id, "221102", "社会保险费", "负债", "贷")
    _ensure_account(db, company_id, "1221", "其他应收款", "资产", "借")

    total_company = round(sum(d.company_amount or 0 for d in details), 2)
    total_personal = round(sum(d.personal_amount or 0 for d in details), 2)
    total_all = round(total_company + total_personal, 2)

    entry_date = datetime.strptime(period + "-01", "%Y-%m-%d").date()
    next_voucher_no = _next_voucher_no(db, company_id, period, "记")
    entries = []

    # 借：管理费用/社会保险费（公司部分）
    entries.append(JournalEntry(
        company_id=company_id, entry_date=entry_date,
        period=period, voucher_word="记", voucher_no=next_voucher_no,
        summary=summary_tag, account_code="660212", account_name="社会保险费",
        debit_amount=total_company, credit_amount=0, source="社保计提",
    ))

    # 借：其他应收款/<员工姓名>（每人个人社保部分）
    for d in details:
        personal = round(d.personal_amount or 0, 2)
        if personal == 0:
            continue
        emp_code = _ensure_personal_ar_account(db, company_id, d.employee_name)
        emp_acc = db.query(Account).filter(
            Account.company_id == company_id, Account.code == emp_code
        ).first()
        entries.append(JournalEntry(
            company_id=company_id, entry_date=entry_date,
            period=period, voucher_word="记", voucher_no=next_voucher_no,
            summary=summary_tag, account_code=emp_code,
            account_name=f"其他应收款/{d.employee_name}",
            contact_project=d.employee_name,
            debit_amount=personal, credit_amount=0, source="社保计提",
        ))

    # 贷：应付职工薪酬/社会保险费（公司+个人合计）
    entries.append(JournalEntry(
        company_id=company_id, entry_date=entry_date,
        period=period, voucher_word="记", voucher_no=next_voucher_no,
        summary=summary_tag, account_code="221102", account_name="社会保险费",
        debit_amount=0, credit_amount=total_all, source="社保计提",
    ))

    db.add_all(entries)
    db.flush()
    return {
        "generated": 1,
        "voucher_no": next_voucher_no,
        "company_amount": total_company,
        "personal_amount": total_personal,
    }


def _match_ss_payment_journals(db: Session, company_id: int):
    """社保缴纳凭证（新逻辑）：
    匹配银行流水中支付社保的记录，生成：
    借：应付职工薪酬/社会保险费（应付科目对冲，公司+个人合计）
    贷：银行存款

    社保都从公司直接付（含员工个人部分），所以应付职工薪酬/社会保险费
    在计提时已经包含了公司+个人合计，此处全额冲销。

    匹配关键词：税务、社会保险、社保
    """

    txs = db.query(BankTransaction).filter(
        BankTransaction.company_id == company_id
    ).all()

    generated = 0
    matched = 0

    for tx in txs:
        cp = tx.counterparty_name or ""
        summary = tx.summary or ""
        tx_period = tx.transaction_date.strftime("%Y-%m") if tx.transaction_date else ""

        # 判断是否社保相关：关键词匹配 + 金额匹配
        full_text = (cp + " " + summary).lower()
        result = _classify_bank_tx(db, company_id, tx)
        is_ss = (result and result[2] == "social_security") or \
                any(kw in full_text for kw in ["社保", "社会保险", "社会保险费"])

        # 关键词未命中时，按金额匹配社保申报总额（社保由税务统一征收，
        # 对方户名为国家金库且摘要为"缴税"，无法通过关键词区分）
        if not is_ss:
            payment_amount = (tx.debit_amount or 0) if (tx.debit_amount and tx.debit_amount > 0) else (tx.credit_amount or 0)
            if payment_amount > 0 and tx_period:
                # 查同期社保明细合计
                ss_amt = db.query(func.coalesce(func.sum(SocialSecurityDetail.total_amount), 0)).join(
                    SocialSecurityDeclaration,
                    SocialSecurityDetail.declaration_id == SocialSecurityDeclaration.id
                ).filter(
                    SocialSecurityDeclaration.company_id == company_id,
                    SocialSecurityDeclaration.period == tx_period,
                ).scalar()
                if abs(payment_amount - ss_amt) < 0.01:
                    is_ss = True

        if not is_ss:
            continue

        # 只处理支出（借方>0 表示银行账户减少即付款）
        is_debit = tx.debit_amount and tx.debit_amount > 0
        payment_amount = (tx.debit_amount or 0) if is_debit else (tx.credit_amount or 0)
        if payment_amount <= 0:
            continue

        # 去重
        summary_tag = f"社保缴纳-#{tx.id}"
        existing = db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.summary == summary_tag,
            JournalEntry.source == "银行流水",
        ).first()
        if existing:
            continue

        # 检查是否已被「银行流水」自动凭证生成过（避免重复）
        existing_bank = db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.source == "银行流水",
            func.abs(JournalEntry.debit_amount - payment_amount) < 0.01,
            JournalEntry.account_code == "1002",
        ).first()
        if existing_bank:
            continue

        matched += 1
        period = tx_period or datetime.now().strftime("%Y-%m")
        next_voucher_no = _next_voucher_no(db, company_id, period, "记")
        date_str = tx.transaction_date.strftime("%Y-%m-%d") if tx.transaction_date else period + "-01"

        # 借：应付职工薪酬/社会保险费
        # 贷：银行存款
        db.add_all([
            JournalEntry(
                company_id=company_id,
                entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                period=period, voucher_word="记", voucher_no=next_voucher_no,
                summary=summary_tag, account_code="221102", account_name="社会保险费",
                debit_amount=round(payment_amount, 2), credit_amount=0,
                source="银行流水",
            ),
            JournalEntry(
                company_id=company_id,
                entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                period=period, voucher_word="记", voucher_no=next_voucher_no,
                summary=summary_tag, account_code="1002", account_name="银行存款",
                debit_amount=0, credit_amount=round(payment_amount, 2),
                source="银行流水",
            ),
        ])
        voucher_str = f"记-{next_voucher_no}"
        tx.journal_voucher_no = voucher_str
        db.flush()
        generated += 1

    return {"matched": matched, "generated": generated}


# ========== 工资薪金 — 序时账自动生成 ==========

def _generate_salary_journals(db: Session, company_id: int, period: str):
    """工资计提凭证（新逻辑）：
    实发工资 = 应发工资 - 个人社保 - 个人公积金 - 个税

    借：管理费用/工资（应发合计）
    贷：其他应收款/<员工>（每人：个人社保+个人公积金，冲原来社保/公积金计提时产生的其他应收款）
    贷：应交税费/应交个人所得税（个税合计）
    贷：应付职工薪酬/工资（实发合计，待发放）
    """
    records = db.query(SalaryRecord).filter(
        SalaryRecord.company_id == company_id,
        SalaryRecord.period == period
    ).all()
    if not records:
        return {"generated": 0, "message": "无工资记录"}

    # 幂等检查
    existing = db.query(JournalEntry).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period == period,
        JournalEntry.source == "工资计提",
    ).first()
    if existing:
        return {"generated": 0, "message": "工资计提凭证已存在，跳过"}

    # 确保科目
    _ensure_account(db, company_id, "6602", "管理费用", "损益", "借")
    _ensure_account(db, company_id, "660204", "工资", "损益", "借")
    _ensure_account(db, company_id, "2211", "应付职工薪酬", "负债", "贷")
    _ensure_account(db, company_id, "221101", "工资", "负债", "贷")
    _ensure_account(db, company_id, "2210", "应交税费", "负债", "贷")
    _ensure_account(db, company_id, "221003", "应交个人所得税", "负债", "贷")
    _ensure_account(db, company_id, "1221", "其他应收款", "资产", "借")

    # 汇总
    total_income = round(sum(r.current_income or 0 for r in records), 2)
    # 工资表「本期应补(退)税额」才是当月实际从工资中扣缴的个税
    total_tax = round(sum(r.tax_refund or 0 for r in records), 2)

    # 每人：个人社保+个人公积金（需要从其他应收款冲回）
    emp_personal = {}  # name → {ss, hf, code}
    for r in records:
        ss_amt = round((r.pension_insurance or 0) + (r.medical_insurance or 0) + (r.unemployment_insurance or 0), 2)
        hf_amt = round(r.housing_fund or 0, 2)
        emp_personal[r.employee_name] = {
            "ss": ss_amt,
            "hf": hf_amt,
            "total": round(ss_amt + hf_amt, 2),
        }
    total_deduct = round(sum(v["total"] for v in emp_personal.values()), 2)

    entry_date = datetime.strptime(period + "-01", "%Y-%m-%d").date()
    next_voucher_no = _next_voucher_no(db, company_id, period, "记")
    summary_tag = f"工资计提-{period}"
    entries = []

    # 借：管理费用/工资（应发合计）
    entries.append(JournalEntry(
        company_id=company_id, entry_date=entry_date,
        period=period, voucher_word="记", voucher_no=next_voucher_no,
        summary=summary_tag, account_code="660204", account_name="工资",
        debit_amount=total_income, credit_amount=0, source="工资计提",
    ))

    # 贷：其他应收款/<员工>（每人个人社保+公积金合计，冲社保/公积金计提时的应收款）
    for emp_name, data in emp_personal.items():
        if data["total"] == 0:
            continue
        emp_code = _ensure_personal_ar_account(db, company_id, emp_name)
        entries.append(JournalEntry(
            company_id=company_id, entry_date=entry_date,
            period=period, voucher_word="记", voucher_no=next_voucher_no,
            summary=summary_tag, account_code=emp_code,
            account_name=f"其他应收款/{emp_name}",
            contact_project=emp_name,
            debit_amount=0, credit_amount=data["total"], source="工资计提",
        ))

    # 贷：应交税费/应交个人所得税
    if total_tax != 0:
        entries.append(JournalEntry(
            company_id=company_id, entry_date=entry_date,
            period=period, voucher_word="记", voucher_no=next_voucher_no,
            summary=summary_tag, account_code="221003", account_name="应交个人所得税",
            debit_amount=0, credit_amount=total_tax, source="工资计提",
        ))

    # 贷：应付职工薪酬/工资（实发工资，待发放）
    # 实发 = 应发 - 个人社保 - 个人公积金 - 本期应补退税额（与Excel实发工资一致）
    total_net = round(total_income - total_deduct - total_tax, 2)
    if total_net < 0:
        total_net = 0
    entries.append(JournalEntry(
        company_id=company_id, entry_date=entry_date,
        period=period, voucher_word="记", voucher_no=next_voucher_no,
        summary=summary_tag, account_code="221101", account_name="工资",
        debit_amount=0, credit_amount=total_net, source="工资计提",
    ))

    # 验证借贷平衡
    total_debit = round(sum(e.debit_amount or 0 for e in entries), 2)
    total_credit = round(sum(e.credit_amount or 0 for e in entries), 2)
    if abs(total_debit - total_credit) > 0.01:
        return {"generated": 0, "message": f"借贷不平衡: 借{total_debit} 贷{total_credit}，请检查数据"}

    db.add_all(entries)
    db.flush()
    return {
        "generated": 1,
        "voucher_no": next_voucher_no,
        "total_income": total_income,
        "total_deduct": total_deduct,
        "total_tax": total_tax,
        "total_net": total_net,
    }


def _generate_hf_accrual_journals(db: Session, company_id: int, period: str):
    """公积金计提凭证（新逻辑）：
    公司承担部分：借 管理费用/住房公积金
    个人承担部分：借 其他应收款/<员工姓名>（每人一行）
    贷：应付职工薪酬/住房公积金（公司+个人合计）

    都从公司直接付，人员承担部分先挂其他应收款，工资发放时冲回。
    """
    details = db.query(HousingFundDetail).filter(
        HousingFundDetail.company_id == company_id,
        HousingFundDetail.period == period
    ).all()
    if not details:
        return {"generated": 0, "message": "无公积金明细数据"}

    period_str = period
    summary_tag = f"公积金计提-{period_str}"

    # 去重：已存在则删除旧凭证重新生成
    existing = db.query(JournalEntry).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period == period_str,
        JournalEntry.source == "公积金计提",
        JournalEntry.summary == summary_tag,
    ).first()
    if existing:
        db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.voucher_no == existing.voucher_no,
            JournalEntry.period == period_str,
            JournalEntry.source == "公积金计提",
        ).delete()
        db.flush()

    # 确保科目
    _ensure_account(db, company_id, "6602", "管理费用", "损益", "借")
    _ensure_account(db, company_id, "660216", "住房公积金", "损益", "借")
    _ensure_account(db, company_id, "2211", "应付职工薪酬", "负债", "贷")
    _ensure_account(db, company_id, "221103", "住房公积金", "负债", "贷")
    _ensure_account(db, company_id, "1221", "其他应收款", "资产", "借")

    total_company = round(sum(d.company_amount or 0 for d in details), 2)
    total_personal = round(sum(d.personal_amount or 0 for d in details), 2)
    total_all = round(total_company + total_personal, 2)

    entry_date = datetime.strptime(period_str + "-01", "%Y-%m-%d").date()
    next_voucher_no = _next_voucher_no(db, company_id, period_str, "记")
    entries = []

    # 借：管理费用/住房公积金（公司部分）
    entries.append(JournalEntry(
        company_id=company_id, entry_date=entry_date,
        period=period_str, voucher_word="记", voucher_no=next_voucher_no,
        summary=summary_tag, account_code="660216", account_name="住房公积金",
        debit_amount=total_company, credit_amount=0, source="公积金计提",
    ))

    # 借：其他应收款/<员工>（个人部分，每人一行）
    for d in details:
        personal = round(d.personal_amount or 0, 2)
        if personal == 0:
            continue
        emp_code = _ensure_personal_ar_account(db, company_id, d.employee_name)
        entries.append(JournalEntry(
            company_id=company_id, entry_date=entry_date,
            period=period_str, voucher_word="记", voucher_no=next_voucher_no,
            summary=summary_tag, account_code=emp_code,
            account_name=f"其他应收款/{d.employee_name}",
            contact_project=d.employee_name,
            debit_amount=personal, credit_amount=0, source="公积金计提",
        ))

    # 贷：应付职工薪酬/住房公积金（公司+个人合计）
    entries.append(JournalEntry(
        company_id=company_id, entry_date=entry_date,
        period=period_str, voucher_word="记", voucher_no=next_voucher_no,
        summary=summary_tag, account_code="221103", account_name="住房公积金",
        debit_amount=0, credit_amount=total_all, source="公积金计提",
    ))

    db.add_all(entries)
    db.flush()
    return {
        "generated": 1,
        "voucher_no": next_voucher_no,
        "company_amount": total_company,
        "personal_amount": total_personal,
    }


def _match_hf_payment_journals(db: Session, company_id: int):
    """公积金缴纳凭证（新逻辑）：
    匹配银行流水中支付公积金的记录，生成：
    借：应付职工薪酬/住房公积金（公司+个人合计）
    贷：银行存款

    匹配关键词：住房公积金、公积金、公积金中心
    """
    from datetime import datetime as _dt

    txs = db.query(BankTransaction).filter(
        BankTransaction.company_id == company_id
    ).all()

    generated = 0
    matched = 0

    for tx in txs:
        cp = tx.counterparty_name or ""
        summary = tx.summary or ""
        tx_period = tx.transaction_date.strftime("%Y-%m") if tx.transaction_date else ""

        # 关键词匹配：公积金相关
        full_text = (cp + " " + summary).lower()
        result = _classify_bank_tx(db, company_id, tx)
        is_hf = (result and result[2] == "housing_fund") or \
                any(kw in full_text for kw in ["公积金", "住房公积金", "公积金中心"])
        if not is_hf:
            continue

        # 只处理支出
        is_debit = tx.debit_amount and tx.debit_amount > 0
        payment_amount = (tx.debit_amount or 0) if is_debit else (tx.credit_amount or 0)
        if payment_amount <= 0:
            continue

        # 去重
        summary_tag = f"公积金缴纳-#{tx.id}"
        existing = db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.summary == summary_tag,
            JournalEntry.source == "银行流水",
        ).first()
        if existing:
            continue

        # 检查是否已被「银行流水」自动凭证生成过（避免重复）
        existing_bank = db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.source == "银行流水",
            func.abs(JournalEntry.debit_amount - payment_amount) < 0.01,
            JournalEntry.account_code == "1002",
        ).first()
        if existing_bank:
            continue

        matched += 1
        period = tx_period or _dt.now().strftime("%Y-%m")
        next_voucher_no = _next_voucher_no(db, company_id, period, "记")
        date_str = tx.transaction_date.strftime("%Y-%m-%d") if tx.transaction_date else period + "-01"

        # 借：应付职工薪酬/住房公积金
        # 贷：银行存款
        db.add_all([
            JournalEntry(
                company_id=company_id,
                entry_date=_dt.strptime(date_str, "%Y-%m-%d").date(),
                period=period, voucher_word="记", voucher_no=next_voucher_no,
                summary=summary_tag, account_code="221103", account_name="住房公积金",
                debit_amount=round(payment_amount, 2), credit_amount=0,
                source="银行流水",
            ),
            JournalEntry(
                company_id=company_id,
                entry_date=_dt.strptime(date_str, "%Y-%m-%d").date(),
                period=period, voucher_word="记", voucher_no=next_voucher_no,
                summary=summary_tag, account_code="1002", account_name="银行存款",
                debit_amount=0, credit_amount=round(payment_amount, 2),
                source="银行流水",
            ),
        ])
        voucher_str = f"记-{next_voucher_no}"
        tx.journal_voucher_no = voucher_str
        db.flush()
        generated += 1

    return {"matched": matched, "generated": generated}


# ========== 银行流水凭证规则库 ==========

class BankRule(Base):
    """银行流水智能分类规则：关键词 → 会计科目"""
    __tablename__ = "bank_rules"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    keyword = Column(String(100), nullable=False, index=True)  # 匹配关键词（摘要/对方户名）
    account_code = Column(String(20), nullable=False)  # 匹配到的借方或贷方科目代码
    account_name = Column(String(100))  # 科目名称（冗余，便于展示）
    transaction_type = Column(String(10), default="全部")  # 收入 / 支出 / 全部
    direction = Column(String(4), default="auto")  # 规则适用的方向：debit(支出侧) / credit(收入侧) / auto
    priority = Column(Integer, default=0)  # 优先级，数字越大越优先
    is_active = Column(Integer, default=1)  # 1=启用, 0=禁用
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    company = relationship("Company", back_populates="bank_rules")


# ========== 增值税申报表模型 ==========

class VATDeclaration(Base):
    """增值税及附加税费申报表头"""
    __tablename__ = "vat_declarations"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    period = Column(String(7), nullable=False)  # YYYY-MM 税款所属期
    # 纳税人信息
    taxpayer_name = Column(String(100))
    taxpayer_id = Column(String(50))
    industry = Column(String(50))
    register_type = Column(String(50))
    legal_representative = Column(String(50))
    address = Column(String(200))
    bank_account = Column(String(100))
    phone = Column(String(30))
    # 填表信息
    fill_date = Column(Date)
    # 小微企业"六税两费"减免
    micro_enterprise = Column(Boolean, default=False)
    six_tax_reduction = Column(Boolean, default=False)
    reduction_start = Column(String(10))
    reduction_end = Column(String(10))
    # 附加税费
    city_maintenance_tax = Column(Numeric(18, 2), default=0.0)
    education_surcharge = Column(Numeric(18, 2), default=0.0)
    local_education_surcharge = Column(Numeric(18, 2), default=0.0)
    # 状态
    status = Column(String(20), default="草稿")
    submitted_at = Column(DateTime)
    # 7张表的填报数据（JSON格式）
    form_main = Column(Text)
    form_sales = Column(Text)
    form_input = Column(Text)
    form_deduction = Column(Text)
    form_credit = Column(Text)
    form_surcharge = Column(Text)
    form_reduction = Column(Text)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    company = relationship("Company", back_populates="vat_declarations")


# ========== 社保申报模型 ==========

class SocialSecurityDeclaration(Base):
    """社保申报主表"""
    __tablename__ = "social_security_declarations"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    period = Column(String(7), nullable=False, index=True)  # YYYY-MM 费款所属期
    status = Column(String(20), default="草稿")  # 草稿/已确认
    note = Column(String(500))  # 备注
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    company = relationship("Company", back_populates="social_security_declarations")
    details = relationship("SocialSecurityDetail", back_populates="declaration", cascade="all, delete-orphan")


class SocialSecurityDetail(Base):
    """社保申报明细表"""
    __tablename__ = "social_security_details"

    id = Column(Integer, primary_key=True, index=True)
    declaration_id = Column(Integer, ForeignKey("social_security_declarations.id"), nullable=False, index=True)
    seq = Column(Integer, comment="序号")
    employee_name = Column(String(50), comment="姓名")
    id_number = Column(String(30), comment="证件号码")
    period_start = Column(String(7), comment="费款所属期起")
    period_end = Column(String(7), comment="费款所属期止")
    total_amount = Column(Numeric(18, 2), default=0.0, comment="应收金额")
    personal_amount = Column(Numeric(18, 2), default=0.0, comment="个人社保合计")
    company_amount = Column(Numeric(18, 2), default=0.0, comment="单位社保合计")
    salary_base = Column(Numeric(18, 2), default=0.0, comment="缴费工资")
    category = Column(String(20), default="在职人员", comment="人员类别：在职人员/退休人员/家属统筹人员")
    insurance_items = Column(Text, comment="JSON: 各项保险明细 [{name,rate,amount},...]")
    created_at = Column(DateTime, default=datetime.now)

    declaration = relationship("SocialSecurityDeclaration", back_populates="details")


# ========== 公积金缴存模型 ==========

class HousingFundDetail(Base):
    """公积金缴存明细（一人一行）"""
    __tablename__ = "housing_fund_details"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    period = Column(String(7), nullable=False, index=True)  # YYYY-MM
    employee_id = Column(String(20), comment="工号")
    employee_name = Column(String(50), nullable=False, comment="姓名")
    id_number = Column(String(18), comment="身份证号")
    deposit_base = Column(Numeric(18, 2), default=0.0, comment="缴存基数")
    company_ratio = Column(Numeric(18, 2), default=0.0, comment="单位缴存比例(%)")
    personal_ratio = Column(Numeric(18, 2), default=0.0, comment="个人缴存比例(%)")
    total_amount = Column(Numeric(18, 2), default=0.0, comment="缴存额（月缴存额合计）")
    company_amount = Column(Numeric(18, 2), default=0.0, comment="单位缴存额")
    personal_amount = Column(Numeric(18, 2), default=0.0, comment="个人缴存额")
    status = Column(String(20), default="正常", comment="正常/封存")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    company = relationship("Company", back_populates="housing_fund_details")


class HousingFundDeclaration(Base):
    """公积金申报主表"""
    __tablename__ = "housing_fund_declarations"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    period = Column(String(7), nullable=False, index=True)  # YYYY-MM
    status = Column(String(20), default="草稿")  # 草稿/已确认
    note = Column(String(500))
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    company = relationship("Company", back_populates="housing_fund_declarations")


# 基础科目数据模板（中小制造业标准科目表）
ACCOUNTS_TEMPLATE = [
    ("1001", "库存现金", "资产", "借", 1),
    ("1002", "银行存款", "资产", "借", 1),
    ("1122", "应收账款", "资产", "借", 1),
    ("1123", "预付账款", "资产", "借", 1),
    ("1221", "其他应收款", "资产", "借", 1),
    ("1401", "原材料", "资产", "借", 1),
    ("1402", "在途物资", "资产", "借", 1),
    ("1403", "库存商品", "资产", "借", 1),
    ("1405", "委托加工物资", "资产", "借", 1),
    ("1411", "周转材料", "资产", "借", 1),
    ("1601", "固定资产", "资产", "借", 1),
    ("1602", "累计折旧", "资产", "贷", 1),
    ("1701", "无形资产", "资产", "借", 1),
    ("1801", "长期待摊费用", "资产", "借", 1),
    ("2001", "短期借款", "负债", "贷", 1),
    ("2202", "应付账款", "负债", "贷", 1),
    ("2203", "预收账款", "负债", "贷", 1),
    ("2221", "其他应付款", "负债", "贷", 1),
    ("2241", "其他应付款", "负债", "贷", 1),
    ("2501", "长期借款", "负债", "贷", 1),
    ("2210", "应交税费", "负债", "贷", 1),
    ("221001", "应交增值税", "负债", "贷", 2, "2210"),
    ("221001001", "销项税额", "负债", "贷", 3, "221001"),
    ("221001002", "进项税额", "负债", "借", 3, "221001"),
    ("221001003", "待认证进项税额", "负债", "贷", 3, "221001"),
    ("221001004", "已交税金", "负债", "借", 3, "221001"),
    ("221001005", "转出未交增值税", "负债", "借", 3, "221001"),
    ("221001006", "转出多交增值税", "负债", "贷", 3, "221001"),
    ("221001007", "减免税款", "负债", "借", 3, "221001"),
    ("221001008", "出口抵减内销产品应纳税额", "负债", "借", 3, "221001"),
    ("221001009", "出口退税", "负债", "贷", 3, "221001"),
    ("221001010", "进项税额转出", "负债", "贷", 3, "221001"),
    ("221001011", "销项税额抵减", "负债", "借", 3, "221001"),
    ("221009", "预交增值税", "负债", "借", 2, "2210"),
    ("221010", "待抵扣进项税额", "负债", "借", 2, "2210"),
    ("221011", "待转销项税额", "负债", "贷", 2, "2210"),
    ("221012", "增值税留抵税额", "负债", "借", 2, "2210"),
    ("221013", "简易计税", "负债", "贷", 2, "2210"),
    ("221014", "转让金融商品应交增值税", "负债", "贷", 2, "2210"),
    ("221015", "代扣代交增值税", "负债", "贷", 2, "2210"),
    ("221002", "应交企业所得税", "负债", "贷", 2, "2210"),
    ("221003", "应交个人所得税", "负债", "贷", 2, "2210"),
    ("221004", "未交增值税", "负债", "贷", 2, "2210"),
    ("221005", "应交城市维护建设税", "负债", "贷", 2, "2210"),
    ("221006", "应交教育费附加", "负债", "贷", 2, "2210"),
    ("221007", "应交地方教育附加", "负债", "贷", 2, "2210"),
    ("221008", "应交印花税", "负债", "贷", 2, "2210"),
    ("2211", "应付职工薪酬", "负债", "贷", 1),
    ("221101", "工资", "负债", "贷", 2, "2211"),
    ("221102", "社会保险费", "负债", "贷", 2, "2211"),
    ("221103", "住房公积金", "负债", "贷", 2, "2211"),
    ("222101", "代扣社会保险费", "负债", "贷", 2, "2221"),
    ("4001", "实收资本", "权益", "贷", 1),
    ("4002", "资本公积", "权益", "贷", 1),
    ("4101", "盈余公积", "权益", "贷", 1),
    ("4103", "本年利润", "权益", "贷", 1),
    ("4104", "利润分配", "权益", "贷", 1),
    ("5001", "生产成本", "成本", "借", 1),
    ("500101", "直接材料", "成本", "借", 2, "5001"),
    ("500102", "直接人工", "成本", "借", 2, "5001"),
    ("500103", "制造费用", "成本", "借", 2, "5001"),
    ("5101", "制造费用", "成本", "借", 1),
    ("6001", "主营业务收入", "收入", "贷", 1),
    ("6051", "其他业务收入", "收入", "贷", 1),
    ("6111", "投资收益", "收入", "贷", 1),
    ("6301", "营业外收入", "收入", "贷", 1),
    ("6401", "主营业务成本", "损益", "借", 1),
    ("6402", "其他业务成本", "损益", "借", 1),
    ("6403", "税金及附加", "损益", "借", 1),
    ("6601", "销售费用", "损益", "借", 1),
    ("6602", "管理费用", "损益", "借", 1),
    ("660201", "办公费", "损益", "借", 2, "6602"),
    ("660202", "差旅费", "损益", "借", 2, "6602"),
    ("660203", "折旧费", "损益", "借", 2, "6602"),
    ("660204", "工资", "损益", "借", 2, "6602"),
    ("660205", "社保费", "损益", "借", 2, "6602"),
    ("660206", "交通费", "损益", "借", 2, "6602"),
    ("660207", "通讯费", "损益", "借", 2, "6602"),
    ("660208", "摊销费", "损益", "借", 2, "6602"),
    ("660209", "咨询费", "损益", "借", 2, "6602"),
    ("660210", "培训费", "损益", "借", 2, "6602"),
    ("660211", "维修费", "损益", "借", 2, "6602"),
    ("660212", "社会保险费", "损益", "借", 2, "6602"),
    ("660213", "租赁费", "损益", "借", 2, "6602"),
    ("660214", "水电费", "损益", "借", 2, "6602"),
    ("660215", "业务招待费", "损益", "借", 2, "6602"),
    ("660216", "住房公积金", "损益", "借", 2, "6602"),
    ("6603", "财务费用", "损益", "借", 1),
    ("660301", "手续费", "损益", "借", 2, "6603"),
    ("6711", "营业外支出", "损益", "借", 1),
    ("6801", "所得税费用", "损益", "借", 1),
]

DEPARTMENTS_TEMPLATE = [
    ("BM001", "总经办"),
    ("BM002", "生产部"),
    ("BM003", "技术部"),
    ("BM004", "质检部"),
    ("BM005", "采购部"),
    ("BM006", "销售部"),
    ("BM007", "仓储部"),
    ("BM008", "财务部"),
    ("BM009", "行政部"),
    ("BM010", "人事部"),
]


def init_company_data(db, company_id: int):
    """为新公司初始化科目表、部门、期间等基础数据"""
    # 科目表
    existing = db.query(Account).filter(Account.company_id == company_id).count()
    if existing == 0:
        for row in ACCOUNTS_TEMPLATE:
            code, name, category, direction, level = row[0], row[1], row[2], row[3], row[4]
            parent = row[5] if len(row) > 5 else None
            db.add(Account(
                company_id=company_id, code=code, name=name,
                category=category, balance_direction=direction,
                level=level, parent_code=parent
            ))
        db.flush()  # 立即刷新，让后续 _ensure_account 能查询到已添加的科目

    # 始终确保增值税完整科目体系（财会〔2016〕22号）
    vat_accounts = [
        ("221001001", "销项税额", "负债", "贷"),
        ("221001002", "进项税额", "负债", "借"),
        ("221001003", "待认证进项税额", "负债", "贷"),
        ("221001004", "已交税金", "负债", "借"),
        ("221001005", "转出未交增值税", "负债", "借"),
        ("221001006", "转出多交增值税", "负债", "贷"),
        ("221001007", "减免税款", "负债", "借"),
        ("221001008", "出口抵减内销产品应纳税额", "负债", "借"),
        ("221001009", "出口退税", "负债", "贷"),
        ("221001010", "进项税额转出", "负债", "贷"),
        ("221001011", "销项税额抵减", "负债", "借"),
        ("221009", "预交增值税", "负债", "借"),
        ("221010", "待抵扣进项税额", "负债", "借"),
        ("221011", "待转销项税额", "负债", "贷"),
        ("221012", "增值税留抵税额", "负债", "借"),
        ("221013", "简易计税", "负债", "贷"),
        ("221014", "转让金融商品应交增值税", "负债", "贷"),
        ("221015", "代扣代交增值税", "负债", "贷"),
    ]
    for code, name, category, direction in vat_accounts:
        _ensure_account(db, company_id, code, name, category, direction)

    # 部门
    dept_count = db.query(Department).filter(Department.company_id == company_id).count()
    if dept_count == 0:
        for code, name in DEPARTMENTS_TEMPLATE:
            db.add(Department(company_id=company_id, code=code, name=name))

    # 期间
    period_count = db.query(Period).filter(Period.company_id == company_id).count()
    if period_count == 0:
        from datetime import date
        current = date.today().strftime("%Y-%m")
        db.add(Period(company_id=company_id, period=current))

    db.commit()



class SalaryRecord(Base):
    """工资薪金所得预扣预缴明细 - 按税务模板"""
    __tablename__ = "salary_records"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    period = Column(String(20), nullable=False, index=True)  # 期间，如 2025-10

    # 人员信息
    employee_code = Column(String(50), index=True)          # 工号（关联人员档案 code）
    employee_name = Column(String(100), nullable=False)       # 姓名
    id_type = Column(String(50), default="居民身份证")       # 证件类型
    id_number = Column(String(50), index=True)                # 证件号码

    # 税款所属期
    tax_period_start = Column(String(20))  # 税款所属期起，如 2025-10-01
    tax_period_end = Column(String(20))    # 税款所属期止，如 2025-10-31
    income_type = Column(String(50), default="正常工资薪金")  # 所得项目

    # 本期扣除
    current_income = Column(Numeric(18, 2), default=0.0)       # 本期收入
    tax_free_income = Column(Numeric(18, 2), default=0.0)       # 免税收入
    basic_deduction = Column(Numeric(18, 2), default=5000.0)    # 基本减除费用

    # 专项扣除（本月）
    pension_insurance = Column(Numeric(18, 2), default=0.0)      # 基本养老保险
    medical_insurance = Column(Numeric(18, 2), default=0.0)     # 基本医疗保险
    unemployment_insurance = Column(Numeric(18, 2), default=0.0) # 失业保险
    housing_fund = Column(Numeric(18, 2), default=0.0)           # 住房公积金
    enterprise_annuity = Column(Numeric(18, 2), default=0.0)    # 企业年金
    commercial_health = Column(Numeric(18, 2), default=0.0)     # 商业健康保险
    tax_deferred_pension = Column(Numeric(18, 2), default=0.0)  # 税延养老保险
    other_special_deduction = Column(Numeric(18, 2), default=0.0) # 其他专项扣除

    # 专项附加扣除（本月）
    child_education = Column(Numeric(18, 2), default=0.0)        # 子女教育
    continuing_education = Column(Numeric(18, 2), default=0.0)   # 继续教育
    housing_loan_interest = Column(Numeric(18, 2), default=0.0)  # 住房贷款利息
    housing_rent = Column(Numeric(18, 2), default=0.0)            # 住房租金
    elderly_support = Column(Numeric(18, 2), default=0.0)        # 赡养老人
    infant_care = Column(Numeric(18, 2), default=0.0)            # 3岁以下婴幼儿照护
    major_medical = Column(Numeric(18, 2), default=0.0)           # 大病医疗
    other_additional_deduction = Column(Numeric(18, 2), default=0.0) # 其他附加扣除

    # 累计数据
    cumulative_income = Column(Numeric(18, 2), default=0.0)           # 累计收入额
    cumulative_tax_free = Column(Numeric(18, 2), default=0.0)         # 累计免税收入
    cumulative_deduction = Column(Numeric(18, 2), default=0.0)        # 累计减除费用
    cumulative_special = Column(Numeric(18, 2), default=0.0)          # 累计专项扣除
    cumulative_additional = Column(Numeric(18, 2), default=0.0)       # 累计专项附加扣除
    cumulative_other = Column(Numeric(18, 2), default=0.0)            # 累计其他扣除
    cumulative_tax_withheld = Column(Numeric(18, 2), default=0.0)    # 累计已预扣预缴税额

    # 本期其他扣除
    other_deduction = Column(Numeric(18, 2), default=0.0)             # 本期其他扣除

    # 税额计算
    taxable_income = Column(Numeric(18, 2), default=0.0)      # 应纳税所得额
    tax_rate = Column(Numeric(18, 2), default=0.0)            # 税率
    quick_deduction = Column(Numeric(18, 2), default=0.0)     # 速算扣除数
    tax_payable = Column(Numeric(18, 2), default=0.0)         # 累计应预扣预缴税额
    tax_already_withheld = Column(Numeric(18, 2), default=0.0) # 本期已预扣预缴税额
    tax_to_pay = Column(Numeric(18, 2), default=0.0)          # 本期应预扣预缴税额（实际应缴）
    tax_refund = Column(Numeric(18, 2), default=0.0)          # 应补(退)税额

    # 实发工资
    net_salary = Column(Numeric(18, 2), default=0.0)           # 实发工资

    # 原始行数据（JSON，保留导入时的完整列）
    raw_data = Column(Text)  # JSON string，存储Excel原始行

    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        Index('idx_salary_company_period', 'company_id', 'period'),
    )
    company = relationship("Company", back_populates="salary_records")


# ==================== 文化事业建设费申报 ====================

class CulturalConstructionFeeDeclaration(Base):
    """文化事业建设费申报表（主表）"""
    __tablename__ = "cultural_construction_fee_declarations"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    period = Column(String(7), nullable=False, comment="申报期间 YYYY-MM")
    status = Column(String(20), default="草稿", comment="状态：草稿/已确认/已申报")
    note = Column(Text, comment="备注")
    taxpayer_name = Column(String(200), comment="纳税人名称")
    taxpayer_id = Column(String(50), comment="纳税人识别号")
    fill_date = Column(Date, comment="填表日期")

    # 主表栏次（本月数 / 本年累计）—— 命名以 rowN_ 前缀对应 Pydantic 模型
    row1_taxable_income_current = Column(Numeric(18, 2), default=0.0, comment="栏次1 应征收入 本月数")
    row1_taxable_income_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次1 应征收入 本年累计")
    row2_tax_exempt_income_current = Column(Numeric(18, 2), default=0.0, comment="栏次2 免征收入 本月数")
    row2_tax_exempt_income_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次2 免征收入 本年累计")
    row3_deduction_beginning_current = Column(Numeric(18, 2), default=0.0, comment="栏次3 减除项目期初金额 本月数")
    row3_deduction_beginning_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次3 减除项目期初金额 本年累计")
    row4_deduction_current_period_current = Column(Numeric(18, 2), default=0.0, comment="栏次4 减除项目本期发生额 本月数")
    row4_deduction_current_period_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次4 减除项目本期发生额 本年累计")
    row5_taxable_income_deduction_current = Column(Numeric(18, 2), default=0.0, comment="栏次5 应征收入减除额 本月数")
    row5_taxable_income_deduction_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次5 应征收入减除额 本年累计")
    row6_tax_exempt_deduction_current = Column(Numeric(18, 2), default=0.0, comment="栏次6 免征收入减除额 本月数")
    row6_tax_exempt_deduction_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次6 免征收入减除额 本年累计")
    row7_deduction_ending_balance_current = Column(Numeric(18, 2), default=0.0, comment="栏次7 减除项目期末余额 本月数")
    row7_deduction_ending_balance_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次7 减除项目期末余额 本年累计")
    row8_taxable_sales_current = Column(Numeric(18, 2), default=0.0, comment="栏次8 计费销售额 本月数")
    row8_taxable_sales_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次8 计费销售额 本年累计")
    row9_fee_rate = Column(Numeric(18, 4), default=0.03, comment="栏次9 费率")
    row10_payable_fee_current = Column(Numeric(18, 2), default=0.0, comment="栏次10 应缴费额 本月数")
    row10_payable_fee_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次10 应缴费额 本年累计")
    row10a_fee_reduction_current = Column(Numeric(18, 2), default=0.0, comment="栏次10a 本期减免额（财税〔2025〕7号 50%减征）本月数")
    row10a_fee_reduction_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次10a 本期减免额 本年累计")
    fee_reduction_rate = Column(Numeric(18, 4), default=0.5, comment="减免比例（财税〔2025〕7号：归属中央收入50%减征）")
    row11_unpaid_beginning_current = Column(Numeric(18, 2), default=0.0, comment="栏次11 期初未缴费额 本月数")
    row11_unpaid_beginning_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次11 期初未缴费额 本年累计")
    row12_paid_current_period_current = Column(Numeric(18, 2), default=0.0, comment="栏次12 本期已缴费额 本月数")
    row12_paid_current_period_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次12 本期已缴费额 本年累计")
    row13_prepaid_current = Column(Numeric(18, 2), default=0.0, comment="栏次13 本期预缴费额 本月数")
    row13_prepaid_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次13 本期预缴费额 本年累计")
    row14_paid_last_period_current = Column(Numeric(18, 2), default=0.0, comment="栏次14 本期缴纳上期费额 本月数")
    row14_paid_last_period_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次14 本期缴纳上期费额 本年累计")
    row15_paid_arrears_current = Column(Numeric(18, 2), default=0.0, comment="栏次15 本期缴纳欠费额 本月数")
    row15_paid_arrears_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次15 本期缴纳欠费额 本年累计")
    row16_unpaid_ending_current = Column(Numeric(18, 2), default=0.0, comment="栏次16 期末未缴费额 本月数")
    row16_unpaid_ending_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次16 期末未缴费额 本年累计")
    row17_arrears_current = Column(Numeric(18, 2), default=0.0, comment="栏次17 欠缴费额 本月数")
    row17_arrears_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次17 欠缴费额 本年累计")
    row18_fill_refund_current = Column(Numeric(18, 2), default=0.0, comment="栏次18 本期应补(退)费额 本月数")
    row18_fill_refund_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次18 本期应补(退)费额 本年累计")
    row19_inspected_supplement_current = Column(Numeric(18, 2), default=0.0, comment="栏次19 本期检查已补缴费额 本月数")
    row19_inspected_supplement_ytd = Column(Numeric(18, 2), default=0.0, comment="栏次19 本期检查已补缴费额 本年累计")

    # JSON 表单数据（与 VAT 模块一致）
    form_main = Column(Text, comment="主表 JSON")
    form_deduction = Column(Text, comment="扣除项目表 JSON")

    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        Index('idx_ccf_company_period', 'company_id', 'period'),
    )
    company = relationship("Company", back_populates="cultural_construction_fee_declarations")
    deductions = relationship("CulturalConstructionFeeDeduction", back_populates="declaration", cascade="all, delete-orphan")


class CulturalConstructionFeeDeduction(Base):
    """应税服务扣除项目清单"""
    __tablename__ = "cultural_construction_fee_deductions"

    id = Column(Integer, primary_key=True, index=True)
    declaration_id = Column(Integer, ForeignKey("cultural_construction_fee_declarations.id"), nullable=False)
    seq = Column(Integer, default=0, comment="序号")
    invoice_supplier_tax_no = Column(String(50), comment="开票方纳税人识别号")
    invoice_supplier_name = Column(String(100), comment="开票方单位名称")
    service_item_name = Column(String(100), comment="服务项目名称")
    voucher_type = Column(String(20), comment="凭证种类")
    voucher_no = Column(String(50), comment="凭证号码")
    amount = Column(Numeric(18, 2), default=0.0, comment="金额")

    __table_args__ = (
        Index('idx_ccf_ded_decl', 'declaration_id'),
    )
    declaration = relationship("CulturalConstructionFeeDeclaration", back_populates="deductions")


def init_db():
    """初始化数据库：建表 → 迁移 → 初始化已有公司的种子数据

    新环境首次运行时，如果 companys 表为空，自动创建一家演示公司，
    并初始化其科目/部门/期间，保证系统可直接使用。
    """
    from datetime import date
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        migrate_schema(db)

        # 新环境无公司时，自动创建演示公司
        if db.query(Company).count() == 0:
            demo = Company(
                name="演示公司",
                uscc="91110000DEMO00001",
                registered_capital=1000000.0,
                established_date=date.today(),
                legal_representative="管理员",
                address="系统自动创建",
                business_scope="演示用途",
            )
            db.add(demo)
            db.flush()  # 拿到 demo.id
            print(f"[init_db] 自动创建演示公司: id={demo.id}")
            init_company_data(db, demo.id)
            companies = [demo]
        else:
            companies = db.query(Company).order_by(Company.id).all()
            for company in companies:
                try:
                    init_company_data(db, company.id)
                except Exception as e:
                    print(f"[init_db] 警告：公司{company.id} 数据初始化失败: {e}")


        db.commit()
        print(f"数据库初始化完成（{len(companies)} 家公司）")
    except Exception as e:
        db.rollback()
        print(f"初始化错误: {e}")
        raise  # 重新抛出，让调用方知道初始化失败
    finally:
        db.close()
