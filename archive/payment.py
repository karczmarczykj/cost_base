from fractions import Fraction

class payment_unit:
    def __init__(self, fund_name : str, register : str, cost : Fraction, units : Fraction,
                 currency_conversion_rate : Fraction, transaction : str):
        assert all([x > 0 for x in (units, cost)])
        self.__fund_name = fund_name
        self.__register = register
        self.__transaction = transaction
        self.__units = units
        self.__cost = cost
        self.__status = 'exists'
        self.__buy_currency_conversion_rate = currency_conversion_rate
        assert(type(self.__cost) is Fraction)

    def __mul__(self, multiplier : Fraction):
        self.__cost *= multiplier
        self.__units *= multiplier
        return self

    def convert(self, dst_fund : str, dst_register : str, dst_units : Fraction, transaction : str):
        self.__fund_name = dst_fund
        self.__register = dst_register
        self.__transaction = transaction
        self.__units = dst_units

    def close(self, redemption_payment : Fraction, currency_exchange_rate : Fraction, transaction : str):
        self.__redemption_payment = redemption_payment
        self.__redemption_currency_conversion_rate = currency_exchange_rate
        self.__transaction = transaction
        self.__status = 'closed'

    @property
    def is_closed(self) -> bool:
        return self.__status != 'exists'

    @property
    def fund_name(self) -> str:
        return self.__fund_name

    @property
    def register(self) -> str:
        return self.__register

    @property
    def transaction(self) -> str:
        return self.__transaction

    @property
    def units(self) -> Fraction:
        return self.__units

    @property
    def cost(self) -> Fraction:
        return self.__cost

    @property
    def cost_in_local_currency(self) -> Fraction:
        return self.__cost * self.__buy_currency_conversion_rate

    @property
    def close_key(self):
        if self.__status != 'closed':
            raise Exception('Can\'t get closing key when transaction is not yet closed')
        return (self.fund_name, self.register, self.transaction)

    @property
    def close_value(self):
        if self.__status != 'closed':
            raise Exception('Can\'t get closing value when transaction is not yet closed')
        cost = self.__cost
        cost_in_local_currency = self.cost_in_local_currency
        units = self.units
        payment = self.__redemption_payment
        payment_in_local_currency = payment * self.__redemption_currency_conversion_rate
        return (cost, cost_in_local_currency, payment, payment_in_local_currency, units)

    @property
    def key(self):
        return (self.fund_name, self.register)

    @property
    def remaining_value(self):
        return (self.__cost, self.cost_in_local_currency, self.units)
