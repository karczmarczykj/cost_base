from unittest import TestCase
from fractions import Fraction
from fifo_transaction_engine import fifo_transaction_engine


class TestTransaction_engine(TestCase):

    def setUp(self):
        self.fund_name = 'fund'

    def check_closed_unit(self, closed_unit, fund_name, register, transaction, units, expected_cost_usd, currency_conversion_in, payment, currency_conversion_out):
        (given_fund_name, given_register, given_transaction) = closed_unit[0]
        (given_cost, given_cost_in_local_currency, given_payment, given_payment_in_local_currency, given_units) = closed_unit[1]

        self.assertIs(given_fund_name, fund_name, f'Given fund name is different from expected {given_fund_name} <> {fund_name}.')
        self.assertIs(given_register, register, f'Given register is different from expected {given_register} <> {register}.')
        self.assertIs(given_transaction, transaction, f'Given transaction out is different from expected {given_transaction} <> {transaction}.')
        self.assertIsInstance(expected_cost_usd, Fraction)
        self.assertEqual(given_cost, expected_cost_usd, f'Given cost is different from expected {given_cost} USD <> {expected_cost_usd} USD')
        expected_cost_in_currency = expected_cost_usd * currency_conversion_in
        self.assertIsInstance(expected_cost_in_currency, Fraction)
        self.assertEqual(given_cost_in_local_currency, expected_cost_in_currency,
                         f'Given cost in local currency is different from expected {given_cost} USD <> {expected_cost_usd} USD')
        self.assertIsInstance(given_units, Fraction)
        self.assertEqual(given_units, units, f'Given unit number differ from expected {given_units} <> {units}')
        self.assertIsInstance(given_payment, Fraction)
        self.assertEqual(given_payment, payment, f'Given out payment differ from expected {given_payment} <> {payment}')
        expected_payment_in_local_currency = payment * currency_conversion_out
        self.assertIsInstance(given_payment_in_local_currency, Fraction)
        self.assertEqual(given_payment_in_local_currency, expected_payment_in_local_currency,
                              f'Given payment in local currency differ from expected {given_payment_in_local_currency} <> {expected_payment_in_local_currency}')
        
    def check_remaining_unit(self, remaining_unit, fund_name, register, expected_cost_usd, currency_conversion_in, expected_units):
        (given_fund_name, given_register) = remaining_unit[0]
        (given_cost, given_cost_in_local_currency, given_units) = remaining_unit[1]
        self.assertIs(given_fund_name, fund_name, f'Given fund name is different from expected {given_fund_name} <> {fund_name}.')
        self.assertIs(given_register, register, f'Given register is different from expected {given_register} <> {register}.')
        self.assertIsInstance(expected_cost_usd, Fraction)
        self.assertEqual(given_cost, expected_cost_usd, f'Given cost is different from expected {given_cost} USD <> {expected_cost_usd} USD')
        expected_cost_in_currency = expected_cost_usd * currency_conversion_in
        self.assertIsInstance(expected_cost_in_currency, Fraction)
        self.assertIsInstance(given_units, Fraction)
        self.assertEqual(given_units, expected_units, f'Given unit number differ from expected {given_units} <> {expected_units}')

    def two_transaction_test(self, money_paid_in_usd : Fraction = Fraction(102), units_in : Fraction = Fraction(10),
                             fee_in_usd : Fraction = Fraction(102), money_paid_out_usd : Fraction = Fraction(118),
                             units_out : Fraction = Fraction(10), fee_out_usd : Fraction = Fraction(2),
                             currency_conversion_in : Fraction = Fraction(1.2), currency_conversion_out : Fraction = Fraction(1.5)):
        transaction_in = 'in'
        transaction_out = 'out'
        register = '1233516'
        fund_name = 'fund'
        engine = fifo_transaction_engine()
        engine.add_payment(fund_name, register, money_paid_in_usd, fee_in_usd, units_in, currency_conversion_in, transaction_in)
        engine.add_withdrawal(fund_name, register, money_paid_out_usd, fee_out_usd, units_out, currency_conversion_out, transaction_out)
        closed_units = engine.closed_units
        remaining_units = engine.remaining_units

        expected_cost_usd = Fraction(Fraction(money_paid_in_usd) * Fraction(units_out) / Fraction(units_in))
        self.check_closed_unit(closed_units[0], fund_name, register, transaction_out, units_out, expected_cost_usd, currency_conversion_in,
                               money_paid_out_usd, currency_conversion_out)

        if (units_in == units_out):
            self.assertEqual(len(remaining_units), 0)
        else:
            self.assertEqual(len(remaining_units), 1)
            self.check_remaining_unit(remaining_units[0], fund_name, register, money_paid_in_usd * (1 - units_out / units_in), currency_conversion_in, (units_in - units_out))

    def test_simple_two_transactions_full_withdrawal_surplus(self):
        self.two_transaction_test()

    def test_simple_two_transactions_full_withdrawal_deficit(self):
        self.two_transaction_test(money_paid_out_usd=Fraction(50))

    def test_simple_two_transactions_full_withdrawal_deficit_because_of_commision(self):
        self.two_transaction_test(money_paid_out_usd=Fraction(100))

    def test_simple_two_transactions_partial_withdrawal(self):
        self.two_transaction_test(units_out=Fraction(8))

    def two_int_one_out_transaction_test(self, money_paid_a_usd = Fraction(22), units_a_in = Fraction(10), fee_a_in_usd = Fraction(2), currency_conversion_a_in = Fraction(1.2),
                                         money_paid_b_usd = Fraction(10.5), units_b_in = Fraction(2.5), fee_b_in_usd = Fraction(0.5), currency_conversion_b_in = Fraction(1.2),
                                         money_paid_out_usd = Fraction(37.5), units_out = Fraction(12.5), fee_out_usd = Fraction(1), currency_conversion_out = Fraction(1.0)):
        transaction_in_a = 'in a'
        transaction_in_b = 'in b'
        transaction_out = 'out'
        register = '1233516'
        fund_name = 'fund'
        engine = fifo_transaction_engine()
        engine.add_payment(fund_name, register, money_paid_a_usd, fee_a_in_usd, units_a_in, currency_conversion_a_in, transaction_in_a)
        engine.add_payment(fund_name, register, money_paid_b_usd, fee_b_in_usd, units_b_in, currency_conversion_b_in, transaction_in_b)
        engine.add_withdrawal(fund_name, register, money_paid_out_usd, fee_out_usd, units_out, currency_conversion_out, transaction_out)
        closed_units = engine.closed_units
        remaining_units = engine.remaining_units

        if (units_out <= units_a_in):
            cost_usd = money_paid_a_usd * units_out/units_a_in
            self.check_closed_unit(closed_units[0], fund_name, register, transaction_out, units_out, cost_usd,
                                   currency_conversion_a_in, money_paid_out_usd, currency_conversion_out)
            if units_out < units_a_in:
                self.assertEqual(len(remaining_units), 2)
                splitted_unit = remaining_units.pop(0)
                cost_usd = money_paid_a_usd * (1 - units_out/units_a_in)
                self.check_remaining_unit(splitted_unit, fund_name, register, cost_usd, currency_conversion_a_in, (units_a_in - units_out))
            else:
                self.assertEqual(len(remaining_units), 1)

            self.check_remaining_unit(remaining_units[0], fund_name, register, money_paid_b_usd, currency_conversion_b_in, units_b_in)
        else:
            self.assertEqual(len(closed_units), 2)
            self.check_closed_unit(closed_units[0], fund_name, register, transaction_out, units_a_in, money_paid_a_usd,
                                   currency_conversion_a_in, money_paid_out_usd * units_a_in / units_out, currency_conversion_out)

            self.check_closed_unit(closed_units[1], fund_name, register, transaction_out, units_out - units_a_in,
                                   money_paid_b_usd * (units_out - units_a_in) / units_b_in,
                                   currency_conversion_b_in, money_paid_out_usd * (units_out - units_a_in) / units_out, currency_conversion_out)

            if units_out == units_a_in + units_b_in:
                self.assertEqual(len(remaining_units), 0)
            else:
                self.check_remaining_unit(remaining_units[0], fund_name, register, money_paid_b_usd * (1 - (units_out - units_a_in) / units_b_in),
                                          currency_conversion_b_in, units_a_in + units_b_in - units_out)

    def test_one_in_two_out_transactions_partial_first_paid_cost(self):
        self.two_int_one_out_transaction_test(units_out=Fraction(5))

    def test_one_in_two_out_transactions_first_paid_cost(self):
        self.two_int_one_out_transaction_test(units_out=Fraction(10))

    def test_one_in_two_out_transactions_partial_second_paid_cost(self):
        self.two_int_one_out_transaction_test(units_out=Fraction(11))

    def test_one_in_two_out_transactions_partly_withdrawal_surplus(self):
        self.two_int_one_out_transaction_test(units_out=Fraction(12.5))

    def test_conversion_from_and_to_same_fund(self):
        engine = fifo_transaction_engine()
        engine.add_payment('A', '1', Fraction(100), Fraction(0), Fraction(10), Fraction(1), 'transaction 1')
        engine.add_conversion('A', '1', Fraction(2), 'B', '2', Fraction(20), Fraction(0), Fraction(2), 'transaction 2')
        engine.add_conversion('B', '2', Fraction(15), 'A', '1', Fraction(1), Fraction(0), Fraction(2), 'transaction 3')
        engine.add_conversion('B', '2', Fraction(5), 'A', '1', Fraction(1), Fraction(0), Fraction(2), 'transaction 4')
        engine.add_withdrawal('A', '1', Fraction(200), Fraction(0), Fraction(10), Fraction(2), 'transaction out')
        closed_units = engine.closed_units
        remaining_units = engine.remaining_units

        self.assertEqual(len(remaining_units), 0)
        self.assertEqual(len(closed_units), 3)

        self.check_closed_unit(closed_units[0], 'A', '1', 'transaction out', Fraction(8), Fraction(80), Fraction(1), Fraction(160), Fraction(2))
        self.check_closed_unit(closed_units[1], 'A', '1', 'transaction out', Fraction(1), Fraction(15), Fraction(1), Fraction(20), Fraction(2))
        self.check_closed_unit(closed_units[2], 'A', '1', 'transaction out', Fraction(1), Fraction(5), Fraction(1), Fraction(20), Fraction(2))

    def test_conversion_to_other_register(self):
        engine = fifo_transaction_engine()
        engine.add_payment('A', '1', Fraction(100), Fraction(0), Fraction(10), Fraction(1), 'transaction 1')
        engine.add_conversion('A', '1', Fraction(2), 'B', '1', Fraction(4), Fraction(0), Fraction(2), 'transaction 2')

        engine.add_conversion('B', '2', Fraction(15), 'A', '1', Fraction(1), Fraction(0), Fraction(2), 'transaction 3')
        engine.add_conversion('B', '2', Fraction(5), 'A', '1', Fraction(1), Fraction(0), Fraction(2), 'transaction 4')
        engine.add_withdrawal('A', '1', Fraction(200), Fraction(0), Fraction(10), Fraction(2), 'transaction out')
        closed_units = engine.closed_units
        remaining_units = engine.remaining_units

        self.assertEqual(len(remaining_units), 0)
        self.assertEqual(len(closed_units), 3)

        self.check_closed_unit(closed_units[0], 'A', '1', 'transaction out', Fraction(8), Fraction(80), Fraction(1), Fraction(160), Fraction(2))
        self.check_closed_unit(closed_units[1], 'A', '1', 'transaction out', Fraction(1), Fraction(15), Fraction(1), Fraction(20), Fraction(2))
        self.check_closed_unit(closed_units[2], 'A', '1', 'transaction out', Fraction(1), Fraction(5), Fraction(1), Fraction(20), Fraction(2))

