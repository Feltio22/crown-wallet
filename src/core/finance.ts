/** Crown Wallet financial core (Phase 1).
 * Amounts are stored in each account's own currency. FX rates mean
 * "units of account currency for 1 USD". Never add unlike currencies.
 */
export type Currency = 'GYD' | 'USD' | 'EUR' | 'GBP' | 'CAD' | 'PYG' | 'UYU' | 'BRL' | 'CRC';

export type Account = {
  id: string;
  name: string;
  currency: Currency;
  openingBalance: number;
  allowNegative: boolean;
  /** Per-account manual override: units of this account's currency per 1 USD. */
  manualUsdRate?: number;
  /** Automatic/reference rate kept separately; never overwrites manual rate. */
  automaticUsdRate?: number;
  automaticRateUpdatedAt?: string;
};

export type Transaction = {
  id: string;
  accountId: string;
  kind: 'income' | 'expense';
  /** Amount in the account's currency. Must be positive. */
  amount: number;
  currency: Currency;
  createdAt: string;
  categoryId?: string;
  note?: string;
  voided: boolean;
  /** Snapshot of the rate used when this transaction was recorded. */
  usdRateUsed?: number;
  /** Historical USD equivalent captured when recorded. */
  historicalUsdEquivalent?: number;
};

export type BalanceAdjustment = {
  id: string;
  accountId: string;
  /** Signed adjustment in account currency; positive adds money. */
  amount: number;
  createdAt: string;
  note?: string;
  voided: boolean;
};

export type Transfer = { id: string; fromAccountId: string; toAccountId: string; sentAmount: number; receivedAmount: number; fromCurrency: Currency; toCurrency: Currency; createdAt: string; note?: string; feeTransactionId?: string; voided: boolean };

export type BudgetSettings = { period: 'daily' | 'weekly' | 'monthly'; amount: number; currency: Currency };

export type ExchangeRateSettings = { gydPerUsd: number }; 

/** A savings goal is a tracking record only; it does not move money between accounts. */
export type SavingsGoal = { id: string; name: string; targetAmount: number; savedAmount: number; currency: Currency; createdAt: string };

export type WalletState = {
  budget?: BudgetSettings;
  exchangeRates?: ExchangeRateSettings;
  goals: SavingsGoal[];
  accounts: Account[];
  primaryAccountId: string;
  transactions: Transaction[];
  adjustments: BalanceAdjustment[];
  transfers: Transfer[];
};

export const initialState: WalletState = {
  exchangeRates: { gydPerUsd: 240 },
  accounts: [
    { id: 'cash-gyd', name: 'Efectivo', currency: 'GYD', openingBalance: 0, allowNegative: false, manualUsdRate: 240 },
    { id: 'bank-gyd', name: 'Tarjeta / Banco', currency: 'GYD', openingBalance: 0, allowNegative: true, manualUsdRate: 240 },
  ],
  primaryAccountId: 'cash-gyd',
  goals: [],
  transactions: [],
  adjustments: [],
  transfers: [],
};

export function formatMoney(amount: number, currency: Currency): string {
  const decimals = currency === 'GYD' ? 0 : 2;
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${currency}`;
}

export function isValidAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0;
}

/** Active account-specific USD rate. Manual takes priority over automatic. */
export function getUsdRate(account: Account, rates?: ExchangeRateSettings): number | null {
  if (account.currency === 'USD') return 1;
  const rate = account.currency === 'GYD' ? (rates?.gydPerUsd ?? account.manualUsdRate ?? account.automaticUsdRate ?? 240) : (account.manualUsdRate ?? account.automaticUsdRate);
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** Convert an amount from the account's currency to USD. null means no known rate. */
export function toUsd(amount: number, account: Account, rates?: ExchangeRateSettings): number | null {
  const rate = getUsdRate(account, rates);
  if (rate === null) return null;
  return account.currency === 'USD' ? amount : amount / rate;
}

export function getAccountBalance(state: WalletState, accountId: string): number | null {
  const account = state.accounts.find(a => a.id === accountId);
  if (!account) return null;
  const transactions = state.transactions
    .filter(t => t.accountId === accountId && !t.voided)
    .reduce((sum, t) => sum + (t.kind === 'income' ? t.amount : -t.amount), 0);
  const adjustments = state.adjustments
    .filter(a => a.accountId === accountId && !a.voided)
    .reduce((sum, a) => sum + a.amount, 0);
  const transfers = (state.transfers ?? []).filter(t => !t.voided).reduce((sum, t) => {
    if (t.fromAccountId === accountId) return sum - t.sentAmount;
    if (t.toAccountId === accountId) return sum + t.receivedAmount;
    return sum;
  }, 0);
  return account.openingBalance + transactions + adjustments + transfers;
}

export type ValidationResult = { ok: true } | { ok: false; reason: string; shortfall?: number };

/** Checks a proposed expense against the account's negative-balance policy. */
export function validateExpense(state: WalletState, accountId: string, amount: number): ValidationResult {
  if (!isValidAmount(amount)) return { ok: false, reason: 'El importe debe ser mayor que cero.' };
  const account = state.accounts.find(a => a.id === accountId);
  if (!account) return { ok: false, reason: 'No se encontró la cuenta seleccionada.' };
  const balance = getAccountBalance(state, accountId);
  if (balance === null) return { ok: false, reason: 'No se pudo calcular el saldo de la cuenta.' };
  if (!account.allowNegative && amount > balance) {
    return { ok: false, reason: 'Saldo insuficiente y el saldo negativo está desactivado.', shortfall: amount - balance };
  }
  return { ok: true };
}

export type UsdTotal = { value: number; pendingAccounts: string[] };

/** Consolidates account balances in USD; reports missing rates instead of pretending the total is complete. */
export function getConsolidatedWealthUsd(state: WalletState): UsdTotal {
  let value = 0;
  const pendingAccounts: string[] = [];
  for (const account of state.accounts) {
    const balance = getAccountBalance(state, account.id);
    if (balance === null) continue;
    const currentRate = getCurrentUsdRate(state, account.currency);
    if (currentRate === null) pendingAccounts.push(account.name);
    else value += account.currency === 'USD' ? balance : balance / currentRate;
  }
  return { value, pendingAccounts };
}

/** Sums one transaction kind in USD using historical equivalents/rates where available. */
export function getTransactionTotalUsd(state: WalletState, kind: Transaction['kind']): UsdTotal {
  let value = 0;
  const pendingAccounts = new Set<string>();
  for (const transaction of state.transactions) {
    if (transaction.voided || transaction.kind !== kind) continue;
    const account = state.accounts.find(a => a.id === transaction.accountId);
    if (!account) { pendingAccounts.add('Cuenta no encontrada'); continue; }
    let usd = transaction.historicalUsdEquivalent;
    if (usd === undefined) {
      if (account.currency === 'USD') usd = transaction.amount;
      else {
        const rate = transaction.usdRateUsed;
        if (rate === null || rate === undefined || !Number.isFinite(rate) || rate <= 0) {
          pendingAccounts.add(account.name);
          continue;
        }
        usd = transaction.amount / rate;
      }
    }
    value += usd;
  }
  return { value, pendingAccounts: [...pendingAccounts] };
}

/** Snapshot rate and historical USD equivalent for a transaction at recording time. */
export function createTransactionSnapshot(
  input: Omit<Transaction, 'usdRateUsed' | 'historicalUsdEquivalent'>,
  account: Account,
  rates?: ExchangeRateSettings,
): Transaction {
  if (input.accountId !== account.id) throw new Error('La transacción y la cuenta no coinciden.');
  if (input.currency !== account.currency) throw new Error('La moneda debe coincidir con la moneda de la cuenta.');
  if (!isValidAmount(input.amount)) throw new Error('El importe debe ser mayor que cero.');
  const rate = getUsdRate(account, rates);
  const usd = toUsd(input.amount, account, rates);
  return {
    ...input,
    ...(rate === null ? {} : { usdRateUsed: rate }),
    ...(usd === null ? {} : { historicalUsdEquivalent: usd }),
  };
}

/** Current valuation rate for a currency, in units of that currency per USD. */
export function getCurrentUsdRate(state: WalletState, currency: Currency): number | null {
  if (currency === 'USD') return 1;
  if (currency === 'GYD') {
    const rate = state.exchangeRates?.gydPerUsd ?? 240;
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  }
  const account = state.accounts.find(a => a.currency === currency);
  return account ? getUsdRate(account, state.exchangeRates) : null;
}

/** Converts a current amount between currencies using current rates, not historical transaction snapshots. */
export function convertCurrentAmount(state: WalletState, amount: number, fromCurrency: Currency, toCurrency: Currency): number | null {
  const fromRate = getCurrentUsdRate(state, fromCurrency);
  const toRate = getCurrentUsdRate(state, toCurrency);
  if (fromRate === null || toRate === null) return null;
  const usd = fromCurrency === 'USD' ? amount : amount / fromRate;
  return toCurrency === 'USD' ? usd : usd * toRate;
}
