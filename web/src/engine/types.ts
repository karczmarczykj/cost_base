import Fraction from 'fraction.js';

/**
 * Supported operation types for fund transactions.
 */
export type OperationType = 'Buy' | 'Sell' | 'Conversion';

/**
 * Raw transaction data as entered by the user or parsed from clipboard.
 * All monetary/unit values are strings to be parsed into Fraction later.
 */
export interface RawTransaction {
  readonly id: string;
  readonly date: string;             // DD.MM.YY
  readonly operationType: OperationType;
  readonly fundName: string;
  readonly register: string;
  readonly amount: string;           // absolute value in USD (no sign)
  readonly units: string;
  readonly commission: string;       // USD, "0" if none
  readonly currencyConversionRate: string; // PLN per 1 USD
  readonly transactionNumber: string;

  // Conversion-only fields
  readonly dstFundName?: string;
  readonly dstRegister?: string;
  readonly dstUnits?: string;
}

/**
 * Parsed transaction with Fraction values, ready for the engine.
 */
export interface ParsedTransaction {
  readonly id: string;
  readonly date: string;
  readonly operationType: OperationType;
  readonly fundName: string;
  readonly register: string;
  readonly amount: Fraction;         // absolute USD value
  readonly units: Fraction;
  readonly commission: Fraction;
  readonly currencyConversionRate: Fraction;
  readonly transactionNumber: string;

  // Conversion-only
  readonly dstFundName?: string;
  readonly dstRegister?: string;
  readonly dstUnits?: Fraction;
}

/**
 * Key identifying a closed transaction group: (fundName, register, transactionNumber).
 */
export interface ClosedTransactionKey {
  readonly fundName: string;
  readonly register: string;
  readonly transaction: string;
}

/**
 * Aggregated values for a closed transaction group.
 */
export interface ClosedTransactionValue {
  readonly costUsd: Fraction;
  readonly costPln: Fraction;
  readonly paymentUsd: Fraction;
  readonly paymentPln: Fraction;
  readonly units: Fraction;
}

/**
 * Key for remaining (open) fund positions.
 */
export interface RemainingFundKey {
  readonly fundName: string;
  readonly register: string;
}

/**
 * Aggregated values for remaining fund positions.
 */
export interface RemainingFundValue {
  readonly costUsd: Fraction;
  readonly costPln: Fraction;
  readonly units: Fraction;
}

/**
 * A single closed unit entry (before aggregation).
 */
export interface ClosedUnitEntry {
  readonly key: ClosedTransactionKey;
  readonly value: ClosedTransactionValue;
}

/**
 * A single remaining unit entry (before aggregation).
 */
export interface RemainingUnitEntry {
  readonly key: RemainingFundKey;
  readonly value: RemainingFundValue;
}

/**
 * Data parsed from a clipboard paste (before user confirmation).
 */
export interface ClipboardParseResult {
  readonly operationType: OperationType;
  readonly date: string;
  readonly fundName: string;
  readonly register: string;
  readonly amount: string;
  readonly units: string;
  readonly price: string;
  readonly commission: string;
  readonly transactionNumber: string;
  readonly amountPln?: string;       // only for Buy with PLN in parentheses

  // Conversion destination
  readonly dstFundName?: string;
  readonly dstRegister?: string;
  readonly dstUnits?: string;
  readonly dstPrice?: string;
}
