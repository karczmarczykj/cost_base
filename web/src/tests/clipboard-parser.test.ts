import { describe, it, expect } from 'vitest';
import { parseClipboard, parsePolishNumber } from '../engine/clipboard-parser';

describe('parsePolishNumber', () => {
  it('should parse positive number with spaces and comma', () => {
    expect(parsePolishNumber('12 350,63')).toBe('12350.63');
  });

  it('should parse negative number', () => {
    expect(parsePolishNumber('-7 853,81')).toBe('-7853.81');
  });

  it('should parse zero', () => {
    expect(parsePolishNumber('0,00')).toBe('0.00');
  });

  it('should parse number without thousands separator', () => {
    expect(parsePolishNumber('946,65')).toBe('946.65');
  });

  it('should handle integer-like numbers', () => {
    expect(parsePolishNumber('100')).toBe('100');
  });
});

describe('parseClipboard - Sell (clipboard-transaction1)', () => {
  const sellClipboard = `07.09.25
19:55:09

BlackRock GF World Gold A2 (USD)
Fundusz akcji spolek surowcowych
Zrealizowane
-7 853,81 USD
0,00 USD
Data realizacji
15.09.25
Liczba jednostek
102,17
Cena
76,87
Nr rejestru
100051982
Numer zlecenia
20250907/WWW/R/015
Wynik podatkowy (podatek)

TFI nie rozlicza podatku
Rachunek do zwrotu srodkow
50 2490 ... 9730`;

  it('should detect Sell operation', () => {
    const result = parseClipboard(sellClipboard);
    expect(result.operationType).toBe('Sell');
  });

  it('should parse date', () => {
    const result = parseClipboard(sellClipboard);
    expect(result.date).toBe('07.09.25');
  });

  it('should parse fund name', () => {
    const result = parseClipboard(sellClipboard);
    expect(result.fundName).toBe('BlackRock GF World Gold A2 (USD)');
  });

  it('should parse amount (absolute value)', () => {
    const result = parseClipboard(sellClipboard);
    expect(result.amount).toBe('7853.81');
  });

  it('should parse units', () => {
    const result = parseClipboard(sellClipboard);
    expect(result.units).toBe('102.17');
  });

  it('should parse register', () => {
    const result = parseClipboard(sellClipboard);
    expect(result.register).toBe('100051982');
  });

  it('should parse transaction number', () => {
    const result = parseClipboard(sellClipboard);
    expect(result.transactionNumber).toBe('20250907/WWW/R/015');
  });

  it('should not have PLN amount', () => {
    const result = parseClipboard(sellClipboard);
    expect(result.amountPln).toBeUndefined();
  });
});

describe('parseClipboard - Buy (clipboard-transaction2)', () => {
  const buyClipboard = `18.06.14
10:55:36

BlackRock GF China A2 (USD)
Fundusz akcji zagranicznych azjatyckich
Zrealizowane
12 350,63 USD
(37 800,00 PLN)
11 918,32 USD
Data realizacji
24.06.14
Liczba jednostek
946,65
Cena
12,59
Prowizja
432,27 USD
Nr rejestru
100019521
Numer zlecenia
20140618/209150/P/001
Rachunek do zwrotu srodkow
58 2490 ... 2060`;

  it('should detect Buy operation', () => {
    const result = parseClipboard(buyClipboard);
    expect(result.operationType).toBe('Buy');
  });

  it('should parse amount', () => {
    const result = parseClipboard(buyClipboard);
    expect(result.amount).toBe('12350.63');
  });

  it('should parse PLN amount from parentheses', () => {
    const result = parseClipboard(buyClipboard);
    expect(result.amountPln).toBe('37800.00');
  });

  it('should parse units', () => {
    const result = parseClipboard(buyClipboard);
    expect(result.units).toBe('946.65');
  });

  it('should parse commission', () => {
    const result = parseClipboard(buyClipboard);
    expect(result.commission).toBe('432.27');
  });

  it('should parse fund name', () => {
    const result = parseClipboard(buyClipboard);
    expect(result.fundName).toBe('BlackRock GF China A2 (USD)');
  });

  it('should parse register', () => {
    const result = parseClipboard(buyClipboard);
    expect(result.register).toBe('100019521');
  });

  it('should parse transaction number', () => {
    const result = parseClipboard(buyClipboard);
    expect(result.transactionNumber).toBe('20140618/209150/P/001');
  });
});

describe('parseClipboard - Conversion (clipboard-transaction3)', () => {
  const conversionClipboard = `30.08.20
21:07:09

BlackRock GF World Gold A2 (USD)
Fundusz akcji spolek surowcowych
Zrealizowane
-4 989,85 USD
11 259,20 USD
Data realizacji
31.08.20
Liczba jednostek
100,46
Cena
49,67
Prowizja
0,00 USD
Nr rejestru
100051982
Numer zlecenia
20200830/WWW/S/009
Wynik podatkowy (podatek)

TFI nie rozlicza podatku

BlackRock GF World Technology A2 (USD)
Fundusz akcji sektorow
4 989,85 USD
10 615,42 USD
Liczba jednostek
77,23
Cena
64,61
Nr rejestru
100052024`;

  it('should detect Conversion operation', () => {
    const result = parseClipboard(conversionClipboard);
    expect(result.operationType).toBe('Conversion');
  });

  it('should parse source fund name', () => {
    const result = parseClipboard(conversionClipboard);
    expect(result.fundName).toBe('BlackRock GF World Gold A2 (USD)');
  });

  it('should parse source amount (absolute)', () => {
    const result = parseClipboard(conversionClipboard);
    expect(result.amount).toBe('4989.85');
  });

  it('should parse source units', () => {
    const result = parseClipboard(conversionClipboard);
    expect(result.units).toBe('100.46');
  });

  it('should parse source register', () => {
    const result = parseClipboard(conversionClipboard);
    expect(result.register).toBe('100051982');
  });

  it('should parse destination fund name', () => {
    const result = parseClipboard(conversionClipboard);
    expect(result.dstFundName).toBe('BlackRock GF World Technology A2 (USD)');
  });

  it('should parse destination units', () => {
    const result = parseClipboard(conversionClipboard);
    expect(result.dstUnits).toBe('77.23');
  });

  it('should parse destination register', () => {
    const result = parseClipboard(conversionClipboard);
    expect(result.dstRegister).toBe('100052024');
  });

  it('should parse transaction number', () => {
    const result = parseClipboard(conversionClipboard);
    expect(result.transactionNumber).toBe('20200830/WWW/S/009');
  });
});

describe('parseClipboard - error cases', () => {
  it('should throw on too short input', () => {
    expect(() => parseClipboard('hello')).toThrow('too short');
  });

  it('should throw on non-BlackRock fund', () => {
    const text = `01.01.25
12:00:00

Some Other Fund
Category
Zrealizowane
100,00 USD`;
    expect(() => parseClipboard(text)).toThrow();
  });
});
