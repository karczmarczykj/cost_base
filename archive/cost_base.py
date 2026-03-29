import argparse
import xlrd
from fifo_transaction_engine import fifo_transaction_engine
from enum import IntEnum
from fractions import Fraction
from tabulate import tabulate

class Field(IntEnum):
    lp = 0,
    date = 1,
    operation = 2,
    number = 3,
    payment = 4,
    fund_name = 5,
    register = 6,
    units = 7,
    commision = 8,
    dst_fund_name = 9,
    dst_register = 10,
    dst_units = 11,
    currency_converion_rate = 12
    tax_gain = 13

def fifo_fund_buy_transaction(engine, row):
    fund_name = row[Field.fund_name].strip()
    register = row[Field.register].strip()
    payment = Fraction(repr(row[Field.payment]))
    units = Fraction(repr(row[Field.units]))
    currency_conversion_rate = Fraction(repr(row[Field.currency_converion_rate]))
    fee = Fraction(repr(row[Field.commision]))
    transaction_number = row[Field.number].strip()

    engine.add_payment(fund_name, register, payment, fee, units, currency_conversion_rate, transaction_number)

def fifo_fund_conversion_transaction(engine, row):
    src_fund_name = row[Field.fund_name].strip()
    src_register = row[Field.register].strip()
    src_units = Fraction(repr(row[Field.units]))
    dst_fund_name = row[Field.dst_fund_name].strip()
    dst_register = row[Field.dst_register].strip()
    dst_units = Fraction(repr(row[Field.dst_units]))
    fee = Fraction(repr(row[Field.commision]))
    transaction_number = row[Field.number].strip()
    currency_conversion_rate = Fraction(repr(row[Field.currency_converion_rate]))

    engine.add_conversion(src_fund_name, src_register, src_units, dst_fund_name, dst_register, dst_units, fee, currency_conversion_rate, transaction_number)

def fifo_fund_sell_transaction(engine, row):
    fund_name = row[Field.fund_name].strip()
    register = row[Field.register].strip()
    payment = Fraction(repr(row[Field.payment]))
    units = Fraction(repr(row[Field.units]))
    fee = Fraction(repr(row[Field.commision]))
    transaction_number = row[Field.number].strip()
    currency_conversion_rate = Fraction(repr(row[Field.currency_converion_rate]))

    engine.add_withdrawal(fund_name, register, payment, fee, units, currency_conversion_rate, transaction_number)

def calculate_fifo_fund_tax(sheet, render_file : str):
    engine = fifo_transaction_engine()
    for i in range(3, sheet.nrows):
        row_values = sheet.row_values(i)
        transaction_type = row_values[Field.operation]
        if transaction_type == 'Buy':
            fifo_fund_buy_transaction(engine, row_values)
        elif transaction_type == 'Conversion':
            fifo_fund_conversion_transaction(engine, row_values)
        elif transaction_type == 'Sell':
            fifo_fund_sell_transaction(engine, row_values)
        else:
            raise ValueError(f'Undefined transaction type {transaction_type}')

    closed_transactions = engine.closed_transactions
    print(f'Closed transactions:')
    headers = ['Fund', 'Register', 'Transaction', 'Cost PLN', 'Cost USD', 'Payment USD', 'Payment PLN', 'Units']
    entries = []
    for (key, value) in closed_transactions.items():
        list_values = []
        for item in key:
            list_values.append(f'{item}')
        for item in value:
            list_values.append(f'{float(item):,.2f}')
        entries.append(list_values)
    print(tabulate(entries, headers))
    remaining_units = engine.remaining_funds
    print(f'\nRemaining funds:')
    headers = ['Fund', 'Register', 'Cost PLN', 'Cost USD', 'Units']
    entries = []
    for (key, value) in remaining_units.items():
        list_values = [f'{key[0]}', f'{key[1]}']
        for item in value:
            list_values.append(f'{float(item):,.2f}')
        entries.append(list_values)
    print(tabulate(entries, headers))
    if not render_file is None:
        engine.generate_diagram(render_file)

def calculate_tax(spreadsheet_file : str, render_file):
    workbook = xlrd.open_workbook(spreadsheet_file)
    for sheet_name in workbook.sheet_names():
        calculate_fifo_fund_tax(workbook.sheet_by_name(sheet_name), render_file)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description = 'Calculate tax gain based on transaction set')
    parser.add_argument('spreadsheet', help='Spreadsheet with transaction record .xlsx', nargs=1)
    parser.add_argument('--render',  help='Render diagram .png file',nargs='?')
    options = parser.parse_args()
    if options is not None:
        calculate_tax(options.spreadsheet[0], options.render)