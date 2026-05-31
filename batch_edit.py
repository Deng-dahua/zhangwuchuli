#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Batch edit main.py: add company_id filtering to all query patterns."""
import sys

FILEPATH = r'C:\Users\26726\WorkBuddy\2026-05-31-09-56-37\zhangwuchuli\main.py'

with open(FILEPATH, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Read {len(content)} chars")

# Count occurrences
for name in ['CompanyInfo', 'department_code', 'departments_code']:
    c = content.count(name)
    if c > 0:
        print(f"  '{name}' found {c} times")

# Replacements - order matters
reps = [
    # CompanyInfo references (still present in old code)
    ('CompanyInfoUpdate', 'CompanyUpdate'),
    ('CompanyInfo(', 'Company('),
    ('CompanyInfo.', 'Company.'),
    ('CompanyInfo ', 'Company '),
    ('db.query(Company)', 'db.query(Company)'),  # skip for Company

    # Add company_id filter to q = db.query(Model)
    ('q = db.query(Department)', 'q = db.query(Department).filter(Department.company_id == company_id)'),
    ('q = db.query(Employee)', 'q = db.query(Employee).filter(Employee.company_id == company_id)'),
    ('q = db.query(Customer)', 'q = db.query(Customer).filter(Customer.company_id == company_id)'),
    ('q = db.query(Supplier)', 'q = db.query(Supplier).filter(Supplier.company_id == company_id)'),
    ('q = db.query(Account)', 'q = db.query(Account).filter(Account.company_id == company_id)'),
    ('q = db.query(Voucher)', 'q = db.query(Voucher).filter(Voucher.company_id == company_id)'),
    ('q = db.query(Period)', 'q = db.query(Period).filter(Period.company_id == company_id)'),

    # direct db.query(Model).filter(...) patterns
    ('db.query(Department).filter(Department.', 'db.query(Department).filter(Department.company_id == company_id, Department.'),
    ('db.query(Employee).filter(or_', 'db.query(Employee).filter(Employee.company_id == company_id, or_'),
    ('db.query(Employee).filter(Employee.', 'db.query(Employee).filter(Employee.company_id == company_id, Employee.'),
    ('db.query(Customer).filter(or_', 'db.query(Customer).filter(Customer.company_id == company_id, or_'),
    ('db.query(Customer).filter(Customer.', 'db.query(Customer).filter(Customer.company_id == company_id, Customer.'),
    ('db.query(Supplier).filter(or_', 'db.query(Supplier).filter(Supplier.company_id == company_id, or_'),
    ('db.query(Supplier).filter(Supplier.', 'db.query(Supplier).filter(Supplier.company_id == company_id, Supplier.'),
    ('db.query(Account).filter(or_', 'db.query(Account).filter(Account.company_id == company_id, or_'),
    ('db.query(Account).filter(Account.', 'db.query(Account).filter(Account.company_id == company_id, Account.'),

    # Model.code lookups need company_id
    ('filter(Department.code == data.code)', 'filter(Department.company_id == company_id, Department.code == data.code)'),
    ('filter(Employee.code == data.code)', 'filter(Employee.company_id == company_id, Employee.code == data.code)'),
    ('filter(Customer.code == data.code)', 'filter(Customer.company_id == company_id, Customer.code == data.code)'),
    ('filter(Supplier.code == data.code)', 'filter(Supplier.company_id == company_id, Supplier.code == data.code)'),
    ('filter(Account.code == code)', 'filter(Account.company_id == company_id, Account.code == code)'),
    ('filter(Account.code ==', 'filter(Account.company_id == company_id, Account.code =='),

    # get_company and update_company
    ('info = db.query(Company).first()', 'info = db.query(Company).filter(Company.id == company_id).first()'),
    ("info = Company(company_name=data.company_name or \"\")", "info = Company(id=company_id, name=data.company_name or \"\")"),
    ('info = db.query(Company).filter(Company.', 'info = db.query(Company).filter(Company.'),

    # Fix: double filter for Voucher
    ('.filter(Voucher.company_id == company_id, Voucher.company_id == company_id',
     '.filter(Voucher.company_id == company_id'),

    # VoucherDetail queries through Voucher join
    # These are in ledger/report queries - add Voucher.company_id filter
    ('.join(Voucher, VoucherDetail.voucher_id == Voucher.id) ',
     '.join(Voucher, VoucherDetail.voucher_id == Voucher.id) \\\n     .filter(Voucher.company_id == company_id) \\'),
    ('join(Voucher, VoucherDetail.voucher_id == Voucher.id) \\',
     'join(Voucher, VoucherDetail.voucher_id == Voucher.id) \\\n         .filter(Voucher.company_id == company_id) \\'),
]

for old, new in reps:
    if old in content:
        n = content.count(old)
        content = content.replace(old, new)
        if n <= 3:
            print(f"  OK: '{old[:60]}' x{n}")
        else:
            print(f"  OK: '{old[:60]}' x{n} occurrences")

# Clean up: ensure no double Voucher filter on general ledger
content = content.replace(
    '.filter(Voucher.company_id == company_id) \n     .filter(Voucher.company_id == company_id)',
    '.filter(Voucher.company_id == company_id)'
)

with open(FILEPATH, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\nWrote {len(content)} chars back to main.py")
print("BATCH EDIT COMPLETE")
