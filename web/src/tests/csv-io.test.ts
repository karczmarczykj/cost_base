import { describe, it, expect } from 'vitest';
import {
  exportTransactionsToCsv,
  parseCsvToTransactions,
  findDuplicatesInList,
  findDuplicatesAgainstExisting,
  isDuplicate,
  deduplicationKey,
} from '../engine/csv-io';
import type { RawTransaction } from '../engine/types';

/* ---------------------------------------------------------------
   Helpers
   --------------------------------------------------------------- */

function makeTx(overrides: Partial<RawTransaction> = {}): RawTransaction {
  return {
    id: 'test-1',
    date: '15.03.25',
    operationType: 'Buy',
    fundName: 'BlackRock GF World Technology',
    register: '100012345',
    amount: '1000.00',
    units: '10.5',
    commission: '5.00',
    currencyConversionRate: '4.1234',
    transactionNumber: '20250315/WWW/P/001',
    ...overrides,
  };
}

function makeSellTx(overrides: Partial<RawTransaction> = {}): RawTransaction {
  return makeTx({
    operationType: 'Sell',
    transactionNumber: '20250320/WWW/P/002',
    date: '20.03.25',
    ...overrides,
  });
}

function makeConversionTx(overrides: Partial<RawTransaction> = {}): RawTransaction {
  return makeTx({
    operationType: 'Conversion',
    transactionNumber: '20250325/WWW/P/003',
    date: '25.03.25',
    currencyConversionRate: '0',
    dstFundName: 'BlackRock GF Continental European',
    dstRegister: '100099999',
    dstUnits: '20.3',
    ...overrides,
  });
}

/* ---------------------------------------------------------------
   Export tests
   --------------------------------------------------------------- */

describe('exportTransactionsToCsv', () => {
  it('should export empty list with headers only', () => {
    const csv = exportTransactionsToCsv([]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.replace('\uFEFF', '').split('\r\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Data;Typ;Fundusz');
  });

  it('should include BOM at start', () => {
    const csv = exportTransactionsToCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it('should export single Buy transaction', () => {
    const csv = exportTransactionsToCsv([makeTx()]);
    const lines = csv.replace('\uFEFF', '').split('\r\n');
    expect(lines).toHaveLength(2);
    const fields = lines[1].split(';');
    expect(fields[0]).toBe('15.03.25');
    expect(fields[1]).toBe('Nabycie');
    expect(fields[2]).toBe('BlackRock GF World Technology');
    expect(fields[3]).toBe('100012345');
    expect(fields[4]).toBe('1000.00');
    expect(fields[5]).toBe('10.5');
    expect(fields[6]).toBe('5.00');
    expect(fields[7]).toBe('4.1234');
    expect(fields[8]).toBe('20250315/WWW/P/001');
  });

  it('should export mixed Buy/Sell/Conversion', () => {
    const csv = exportTransactionsToCsv([makeTx(), makeSellTx(), makeConversionTx()]);
    const lines = csv.replace('\uFEFF', '').split('\r\n');
    expect(lines).toHaveLength(4); // header + 3 rows
    expect(lines[1]).toContain('Nabycie');
    expect(lines[2]).toContain('Odkupienie');
    expect(lines[3]).toContain('Zamiana');
  });

  it('should export Conversion destination fields', () => {
    const csv = exportTransactionsToCsv([makeConversionTx()]);
    const lines = csv.replace('\uFEFF', '').split('\r\n');
    const fields = lines[1].split(';');
    expect(fields[9]).toBe('BlackRock GF Continental European');
    expect(fields[10]).toBe('100099999');
    expect(fields[11]).toBe('20.3');
  });

  it('should not export id field', () => {
    const csv = exportTransactionsToCsv([makeTx()]);
    expect(csv).not.toContain('test-1');
  });

  it('should escape semicolons in values', () => {
    const tx = makeTx({ fundName: 'Fund; Name "With" Quotes' });
    const csv = exportTransactionsToCsv([tx]);
    expect(csv).toContain('"Fund; Name ""With"" Quotes"');
  });

  it('should deduplicate on export (defensive)', () => {
    const tx1 = makeTx({ id: 'a' });
    const tx2 = makeTx({ id: 'b' }); // same transactionNumber+date
    const csv = exportTransactionsToCsv([tx1, tx2]);
    const lines = csv.replace('\uFEFF', '').split('\r\n');
    expect(lines).toHaveLength(2); // header + 1 row only
  });
});

/* ---------------------------------------------------------------
   Import tests
   --------------------------------------------------------------- */

describe('parseCsvToTransactions', () => {
  it('should roundtrip: export then import produces identical data', () => {
    const original = [makeTx(), makeSellTx(), makeConversionTx()];
    const csv = exportTransactionsToCsv(original);
    const imported = parseCsvToTransactions(csv);

    expect(imported).toHaveLength(3);
    for (let i = 0; i < original.length; i++) {
      expect(imported[i].date).toBe(original[i].date);
      expect(imported[i].operationType).toBe(original[i].operationType);
      expect(imported[i].fundName).toBe(original[i].fundName);
      expect(imported[i].register).toBe(original[i].register);
      expect(imported[i].amount).toBe(original[i].amount);
      expect(imported[i].units).toBe(original[i].units);
      expect(imported[i].commission).toBe(original[i].commission);
      expect(imported[i].currencyConversionRate).toBe(original[i].currencyConversionRate);
      expect(imported[i].transactionNumber).toBe(original[i].transactionNumber);
      expect(imported[i].dstFundName).toBe(original[i].dstFundName);
      expect(imported[i].dstRegister).toBe(original[i].dstRegister);
      expect(imported[i].dstUnits).toBe(original[i].dstUnits);
    }

    // id should be newly generated, not same as original
    expect(imported[0].id).not.toBe(original[0].id);
  });

  it('should import Polish operation type names', () => {
    const csv = [
      'Data;Typ;Fundusz;Rejestr;Kwota USD;Jednostki;Prowizja;Kurs PLN/USD;Nr zlecenia',
      '15.03.25;Nabycie;FundA;R1;100;10;0;4.12;TX001',
      '16.03.25;Odkupienie;FundA;R1;100;10;0;4.13;TX002',
      '17.03.25;Zamiana;FundA;R1;100;10;0;0;TX003',
    ].join('\n');

    const result = parseCsvToTransactions(csv);
    expect(result[0].operationType).toBe('Buy');
    expect(result[1].operationType).toBe('Sell');
    expect(result[2].operationType).toBe('Conversion');
  });

  it('should import English operation type names', () => {
    const csv = [
      'Data;Typ;Fundusz;Rejestr;Kwota USD;Jednostki;Prowizja;Kurs PLN/USD;Nr zlecenia',
      '15.03.25;Buy;FundA;R1;100;10;0;4.12;TX001',
    ].join('\n');

    const result = parseCsvToTransactions(csv);
    expect(result[0].operationType).toBe('Buy');
  });

  it('should autodetect comma separator', () => {
    const csv = [
      'Data,Typ,Fundusz,Rejestr,Kwota USD,Jednostki,Prowizja,Kurs PLN/USD,Nr zlecenia',
      '15.03.25,Buy,FundA,R1,100,10,0,4.12,TX001',
    ].join('\n');

    const result = parseCsvToTransactions(csv);
    expect(result).toHaveLength(1);
    expect(result[0].fundName).toBe('FundA');
  });

  it('should strip BOM', () => {
    const csv = '\uFEFF' + [
      'Data;Typ;Fundusz;Rejestr;Kwota USD;Jednostki;Prowizja;Kurs PLN/USD;Nr zlecenia',
      '15.03.25;Buy;FundA;R1;100;10;0;4.12;TX001',
    ].join('\n');

    const result = parseCsvToTransactions(csv);
    expect(result).toHaveLength(1);
  });

  it('should throw on empty CSV', () => {
    expect(() => parseCsvToTransactions('')).toThrow('pusty');
  });

  it('should throw on missing required columns', () => {
    const csv = 'Data;Typ\n15.03.25;Buy';
    expect(() => parseCsvToTransactions(csv)).toThrow('Brakujace kolumny');
  });

  it('should throw on unknown operation type', () => {
    const csv = [
      'Data;Typ;Fundusz;Rejestr;Kwota USD;Jednostki;Prowizja;Kurs PLN/USD;Nr zlecenia',
      '15.03.25;Przelew;FundA;R1;100;10;0;4.12;TX001',
    ].join('\n');

    expect(() => parseCsvToTransactions(csv)).toThrow('nieznany typ operacji');
  });

  it('should throw when Buy has no conversion rate', () => {
    const csv = [
      'Data;Typ;Fundusz;Rejestr;Kwota USD;Jednostki;Prowizja;Kurs PLN/USD;Nr zlecenia',
      '15.03.25;Buy;FundA;R1;100;10;0;;TX001',
    ].join('\n');

    expect(() => parseCsvToTransactions(csv)).toThrow('brak kursu PLN/USD');
  });

  it('should allow Conversion without conversion rate', () => {
    const csv = [
      'Data;Typ;Fundusz;Rejestr;Kwota USD;Jednostki;Prowizja;Kurs PLN/USD;Nr zlecenia',
      '17.03.25;Conversion;FundA;R1;100;10;0;;TX003',
    ].join('\n');

    const result = parseCsvToTransactions(csv);
    expect(result).toHaveLength(1);
    expect(result[0].currencyConversionRate).toBe('0');
  });

  it('should throw on missing required field (date)', () => {
    const csv = [
      'Data;Typ;Fundusz;Rejestr;Kwota USD;Jednostki;Prowizja;Kurs PLN/USD;Nr zlecenia',
      ';Buy;FundA;R1;100;10;0;4.12;TX001',
    ].join('\n');

    expect(() => parseCsvToTransactions(csv)).toThrow('brak daty');
  });

  it('should handle columns in different order', () => {
    const csv = [
      'Nr zlecenia;Data;Fundusz;Typ;Rejestr;Kwota USD;Jednostki;Prowizja;Kurs PLN/USD',
      'TX001;15.03.25;FundA;Buy;R1;100;10;0;4.12',
    ].join('\n');

    const result = parseCsvToTransactions(csv);
    expect(result).toHaveLength(1);
    expect(result[0].transactionNumber).toBe('TX001');
    expect(result[0].fundName).toBe('FundA');
  });

  it('should handle RFC 4180 quoted fields', () => {
    const csv = [
      'Data;Typ;Fundusz;Rejestr;Kwota USD;Jednostki;Prowizja;Kurs PLN/USD;Nr zlecenia',
      '15.03.25;Buy;"Fund; Name ""Special""";R1;100;10;0;4.12;TX001',
    ].join('\n');

    const result = parseCsvToTransactions(csv);
    expect(result[0].fundName).toBe('Fund; Name "Special"');
  });

  it('should generate unique ids for imported rows', () => {
    const csv = [
      'Data;Typ;Fundusz;Rejestr;Kwota USD;Jednostki;Prowizja;Kurs PLN/USD;Nr zlecenia',
      '15.03.25;Buy;FundA;R1;100;10;0;4.12;TX001',
      '16.03.25;Buy;FundA;R1;200;20;0;4.13;TX002',
    ].join('\n');

    const result = parseCsvToTransactions(csv);
    expect(result[0].id).not.toBe(result[1].id);
  });
});

/* ---------------------------------------------------------------
   Deduplication tests
   --------------------------------------------------------------- */

describe('deduplicationKey', () => {
  it('should combine transactionNumber and date', () => {
    const key = deduplicationKey({ transactionNumber: 'TX001', date: '15.03.25' });
    expect(key).toBe('TX001|15.03.25');
  });
});

describe('findDuplicatesInList', () => {
  it('should return empty array for unique entries', () => {
    const list = [
      { transactionNumber: 'TX001', date: '15.03.25' },
      { transactionNumber: 'TX002', date: '16.03.25' },
    ];
    expect(findDuplicatesInList(list)).toEqual([]);
  });

  it('should detect duplicates within list', () => {
    const list = [
      { transactionNumber: 'TX001', date: '15.03.25' },
      { transactionNumber: 'TX002', date: '16.03.25' },
      { transactionNumber: 'TX001', date: '15.03.25' },
    ];
    expect(findDuplicatesInList(list)).toEqual(['TX001']);
  });

  it('should allow same transactionNumber with different date', () => {
    const list = [
      { transactionNumber: 'TX001', date: '15.03.25' },
      { transactionNumber: 'TX001', date: '16.03.25' },
    ];
    expect(findDuplicatesInList(list)).toEqual([]);
  });
});

describe('findDuplicatesAgainstExisting', () => {
  it('should return empty when no overlap', () => {
    const incoming = [{ transactionNumber: 'TX003', date: '17.03.25' }];
    const existing = [{ transactionNumber: 'TX001', date: '15.03.25' }];
    expect(findDuplicatesAgainstExisting(incoming, existing)).toEqual([]);
  });

  it('should detect cross-list duplicates', () => {
    const incoming = [
      { transactionNumber: 'TX001', date: '15.03.25' },
      { transactionNumber: 'TX003', date: '17.03.25' },
    ];
    const existing = [{ transactionNumber: 'TX001', date: '15.03.25' }];
    expect(findDuplicatesAgainstExisting(incoming, existing)).toEqual(['TX001']);
  });
});

describe('isDuplicate', () => {
  it('should return false for new transaction', () => {
    const tx = { transactionNumber: 'TX999', date: '01.01.26' };
    const existing = [{ transactionNumber: 'TX001', date: '15.03.25' }];
    expect(isDuplicate(tx, existing)).toBe(false);
  });

  it('should return true for existing transaction', () => {
    const tx = { transactionNumber: 'TX001', date: '15.03.25' };
    const existing = [{ transactionNumber: 'TX001', date: '15.03.25' }];
    expect(isDuplicate(tx, existing)).toBe(true);
  });
});

/* ---------------------------------------------------------------
   Integration: deduplication during import
   --------------------------------------------------------------- */

describe('CSV import deduplication', () => {
  it('should detect duplicates within imported CSV file', () => {
    const csv = [
      'Data;Typ;Fundusz;Rejestr;Kwota USD;Jednostki;Prowizja;Kurs PLN/USD;Nr zlecenia',
      '15.03.25;Buy;FundA;R1;100;10;0;4.12;TX001',
      '15.03.25;Buy;FundB;R2;200;20;0;4.13;TX001', // same TX number + date
    ].join('\n');

    const imported = parseCsvToTransactions(csv);
    const dups = findDuplicatesInList(imported);
    expect(dups).toEqual(['TX001']);
  });
});
