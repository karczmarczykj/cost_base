import unittest
from payment import payment_unit
from fractions import Fraction

class test_payment_test(unittest.TestCase):

    def setUp(self):
        self.params = {'primary' : {}, 'secondary' : {}}
        self.params['primary']['fund']='Subfund gold'
        self.params['primary']['cost'] = 300000.23
        self.params['primary']['transaction'] = '1-1'
        self.params['primary']['register'] = '121'
        self.params['primary']['units'] = 3.23
        self.params['primary']['currency_exchange_rate'] = 0.000001

        self.params['secondary']['fund']='Subfund bond'
        self.params['secondary']['transaction'] = '1-2'
        self.params['secondary']['register'] = '129'
        self.params['secondary']['units'] = 7.12

    def create_payment_unit(self, name : str):
        params = self.params[name]
        return payment_unit(params['fund'], params['register'], params['cost'], params['units'], params['currency_exchange_rate'], params['transaction'])

    def convert_to(self, payment : payment_unit, name : str):
        params = self.params[name]
        payment.convert(params['fund'], params['register'], params['units'], params['transaction'])

    def test_initialization_params(self):
        unit = self.create_payment_unit('primary')
        params = self.params['primary']
        self.assertEqual(unit.fund_name, params['fund'])
        self.assertEqual(unit.register, params['register'])
        self.assertEqual(unit.transaction, params['transaction'])
        self.assertEqual(unit.units, float(params['units']))
        self.assertEqual(unit.cost, float(params['cost']))
        self.assertEqual(unit.cost_in_local_currency, float(params['cost'] * params['currency_exchange_rate']))
        self.assertFalse(unit.is_closed)

    def test_key(self):
        unit = self.create_payment_unit('primary')
        (fund_name, register) = unit.key
        params = self.params['primary']
        self.assertEqual(fund_name, params['fund'])
        self.assertEqual(register, params['register'])

    def test_remaining_value(self):
        unit = self.create_payment_unit('primary')
        (cost, cost_in_local_currency, units) = unit.remaining_value
        params = self.params['primary']
        self.assertEqual(cost, params['cost'])
        self.assertEqual(cost_in_local_currency, params['cost'] * params['currency_exchange_rate'])
        self.assertEqual(units, params['units'])

    def test_multiplication(self):
        rate = 0.3
        unit = self.create_payment_unit('primary') * Fraction(rate)
        params = self.params['primary']
        self.assertEqual(unit.units, params['units'] * rate)
        self.assertEqual(unit.cost, params['cost'] * rate)
        self.assertEqual(unit.cost_in_local_currency, params['cost'] * params['currency_exchange_rate'] * rate)

    def test_close_transaction_key(self):
        params = self.params['primary']
        unit = self.create_payment_unit('primary')
        currency_exchange_rate = Fraction(3)
        unit.close(Fraction(100), currency_exchange_rate, '2-1')
        (fund_name, register, transaction) = unit.close_key
        self.assertEqual(fund_name, params['fund'])
        self.assertEqual(register, params['register'])
        self.assertEqual(transaction, '2-1')
        self.assertTrue(unit.is_closed)

    def test_close_transaction_value(self):
        params = self.params['primary']
        unit = self.create_payment_unit('primary')
        given_payment = 100.0
        currency_exchange_rate = 3.0
        unit.close(Fraction(given_payment), Fraction(currency_exchange_rate), '2-1')
        (cost, cost_in_local_currency, payment, payment_in_local_currency, units) = unit.close_value
        self.assertEqual(cost, params['cost'])
        self.assertEqual(cost_in_local_currency, params['cost'] * params['currency_exchange_rate'])
        self.assertEqual(payment, given_payment)
        self.assertEqual(payment_in_local_currency, given_payment * currency_exchange_rate)
        self.assertEqual(units, params['units'])

    def test_unit_conversion(self):
        params = self.params['secondary']
        unit = self.create_payment_unit('primary')
        self.convert_to(unit, 'secondary')
        self.assertEqual(unit.fund_name, params['fund'])
        self.assertEqual(unit.cost, self.params['primary']['cost'])
        self.assertEqual(unit.cost_in_local_currency, self.params['primary']['cost'] * self.params['primary']['currency_exchange_rate'])
        self.assertEqual(unit.transaction, params['transaction'])
        self.assertEqual(unit.register, params['register'])
        self.assertEqual(unit.units, params['units'])

if __name__ == '__main__':
    unittest.main()
