import { describe, it, expect } from 'vitest';
import Fraction from 'fraction.js';
import { PaymentUnit } from '../engine/payment-unit';

/**
 * Port of test_payment.py - test_payment_test class.
 */
describe('PaymentUnit', () => {
  const primaryParams = {
    fund: 'Subfund gold',
    cost: 300000.23,
    transaction: '1-1',
    register: '121',
    units: 3.23,
    currencyExchangeRate: 0.000001,
  };

  const secondaryParams = {
    fund: 'Subfund bond',
    transaction: '1-2',
    register: '129',
    units: 7.12,
  };

  function createPrimaryUnit(): PaymentUnit {
    return new PaymentUnit(
      primaryParams.fund,
      primaryParams.register,
      new Fraction(primaryParams.cost),
      new Fraction(primaryParams.units),
      new Fraction(primaryParams.currencyExchangeRate),
      primaryParams.transaction,
    );
  }

  it('should initialize with correct params', () => {
    const unit = createPrimaryUnit();
    expect(unit.fundName).toBe(primaryParams.fund);
    expect(unit.register).toBe(primaryParams.register);
    expect(unit.transaction).toBe(primaryParams.transaction);
    expect(unit.units.equals(new Fraction(primaryParams.units))).toBe(true);
    expect(unit.cost.equals(new Fraction(primaryParams.cost))).toBe(true);
    expect(
      unit.costInLocalCurrency.equals(
        new Fraction(primaryParams.cost).mul(new Fraction(primaryParams.currencyExchangeRate)),
      ),
    ).toBe(true);
    expect(unit.isClosed).toBe(false);
  });

  it('should return correct key', () => {
    const unit = createPrimaryUnit();
    const { fundName, register } = unit.key;
    expect(fundName).toBe(primaryParams.fund);
    expect(register).toBe(primaryParams.register);
  });

  it('should return correct remaining value', () => {
    const unit = createPrimaryUnit();
    const { cost, costInLocalCurrency, units } = unit.remainingValue;
    expect(cost.equals(new Fraction(primaryParams.cost))).toBe(true);
    expect(
      costInLocalCurrency.equals(
        new Fraction(primaryParams.cost).mul(new Fraction(primaryParams.currencyExchangeRate)),
      ),
    ).toBe(true);
    expect(units.equals(new Fraction(primaryParams.units))).toBe(true);
  });

  it('should scale correctly (scale returns new instance)', () => {
    const rate = new Fraction(0.3);
    const original = createPrimaryUnit();
    const scaled = original.scale(rate);

    // Scaled unit has multiplied values
    expect(scaled.units.equals(new Fraction(primaryParams.units).mul(rate))).toBe(true);
    expect(scaled.cost.equals(new Fraction(primaryParams.cost).mul(rate))).toBe(true);
    expect(
      scaled.costInLocalCurrency.equals(
        new Fraction(primaryParams.cost)
          .mul(new Fraction(primaryParams.currencyExchangeRate))
          .mul(rate),
      ),
    ).toBe(true);

    // Original is unchanged
    expect(original.units.equals(new Fraction(primaryParams.units))).toBe(true);
    expect(original.cost.equals(new Fraction(primaryParams.cost))).toBe(true);
  });

  it('should scale in place (mutating)', () => {
    const rate = new Fraction(0.3);
    const unit = createPrimaryUnit();
    const returned = unit.scaleInPlace(rate);

    // Returns same instance
    expect(returned).toBe(unit);
    expect(unit.units.equals(new Fraction(primaryParams.units).mul(rate))).toBe(true);
    expect(unit.cost.equals(new Fraction(primaryParams.cost).mul(rate))).toBe(true);
  });

  it('should return close key after closing', () => {
    const unit = createPrimaryUnit();
    unit.close(new Fraction(100), new Fraction(3), '2-1', '15.06.24');

    const { fundName, register, transaction, closeDate } = unit.closeKey;
    expect(fundName).toBe(primaryParams.fund);
    expect(register).toBe(primaryParams.register);
    expect(transaction).toBe('2-1');
    expect(closeDate).toBe('15.06.24');
    expect(unit.isClosed).toBe(true);
  });

  it('should return close value after closing', () => {
    const unit = createPrimaryUnit();
    const givenPayment = new Fraction(100);
    const currencyExchangeRate = new Fraction(3);
    unit.close(givenPayment, currencyExchangeRate, '2-1', '15.06.24');

    const { cost, costInLocalCurrency, payment, paymentInLocalCurrency, units } = unit.closeValue;
    expect(cost.equals(new Fraction(primaryParams.cost))).toBe(true);
    expect(
      costInLocalCurrency.equals(
        new Fraction(primaryParams.cost).mul(new Fraction(primaryParams.currencyExchangeRate)),
      ),
    ).toBe(true);
    expect(payment.equals(givenPayment)).toBe(true);
    expect(paymentInLocalCurrency.equals(givenPayment.mul(currencyExchangeRate))).toBe(true);
    expect(units.equals(new Fraction(primaryParams.units))).toBe(true);
  });

  it('should throw when accessing closeKey before closing', () => {
    const unit = createPrimaryUnit();
    expect(() => unit.closeKey).toThrow("Can't get closing key");
  });

  it('should throw when accessing closeValue before closing', () => {
    const unit = createPrimaryUnit();
    expect(() => unit.closeValue).toThrow("Can't get closing value");
  });

  it('should convert to different fund', () => {
    const unit = createPrimaryUnit();
    unit.convert(
      secondaryParams.fund,
      secondaryParams.register,
      new Fraction(secondaryParams.units),
      secondaryParams.transaction,
    );

    expect(unit.fundName).toBe(secondaryParams.fund);
    expect(unit.register).toBe(secondaryParams.register);
    expect(unit.transaction).toBe(secondaryParams.transaction);
    expect(unit.units.equals(new Fraction(secondaryParams.units))).toBe(true);
    // Cost basis preserved from original
    expect(unit.cost.equals(new Fraction(primaryParams.cost))).toBe(true);
    expect(
      unit.costInLocalCurrency.equals(
        new Fraction(primaryParams.cost).mul(new Fraction(primaryParams.currencyExchangeRate)),
      ),
    ).toBe(true);
  });

  it('should reject non-positive units', () => {
    expect(
      () =>
        new PaymentUnit('fund', 'reg', new Fraction(100), new Fraction(0), new Fraction(1), 'tx'),
    ).toThrow();
  });

  it('should reject non-positive cost', () => {
    expect(
      () =>
        new PaymentUnit('fund', 'reg', new Fraction(0), new Fraction(10), new Fraction(1), 'tx'),
    ).toThrow();
  });
});
