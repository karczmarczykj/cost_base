import copy
from fractions import Fraction
from collections import deque
from payment import payment_unit
from graphviz import Digraph

class fifo_transaction_engine:
    def __init__(self):
        self.__payments = {}
        self.__diagram = Digraph(comment='FIFO transactions analysis', engine='dot')
        self.__edges = set()
        self.__buy_no = 1
        self.__convert_no = 1
        self.__sell_no = 1

    def __get_payment_list(self, fund_name : str, register : str):
        payment_key = (fund_name, register)
        if payment_key not in self.__payments:
            self.__payments[payment_key] = deque()
        return self.__payments[payment_key]

    def __adjust_payments(self, fund_name : str, register : str, units : Fraction, remove_elements = False):
        assert units > 0
        remaining_units = units
        payment_list = self.__get_payment_list(fund_name, register)
        collected_units = deque()
        while remaining_units > 0:
            if len(payment_list) == 0:
                break
            payment = payment_list.popleft()
            if payment.units <= remaining_units:
                collected_units.append(payment)
                remaining_units -= payment.units
            else:
                split_ration = remaining_units / payment.units
                collected_units.append(copy.deepcopy(payment) * split_ration)
                payment_list.appendleft(payment * (1 - split_ration))
                remaining_units = 0
        if remaining_units > 0:
            raise ValueError(f'Can\'t adjust units in  (remaining units = {float(remaining_units)}, fund name = {fund_name}, register = {register})')
        if not remove_elements:
            tmp_collection = collected_units
            tmp_collection.reverse()
            payment_list.extendleft(tmp_collection)
        return collected_units

    def __desc_label(self,fund_name : str, register : str, cost_usd : Fraction, cost_pln : Fraction, fee_usd : Fraction, fee_pln : Fraction,
                          units : Fraction, transaction_number : str):
        text = f'{"Transaction:":<12}  {transaction_number}\\l'
        text += f'{"Register:":<12}    {register}\\l'
        text += f'{"Fund:":<12}    "{fund_name}"\\l'
        text += f'{"Units:":<12}      {float(units):,.2f}\\l'
        text += f'{"Cost:":<12}     {float(cost_usd):,.2f} USD ({float(cost_pln):,.2f} PLN)\\l'
        text += f'{"Fee:":<12}      {float(fee_usd):,.2f} USD ({float(fee_pln):,.2f} PLN)\\l'
        return text

    def __buy_description(self, fund_name : str, register : str, cost_usd : Fraction, cost_pln : Fraction, fee_usd : Fraction, fee_pln : Fraction,
                          units : Fraction, transaction_number : str):
        text = f'Buy #{self.__buy_no}\\n'
        text += self.__desc_label(fund_name, register, cost_usd, cost_pln, fee_usd, fee_pln, units, transaction_number)
        self.__buy_no+=1
        self.__diagram.node(transaction_number, label=text, shape='box', group=register, style='bold', color='forestgreen')

    def __convert_description(self, fund_name : str, register : str, cost_usd : Fraction, cost_pln : Fraction, fee_usd : Fraction,
                              fee_pln :Fraction, units : Fraction, transaction_number : str):
        text = f'Convert #{self.__convert_no}\n'
        text += self.__desc_label(fund_name, register, cost_usd, cost_pln, fee_usd, fee_pln, units, transaction_number)
        self.__convert_no+=1
        self.__diagram.node(transaction_number, label=text, shape='box', group=register, style='bold', color='lightskyblue1')

    def __sell_description(self, fund_name : str, register : str, cost_usd : Fraction, cost_pln : Fraction, units : Fraction,
                    transaction_number : str, fee_usd : Fraction, fee_pln : Fraction, payment_usd : Fraction, payment_pln : Fraction):
        text = f'Sell #{self.__sell_no}\n'
        text += self.__desc_label(fund_name, register, cost_usd, cost_pln, fee_usd, fee_pln, units, transaction_number)
        text += f'{"Payment:":<12}   {float(payment_usd):,.2f} USD ({float(payment_pln):,.2f} PLN)\\l'
        self.__sell_no += 1
        self.__diagram.node(transaction_number, label=text, shape='box', group=register, style='bold', color='red2')

    def add_payment(self, fund_name : str, register : str, payment : Fraction, fee : Fraction, units : Fraction,
                    currency_conversion_rate : Fraction, transaction_number : str):
        assert units > 0
        assert all([x > 0 for x in (units, payment, currency_conversion_rate)])
        assert all([type(x) is Fraction for x in (payment, fee, units, currency_conversion_rate)])
        payment_list = self.__get_payment_list(fund_name, register)
        payment_list.append(payment_unit(fund_name, register, payment, units, currency_conversion_rate, transaction_number))
        self.__buy_description(fund_name, register, payment, payment * currency_conversion_rate, fee,
                               fee * currency_conversion_rate, units, transaction_number)

    def add_conversion(self, src_fund_name : str, src_register: str, src_units : Fraction, dst_fund_name : str,
                       dst_register : str, dst_units : Fraction, fee : Fraction, currency_conversion_rate : Fraction, transaction_number : str):
        assert all([x > 0 for x in (src_units, dst_units)])
        assert all([type(x) is Fraction for x in (src_units, dst_units, fee, currency_conversion_rate)])
        payment_list = self.__adjust_payments(src_fund_name, src_register, src_units, True)
        cost_usd = 0
        cost_pln = 0
        for payment in payment_list:
            current_units = payment.units
            cost_usd += payment.remaining_value[0]
            cost_pln += payment.remaining_value[1]
            self.__edges.add((payment.transaction, transaction_number))
            payment.convert(dst_fund_name, dst_register, (current_units * dst_units) / src_units, transaction_number)
        self.__get_payment_list(dst_fund_name, dst_register).extend(payment_list)
        self.__convert_description(dst_fund_name, dst_register, cost_usd, cost_pln, fee,
                                   fee * currency_conversion_rate, dst_units, transaction_number)

    def add_withdrawal(self, fund_name : str, register : str, out_payment : Fraction, fee : Fraction, units : Fraction,
                       currency_conversion_rate : Fraction, transaction_number : str):
        assert all([x > 0 for x in (units, out_payment, currency_conversion_rate)])
        assert all([type(x) is Fraction for x in (out_payment, fee, units, currency_conversion_rate)])
        unit_list = self.__adjust_payments(fund_name, register, units)
        cost_usd = 0
        cost_pln = 0
        for payment in unit_list:
            current_units = payment.units
            cost_usd += payment.remaining_value[0]
            cost_pln += payment.remaining_value[1]
            self.__edges.add((payment.transaction, transaction_number))
            payment.close((out_payment * current_units) / units, currency_conversion_rate, transaction_number)
        self.__sell_description(fund_name, register, cost_usd, cost_pln, units, transaction_number, fee,
                                fee * currency_conversion_rate, out_payment, out_payment * currency_conversion_rate)

    @property
    def closed_units(self):
        retval = []
        for (key, value) in self.__payments.items():
            for payment in value:
                if not payment.is_closed:
                    continue
                retval.append((payment.close_key, payment.close_value))
        return retval

    @property
    def remaining_units(self):
        retval = []
        for (key, value) in self.__payments.items():
            for payment in value:
                if payment.is_closed:
                    continue
                retval.append((payment.key, payment.remaining_value))
        return retval

    @property
    def closed_transactions(self):
        retval = {}
        for (key, value) in self.closed_units:
                if key not in retval:
                    retval[key] = value
                else:
                    retval[key] = tuple( x + y for x, y in zip(value, retval[key]))
        return retval

    @property
    def remaining_funds(self):
        retval = {}
        for (key, value) in self.remaining_units:
            if key not in retval:
                retval[key] = value
            else:
                retval[key] = tuple(x + y for x, y in zip(value, retval[key]))
        return retval

    def generate_diagram(self, render_file):
        for (src, dst) in self.__edges:
            self.__diagram.edge(src, dst)
        return self.__diagram.render(render_file, view=True, format='png')


