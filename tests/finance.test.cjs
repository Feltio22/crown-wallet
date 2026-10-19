const test = require('node:test');
const assert = require('node:assert/strict');
const finance = require('../.test-build/finance.js');

function baseState() {
  return {
    accounts: [
      { id: 'cash', name: 'Efectivo', currency: 'GYD', openingBalance: 10000, allowNegative: false, manualUsdRate: 240 },
      { id: 'bank', name: 'Banco', currency: 'GYD', openingBalance: 0, allowNegative: true, manualUsdRate: 240 },
      { id: 'usd', name: 'USD', currency: 'USD', openingBalance: 0, allowNegative: false },
    ],
    primaryAccountId: 'cash', goals: [], transactions: [], adjustments: [], transfers: [],
  };
}

test('calcula saldo con ingresos, gastos, ajustes y transferencias activas', () => {
  const s = baseState();
  s.transactions.push({ id:'i', accountId:'cash', kind:'income', amount:500, currency:'GYD', createdAt:'2026-01-01', voided:false });
  s.transactions.push({ id:'e', accountId:'cash', kind:'expense', amount:200, currency:'GYD', createdAt:'2026-01-01', voided:false });
  s.adjustments.push({ id:'a', accountId:'cash', amount:-100, createdAt:'2026-01-01', voided:false });
  s.transfers.push({ id:'t', fromAccountId:'cash', toAccountId:'bank', sentAmount:1000, receivedAmount:950, fromCurrency:'GYD', toCurrency:'GYD', createdAt:'2026-01-01', voided:false });
  assert.equal(finance.getAccountBalance(s, 'cash'), 9200);
  assert.equal(finance.getAccountBalance(s, 'bank'), 950);
});

test('transferencias propias no se clasifican como ingreso ni gasto', () => {
  const s = baseState();
  s.transfers.push({ id:'t', fromAccountId:'cash', toAccountId:'bank', sentAmount:1000, receivedAmount:1000, fromCurrency:'GYD', toCurrency:'GYD', createdAt:'2026-01-01', voided:false });
  assert.equal(finance.getTransactionTotalUsd(s, 'income').value, 0);
  assert.equal(finance.getTransactionTotalUsd(s, 'expense').value, 0);
});

test('gasto de comisión se convierte usando la tasa histórica al registrarse', () => {
  const s = baseState();
  const account = s.accounts[0];
  const fee = finance.createTransactionSnapshot({ id:'fee', accountId:'cash', kind:'expense', amount:240, currency:'GYD', createdAt:'2026-01-01', categoryId:'bank-fees', voided:false }, account);
  assert.equal(fee.usdRateUsed, 240);
  assert.equal(fee.historicalUsdEquivalent, 1);
  account.manualUsdRate = 300;
  assert.equal(finance.getTransactionTotalUsd({ ...s, transactions:[fee] }, 'expense').value, 1);
});

test('rechaza gasto que supera saldo cuando no se permite saldo negativo', () => {
  const result = finance.validateExpense(baseState(), 'cash', 10001);
  assert.equal(result.ok, false);
  assert.equal(result.shortfall, 1);
});

test('ignora movimientos anulados al calcular saldo', () => {
  const s = baseState();
  s.transactions.push({ id:'e', accountId:'cash', kind:'expense', amount:200, currency:'GYD', createdAt:'2026-01-01', voided:true });
  assert.equal(finance.getAccountBalance(s, 'cash'), 10000);
});

test('prioriza tasa manual sobre automática', () => {
  const account = { id:'x', name:'Cuenta', currency:'GYD', openingBalance:0, allowNegative:false, manualUsdRate:250, automaticUsdRate:260 };
  assert.equal(finance.getUsdRate(account), 250);
});

test('marca patrimonio como incompleto si falta tasa de conversión', () => {
  const s = baseState();
  s.accounts.push({ id:'eur', name:'Cuenta EUR', currency:'EUR', openingBalance:50, allowNegative:false });
  const total = finance.getConsolidatedWealthUsd(s);
  assert.deepEqual(total.pendingAccounts, ['Cuenta EUR']);
});

test('la tasa de referencia inicial para cuentas GYD es 240 GYD por USD', () => {
  assert.equal(finance.getUsdRate(finance.initialState.accounts[0]), 240);
  assert.equal(finance.getUsdRate(finance.initialState.accounts[1]), 240);
});


test('la valoración actual de patrimonio usa la tasa global GYD, sin reescribir movimientos históricos', () => {
  const s = baseState();
  const tx = finance.createTransactionSnapshot({ id:'old', accountId:'cash', kind:'expense', amount:240, currency:'GYD', createdAt:'2026-01-01', voided:false }, s.accounts[0], s.exchangeRates);
  s.transactions.push(tx);
  assert.equal(tx.historicalUsdEquivalent, 1);
  s.exchangeRates = { gydPerUsd: 300 };
  assert.equal(finance.getConsolidatedWealthUsd(s).value, 9760 / 300);
  assert.equal(finance.getTransactionTotalUsd(s, 'expense').value, 1);
  assert.equal(s.transactions[0].historicalUsdEquivalent, 1);
});

test('conversión de presupuesto usa tasas actuales coherentes entre GYD y USD', () => {
  const s = baseState();
  s.exchangeRates = { gydPerUsd: 300 };
  assert.equal(finance.convertCurrentAmount(s, 3000, 'GYD', 'USD'), 10);
  assert.equal(finance.convertCurrentAmount(s, 10, 'USD', 'GYD'), 3000);
});

test('preserva la prioridad de tasa manual en monedas que no son GYD', () => {
  const s = baseState();
  s.accounts.push({ id:'eur', name:'Euro', currency:'EUR', openingBalance:0, allowNegative:false, manualUsdRate:0.9, automaticUsdRate:0.92 });
  assert.equal(finance.getCurrentUsdRate(s, 'EUR'), 0.9);
});


test('un movimiento antiguo sin tasa histórica no se revalora silenciosamente con la tasa actual', () => {
  const s = baseState();
  s.transactions.push({ id:'legacy', accountId:'cash', kind:'expense', amount:240, currency:'GYD', createdAt:'2025-01-01', voided:false });
  assert.deepEqual(finance.getTransactionTotalUsd(s, 'expense').pendingAccounts, ['Efectivo']);
  s.exchangeRates = { gydPerUsd: 300 };
  assert.deepEqual(finance.getTransactionTotalUsd(s, 'expense').pendingAccounts, ['Efectivo']);
});


test('los movimientos antiguos en USD no necesitan una tasa de cambio', () => {
  const s = baseState();
  s.transactions.push({ id:'legacy-usd', accountId:'usd', kind:'income', amount:25, currency:'USD', createdAt:'2025-01-01', voided:false });
  assert.equal(finance.getTransactionTotalUsd(s, 'income').value, 25);
  assert.deepEqual(finance.getTransactionTotalUsd(s, 'income').pendingAccounts, []);
});
