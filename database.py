"""
中小制造业账务处理系统 - 数据库模型（多公司账套版本）
"""
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Date, Time, DateTime,
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
    registered_capital = Column(Float, comment="注册资本")
    established_date = Column(Date, comment="成立日期")
    legal_representative = Column(String(50), comment="法定代表人")
    legal_representative_id = Column(String(30), comment="法定代表人身份证")
    address = Column(String(200), comment="注册地址")
    business_scope = Column(Text, comment="经营范围")
    created_at = Column(DateTime, default=datetime.now)

    shareholders = relationship("CompanyShareholder", back_populates="company", cascade="all, delete-orphan")
    directors = relationship("CompanyDirector", back_populates="company", cascade="all, delete-orphan")
    supervisors = relationship("CompanySupervisor", back_populates="company", cascade="all, delete-orphan")
    finance_contacts = relationship("CompanyFinanceContact", back_populates="company", cascade="all, delete-orphan")


class CompanyShareholder(Base):
    __tablename__ = "company_shareholders"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    name = Column(String(50), nullable=False, comment="股东姓名")
    id_number = Column(String(30), comment="身份证号")
    ratio = Column(Float, comment="持股比例(%)")
    contribution_amount = Column(Float, comment="认缴出资额")
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


# ==================== 人员档案 ====================

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    code = Column(String(20), nullable=False, comment="工号")
    name = Column(String(50), nullable=False, comment="姓名")
    id_card = Column(String(30), comment="身份证号")
    email = Column(String(100), comment="邮箱")
    salary = Column(Float, default=0.0, comment="基本工资")
    leave_date = Column(Date, comment="离职日期")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


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
    credit_limit = Column(Float, default=0.0, comment="信用额度")
    payment_terms = Column(Integer, default=30, comment="账期（天）")
    bank_name = Column(String(100), comment="开户银行")
    bank_account = Column(String(50), comment="银行账号")
    uscc = Column(String(50), comment="统一社会信用代码")
    is_active = Column(Boolean, default=True)
    remark = Column(String(200), comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


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
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


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
    opening_balance = Column(Float, default=0.0, comment="期初金额")
    created_at = Column(DateTime, default=datetime.now)


# ==================== 会计期间 ====================

class Period(Base):
    """会计期间 - 每个公司独立管理期间"""
    __tablename__ = "periods"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    period = Column(String(7), nullable=False, comment="YYYY-MM")
    status = Column(String(20), default="开放", comment="开放/已结账")
    closed_at = Column(DateTime, nullable=True)


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
    original_value = Column(Float, default=0.0, comment="原值")
    residual_value = Column(Float, default=0.0, comment="预计净残值")
    useful_life_months = Column(Integer, default=60, comment="使用年限（月）")
    accumulated_depreciation = Column(Float, default=0.0, comment="累计折旧")
    monthly_depreciation = Column(Float, default=0.0, comment="月折旧额")
    depreciation_method = Column(String(20), default="直线法", comment="折旧方法：直线法/双倍余额递减法/年数总和法")
    status = Column(String(20), default="在用", comment="状态：在用/闲置/报废/出售")
    supplier = Column(String(100), comment="供应商")
    warranty_expiry = Column(Date, comment="保修到期日")
    voucher_no = Column(String(30), comment="入账凭证号")
    disposal_voucher_no = Column(String(30), comment="处置凭证号")
    disposal_date = Column(Date, comment="处置日期")
    disposal_amount = Column(Float, default=0.0, comment="处置收入")
    remark = Column(Text, comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


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
    depreciation_amount = Column(Float, default=0.0, comment="本期折旧额")
    accumulated_before = Column(Float, default=0.0, comment="折旧前累计")
    accumulated_after = Column(Float, default=0.0, comment="折旧后累计")
    net_value = Column(Float, default=0.0, comment="折旧后净值")
    remark = Column(String(200), comment="备注")
    created_at = Column(DateTime, default=datetime.now)


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
    original_value = Column(Float, default=0.0, comment="原值")
    useful_life_months = Column(Integer, default=120, comment="摊销期限（月）")
    accumulated_amortization = Column(Float, default=0.0, comment="累计摊销")
    monthly_amortization = Column(Float, default=0.0, comment="月摊销额")
    residual_value = Column(Float, default=0.0, comment="预计残值")
    status = Column(String(20), default="在用", comment="状态：在用/处置")
    voucher_no = Column(String(30), comment="入账凭证号")
    disposal_voucher_no = Column(String(30), comment="处置凭证号")
    disposal_date = Column(Date, comment="处置日期")
    disposal_amount = Column(Float, default=0.0, comment="处置收入")
    remark = Column(Text, comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class IntangibleAssetAmortization(Base):
    """无形资产摊销明细"""
    __tablename__ = "ia_amortizations"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    asset_id = Column(Integer, ForeignKey("intangible_assets.id"), nullable=False)
    period = Column(String(7), nullable=False, comment="摊销期间")
    amortization_amount = Column(Float, default=0.0, comment="本期摊销额")
    accumulated_before = Column(Float, default=0.0, comment="摊销前累计")
    accumulated_after = Column(Float, default=0.0, comment="摊销后累计")
    net_value = Column(Float, default=0.0, comment="摊销后净值")
    remark = Column(String(200), comment="备注")
    created_at = Column(DateTime, default=datetime.now)


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
    safety_stock = Column(Float, default=0.0, comment="安全库存量")
    current_stock = Column(Float, default=0.0, comment="当前库存量")
    cost_price = Column(Float, default=0.0, comment="参考成本价")
    sale_price = Column(Float, default=0.0, comment="参考售价")
    account_code = Column(String(20), comment="关联会计科目编码")
    is_active = Column(Boolean, default=True)
    remark = Column(String(200), comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


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
    quantity = Column(Float, nullable=False, comment="数量（+入库/-出库）")
    unit_price = Column(Float, default=0.0, comment="单价")
    total_amount = Column(Float, default=0.0, comment="金额")
    warehouse = Column(String(50), comment="仓库")
    warehouse_to = Column(String(50), comment="调入仓库（调拨用）")
    voucher_no = Column(String(30), comment="关联凭证号")
    reference_no = Column(String(50), comment="单据号（入库单/出库单等）")
    operator = Column(String(50), comment="操作人")
    remark = Column(Text, comment="备注")
    created_at = Column(DateTime, default=datetime.now)


class InventoryBalance(Base):
    """库存余额快照（按期计算）"""
    __tablename__ = "inventory_balances"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    item_code = Column(String(30), nullable=False, comment="商品编码")
    period = Column(String(7), nullable=False, comment="期间 YYYY-MM")
    begin_quantity = Column(Float, default=0.0, comment="期初数量")
    in_quantity = Column(Float, default=0.0, comment="本期入库数量")
    out_quantity = Column(Float, default=0.0, comment="本期出库数量")
    end_quantity = Column(Float, default=0.0, comment="期末数量")
    total_amount = Column(Float, default=0.0, comment="期末金额")
    created_at = Column(DateTime, default=datetime.now)


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
    amount = Column(Float, default=0.0, comment="合同金额")
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


class ContractPayment(Base):
    """合同收付款计划"""
    __tablename__ = "contract_payments"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    payment_no = Column(Integer, default=1, comment="期次")
    payment_type = Column(String(10), nullable=False, comment="收款/付款")
    amount = Column(Float, nullable=False, comment="金额")
    due_date = Column(Date, comment="到期日期")
    paid_date = Column(Date, comment="实际收付日期")
    paid_amount = Column(Float, default=0.0, comment="实收/实付金额")
    status = Column(String(20), default="未付", comment="状态：未付/部分已付/已付清")
    remark = Column(String(200), comment="备注")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


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
    amount = Column(Float, nullable=False, comment="金额")
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
    invoice_no = Column(String(30), nullable=True, comment="发票号码")
    digital_invoice_no = Column(String(50), comment="数电发票号码")
    # 销方信息
    seller_tax_no = Column(String(50), comment="销方识别号")
    seller_name = Column(String(100), comment="销方名称")
    # 购方信息
    buyer_tax_no = Column(String(50), comment="购方识别号")
    buyer_name = Column(String(100), comment="购买方名称")
    # 发票日期与分类
    invoice_date = Column(Date, nullable=True, comment="开票日期")
    tax_category_code = Column(String(30), comment="税收分类编码")
    specific_business_type = Column(String(50), comment="特定业务类型")
    # 货物明细
    goods_name = Column(String(200), comment="货物或应税劳务名称")
    spec = Column(String(100), comment="规格型号")
    unit = Column(String(10), comment="单位")
    quantity = Column(Float, default=0, comment="数量")
    unit_price = Column(Float, default=0, comment="单价")
    # 金额信息
    amount = Column(Float, default=0.0, comment="金额（不含税）")
    tax_rate = Column(Float, default=0.0, comment="税率（%）")
    tax_amount = Column(Float, default=0.0, comment="税额")
    total_amount = Column(Float, default=0.0, comment="价税合计")
    # 发票属性
    invoice_source = Column(String(20), comment="发票来源")
    invoice_category = Column(String(20), default="增值税专用发票", comment="发票票种：增值税专用发票/增值税普通发票/电子普通发票/其他")
    status = Column(String(20), default="正常", comment="发票状态：正常/作废/红冲")
    is_positive = Column(Boolean, default=True, comment="是否正数发票")
    invoice_risk_level = Column(String(10), comment="发票风险等级")
    # 其他
    issuer = Column(String(30), comment="开票人")
    remark = Column(Text, comment="备注")
    raw_data = Column(Text, comment="导入时的额外列数据JSON")
    _fingerprint = Column(String(64), comment="全行指纹（去重用）")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

# ==================== 取得发票（采购发票）====================

class PurchaseInvoice(Base):
    """取得发票 - 企业收到的采购发票"""
    __tablename__ = "purchase_invoices"
    __table_args__ = (
        Index('idx_pi_company_date', 'company_id', 'invoice_date'),
        Index('idx_pi_company_seller', 'company_id', 'seller_name'),
        Index('idx_pi_company_cert', 'company_id', 'certification_status'),
    )
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, comment="所属公司")
    # 发票基本信息
    invoice_code = Column(String(30), comment="发票代码")
    invoice_no = Column(String(30), nullable=True, comment="发票号码")
    digital_invoice_no = Column(String(50), comment="数电发票号码")
    # 销方信息
    seller_tax_no = Column(String(50), comment="销方识别号")
    seller_name = Column(String(100), comment="销方名称")
    # 购方信息
    buyer_tax_no = Column(String(50), comment="购方识别号")
    buyer_name = Column(String(100), comment="购买方名称")
    # 发票日期与分类
    invoice_date = Column(Date, nullable=True, comment="开票日期")
    tax_category_code = Column(String(30), comment="税收分类编码")
    specific_business_type = Column(String(50), comment="特定业务类型")
    # 货物明细
    goods_name = Column(String(200), comment="货物或应税劳务名称")
    spec = Column(String(100), comment="规格型号")
    unit = Column(String(10), comment="单位")
    quantity = Column(Float, default=0, comment="数量")
    unit_price = Column(Float, default=0, comment="单价")
    # 金额信息
    amount = Column(Float, default=0.0, comment="金额（不含税）")
    tax_rate = Column(Float, default=0.0, comment="税率（%）")
    tax_amount = Column(Float, default=0.0, comment="税额")
    total_amount = Column(Float, default=0.0, comment="价税合计")
    # 发票属性
    invoice_source = Column(String(20), comment="发票来源")
    invoice_category = Column(String(20), default="增值税专用发票", comment="发票票种：增值税专用发票/增值税普通发票/电子普通发票/其他")
    status = Column(String(20), default="正常", comment="发票状态：正常/作废/红冲")
    is_positive = Column(Boolean, default=True, comment="是否正数发票")
    invoice_risk_level = Column(String(10), comment="发票风险等级")
    # 认证信息
    certification_status = Column(String(20), default="未认证", comment="认证状态：未认证/已认证/已抵扣")
    certification_date = Column(Date, comment="认证日期")
    deduction_period = Column(String(7), comment="抵扣期间 YYYY-MM")
    deduction_rate = Column(Float, default=100.0, comment="抵扣率（%），默认100=全额抵扣")
    # 其他
    issuer = Column(String(30), comment="开票人")
    remark = Column(Text, comment="备注")
    raw_data = Column(Text, comment="导入时的额外列数据JSON")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

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
    debit_amount = Column(Float, default=0.0, comment="借方金额")
    credit_amount = Column(Float, default=0.0, comment="贷方金额")
    balance = Column(Float, default=0.0, comment="余额")
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
    amount = Column(Float, default=0.0, comment="交易金额（旧：收入为正/支出为负）")
    transaction_type = Column(String(20), default="支出", comment="类型（旧）")
    payment_method = Column(String(30), comment="结算方式（旧）")
    reference_no = Column(String(50), comment="银行流水号（旧）")
    raw_data = Column(Text, comment="原始数据JSON（旧）")
    journal_voucher_no = Column(String(30), comment="关联序时账凭证号")
    remark = Column(Text, comment="备注（旧）")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


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
    amount = Column(Float, default=0.0, comment="金额（不含税）")
    tax_amount = Column(Float, default=0.0, comment="税额")
    deductible_tax_amount = Column(Float, default=0.0, comment="有效抵扣税额")
    # 票种信息
    invoice_category = Column(String(50), comment="票种，如：数电发票（增值税专用发票）")
    invoice_category_label = Column(String(30), comment="票种标签")
    invoice_status = Column(String(20), default="正常", comment="发票状态：正常/作废/红冲")
    # 勾选与风险
    check_time = Column(DateTime, comment="勾选时间")
    risk_level = Column(String(20), default="正常", comment="发票风险等级：正常/疑点/异常/失控")
    # 保留字段（历史兼容）
    goods_name = Column(String(200), comment="货物名称")
    total_amount = Column(Float, default=0.0, comment="价税合计")
    tax_rate = Column(Float, default=0.0, comment="税率（%）")
    deducted_tax_amount = Column(Float, default=0.0, comment="已抵扣税额")
    deduction_period = Column(String(7), comment="抵扣所属期 YYYY-MM")
    deduction_status = Column(String(20), default="待抵扣", comment="抵扣状态：待认证/待抵扣/已抵扣/部分抵扣/不得抵扣")
    certification_date = Column(Date, comment="认证日期")
    deduction_date = Column(Date, comment="抵扣日期")
    deduction_method = Column(String(30), default="凭票抵扣", comment="抵扣方式：凭票抵扣/计算抵扣/核定抵扣")
    voucher_no = Column(String(30), comment="关联凭证号")
    remark = Column(Text, comment="备注")
    raw_data = Column(Text, comment="导入时的额外列数据JSON")
    import_batch_id = Column(String(36), comment="导入批次ID，同一次导入共享")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


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
    debit_amount = Column(Float, default=0.0, comment="借方金额")
    credit_amount = Column(Float, default=0.0, comment="贷方金额")
    prepared_by = Column(String(50), comment="制单人")
    reviewed_by = Column(String(50), comment="复核人")
    is_reviewed = Column(Boolean, default=False, comment="是否复核")
    reviewed_at = Column(DateTime, comment="复核时间")
    remark = Column(Text, comment="备注")
    contact_project = Column(String(100), comment="往来项目")
    spec_model = Column(String(100), comment="规格型号")
    quantity = Column(Float, default=0.0, comment="数量")
    unit = Column(String(20), comment="单位")
    unit_price = Column(Float, default=0.0, comment="单价")
    source = Column(String(50), default="手动录入", comment="凭证来源：手动录入/开具发票/进项抵扣/银行流水")
    ref_id = Column(Integer, comment="关联业务ID（开具发票=SalesInvoice.id, 进项抵扣=InputVATDeduction.id）")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


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

    # ── 2. 如果没有公司，将旧 company_info 数据迁移到 companies ──
    if db.query(Company).count() == 0:
        # 检查旧 company_info 表是否有数据
        if "company_info" in inspector.get_table_names():
            try:
                old = db.execute(TextClause("SELECT * FROM company_info LIMIT 1")).fetchone()
                if old:
                    keys = [c for c in old._mapping.keys()]
                    vals = [old._mapping[k] for k in keys]
                    placeholders = ", ".join([f":{k}" for k in keys])
                    cols = ", ".join(keys)
                    params = {k: old._mapping[k] for k in keys}
                    # 映射 company_name → name
                    if "company_name" in params:
                        params["name"] = params.pop("company_name")
                    # 去掉 id 让数据库自增
                    cols_no_id = ", ".join([k for k in keys if k != "id"])
                    placeholders_no_id = ", ".join([f":{k}" for k in keys if k != "id"])
                    params_no_id = {k: v for k, v in params.items() if k != "id"}
                    if "name" not in params_no_id:
                        params_no_id["name"] = "默认公司"
                    db.execute(TextClause(
                        f"INSERT INTO companies ({cols_no_id}) VALUES ({placeholders_no_id})"
                    ), params_no_id)
                    db.commit()
                    print("已从 company_info 迁移数据到 companies 表")
            except Exception as e:
                db.rollback()
                print(f"迁移 company_info → companies 失败: {e}")

    # ── 3. 给所有表增加 company_id 列 ──
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

    # ── 7. 销售发票字段扩展（数电发票、销方、风险等级等） ──
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

    # ── 12.5. 已有公司补充 待认证进项税额 科目（222101） ──
    if "accounts" in inspector.get_table_names():
        companies = db.query(Company).order_by(Company.id).all()
        for comp in companies:
            existing = db.query(Account).filter(
                Account.company_id == comp.id,
                Account.code == "222101"
            ).first()
            if not existing:
                try:
                    db.add(Account(
                        company_id=comp.id,
                        code="222101", name="待认证进项税额",
                        category="负债", balance_direction="贷",
                        level=2, parent_code="2210"
                    ))
                    db.commit()
                    print(f"  [OK] 为 {comp.name} 添加科目 222101 待认证进项税额")
                except Exception as e:
                    db.rollback()
                    print(f"  [X] 222101 待认证进项税额 迁移失败: {e}")


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


def auto_generate_journals(db):
    """为所有"正常"状态的开具发票自动生成记账凭证（未生成过的）"""
    companies = db.query(Company).order_by(Company.id).all()
    total = 0
    for comp in companies:
        invoices = db.query(SalesInvoice).filter(
            SalesInvoice.company_id == comp.id
        ).order_by(SalesInvoice.invoice_date.asc()).all()

        for inv in invoices:
            buyer = inv.buyer_name or "客户"
            goods = inv.goods_name or ""
            summary = f"销售{goods or '货物'}给{buyer}"

            def get_full_name(code):
                """构建科目的全级次名称"""
                parts = []
                cur = code
                while cur:
                    acc = db.query(Account).filter(
                        Account.company_id == comp.id,
                        Account.code == cur
                    ).first()
                    if not acc:
                        break
                    parts.insert(0, acc.name)
                    cur = acc.parent_code
                return "/".join(parts) if parts else code

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
                next_num = int(max_sub[0][4:]) + 1 if (max_sub and max_sub[0]) else 1
                new_code = f"6001{next_num:03d}"
                new_acc = Account(
                    company_id=comp.id, code=new_code, name=gn,
                    category="收入", balance_direction="贷",
                    level=2, parent_code="6001",
                )
                db.add(new_acc)
                db.flush()
                return (new_code, get_full_name(new_code))

            period = inv.invoice_date.strftime("%Y-%m") if inv.invoice_date else datetime.now().strftime("%Y-%m")
            date_str = inv.invoice_date.strftime("%Y-%m-%d") if inv.invoice_date else period + "-01"

            # 计算下一个凭证号
            max_no = db.query(JournalEntry.voucher_no).filter(
                JournalEntry.company_id == comp.id,
                JournalEntry.period == period,
                JournalEntry.voucher_word == "记"
            ).order_by(JournalEntry.voucher_no.desc()).first()
            next_voucher_no = (max_no[0] + 1) if max_no and max_no[0] else 1

            rev_code, rev_name = ensure_revenue_sub(goods)

            entries = [
                JournalEntry(
                    company_id=comp.id,
                    entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                    period=period, voucher_word="记", voucher_no=next_voucher_no,
                    summary=summary, account_code="1122",
                    account_name=get_full_name("1122"),
                    debit_amount=inv.total_amount, credit_amount=0,
                    contact_project=buyer,
                    spec_model=inv.spec or "", quantity=inv.quantity or 0,
                    unit=inv.unit or "", unit_price=inv.unit_price or 0,
                    source="开具发票", ref_id=inv.id,
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
                    source="开具发票", ref_id=inv.id,
                ),
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
                    source="开具发票", ref_id=inv.id,
                ),
            ]
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
        JournalEntry.source == "开具发票",
        JournalEntry.ref_id == inv.id
    ).first()
    if existing:
        return

    def get_full_name(code):
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
        next_num = int(max_sub[0][4:]) + 1 if (max_sub and max_sub[0]) else 1
        new_code = f"6001{next_num:03d}"
        new_acc = Account(
            company_id=inv.company_id, code=new_code, name=gn,
            category="收入", balance_direction="贷",
            level=2, parent_code="6001",
        )
        db.add(new_acc)
        db.flush()
        return (new_code, get_full_name(new_code))

    period = inv.invoice_date.strftime("%Y-%m") if inv.invoice_date else datetime.now().strftime("%Y-%m")
    date_str = inv.invoice_date.strftime("%Y-%m-%d") if inv.invoice_date else period + "-01"

    max_no = db.query(JournalEntry.voucher_no).filter(
        JournalEntry.company_id == inv.company_id,
        JournalEntry.period == period,
        JournalEntry.voucher_word == "记"
    ).order_by(JournalEntry.voucher_no.desc()).first()
    next_voucher_no = (max_no[0] + 1) if max_no and max_no[0] else 1

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
            source="开具发票", ref_id=inv.id,
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
            source="开具发票", ref_id=inv.id,
        ),
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
            source="开具发票", ref_id=inv.id,
        ),
    ]
    for e in entries:
        db.add(e)
    db.commit()


def auto_generate_input_vat_for_period(db, company_id, period, total_tax=None):
    """为一个期间的进项抵扣汇总生成凭证（每月一笔认证汇总凭证）
    借：221001002 进项税额 = 贷：222101 待认证进项税额
    
    如果 total_tax 为 None，自动从数据库汇总（优先用 deduction_period，为空则用 invoice_date 年月）
    """

    # 删除该期间已有的进项抵扣凭证
    db.query(JournalEntry).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period == period,
        JournalEntry.source == "进项抵扣"
    ).delete()
    db.flush()

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

    def get_full_name(code):
        parts = []
        cur = code
        while cur:
            acc = db.query(Account).filter(
                Account.company_id == company_id,
                Account.code == cur
            ).first()
            if not acc:
                break
            parts.insert(0, acc.name)
            cur = acc.parent_code
        return "/".join(parts) if parts else code

    # 确保 221001002 进项税额 科目存在
    if not db.query(Account).filter(Account.company_id == company_id, Account.code == "221001002").first():
        db.add(Account(
            company_id=company_id, code="221001002", name="进项税额",
            category="负债", balance_direction="借", level=3, parent_code="221001",
        ))
        db.flush()

    # 确保 222101 待认证进项税额 科目存在
    if not db.query(Account).filter(Account.company_id == company_id, Account.code == "222101").first():
        db.add(Account(
            company_id=company_id, code="222101", name="待认证进项税额",
            category="负债", balance_direction="贷", level=2, parent_code="2210",
        ))
        db.flush()

    # 凭证号取 period 最大号+1
    entry_date = datetime.strptime(period + "-01", "%Y-%m-%d").date()
    max_no = db.query(JournalEntry.voucher_no).filter(
        JournalEntry.company_id == company_id,
        JournalEntry.period == period,
        JournalEntry.voucher_word == "记"
    ).order_by(JournalEntry.voucher_no.desc()).first()
    next_voucher_no = (max_no[0] + 1) if max_no and max_no[0] else 1

    summary = f"{period}月进项认证汇总"
    tax_name = get_full_name("221001002")
    pending_name = get_full_name("222101")

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
            summary=summary, account_code="222101", account_name=pending_name,
            debit_amount=0, credit_amount=total_tax,
            contact_project="", source="进项抵扣",
        ),
    ]
    for e in entries:
        db.add(e)
    db.commit()

    return 1  # 返回生成的凭证数（1号 = 2条分录）


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


def _generate_bank_journals(db: Session, company_id: int, tx_ids: Optional[List[int]] = None):
    """为银行流水批量生成双分录记账凭证（借贷必相等）。
    收款：借 1002 银行存款 / 贷 1122应收账款(匹配客户)或2241其他应付款(未匹配)
    付款：借 2202应付账款(匹配客户)或1221其他应收款(未匹配) / 贷 1002 银行存款
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
    def _ensure_account(code, name, category, direction):
        if not db.query(Account).filter(Account.company_id == company_id, Account.code == code).first():
            db.add(Account(
                company_id=company_id, code=code, name=name,
                category=category, balance_direction=direction, level=1, parent_code="1",
            ))
            db.flush()

    _ensure_account("1002", "银行存款", "资产", "借")
    _ensure_account("1122", "应收账款", "资产", "借")
    _ensure_account("2202", "应付账款", "负债", "贷")
    _ensure_account("1221", "其他应收款", "资产", "借")
    _ensure_account("2241", "其他应付款", "负债", "贷")

    for tx in txs:
        try:
            cp = tx.counterparty_name or tx.summary or "银行流水"
            summary_tag = f"银行流水-#{tx.id}-{cp}"
            period = tx.transaction_date.strftime("%Y-%m") if tx.transaction_date else datetime.now().strftime("%Y-%m")
            max_no = db.query(JournalEntry.voucher_no).filter(
                JournalEntry.company_id == company_id,
                JournalEntry.period == period,
                JournalEntry.voucher_word == "记"
            ).order_by(JournalEntry.voucher_no.desc()).first()
            next_voucher_no = (max_no[0] + 1) if max_no and max_no[0] else 1
            date_str = tx.transaction_date.strftime("%Y-%m-%d") if tx.transaction_date else period + "-01"

            is_debit = tx.debit_amount and tx.debit_amount > 0
            amount = (tx.debit_amount or 0) if is_debit else (tx.credit_amount or 0)

            # 匹配客户档案（标准化名称 + 银行账号两级匹配）
            matched_customer = _match_customer(db, company_id, tx.counterparty_name, tx.counterparty_account)

            if is_debit:
                # 付款：借 应付账款/其他应收款  贷 银行存款
                cp_code, cp_name = ("2202", "应付账款") if matched_customer else ("1221", "其他应收款")
                entry1 = JournalEntry(
                    company_id=company_id, entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                    period=period, voucher_word="记", voucher_no=next_voucher_no,
                    summary=summary_tag, account_code=cp_code, account_name=cp_name,
                    debit_amount=amount, credit_amount=0, contact_project=cp, source="银行流水",
                )
                entry2 = JournalEntry(
                    company_id=company_id, entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                    period=period, voucher_word="记", voucher_no=next_voucher_no,
                    summary=summary_tag, account_code="1002", account_name="银行存款",
                    debit_amount=0, credit_amount=amount, contact_project=cp, source="银行流水",
                )
            else:
                # 收款：借 银行存款  贷 应收账款/其他应付款
                cp_code, cp_name = ("1122", "应收账款") if matched_customer else ("2241", "其他应付款")
                entry1 = JournalEntry(
                    company_id=company_id, entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                    period=period, voucher_word="记", voucher_no=next_voucher_no,
                    summary=summary_tag, account_code="1002", account_name="银行存款",
                    debit_amount=amount, credit_amount=0, contact_project=cp, source="银行流水",
                )
                entry2 = JournalEntry(
                    company_id=company_id, entry_date=datetime.strptime(date_str, "%Y-%m-%d").date(),
                    period=period, voucher_word="记", voucher_no=next_voucher_no,
                    summary=summary_tag, account_code=cp_code, account_name=cp_name,
                    debit_amount=0, credit_amount=amount, contact_project=cp, source="银行流水",
                )
            db.add(entry1)
            db.add(entry2)
            voucher_str = f"记-{next_voucher_no}"
            tx.journal_voucher_no = voucher_str
            db.flush()
            generated += 1
        except Exception as ex:
            errors.append(f"流水#{tx.id}: {str(ex)}")
            skipped += 1
    return {"generated": generated, "skipped": skipped, "infos": infos, "errors": errors}




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
    city_maintenance_tax = Column(Float, default=0.0)
    education_surcharge = Column(Float, default=0.0)
    local_education_surcharge = Column(Float, default=0.0)
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

    company = relationship("Company", backref="vat_declarations")


# 基础科目数据模板（中小制造业标准科目表）
ACCOUNTS_TEMPLATE = [
    ("1001", "库存现金", "资产", "借", 1),
    ("1002", "银行存款", "资产", "借", 1),
    ("1122", "应收账款", "资产", "借", 1),
    ("1123", "预收账款", "负债", "贷", 1),
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
    ("2203", "预付账款", "资产", "借", 1),
    ("2221", "其他应付款", "负债", "贷", 1),
    ("2241", "递延收益", "负债", "贷", 1),
    ("2501", "长期借款", "负债", "贷", 1),
    ("2210", "应交税费", "负债", "贷", 1),
    ("221001", "应交增值税", "负债", "贷", 2, "2210"),
    ("221001001", "销项税额", "负债", "贷", 3, "221001"),
    ("221001002", "进项税额", "负债", "借", 3, "221001"),
    ("222101", "待认证进项税额", "负债", "贷", 2, "2210"),
    ("221002", "应交企业所得税", "负债", "贷", 2, "2210"),
    ("221003", "应交个人所得税", "负债", "贷", 2, "2210"),
    ("2211", "应付职工薪酬", "负债", "贷", 1),
    ("221101", "工资", "负债", "贷", 2, "2211"),
    ("221102", "社会保险费", "负债", "贷", 2, "2211"),
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
    ("6401", "主营业务成本", "费用", "借", 1),
    ("6402", "其他业务成本", "费用", "借", 1),
    ("6403", "税金及附加", "费用", "借", 1),
    ("6601", "销售费用", "费用", "借", 1),
    ("6602", "管理费用", "费用", "借", 1),
    ("660201", "办公费", "费用", "借", 2, "6602"),
    ("660202", "差旅费", "费用", "借", 2, "6602"),
    ("660203", "折旧费", "费用", "借", 2, "6602"),
    ("660204", "工资", "费用", "借", 2, "6602"),
    ("660205", "社保费", "费用", "借", 2, "6602"),
    ("6603", "财务费用", "费用", "借", 1),
    ("660301", "利息支出", "费用", "借", 2, "6603"),
    ("660302", "手续费", "费用", "借", 2, "6603"),
    ("6711", "营业外支出", "费用", "借", 1),
    ("6801", "所得税费用", "费用", "借", 1),
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
    employee_name = Column(String(100), nullable=False)       # 姓名
    id_type = Column(String(50), default="居民身份证")          # 证件类型
    id_number = Column(String(50), index=True)                 # 证件号码

    # 税款所属期
    tax_period_start = Column(String(20))  # 税款所属期起，如 2025-10-01
    tax_period_end = Column(String(20))    # 税款所属期止，如 2025-10-31
    income_type = Column(String(50), default="正常工资薪金")  # 所得项目

    # 本期扣除
    current_income = Column(Float, default=0.0)       # 本期收入
    tax_free_income = Column(Float, default=0.0)       # 免税收入
    basic_deduction = Column(Float, default=5000.0)    # 基本减除费用

    # 专项扣除（本月）
    pension_insurance = Column(Float, default=0.0)      # 基本养老保险
    medical_insurance = Column(Float, default=0.0)     # 基本医疗保险
    unemployment_insurance = Column(Float, default=0.0) # 失业保险
    housing_fund = Column(Float, default=0.0)           # 住房公积金
    enterprise_annuity = Column(Float, default=0.0)    # 企业年金
    commercial_health = Column(Float, default=0.0)     # 商业健康保险
    tax_deferred_pension = Column(Float, default=0.0)  # 税延养老保险
    other_special_deduction = Column(Float, default=0.0) # 其他专项扣除

    # 专项附加扣除（本月）
    child_education = Column(Float, default=0.0)        # 子女教育
    continuing_education = Column(Float, default=0.0)   # 继续教育
    housing_loan_interest = Column(Float, default=0.0)  # 住房贷款利息
    housing_rent = Column(Float, default=0.0)            # 住房租金
    elderly_support = Column(Float, default=0.0)        # 赡养老人
    infant_care = Column(Float, default=0.0)            # 3岁以下婴幼儿照护
    major_medical = Column(Float, default=0.0)           # 大病医疗
    other_additional_deduction = Column(Float, default=0.0) # 其他附加扣除

    # 累计数据
    cumulative_income = Column(Float, default=0.0)           # 累计收入额
    cumulative_tax_free = Column(Float, default=0.0)         # 累计免税收入
    cumulative_deduction = Column(Float, default=0.0)        # 累计减除费用
    cumulative_special = Column(Float, default=0.0)          # 累计专项扣除
    cumulative_additional = Column(Float, default=0.0)       # 累计专项附加扣除
    cumulative_other = Column(Float, default=0.0)            # 累计其他扣除
    cumulative_tax_withheld = Column(Float, default=0.0)    # 累计已预扣预缴税额

    # 本期其他扣除
    other_deduction = Column(Float, default=0.0)             # 本期其他扣除

    # 税额计算
    taxable_income = Column(Float, default=0.0)      # 应纳税所得额
    tax_rate = Column(Float, default=0.0)            # 税率
    quick_deduction = Column(Float, default=0.0)     # 速算扣除数
    tax_payable = Column(Float, default=0.0)         # 累计应预扣预缴税额
    tax_already_withheld = Column(Float, default=0.0) # 本期已预扣预缴税额
    tax_to_pay = Column(Float, default=0.0)          # 本期应预扣预缴税额（实际应缴）
    tax_refund = Column(Float, default=0.0)          # 应补(退)税额

    # 实发工资
    net_salary = Column(Float, default=0.0)           # 实发工资

    # 原始行数据（JSON，保留导入时的完整列）
    raw_data = Column(Text)  # JSON string，存储Excel原始行

    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    __table_args__ = (
        Index('idx_salary_company_period', 'company_id', 'period'),
    )
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

        # 为每家公司创建演示发票数据（仅在无发票时）
        for company in companies:
            try:
                if db.query(SalesInvoice).filter(SalesInvoice.company_id == company.id).count() == 0:
                    today = date.today()
                    demo_invoices = [
                        SalesInvoice(company_id=company.id, invoice_no=f"DEMO-{company.id}001",
                            invoice_date=today, buyer_name="演示客户A", goods_name="咨询服务",
                            amount=50000.0, tax_amount=3000.0, total_amount=53000.0,
                            tax_rate=6, status="正常", invoice_category="增值税专用发票", is_positive=True),
                        SalesInvoice(company_id=company.id, invoice_no=f"DEMO-{company.id}002",
                            invoice_date=today, buyer_name="演示客户B", goods_name="软件产品",
                            amount=100000.0, tax_amount=13000.0, total_amount=113000.0,
                            tax_rate=13, status="正常", invoice_category="增值税专用发票", is_positive=True),
                        SalesInvoice(company_id=company.id, invoice_no=f"DEMO-{company.id}003",
                            invoice_date=today, buyer_name="演示客户C", goods_name="设备租赁",
                            amount=20000.0, tax_amount=2600.0, total_amount=22600.0,
                            tax_rate=13, status="正常", invoice_category="增值税普通发票", is_positive=True),
                    ]
                    for inv in demo_invoices:
                        db.add(inv)
                    db.flush()
                    # 自动生成凭证
                    for inv in demo_invoices:
                        try:
                            auto_generate_single_invoice(db, inv)
                        except Exception as e:
                            print(f"[init_db] 警告：演示发票凭证生成失败: {e}")
                    print(f"[init_db] 公司{company.id}: 创建 {len(demo_invoices)} 张演示发票")

                if db.query(PurchaseInvoice).filter(PurchaseInvoice.company_id == company.id).count() == 0:
                    today = date.today()
                    demo_purchases = [
                        PurchaseInvoice(company_id=company.id, invoice_no=f"PUR-{company.id}001",
                            invoice_date=today, seller_name="供应商A", goods_name="办公用品",
                            amount=5000.0, tax_amount=650.0, total_amount=5650.0,
                            tax_rate=13, status="已认证"),
                    ]
                    for inv in demo_purchases:
                        db.add(inv)
                    print(f"[init_db] 公司{company.id}: 创建 {len(demo_purchases)} 张演示进项发票")
            except Exception as e:
                print(f"[init_db] 警告：公司{company.id} 演示数据创建失败: {e}")

        db.commit()
        print(f"数据库初始化完成（{len(companies)} 家公司）")
    except Exception as e:
        db.rollback()
        print(f"初始化错误: {e}")
        raise  # 重新抛出，让调用方知道初始化失败
    finally:
        db.close()
