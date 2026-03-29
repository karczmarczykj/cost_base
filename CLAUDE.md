# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FIFO cost base calculation engine for investment fund transactions. Calculates tax gains/losses using the FIFO (First In, First Out) method for fund buy/sell/conversion operations. Handles multi-currency transactions with PLN/USD conversion rates.

## Running Tests

```bash
python -m pytest test_payment.py test_transaction_engine.py
# Single test:
python -m pytest test_transaction_engine.py::TestTransaction_engine::test_simple_two_transactions_full_withdrawal_surplus
```

## Running the Tool

```bash
python cost_base.py <spreadsheet.xlsx> [--render output.png]
```

Input is an `.xlsx` file (see `template.xlsx`) with columns: lp, date, operation (Buy/Conversion/Sell), number, payment, fund_name, register, units, commission, dst_fund_name, dst_register, dst_units, currency_conversion_rate, tax_gain.

## Architecture

- **`payment.py`** — `payment_unit` class: represents a single unit of investment. Tracks cost basis, currency conversion rate, supports splitting via `__mul__`, conversion between funds, and closing (selling). All monetary values use `fractions.Fraction` for exact arithmetic.

- **`fifo_transaction_engine.py`** — `fifo_transaction_engine` class: core FIFO engine. Maintains a `deque` of `payment_unit` per (fund_name, register) pair. On withdrawal/conversion, pops units from the front (FIFO). Splits units when a withdrawal doesn't consume a full payment unit. Also builds a Graphviz diagram of transaction flows.

- **`cost_base.py`** — CLI entry point. Reads `.xlsx` via `xlrd`, dispatches rows to engine methods based on operation type, prints results using `tabulate`.

## Key Design Decisions

- All monetary arithmetic uses `fractions.Fraction` (not `float`) to avoid rounding errors. Values are converted via `Fraction(repr(float_value))`.
- The engine uses `collections.deque` per fund/register pair for O(1) FIFO popleft.
- `payment_unit.__mul__` mutates in place (returns `self`), so `copy.deepcopy` is used before splitting.
- Diagram generation uses `graphviz.Digraph` with edges tracked in a set to avoid duplicates.

## Dependencies

`xlrd`, `tabulate`, `graphviz` (Python packages). Graphviz system package needed for diagram rendering.
