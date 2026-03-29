import { describe, it, expect } from 'vitest';
import Fraction from 'fraction.js';
import { FifoEngine } from '../engine/fifo-engine';
import type { ClosedUnitEntry, RemainingUnitEntry } from '../engine/types';

/**
 * Port of test_transaction_engine.py - TestTransaction_engine class.
 */

function checkClosedUnit(
  closedUnit: ClosedUnitEntry,
  fundName: string,
  register: string,
  transaction: string,
  units: Fraction,
  expectedCostUsd: Fraction,
  currencyConversionIn: Fraction,
  payment: Fraction,
  currencyConversionOut: Fraction,
): void {
  expect(closedUnit.key.fundName).toBe(fundName);
  expect(closedUnit.key.register).toBe(register);
  expect(closedUnit.key.transaction).toBe(transaction);

  expect(closedUnit.value.costUsd.equals(expectedCostUsd)).toBe(true);

  const expectedCostPln = expectedCostUsd.mul(currencyConversionIn);
  expect(closedUnit.value.costPln.equals(expectedCostPln)).toBe(true);

  expect(closedUnit.value.units.equals(units)).toBe(true);
  expect(closedUnit.value.paymentUsd.equals(payment)).toBe(true);

  const expectedPaymentPln = payment.mul(currencyConversionOut);
  expect(closedUnit.value.paymentPln.equals(expectedPaymentPln)).toBe(true);
}

function checkRemainingUnit(
  remainingUnit: RemainingUnitEntry,
  fundName: string,
  register: string,
  expectedCostUsd: Fraction,
  currencyConversionIn: Fraction,
  expectedUnits: Fraction,
): void {
  expect(remainingUnit.key.fundName).toBe(fundName);
  expect(remainingUnit.key.register).toBe(register);
  expect(remainingUnit.value.costUsd.equals(expectedCostUsd)).toBe(true);

  const expectedCostPln = expectedCostUsd.mul(currencyConversionIn);
  expect(remainingUnit.value.costPln.equals(expectedCostPln)).toBe(true);
  expect(remainingUnit.value.units.equals(expectedUnits)).toBe(true);
}

describe('FifoEngine', () => {
  function twoTransactionTest(params?: {
    moneyPaidInUsd?: Fraction;
    unitsIn?: Fraction;
    feeInUsd?: Fraction;
    moneyPaidOutUsd?: Fraction;
    unitsOut?: Fraction;
    feeOutUsd?: Fraction;
    currencyConversionIn?: Fraction;
    currencyConversionOut?: Fraction;
  }) {
    const moneyPaidInUsd = params?.moneyPaidInUsd ?? new Fraction(102);
    const unitsIn = params?.unitsIn ?? new Fraction(10);
    const feeInUsd = params?.feeInUsd ?? new Fraction(102);
    const moneyPaidOutUsd = params?.moneyPaidOutUsd ?? new Fraction(118);
    const unitsOut = params?.unitsOut ?? new Fraction(10);
    const feeOutUsd = params?.feeOutUsd ?? new Fraction(2);
    const currencyConversionIn = params?.currencyConversionIn ?? new Fraction(1.2);
    const currencyConversionOut = params?.currencyConversionOut ?? new Fraction(1.5);

    const transactionIn = 'in';
    const transactionOut = 'out';
    const register = '1233516';
    const fundName = 'fund';

    const engine = new FifoEngine();
    engine.addPayment(fundName, register, moneyPaidInUsd, feeInUsd, unitsIn, currencyConversionIn, transactionIn);
    engine.addWithdrawal(fundName, register, moneyPaidOutUsd, feeOutUsd, unitsOut, currencyConversionOut, transactionOut);

    const closedUnits = engine.closedUnits;
    const remainingUnits = engine.remainingUnits;

    const expectedCostUsd = moneyPaidInUsd.mul(unitsOut).div(unitsIn);
    checkClosedUnit(
      closedUnits[0], fundName, register, transactionOut, unitsOut,
      expectedCostUsd, currencyConversionIn, moneyPaidOutUsd, currencyConversionOut,
    );

    if (unitsIn.equals(unitsOut)) {
      expect(remainingUnits.length).toBe(0);
    } else {
      expect(remainingUnits.length).toBe(1);
      checkRemainingUnit(
        remainingUnits[0], fundName, register,
        moneyPaidInUsd.mul(new Fraction(1).sub(unitsOut.div(unitsIn))),
        currencyConversionIn,
        unitsIn.sub(unitsOut),
      );
    }
  }

  it('simple two transactions - full withdrawal surplus', () => {
    twoTransactionTest();
  });

  it('simple two transactions - full withdrawal deficit', () => {
    twoTransactionTest({ moneyPaidOutUsd: new Fraction(50) });
  });

  it('simple two transactions - full withdrawal deficit because of commission', () => {
    twoTransactionTest({ moneyPaidOutUsd: new Fraction(100) });
  });

  it('simple two transactions - partial withdrawal', () => {
    twoTransactionTest({ unitsOut: new Fraction(8) });
  });

  function twoInOneOutTransactionTest(params?: {
    moneyPaidAUsd?: Fraction;
    unitsAIn?: Fraction;
    feeAInUsd?: Fraction;
    currencyConversionAIn?: Fraction;
    moneyPaidBUsd?: Fraction;
    unitsBIn?: Fraction;
    feeBInUsd?: Fraction;
    currencyConversionBIn?: Fraction;
    moneyPaidOutUsd?: Fraction;
    unitsOut?: Fraction;
    feeOutUsd?: Fraction;
    currencyConversionOut?: Fraction;
  }) {
    const moneyPaidAUsd = params?.moneyPaidAUsd ?? new Fraction(22);
    const unitsAIn = params?.unitsAIn ?? new Fraction(10);
    const feeAInUsd = params?.feeAInUsd ?? new Fraction(2);
    const currencyConversionAIn = params?.currencyConversionAIn ?? new Fraction(1.2);
    const moneyPaidBUsd = params?.moneyPaidBUsd ?? new Fraction(10.5);
    const unitsBIn = params?.unitsBIn ?? new Fraction(2.5);
    const feeBInUsd = params?.feeBInUsd ?? new Fraction(0.5);
    const currencyConversionBIn = params?.currencyConversionBIn ?? new Fraction(1.2);
    const moneyPaidOutUsd = params?.moneyPaidOutUsd ?? new Fraction(37.5);
    const unitsOut = params?.unitsOut ?? new Fraction(12.5);
    const feeOutUsd = params?.feeOutUsd ?? new Fraction(1);
    const currencyConversionOut = params?.currencyConversionOut ?? new Fraction(1);

    const transactionInA = 'in a';
    const transactionInB = 'in b';
    const transactionOut = 'out';
    const register = '1233516';
    const fundName = 'fund';

    const engine = new FifoEngine();
    engine.addPayment(fundName, register, moneyPaidAUsd, feeAInUsd, unitsAIn, currencyConversionAIn, transactionInA);
    engine.addPayment(fundName, register, moneyPaidBUsd, feeBInUsd, unitsBIn, currencyConversionBIn, transactionInB);
    engine.addWithdrawal(fundName, register, moneyPaidOutUsd, feeOutUsd, unitsOut, currencyConversionOut, transactionOut);

    const closedUnits = engine.closedUnits;
    const remainingUnits = engine.remainingUnits;

    if (unitsOut.compare(unitsAIn) <= 0) {
      // Withdrawal fits within first payment
      const costUsd = moneyPaidAUsd.mul(unitsOut).div(unitsAIn);
      checkClosedUnit(
        closedUnits[0], fundName, register, transactionOut, unitsOut,
        costUsd, currencyConversionAIn, moneyPaidOutUsd, currencyConversionOut,
      );

      if (unitsOut.compare(unitsAIn) < 0) {
        expect(remainingUnits.length).toBe(2);
        const costRemaining = moneyPaidAUsd.mul(new Fraction(1).sub(unitsOut.div(unitsAIn)));
        checkRemainingUnit(
          remainingUnits[0], fundName, register,
          costRemaining, currencyConversionAIn, unitsAIn.sub(unitsOut),
        );
        checkRemainingUnit(
          remainingUnits[1], fundName, register,
          moneyPaidBUsd, currencyConversionBIn, unitsBIn,
        );
      } else {
        expect(remainingUnits.length).toBe(1);
        checkRemainingUnit(
          remainingUnits[0], fundName, register,
          moneyPaidBUsd, currencyConversionBIn, unitsBIn,
        );
      }
    } else {
      // Withdrawal spans both payments
      expect(closedUnits.length).toBe(2);
      checkClosedUnit(
        closedUnits[0], fundName, register, transactionOut, unitsAIn,
        moneyPaidAUsd, currencyConversionAIn,
        moneyPaidOutUsd.mul(unitsAIn).div(unitsOut), currencyConversionOut,
      );

      const unitsFromB = unitsOut.sub(unitsAIn);
      checkClosedUnit(
        closedUnits[1], fundName, register, transactionOut, unitsFromB,
        moneyPaidBUsd.mul(unitsFromB).div(unitsBIn), currencyConversionBIn,
        moneyPaidOutUsd.mul(unitsFromB).div(unitsOut), currencyConversionOut,
      );

      const totalUnitsIn = unitsAIn.add(unitsBIn);
      if (unitsOut.equals(totalUnitsIn)) {
        expect(remainingUnits.length).toBe(0);
      } else {
        checkRemainingUnit(
          remainingUnits[0], fundName, register,
          moneyPaidBUsd.mul(new Fraction(1).sub(unitsFromB.div(unitsBIn))),
          currencyConversionBIn,
          totalUnitsIn.sub(unitsOut),
        );
      }
    }
  }

  it('two in one out - partial first paid cost', () => {
    twoInOneOutTransactionTest({ unitsOut: new Fraction(5) });
  });

  it('two in one out - first paid cost', () => {
    twoInOneOutTransactionTest({ unitsOut: new Fraction(10) });
  });

  it('two in one out - partial second paid cost', () => {
    twoInOneOutTransactionTest({ unitsOut: new Fraction(11) });
  });

  it('two in one out - full withdrawal', () => {
    twoInOneOutTransactionTest({ unitsOut: new Fraction(12.5) });
  });

  it('conversion from and to same fund', () => {
    const engine = new FifoEngine();
    engine.addPayment('A', '1', new Fraction(100), new Fraction(0), new Fraction(10), new Fraction(1), 'transaction 1');
    engine.addConversion('A', '1', new Fraction(2), 'B', '2', new Fraction(20), new Fraction(0), new Fraction(2), 'transaction 2');
    engine.addConversion('B', '2', new Fraction(15), 'A', '1', new Fraction(1), new Fraction(0), new Fraction(2), 'transaction 3');
    engine.addConversion('B', '2', new Fraction(5), 'A', '1', new Fraction(1), new Fraction(0), new Fraction(2), 'transaction 4');
    engine.addWithdrawal('A', '1', new Fraction(200), new Fraction(0), new Fraction(10), new Fraction(2), 'transaction out');

    const closedUnits = engine.closedUnits;
    const remainingUnits = engine.remainingUnits;

    expect(remainingUnits.length).toBe(0);
    expect(closedUnits.length).toBe(3);

    checkClosedUnit(closedUnits[0], 'A', '1', 'transaction out', new Fraction(8), new Fraction(80), new Fraction(1), new Fraction(160), new Fraction(2));
    checkClosedUnit(closedUnits[1], 'A', '1', 'transaction out', new Fraction(1), new Fraction(15), new Fraction(1), new Fraction(20), new Fraction(2));
    checkClosedUnit(closedUnits[2], 'A', '1', 'transaction out', new Fraction(1), new Fraction(5), new Fraction(1), new Fraction(20), new Fraction(2));
  });

  it('conversion to other register', () => {
    // NOTE: Python test_conversion_to_other_register has a bug - it converts A/1 -> B/1
    // but then tries to convert from B/2 which is empty. Fixed here to convert from B/1.
    const engine = new FifoEngine();
    engine.addPayment('A', '1', new Fraction(100), new Fraction(0), new Fraction(10), new Fraction(1), 'transaction 1');
    engine.addConversion('A', '1', new Fraction(2), 'B', '1', new Fraction(4), new Fraction(0), new Fraction(2), 'transaction 2');
    engine.addConversion('B', '1', new Fraction(3), 'A', '1', new Fraction(1), new Fraction(0), new Fraction(2), 'transaction 3');
    engine.addConversion('B', '1', new Fraction(1), 'A', '1', new Fraction(1), new Fraction(0), new Fraction(2), 'transaction 4');
    engine.addWithdrawal('A', '1', new Fraction(200), new Fraction(0), new Fraction(10), new Fraction(2), 'transaction out');

    const closedUnits = engine.closedUnits;
    const remainingUnits = engine.remainingUnits;

    expect(remainingUnits.length).toBe(0);
    expect(closedUnits.length).toBe(3);

    checkClosedUnit(closedUnits[0], 'A', '1', 'transaction out', new Fraction(8), new Fraction(80), new Fraction(1), new Fraction(160), new Fraction(2));
    checkClosedUnit(closedUnits[1], 'A', '1', 'transaction out', new Fraction(1), new Fraction(15), new Fraction(1), new Fraction(20), new Fraction(2));
    checkClosedUnit(closedUnits[2], 'A', '1', 'transaction out', new Fraction(1), new Fraction(5), new Fraction(1), new Fraction(20), new Fraction(2));
  });

  it('should throw on insufficient units', () => {
    const engine = new FifoEngine();
    engine.addPayment('A', '1', new Fraction(100), new Fraction(0), new Fraction(10), new Fraction(1), 'tx1');
    expect(() => {
      engine.addWithdrawal('A', '1', new Fraction(200), new Fraction(0), new Fraction(20), new Fraction(1), 'tx2');
    }).toThrow("Can't adjust units");
  });

  it('should handle zero-fee payment', () => {
    const engine = new FifoEngine();
    engine.addPayment('A', '1', new Fraction(100), new Fraction(0), new Fraction(10), new Fraction(1), 'tx1');

    const remaining = engine.remainingUnits;
    expect(remaining.length).toBe(1);
    expect(remaining[0].value.costUsd.equals(new Fraction(100))).toBe(true);
    expect(remaining[0].value.units.equals(new Fraction(10))).toBe(true);
  });

  it('aggregated closed transactions', () => {
    const engine = new FifoEngine();
    engine.addPayment('A', '1', new Fraction(100), new Fraction(0), new Fraction(10), new Fraction(1), 'tx1');
    engine.addPayment('A', '1', new Fraction(200), new Fraction(0), new Fraction(20), new Fraction(2), 'tx2');
    engine.addWithdrawal('A', '1', new Fraction(300), new Fraction(0), new Fraction(30), new Fraction(3), 'tx3');

    const closedTx = engine.closedTransactions;
    expect(closedTx.size).toBe(1);

    const entry = closedTx.values().next().value!;
    expect(entry.key.fundName).toBe('A');
    expect(entry.key.register).toBe('1');
    expect(entry.key.transaction).toBe('tx3');
    // Cost: 100 + 200 = 300 USD
    expect(entry.value.costUsd.equals(new Fraction(300))).toBe(true);
    // Cost PLN: 100*1 + 200*2 = 500
    expect(entry.value.costPln.equals(new Fraction(500))).toBe(true);
    // Payment: 300 USD total
    expect(entry.value.paymentUsd.equals(new Fraction(300))).toBe(true);
    // Payment PLN: 300 * 3 = 900
    expect(entry.value.paymentPln.equals(new Fraction(900))).toBe(true);
    // Units: 30
    expect(entry.value.units.equals(new Fraction(30))).toBe(true);
  });
});
