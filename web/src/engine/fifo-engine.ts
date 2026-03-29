import Fraction from 'fraction.js';
import { PaymentUnit } from './payment-unit';
import type {
  ClosedUnitEntry,
  RemainingUnitEntry,
  ClosedTransactionKey,
  ClosedTransactionValue,
  RemainingFundKey,
  RemainingFundValue,
} from './types';

/**
 * FIFO transaction engine for investment fund cost basis calculation.
 *
 * Maintains a deque (array used as deque) of PaymentUnit per (fundName, register) pair.
 * On withdrawal/conversion, units are consumed from the front (FIFO order).
 * When a withdrawal doesn't consume a full PaymentUnit, the unit is split.
 *
 * Port of Python fifo_transaction_engine class.
 */
export class FifoEngine {
  /** Map from "fundName\0register" to array of PaymentUnit (used as deque). */
  private payments: Map<string, PaymentUnit[]> = new Map();

  private static makeKey(fundName: string, register: string): string {
    return `${fundName}\0${register}`;
  }

  private getPaymentList(fundName: string, register: string): PaymentUnit[] {
    const key = FifoEngine.makeKey(fundName, register);
    let list = this.payments.get(key);
    if (!list) {
      list = [];
      this.payments.set(key, list);
    }
    return list;
  }

  /**
   * Core FIFO adjustment: collect units from the front of the deque.
   *
   * When removeElements is true (conversion): units are permanently removed from source.
   * When removeElements is false (withdrawal): units are collected, then put back so
   *   close() can be called on them in-place while they remain in the deque.
   *
   * Returns the collected PaymentUnit array.
   */
  private adjustPayments(
    fundName: string,
    register: string,
    units: Fraction,
    removeElements: boolean = false,
  ): PaymentUnit[] {
    if (units.compare(0) <= 0) {
      throw new Error(`Units must be positive, got ${units.toFraction()}`);
    }

    let remainingUnits = units;
    const paymentList = this.getPaymentList(fundName, register);
    const collected: PaymentUnit[] = [];

    while (remainingUnits.compare(0) > 0) {
      if (paymentList.length === 0) break;

      const payment = paymentList.shift()!; // popleft

      if (payment.units.compare(remainingUnits) <= 0) {
        // This payment is fully consumed
        collected.push(payment);
        remainingUnits = remainingUnits.sub(payment.units);
      } else {
        // Partial consumption: split the payment
        const splitRatio = remainingUnits.div(payment.units);
        collected.push(payment.scale(splitRatio));
        // Put the remainder back at the front
        payment.scaleInPlace(new Fraction(1).sub(splitRatio));
        paymentList.unshift(payment);
        remainingUnits = new Fraction(0);
      }
    }

    if (remainingUnits.compare(0) > 0) {
      throw new Error(
        `Can't adjust units (remaining units = ${remainingUnits.valueOf()}, fund name = ${fundName}, register = ${register})`,
      );
    }

    if (!removeElements) {
      // Put collected units back at the front (in original order)
      const reversed = [...collected].reverse();
      for (const unit of reversed) {
        paymentList.unshift(unit);
      }
    }

    return collected;
  }

  /**
   * Add a buy transaction.
   */
  addPayment(
    fundName: string,
    register: string,
    payment: Fraction,
    _fee: Fraction,
    units: Fraction,
    currencyConversionRate: Fraction,
    transactionNumber: string,
  ): void {
    if (units.compare(0) <= 0 || payment.compare(0) <= 0 || currencyConversionRate.compare(0) <= 0) {
      throw new Error('Units, payment, and currencyConversionRate must be positive');
    }

    const paymentList = this.getPaymentList(fundName, register);
    paymentList.push(
      new PaymentUnit(fundName, register, payment, units, currencyConversionRate, transactionNumber),
    );
  }

  /**
   * Add a conversion (swap) between funds.
   * Removes units from source fund and adds converted units to destination fund.
   * Cost basis is preserved through the conversion.
   */
  addConversion(
    srcFundName: string,
    srcRegister: string,
    srcUnits: Fraction,
    dstFundName: string,
    dstRegister: string,
    dstUnits: Fraction,
    _fee: Fraction,
    _currencyConversionRate: Fraction,
    transactionNumber: string,
  ): void {
    if (srcUnits.compare(0) <= 0 || dstUnits.compare(0) <= 0) {
      throw new Error('Source and destination units must be positive');
    }

    const paymentList = this.adjustPayments(srcFundName, srcRegister, srcUnits, true);

    for (const payment of paymentList) {
      const currentUnits = payment.units;
      // Proportional unit allocation: (currentUnits * dstUnits) / srcUnits
      const newUnits = currentUnits.mul(dstUnits).div(srcUnits);
      payment.convert(dstFundName, dstRegister, newUnits, transactionNumber);
    }

    const dstList = this.getPaymentList(dstFundName, dstRegister);
    dstList.push(...paymentList);
  }

  /**
   * Add a withdrawal (sell) transaction.
   * Closes units using FIFO order, distributing the payment proportionally.
   */
  addWithdrawal(
    fundName: string,
    register: string,
    outPayment: Fraction,
    _fee: Fraction,
    units: Fraction,
    currencyConversionRate: Fraction,
    transactionNumber: string,
    date: string,
  ): void {
    if (units.compare(0) <= 0 || outPayment.compare(0) <= 0 || currencyConversionRate.compare(0) <= 0) {
      throw new Error('Units, outPayment, and currencyConversionRate must be positive');
    }

    const unitList = this.adjustPayments(fundName, register, units);

    for (const payment of unitList) {
      const currentUnits = payment.units;
      // Proportional payment: (outPayment * currentUnits) / totalUnits
      const proportionalPayment = outPayment.mul(currentUnits).div(units);
      payment.close(proportionalPayment, currencyConversionRate, transactionNumber, date);
    }
  }

  /**
   * All closed (sold) unit entries, unaggregated.
   */
  get closedUnits(): ClosedUnitEntry[] {
    const result: ClosedUnitEntry[] = [];
    for (const paymentList of this.payments.values()) {
      for (const payment of paymentList) {
        if (!payment.isClosed) continue;
        const ck = payment.closeKey;
        const cv = payment.closeValue;
        result.push({
          key: { fundName: ck.fundName, register: ck.register, transaction: ck.transaction, closeDate: ck.closeDate },
          value: {
            costUsd: cv.cost,
            costPln: cv.costInLocalCurrency,
            paymentUsd: cv.payment,
            paymentPln: cv.paymentInLocalCurrency,
            units: cv.units,
          },
        });
      }
    }
    return result;
  }

  /**
   * All remaining (open) unit entries, unaggregated.
   */
  get remainingUnits(): RemainingUnitEntry[] {
    const result: RemainingUnitEntry[] = [];
    for (const paymentList of this.payments.values()) {
      for (const payment of paymentList) {
        if (payment.isClosed) continue;
        const rv = payment.remainingValue;
        result.push({
          key: { fundName: payment.key.fundName, register: payment.key.register },
          value: { costUsd: rv.cost, costPln: rv.costInLocalCurrency, units: rv.units },
        });
      }
    }
    return result;
  }

  /**
   * Closed transactions aggregated by (fundName, register, transaction).
   */
  get closedTransactions(): Map<string, { key: ClosedTransactionKey; value: ClosedTransactionValue }> {
    const result = new Map<string, { key: ClosedTransactionKey; value: ClosedTransactionValue }>();

    for (const entry of this.closedUnits) {
      const mapKey = `${entry.key.fundName}\0${entry.key.register}\0${entry.key.transaction}`;
      const existing = result.get(mapKey);
      if (existing) {
        result.set(mapKey, {
          key: existing.key,
          value: {
            costUsd: existing.value.costUsd.add(entry.value.costUsd),
            costPln: existing.value.costPln.add(entry.value.costPln),
            paymentUsd: existing.value.paymentUsd.add(entry.value.paymentUsd),
            paymentPln: existing.value.paymentPln.add(entry.value.paymentPln),
            units: existing.value.units.add(entry.value.units),
          },
        });
      } else {
        result.set(mapKey, { key: { ...entry.key }, value: { ...entry.value } });
      }
    }

    return result;
  }

  /**
   * Remaining funds aggregated by (fundName, register).
   */
  get remainingFunds(): Map<string, { key: RemainingFundKey; value: RemainingFundValue }> {
    const result = new Map<string, { key: RemainingFundKey; value: RemainingFundValue }>();

    for (const entry of this.remainingUnits) {
      const mapKey = `${entry.key.fundName}\0${entry.key.register}`;
      const existing = result.get(mapKey);
      if (existing) {
        result.set(mapKey, {
          key: existing.key,
          value: {
            costUsd: existing.value.costUsd.add(entry.value.costUsd),
            costPln: existing.value.costPln.add(entry.value.costPln),
            units: existing.value.units.add(entry.value.units),
          },
        });
      } else {
        result.set(mapKey, { key: { ...entry.key }, value: { ...entry.value } });
      }
    }

    return result;
  }
}
