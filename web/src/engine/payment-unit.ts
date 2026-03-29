import Fraction from 'fraction.js';

/**
 * Represents a single unit of investment in a fund.
 * Tracks cost basis, currency conversion rate, supports scaling (splitting)
 * and lifecycle operations (convert, close).
 *
 * Port of Python payment_unit class.
 * Key difference: scale() returns a NEW instance (no mutation, no deepcopy needed).
 */
export class PaymentUnit {
  private _fundName: string;
  private _register: string;
  private _transaction: string;
  private _units: Fraction;
  private _cost: Fraction;
  private _status: 'exists' | 'closed' = 'exists';
  private readonly _buyCurrencyConversionRate: Fraction;

  // Set only when closed
  private _redemptionPayment: Fraction | null = null;
  private _redemptionCurrencyConversionRate: Fraction | null = null;

  constructor(
    fundName: string,
    register: string,
    cost: Fraction,
    units: Fraction,
    currencyConversionRate: Fraction,
    transaction: string,
  ) {
    if (units.compare(0) <= 0 || cost.compare(0) <= 0) {
      throw new Error(`Units and cost must be positive (units=${units.toFraction()}, cost=${cost.toFraction()})`);
    }
    this._fundName = fundName;
    this._register = register;
    this._transaction = transaction;
    this._units = units;
    this._cost = cost;
    this._buyCurrencyConversionRate = currencyConversionRate;
  }

  /**
   * Returns a NEW PaymentUnit scaled by the given multiplier.
   * This replaces Python's __mul__ which mutated in-place.
   * Eliminates the need for deepcopy.
   */
  scale(multiplier: Fraction): PaymentUnit {
    const scaled = new PaymentUnit(
      this._fundName,
      this._register,
      this._cost.mul(multiplier),
      this._units.mul(multiplier),
      this._buyCurrencyConversionRate,
      this._transaction,
    );
    return scaled;
  }

  /**
   * Mutating scale - used when we want to modify in-place
   * (e.g., the remainder left in the deque after a split).
   * Equivalent to Python's __mul__.
   */
  scaleInPlace(multiplier: Fraction): this {
    this._cost = this._cost.mul(multiplier);
    this._units = this._units.mul(multiplier);
    return this;
  }

  /**
   * Convert this unit to a different fund/register.
   * Cost basis is preserved; only fund identity and units change.
   */
  convert(dstFund: string, dstRegister: string, dstUnits: Fraction, transaction: string): void {
    this._fundName = dstFund;
    this._register = dstRegister;
    this._transaction = transaction;
    this._units = dstUnits;
  }

  /**
   * Close (sell) this unit, recording the redemption payment and exchange rate.
   */
  close(redemptionPayment: Fraction, currencyExchangeRate: Fraction, transaction: string): void {
    this._redemptionPayment = redemptionPayment;
    this._redemptionCurrencyConversionRate = currencyExchangeRate;
    this._transaction = transaction;
    this._status = 'closed';
  }

  get isClosed(): boolean {
    return this._status !== 'exists';
  }

  get fundName(): string {
    return this._fundName;
  }

  get register(): string {
    return this._register;
  }

  get transaction(): string {
    return this._transaction;
  }

  get units(): Fraction {
    return this._units;
  }

  get cost(): Fraction {
    return this._cost;
  }

  get costInLocalCurrency(): Fraction {
    return this._cost.mul(this._buyCurrencyConversionRate);
  }

  /**
   * Key for grouping closed transactions: [fundName, register, transaction].
   */
  get closeKey(): { fundName: string; register: string; transaction: string } {
    if (this._status !== 'closed') {
      throw new Error("Can't get closing key when transaction is not yet closed");
    }
    return { fundName: this._fundName, register: this._register, transaction: this._transaction };
  }

  /**
   * Values for a closed transaction: cost basis, payment, and units.
   */
  get closeValue(): {
    cost: Fraction;
    costInLocalCurrency: Fraction;
    payment: Fraction;
    paymentInLocalCurrency: Fraction;
    units: Fraction;
  } {
    if (this._status !== 'closed' || !this._redemptionPayment || !this._redemptionCurrencyConversionRate) {
      throw new Error("Can't get closing value when transaction is not yet closed");
    }
    return {
      cost: this._cost,
      costInLocalCurrency: this.costInLocalCurrency,
      payment: this._redemptionPayment,
      paymentInLocalCurrency: this._redemptionPayment.mul(this._redemptionCurrencyConversionRate),
      units: this._units,
    };
  }

  /**
   * Key for grouping open positions: [fundName, register].
   */
  get key(): { fundName: string; register: string } {
    return { fundName: this._fundName, register: this._register };
  }

  /**
   * Values for an open position: cost basis and units.
   */
  get remainingValue(): { cost: Fraction; costInLocalCurrency: Fraction; units: Fraction } {
    return {
      cost: this._cost,
      costInLocalCurrency: this.costInLocalCurrency,
      units: this._units,
    };
  }
}
