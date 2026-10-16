import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StatusBar, Text, TouchableOpacity, View, StyleSheet, TextInput, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Account, Currency, SavingsGoal, Transfer, createTransactionSnapshot, formatMoney, getAccountBalance, getConsolidatedWealthUsd, getTransactionTotalUsd, initialState, isValidAmount, validateExpense, WalletState } from './src/core/finance';

const STORAGE_KEY = 'crown-wallet-state-v1';
type Tab = 'Inicio' | 'Categorías' | 'Estadísticas' | 'Movimientos';
type Kind = 'income' | 'expense';
const CATEGORIES: Record<Kind, { id: string; name: string }[]> = {
  expense: [
    { id: 'food', name: 'Comida' }, { id: 'transport', name: 'Transporte' },
    { id: 'home', name: 'Hogar' }, { id: 'bills', name: 'Facturas' },
    { id: 'health', name: 'Salud' }, { id: 'shopping', name: 'Compras' },
    { id: 'entertainment', name: 'Entretenimiento' }, { id: 'bank-fees', name: 'Comisiones bancarias' },
    { id: 'other-expense', name: 'Otros gastos' },
  ],
  income: [
    { id: 'salary', name: 'Salario' }, { id: 'business', name: 'Negocio' },
    { id: 'gift', name: 'Regalo' }, { id: 'refund', name: 'Reembolso' },
    { id: 'other-income', name: 'Otros ingresos' },
  ],
};
const categoryName = (id?: string) => Object.values(CATEGORIES).flat().find(c => c.id === id)?.name ?? 'Sin categoría';

export default function App() {
  const [state, setState] = useState<WalletState>(initialState);
  const [tab, setTab] = useState<Tab>('Inicio');
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('expense');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState('cash-gyd');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState('food');
  const [accountManagerOpen, setAccountManagerOpen] = useState(false);
  const [transferManagerOpen, setTransferManagerOpen] = useState(false);
  const [transferFromId, setTransferFromId] = useState('cash-gyd');
  const [transferToId, setTransferToId] = useState('bank-gyd');
  const [transferSentText, setTransferSentText] = useState('');
  const [transferReceivedText, setTransferReceivedText] = useState('');
  const [transferNoteText, setTransferNoteText] = useState('');
  const [transferFeeText, setTransferFeeText] = useState('0');
  const [accountNameText, setAccountNameText] = useState('');
  const [accountCurrency, setAccountCurrency] = useState<Currency>('GYD');
  const [openingBalanceText, setOpeningBalanceText] = useState('0');
  const [rateText, setRateText] = useState('240');
  const [allowNegativeNew, setAllowNegativeNew] = useState(false);
  const [adjustmentAccountId, setAdjustmentAccountId] = useState('cash-gyd');
  const [adjustmentAmountText, setAdjustmentAmountText] = useState('');
  const [adjustmentNoteText, setAdjustmentNoteText] = useState('');
  const [budgetPeriod, setBudgetPeriod] = useState<'weekly' | 'monthly'>('monthly');
  const [budgetAmountText, setBudgetAmountText] = useState('');
  const [goalNameText, setGoalNameText] = useState('');
  const [goalTargetText, setGoalTargetText] = useState('');
  const [goalSavedText, setGoalSavedText] = useState('0');
  const [goalCurrency, setGoalCurrency] = useState<Currency>('GYD');
  const [goalContributionText, setGoalContributionText] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<WalletState>;
          setState({ ...initialState, ...parsed, accounts: Array.isArray(parsed.accounts) ? parsed.accounts : initialState.accounts, transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [], goals: Array.isArray(parsed.goals) ? parsed.goals : [], adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments : [], transfers: Array.isArray(parsed.transfers) ? parsed.transfers : [], primaryAccountId: parsed.primaryAccountId ?? initialState.primaryAccountId });
          if (parsed.budget) { setBudgetPeriod(parsed.budget.period); setBudgetAmountText(String(parsed.budget.amount)); }
        }
      } catch { /* conserva estado inicial si el almacenamiento falla */ }
      finally { setLoaded(true); }
    })();
  }, []);
  useEffect(() => { if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => Alert.alert('Aviso', 'No se pudo guardar en el almacenamiento local.')); }, [state, loaded]);

  const mainAccount = state.accounts.find(a => a.id === state.primaryAccountId) ?? state.accounts[0];
  const selectedAccount = state.accounts.find(a => a.id === accountId) ?? state.accounts[0];
  const totalIncome = getTransactionTotalUsd(state, 'income');
  const totalExpense = getTransactionTotalUsd(state, 'expense');
  const wealth = getConsolidatedWealthUsd(state);
  const mainBalance = mainAccount ? getAccountBalance(state, mainAccount.id) ?? 0 : 0;

  const openForm = (nextKind: Kind = 'expense') => {
    setKind(nextKind); setCategoryId(CATEGORIES[nextKind][0].id); setAccountId(mainAccount?.id ?? state.accounts[0]?.id ?? 'cash-gyd'); setAmountText(''); setNote(''); setEditingId(null); setFormOpen(true);
  };
  const saveMovement = () => {
    const amount = Number(amountText.trim());
    if (!selectedAccount) { Alert.alert('Cuenta no disponible', 'No se encontró una cuenta para este movimiento.'); return; }
    if (!isValidAmount(amount)) { Alert.alert('Importe incorrecto', 'Escribe una cantidad mayor que cero. Usa punto para los decimales.'); return; }
    if (kind === 'expense') {
      const validationState = editingId ? { ...state, transactions: state.transactions.filter(t => t.id !== editingId) } : state;
      const result = validateExpense(validationState, selectedAccount.id, amount);
      if (!result.ok) { Alert.alert('Saldo insuficiente', `${result.reason}${result.shortfall !== undefined ? `\nTe faltan ${formatMoney(result.shortfall, selectedAccount.currency)}.` : ''}`); return; }
    }
    try {
      const existing = editingId ? state.transactions.find(t => t.id === editingId) : undefined;
      const tx = createTransactionSnapshot({ id: editingId ?? `tx-${Date.now()}`, accountId: selectedAccount.id, kind, amount, currency: selectedAccount.currency, createdAt: existing?.createdAt ?? new Date().toISOString(), categoryId, note: note.trim() || undefined, voided: false }, selectedAccount);
      setState(s => ({ ...s, transactions: editingId ? s.transactions.map(t => t.id === editingId ? tx : t) : [tx, ...s.transactions] }));
      setFormOpen(false); setTab('Movimientos'); setAmountText(''); setNote(''); setEditingId(null);
      Alert.alert('Guardado', `${editingId ? 'Movimiento actualizado' : kind === 'income' ? 'Ingreso registrado' : 'Gasto registrado'}: ${formatMoney(amount, selectedAccount.currency)}.`);
    } catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar el movimiento.'); }
  };


  const saveTransfer = () => {
    const from = state.accounts.find(a => a.id === transferFromId);
    const to = state.accounts.find(a => a.id === transferToId);
    const sentAmount = Number(transferSentText.trim());
    const receivedAmount = Number((transferReceivedText.trim() || transferSentText.trim()));
    const feeAmount = Number((transferFeeText.trim() || '0'));
    if (!from || !to) { Alert.alert('Cuenta no encontrada', 'Selecciona las cuentas de origen y destino.'); return; }
    if (from.id === to.id) { Alert.alert('Cuentas iguales', 'Elige dos cuentas diferentes para hacer la transferencia.'); return; }
    if (!isValidAmount(sentAmount) || !isValidAmount(receivedAmount)) { Alert.alert('Importe incorrecto', 'Los importes enviado y recibido deben ser mayores que cero.'); return; }
    if (!Number.isFinite(feeAmount) || feeAmount < 0) { Alert.alert('Comisión incorrecta', 'La comisión debe ser cero o un importe positivo.'); return; }
    const balance = getAccountBalance(state, from.id) ?? 0;
    const totalDebit = sentAmount + feeAmount;
    if (!from.allowNegative && totalDebit > balance) { Alert.alert('Saldo insuficiente', `La cuenta de origen no tiene saldo suficiente para el envío y la comisión. Disponible: ${formatMoney(balance, from.currency)}.`); return; }
    const transferId = `transfer-${Date.now()}`;
    const feeTransactionId = feeAmount > 0 ? `tx-fee-${transferId}` : undefined;
    const transfer: Transfer = { id: transferId, fromAccountId: from.id, toAccountId: to.id, sentAmount, receivedAmount, fromCurrency: from.currency, toCurrency: to.currency, createdAt: new Date().toISOString(), note: transferNoteText.trim() || undefined, feeTransactionId, voided: false };
    const feeTransaction = feeAmount > 0 ? createTransactionSnapshot({ id: feeTransactionId!, accountId: from.id, kind: 'expense', amount: feeAmount, currency: from.currency, createdAt: transfer.createdAt, categoryId: 'bank-fees', note: `Comisión por transferencia a ${to.name}`, voided: false }, from) : undefined;
    setState(s => ({ ...s, transfers: [transfer, ...(s.transfers ?? [])], transactions: feeTransaction ? [feeTransaction, ...s.transactions] : s.transactions }));
    setTransferSentText(''); setTransferReceivedText(''); setTransferNoteText(''); setTransferFeeText('0');
    Alert.alert('Transferencia registrada', `${formatMoney(sentAmount, from.currency)} enviados desde ${from.name}; ${formatMoney(receivedAmount, to.currency)} recibidos en ${to.name}.${feeAmount > 0 ? ` Comisión registrada como gasto separado: ${formatMoney(feeAmount, from.currency)}.` : ''} La transferencia no se cuenta como ingreso ni gasto.`);
  };

  const addAccount = () => {
    const name = accountNameText.trim();
    const openingBalance = Number(openingBalanceText.trim());
    const rate = accountCurrency === 'USD' ? 1 : Number(rateText.trim());
    if (!name) { Alert.alert('Falta el nombre', 'Escribe un nombre para la cuenta.'); return; }
    if (!Number.isFinite(openingBalance)) { Alert.alert('Saldo incorrecto', 'Escribe un saldo inicial válido.'); return; }
    if (accountCurrency !== 'USD' && (!Number.isFinite(rate) || rate <= 0)) { Alert.alert('Tasa incorrecta', 'La tasa debe ser mayor que cero.'); return; }
    if (!allowNegativeNew && openingBalance < 0) { Alert.alert('Saldo negativo', 'Activa “Permitir saldo negativo” o corrige el saldo inicial.'); return; }
    const id = `account-${Date.now()}`;
    const account: Account = { id, name, currency: accountCurrency, openingBalance, allowNegative: allowNegativeNew, ...(accountCurrency === 'USD' ? {} : { manualUsdRate: rate }) };
    setState(s => ({ ...s, accounts: [...s.accounts, account], primaryAccountId: id }));
    setAccountId(id); setAdjustmentAccountId(id); setAccountNameText(''); setOpeningBalanceText('0'); setRateText('240'); setAccountCurrency('GYD'); setAllowNegativeNew(false);
    Alert.alert('Cuenta creada', `${name} se añadió y ahora es tu cuenta principal.`);
  };
  const saveAdjustment = () => {
    const amount = Number(adjustmentAmountText.trim());
    const account = state.accounts.find(a => a.id === adjustmentAccountId);
    if (!account) { Alert.alert('Cuenta no encontrada', 'Selecciona una cuenta válida.'); return; }
    if (!Number.isFinite(amount) || amount === 0) { Alert.alert('Importe incorrecto', 'Escribe un ajuste distinto de cero. Usa un número negativo para restar saldo.'); return; }
    const current = getAccountBalance(state, account.id) ?? 0;
    if (!account.allowNegative && current + amount < 0) { Alert.alert('Saldo negativo bloqueado', 'Este ajuste dejaría la cuenta con saldo negativo.'); return; }
    setState(s => ({ ...s, adjustments: [...s.adjustments, { id: `adjust-${Date.now()}`, accountId: account.id, amount, createdAt: new Date().toISOString(), note: adjustmentNoteText.trim() || 'Ajuste manual de saldo', voided: false }] }));
    setAdjustmentAmountText(''); setAdjustmentNoteText('');
    Alert.alert('Saldo ajustado', 'El ajuste se guardó por separado. No cuenta como ingreso ni gasto.');
  };
  const toggleNegative = (account: Account) => {
    const balance = getAccountBalance(state, account.id) ?? 0;
    if (account.allowNegative && balance < 0) { Alert.alert('No se puede bloquear', 'Esta cuenta tiene saldo negativo. Primero corrige el saldo.'); return; }
    setState(s => ({ ...s, accounts: s.accounts.map(a => a.id === account.id ? { ...a, allowNegative: !a.allowNegative } : a) }));
  };
  const saveBudget = () => {
    const amount = Number(budgetAmountText.trim());
    if (!Number.isFinite(amount) || amount <= 0) { Alert.alert('Presupuesto incorrecto', 'Escribe un límite mayor que cero.'); return; }
    const currency = mainAccount?.currency ?? 'GYD';
    setState(s => ({ ...s, budget: { period: budgetPeriod, amount, currency } }));
    Alert.alert('Presupuesto guardado', `Tu límite ${budgetPeriod === 'weekly' ? 'semanal' : 'mensual'} es ${formatMoney(amount, currency)}.`);
  };

  const addGoal = () => {
    const name = goalNameText.trim();
    const targetAmount = Number(goalTargetText.trim());
    const savedAmount = Number(goalSavedText.trim() || '0');
    if (!name) { Alert.alert('Falta el nombre', 'Escribe para qué estás ahorrando.'); return; }
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) { Alert.alert('Meta incorrecta', 'El importe objetivo debe ser mayor que cero.'); return; }
    if (!Number.isFinite(savedAmount) || savedAmount < 0 || savedAmount > targetAmount) { Alert.alert('Ahorro inicial incorrecto', 'El ahorro inicial debe ser cero o más y no superar la meta.'); return; }
    const goal: SavingsGoal = { id: `goal-${Date.now()}`, name, targetAmount, savedAmount, currency: goalCurrency, createdAt: new Date().toISOString() };
    setState(s => ({ ...s, goals: [...(s.goals ?? []), goal] }));
    setGoalNameText(''); setGoalTargetText(''); setGoalSavedText('0');
    Alert.alert('Meta creada', 'La meta se guardó. Su progreso es solo de seguimiento y no modifica el saldo de tus cuentas.');
  };
  const addGoalContribution = (goal: SavingsGoal) => {
    const amount = Number((goalContributionText[goal.id] ?? '').trim());
    if (!Number.isFinite(amount) || amount <= 0) { Alert.alert('Importe incorrecto', 'Escribe una aportación mayor que cero.'); return; }
    setState(s => ({ ...s, goals: (s.goals ?? []).map(g => g.id === goal.id ? { ...g, savedAmount: Math.min(g.targetAmount, g.savedAmount + amount) } : g) }));
    setGoalContributionText(s => ({ ...s, [goal.id]: '' }));
  };

  const budget = state.budget;
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if ((budget?.period ?? budgetPeriod) === 'weekly') { const day = (periodStart.getDay() + 6) % 7; periodStart.setDate(periodStart.getDate() - day); } else periodStart.setDate(1);
  const periodEnd = (budget?.period ?? budgetPeriod) === 'weekly' ? new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + 7) : new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1);
  const daysLeft = Math.max(1, Math.ceil((periodEnd.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000));
  const budgetCurrency = budget?.currency ?? mainAccount?.currency ?? 'GYD';
  const budgetRateAccount = state.accounts.find(a => a.currency === budgetCurrency);
  const budgetUsdRate = budgetCurrency === 'USD' ? 1 : budgetRateAccount ? (budgetRateAccount.manualUsdRate ?? budgetRateAccount.automaticUsdRate ?? null) : null;
  const periodExpenses = state.transactions.filter(t => !t.voided && t.kind === 'expense' && new Date(t.createdAt) >= periodStart && new Date(t.createdAt) < periodEnd);
  let spentInBudget = 0; let budgetHasPending = false;
  for (const t of periodExpenses) {
    const a = state.accounts.find(x => x.id === t.accountId);
    const usd = t.historicalUsdEquivalent ?? (a && (t.usdRateUsed ?? (a.currency === 'USD' ? 1 : a.manualUsdRate ?? a.automaticUsdRate)) ? t.amount / (a!.currency === 'USD' ? 1 : (t.usdRateUsed ?? a!.manualUsdRate ?? a!.automaticUsdRate)!) : undefined);
    if (usd === undefined || budgetUsdRate === null || budgetUsdRate <= 0) budgetHasPending = true; else spentInBudget += usd * budgetUsdRate;
  }
  const budgetRemaining = budget ? budget.amount - spentInBudget : 0;
  const dailyAvailable = budget ? budgetRemaining / daysLeft : 0;

  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="light-content" backgroundColor="#0b0f17" />
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>♛  Mi Presupuesto💰</Text>
      <Text style={styles.date}>{new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      {transferManagerOpen ? <View style={styles.card}>
        <Text style={styles.cardTitle}>Transferir entre mis cuentas</Text>
        <Text style={styles.subtle}>Las transferencias no son ingresos ni gastos. Si las monedas son diferentes, escribe el importe que realmente recibiste.</Text>
        <Text style={styles.label}>Desde</Text><View style={styles.choiceRow}>{state.accounts.map(a => <TouchableOpacity key={a.id} style={[styles.choice, transferFromId === a.id && styles.choiceActive]} onPress={() => { setTransferFromId(a.id); if (a.id === transferToId) setTransferToId(state.accounts.find(x => x.id !== a.id)?.id ?? a.id); }}><Text style={styles.buttonText}>{a.name} ({a.currency})</Text></TouchableOpacity>)}</View>
        <Text style={styles.label}>Hacia</Text><View style={styles.choiceRow}>{state.accounts.filter(a => a.id !== transferFromId).map(a => <TouchableOpacity key={a.id} style={[styles.choice, transferToId === a.id && styles.choiceActive]} onPress={() => setTransferToId(a.id)}><Text style={styles.buttonText}>{a.name} ({a.currency})</Text></TouchableOpacity>)}</View>
        <Text style={styles.label}>Importe enviado ({state.accounts.find(a => a.id === transferFromId)?.currency ?? 'GYD'})</Text><TextInput value={transferSentText} onChangeText={v => { setTransferSentText(v); const f = state.accounts.find(a => a.id === transferFromId); const t = state.accounts.find(a => a.id === transferToId); if (f && t && f.currency === t.currency) setTransferReceivedText(v); }} keyboardType="decimal-pad" placeholder="Ej. 5000" placeholderTextColor="#738097" style={styles.input}/>
        <Text style={styles.label}>Importe recibido ({state.accounts.find(a => a.id === transferToId)?.currency ?? 'GYD'})</Text><TextInput value={transferReceivedText} onChangeText={setTransferReceivedText} keyboardType="decimal-pad" placeholder="Importe depositado" placeholderTextColor="#738097" style={styles.input}/>
        <Text style={styles.label}>Comisión bancaria opcional ({state.accounts.find(a => a.id === transferFromId)?.currency ?? 'GYD'})</Text><TextInput value={transferFeeText} onChangeText={setTransferFeeText} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#738097" style={styles.input}/><Text style={styles.subtle}>Si escribes una comisión, se registrará como gasto separado en Comisiones bancarias.</Text>
        <Text style={styles.label}>Nota (opcional)</Text><TextInput value={transferNoteText} onChangeText={setTransferNoteText} placeholder="Ej. Cambio de moneda" placeholderTextColor="#738097" style={styles.input}/>
        <TouchableOpacity style={styles.primaryButton} onPress={saveTransfer}><Text style={styles.primaryButtonText}>Registrar transferencia</Text></TouchableOpacity>
        <Text style={styles.cardTitle}>Historial de transferencias</Text>
        {(state.transfers ?? []).filter(t => !t.voided).length === 0 ? <Text style={styles.note}>Todavía no hay transferencias.</Text> : (state.transfers ?? []).filter(t => !t.voided).map(t => { const f = state.accounts.find(a => a.id === t.fromAccountId); const to = state.accounts.find(a => a.id === t.toAccountId); return <View key={t.id} style={styles.accountLine}><View style={{flex:1}}><Text style={styles.accountName}>{f?.name ?? 'Origen'} → {to?.name ?? 'Destino'}</Text><Text style={styles.subtle}>{new Date(t.createdAt).toLocaleDateString('es')}{t.note ? ` · ${t.note}` : ''}</Text><Text style={styles.subtle}>{formatMoney(t.sentAmount, t.fromCurrency)} → {formatMoney(t.receivedAmount, t.toCurrency)}</Text></View><TouchableOpacity onPress={() => Alert.alert('Anular transferencia', 'Se revertirán sus efectos en ambas cuentas.', [{text:'Cancelar',style:'cancel'},{text:'Anular',style:'destructive',onPress:() => setState(s => ({...s,transfers:(s.transfers ?? []).map(x => x.id === t.id ? {...x,voided:true} : x),transactions:s.transactions.map(x => x.id === t.feeTransactionId ? {...x,voided:true} : x)}))}])}><Text style={{color:'#ff737b',fontWeight:'700'}}>Anular</Text></TouchableOpacity></View>; })}
        <TouchableOpacity style={styles.cancelButton} onPress={() => setTransferManagerOpen(false)}><Text style={styles.buttonText}>Volver</Text></TouchableOpacity>
      </View> : accountManagerOpen ? <View style={styles.card}>
        <Text style={styles.cardTitle}>Administrar cuentas</Text>
        <Text style={styles.label}>Cuentas existentes</Text>
        {state.accounts.map(a => <View key={a.id} style={styles.accountLine}><TouchableOpacity style={{flex:1}} onPress={() => setState(s => ({ ...s, primaryAccountId: a.id }))}><Text style={styles.accountName}>{a.name}{a.id === state.primaryAccountId ? ' ✓' : ''}</Text><Text style={styles.subtle}>{a.currency} · Saldo: {formatMoney(getAccountBalance(state, a.id) ?? 0, a.currency)}</Text></TouchableOpacity><TouchableOpacity style={styles.choice} onPress={() => toggleNegative(a)}><Text style={styles.buttonText}>{a.allowNegative ? 'Negativo: sí' : 'Negativo: no'}</Text></TouchableOpacity></View>)}
        <Text style={styles.cardTitle}>Crear cuenta</Text>
        <Text style={styles.label}>Nombre</Text><TextInput value={accountNameText} onChangeText={setAccountNameText} placeholder="Ej. Ahorros" placeholderTextColor="#738097" style={styles.input} maxLength={40} />
        <Text style={styles.label}>Moneda</Text><View style={styles.choiceRow}>{(['GYD','USD','EUR','GBP','CAD','PYG','UYU','BRL','CRC'] as Currency[]).map(c => <TouchableOpacity key={c} style={[styles.choice, accountCurrency === c && styles.choiceActive]} onPress={() => { setAccountCurrency(c); setRateText(c === 'USD' ? '1' : c === 'GYD' ? '240' : '') }}><Text style={styles.buttonText}>{c}</Text></TouchableOpacity>)}</View>
        <Text style={styles.label}>Saldo inicial ({accountCurrency})</Text><TextInput value={openingBalanceText} onChangeText={setOpeningBalanceText} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#738097" style={styles.input} />
        {accountCurrency !== 'USD' ? <><Text style={styles.label}>Tasa manual (1 USD = cuántos {accountCurrency})</Text><TextInput value={rateText} onChangeText={setRateText} keyboardType="decimal-pad" placeholder="Escribe la tasa" placeholderTextColor="#738097" style={styles.input} /></> : <Text style={styles.subtle}>La tasa del USD es 1.</Text>}
        <TouchableOpacity style={styles.choice} onPress={() => setAllowNegativeNew(v => !v)}><Text style={styles.buttonText}>{allowNegativeNew ? '✓ Permitir saldo negativo' : '□ Bloquear saldo negativo'}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={addAccount}><Text style={styles.primaryButtonText}>＋ Crear cuenta</Text></TouchableOpacity>
        <Text style={styles.cardTitle}>Ajustar saldo sin registrar ingreso/gasto</Text>
        <Text style={styles.label}>Cuenta</Text><View style={styles.choiceRow}>{state.accounts.map(a => <TouchableOpacity key={a.id} style={[styles.choice, adjustmentAccountId === a.id && styles.choiceActive]} onPress={() => setAdjustmentAccountId(a.id)}><Text style={styles.buttonText}>{a.name}</Text></TouchableOpacity>)}</View>
        <Text style={styles.label}>Ajuste en {state.accounts.find(a => a.id === adjustmentAccountId)?.currency ?? 'GYD'} (negativo para restar)</Text><TextInput value={adjustmentAmountText} onChangeText={setAdjustmentAmountText} keyboardType="numbers-and-punctuation" placeholder="Ej. 500 o -100" placeholderTextColor="#738097" style={styles.input} />
        <TextInput value={adjustmentNoteText} onChangeText={setAdjustmentNoteText} placeholder="Motivo del ajuste" placeholderTextColor="#738097" style={styles.input} maxLength={120} />
        <TouchableOpacity style={styles.primaryButton} onPress={saveAdjustment}><Text style={styles.primaryButtonText}>Guardar ajuste de saldo</Text></TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={() => setAccountManagerOpen(false)}><Text style={styles.buttonText}>Volver</Text></TouchableOpacity>
      </View> : formOpen ? <View style={styles.card}>
        <Text style={styles.cardTitle}>{editingId ? 'Editar movimiento' : 'Registrar movimiento'}</Text>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.kindButton, kind === 'expense' && styles.kindExpense]} onPress={() => { setKind('expense'); setCategoryId(CATEGORIES.expense[0].id); }}><Text style={styles.buttonText}>Gasto</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.kindButton, kind === 'income' && styles.kindIncome]} onPress={() => { setKind('income'); setCategoryId(CATEGORIES.income[0].id); }}><Text style={styles.buttonText}>Ingreso</Text></TouchableOpacity>
        </View>
        <Text style={styles.label}>Cuenta</Text>
        <View style={styles.choiceRow}>{state.accounts.map(a => <TouchableOpacity key={a.id} style={[styles.choice, accountId === a.id && styles.choiceActive]} onPress={() => setAccountId(a.id)}><Text style={styles.buttonText}>{a.name} ({a.currency})</Text></TouchableOpacity>)}</View>
        <Text style={styles.label}>Categoría</Text>
        <View style={styles.choiceRow}>{CATEGORIES[kind].map(c => <TouchableOpacity key={c.id} style={[styles.choice, categoryId === c.id && styles.choiceActive]} onPress={() => setCategoryId(c.id)}><Text style={styles.buttonText}>{c.name}</Text></TouchableOpacity>)}</View>
        <Text style={styles.label}>Importe en {selectedAccount?.currency ?? 'GYD'}</Text>
        <TextInput value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" placeholder="Ej. 1500.50" placeholderTextColor="#738097" style={styles.input} />
        <Text style={styles.label}>Nota opcional</Text>
        <TextInput value={note} onChangeText={setNote} placeholder="¿Para qué fue?" placeholderTextColor="#738097" style={styles.input} maxLength={160} />
        <Text style={styles.subtle}>Se guarda con fecha y hora actuales y con la tasa disponible de esta cuenta.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={saveMovement}><Text style={styles.primaryButtonText}>{editingId ? 'Guardar cambios' : 'Guardar movimiento'}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={() => setFormOpen(false)}><Text style={styles.buttonText}>Cancelar</Text></TouchableOpacity>
      </View> : tab === 'Inicio' ? <>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>SALDO DE {mainAccount?.name.toUpperCase() ?? 'CUENTA'}</Text>
          <Text style={styles.balance}>{formatMoney(mainBalance, mainAccount?.currency ?? 'GYD')}</Text>
          <Text style={styles.subtle}>Equivalente en USD: {mainAccount && (mainAccount.currency === 'USD' || mainAccount.manualUsdRate || mainAccount.automaticUsdRate) ? formatMoney(mainAccount.currency === 'USD' ? mainBalance : mainBalance / (mainAccount.manualUsdRate ?? mainAccount.automaticUsdRate ?? 1), 'USD') : 'Pendiente de tasa'}</Text>
          <Text style={styles.subtle}>Patrimonio en USD: {formatMoney(wealth.value, 'USD')}{wealth.pendingAccounts.length ? ` · Incompleto: falta tasa en ${wealth.pendingAccounts.join(', ')}` : ''}</Text>
          <View style={styles.rule} /><Text style={styles.eyebrow}>TASA DE REFERENCIA DE ESTA CUENTA</Text>
          <Text style={styles.rate}>{mainAccount?.currency === 'USD' ? '1 USD = 1 USD' : `1 USD = ${(mainAccount?.manualUsdRate ?? mainAccount?.automaticUsdRate ?? 0).toLocaleString('en-US', { maximumFractionDigits: 6 })} ${mainAccount?.currency ?? 'GYD'}`}</Text>
          <Text style={styles.note}>La actualización de tasas de mercado todavía está pendiente.</Text>
        </View>
        <View style={styles.row}><View style={styles.statCard}><Text style={styles.eyebrow}>INGRESOS</Text><Text style={styles.income}>{formatMoney(totalIncome.value, 'USD')}</Text><Text style={styles.subtle}>{totalIncome.pendingAccounts.length ? 'Equivalente pendiente' : 'Total histórico equivalente'}</Text></View><View style={styles.statCard}><Text style={styles.eyebrow}>GASTOS</Text><Text style={styles.expense}>{formatMoney(totalExpense.value, 'USD')}</Text><Text style={styles.subtle}>{totalExpense.pendingAccounts.length ? 'Equivalente pendiente' : 'Total histórico equivalente'}</Text></View></View>
        <View style={styles.card}><Text style={styles.cardTitle}>Presupuesto y disponible por día</Text><Text style={styles.subtle}>Elige el período según cómo cobras. La semana empieza el lunes. Solo se descuentan los gastos registrados; los ingresos no aumentan automáticamente el límite.</Text><Text style={styles.label}>¿Cómo recibes tu dinero?</Text><View style={styles.choiceRow}><TouchableOpacity style={[styles.choice, budgetPeriod === 'weekly' && styles.choiceActive]} onPress={() => setBudgetPeriod('weekly')}><Text style={styles.buttonText}>Semanal</Text></TouchableOpacity><TouchableOpacity style={[styles.choice, budgetPeriod === 'monthly' && styles.choiceActive]} onPress={() => setBudgetPeriod('monthly')}><Text style={styles.buttonText}>Mensual</Text></TouchableOpacity></View><Text style={styles.label}>Límite para el período ({mainAccount?.currency ?? 'GYD'})</Text><TextInput value={budgetAmountText} onChangeText={setBudgetAmountText} keyboardType="decimal-pad" placeholder="Ej. 25000" placeholderTextColor="#738097" style={styles.input}/><TouchableOpacity style={styles.primaryButton} onPress={saveBudget}><Text style={styles.primaryButtonText}>Guardar presupuesto</Text></TouchableOpacity>{budget ? <><View style={styles.rule}/><Text style={styles.eyebrow}>{budget.period === 'weekly' ? 'PRESUPUESTO SEMANAL' : 'PRESUPUESTO MENSUAL'}</Text><Text style={styles.balance}>{formatMoney(budget.amount, budget.currency)}</Text><View style={styles.accountLine}><Text style={styles.accountName}>Gastado en este período</Text><Text style={styles.expense}>{formatMoney(spentInBudget, budget.currency)}</Text></View><View style={styles.accountLine}><Text style={styles.accountName}>Restante</Text><Text style={budgetRemaining < 0 ? styles.expense : styles.income}>{formatMoney(budgetRemaining, budget.currency)}</Text></View><View style={styles.accountLine}><Text style={styles.accountName}>Disponible por día</Text><Text style={dailyAvailable < 0 ? styles.expense : styles.amount}>{formatMoney(dailyAvailable, budget.currency)}</Text></View>{budgetHasPending ? <Text style={styles.note}>Aviso: algunos gastos no tienen una tasa disponible y no se pudieron convertir al presupuesto. El total puede ser parcial.</Text> : null}{budgetRemaining < 0 ? <Text style={styles.note}>Has superado tu límite. Puedes seguir registrando gastos; este aviso no bloquea la aplicación.</Text> : <Text style={styles.note}>Quedan {daysLeft} día(s) contando hoy, según el período elegido.</Text>}</> : <Text style={styles.note}>Todavía no has guardado un presupuesto. Recomendado: elige semanal si cobras cada semana o mensual si cobras una vez al mes.</Text>}</View>
        <View style={styles.card}><Text style={styles.cardTitle}>Mis cuentas</Text><TouchableOpacity style={styles.primaryButton} onPress={() => { setTransferManagerOpen(true); setAccountManagerOpen(false); setTransferFromId(mainAccount?.id ?? state.accounts[0]?.id ?? 'cash-gyd'); setTransferToId(state.accounts.find(a => a.id !== mainAccount?.id)?.id ?? state.accounts[1]?.id ?? 'bank-gyd'); }}><Text style={styles.primaryButtonText}>⇄ Transferir entre cuentas</Text></TouchableOpacity><TouchableOpacity style={styles.primaryButton} onPress={() => { setAccountManagerOpen(true); setFormOpen(false); setAdjustmentAccountId(mainAccount?.id ?? state.accounts[0]?.id ?? 'cash-gyd'); }}><Text style={styles.primaryButtonText}>Administrar / crear cuentas</Text></TouchableOpacity>{state.accounts.map(a => <TouchableOpacity key={a.id} style={styles.accountLine} onPress={() => setState(s => ({ ...s, primaryAccountId: a.id }))}><View><Text style={styles.accountName}>{a.name}{a.id === state.primaryAccountId ? '  ✓' : ''}</Text><Text style={styles.subtle}>{a.currency} · {a.allowNegative ? 'Negativo permitido' : 'Negativo bloqueado'} · Toca para seleccionar</Text></View><Text style={styles.amount}>{formatMoney(getAccountBalance(state, a.id) ?? 0, a.currency)}</Text></TouchableOpacity>)}</View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Metas de ahorro</Text>
          <Text style={styles.subtle}>Crea objetivos y registra el progreso. Las aportaciones son de seguimiento: no mueven dinero ni cambian los saldos de tus cuentas.</Text>
          <Text style={styles.label}>Nombre de la meta</Text><TextInput value={goalNameText} onChangeText={setGoalNameText} placeholder="Ej. Fondo de emergencia" placeholderTextColor="#738097" style={styles.input} maxLength={50}/>
          <Text style={styles.label}>Moneda de la meta</Text><View style={styles.choiceRow}>{(['GYD','USD','EUR','GBP','CAD','PYG','UYU','BRL','CRC'] as Currency[]).map(c => <TouchableOpacity key={c} style={[styles.choice, goalCurrency === c && styles.choiceActive]} onPress={() => setGoalCurrency(c)}><Text style={styles.buttonText}>{c}</Text></TouchableOpacity>)}</View>
          <Text style={styles.label}>Importe objetivo ({goalCurrency})</Text><TextInput value={goalTargetText} onChangeText={setGoalTargetText} keyboardType="decimal-pad" placeholder="Ej. 100000" placeholderTextColor="#738097" style={styles.input}/>
          <Text style={styles.label}>Ya ahorrado ({goalCurrency})</Text><TextInput value={goalSavedText} onChangeText={setGoalSavedText} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#738097" style={styles.input}/>
          <TouchableOpacity style={styles.primaryButton} onPress={addGoal}><Text style={styles.primaryButtonText}>＋ Crear meta</Text></TouchableOpacity>
          {(state.goals ?? []).length === 0 ? <Text style={styles.note}>Todavía no has creado metas de ahorro.</Text> : (state.goals ?? []).map(g => { const pct = Math.min(100, Math.round(g.savedAmount / g.targetAmount * 100)); return <View key={g.id} style={{ gap: 8, paddingTop: 12, borderTopColor: '#202c3d', borderTopWidth: 1 }}>
            <View style={styles.accountLine}><View style={{flex:1}}><Text style={styles.accountName}>{g.name}</Text><Text style={styles.subtle}>{formatMoney(g.savedAmount, g.currency)} de {formatMoney(g.targetAmount, g.currency)} · {pct}%</Text></View><TouchableOpacity onPress={() => Alert.alert('Eliminar meta', `¿Eliminar “${g.name}”? Esto no cambia el saldo de tus cuentas.`, [{text:'Cancelar',style:'cancel'},{text:'Eliminar',style:'destructive',onPress:() => setState(s => ({...s, goals:(s.goals ?? []).filter(x => x.id !== g.id)}))}])}><Text style={{color:'#ff737b',fontSize:12,fontWeight:'700'}}>Eliminar</Text></TouchableOpacity></View>
            <View style={{height:8,backgroundColor:'#263347',borderRadius:8,overflow:'hidden'}}><View style={{height:8,width:`${pct}%`,backgroundColor:'#46d39a',borderRadius:8}}/></View>
            {g.savedAmount < g.targetAmount ? <><TextInput value={goalContributionText[g.id] ?? ''} onChangeText={v => setGoalContributionText(s => ({...s,[g.id]:v}))} keyboardType="decimal-pad" placeholder={`Aportación en ${g.currency}`} placeholderTextColor="#738097" style={styles.input}/><TouchableOpacity style={styles.choice} onPress={() => addGoalContribution(g)}><Text style={styles.buttonText}>Registrar aportación</Text></TouchableOpacity></> : <Text style={styles.income}>¡Meta completada!</Text>}
          </View>; })}
        </View>
      </> : tab === 'Movimientos' ? <View style={styles.card}><Text style={styles.cardTitle}>Movimientos</Text><TouchableOpacity style={styles.primaryButton} onPress={() => openForm('expense')}><Text style={styles.primaryButtonText}>＋ Registrar ingreso o gasto</Text></TouchableOpacity>{state.transactions.filter(t => !t.voided).length === 0 ? <Text style={styles.subtle}>Todavía no hay movimientos registrados.</Text> : state.transactions.filter(t => !t.voided).map(t => { const a = state.accounts.find(x => x.id === t.accountId); return <View key={t.id} style={styles.accountLine}><TouchableOpacity style={{ flex: 1 }} onPress={() => { setEditingId(t.id); setKind(t.kind); setCategoryId(t.categoryId && CATEGORIES[t.kind].some(c => c.id === t.categoryId) ? t.categoryId : CATEGORIES[t.kind][0].id); setAccountId(t.accountId); setAmountText(String(t.amount)); setNote(t.note ?? ''); setFormOpen(true); }}><Text style={styles.accountName}>{categoryName(t.categoryId)}{t.note ? ` · ${t.note}` : ''}</Text><Text style={styles.subtle}>{a?.name ?? 'Cuenta'} · {new Date(t.createdAt).toLocaleDateString('es')} · Toca para editar</Text></TouchableOpacity><View style={{ alignItems: 'flex-end', gap: 6 }}><Text style={t.kind === 'income' ? styles.income : styles.expense}>{t.kind === 'income' ? '+' : '−'}{formatMoney(t.amount, t.currency)}</Text><TouchableOpacity onPress={() => Alert.alert('Anular movimiento', 'Se excluirá del saldo y las estadísticas, pero se conservará en el historial.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Anular', style: 'destructive', onPress: () => setState(s => ({ ...s, transactions: s.transactions.map(x => x.id === t.id ? { ...x, voided: true } : x) })) }])}><Text style={{ color: '#ff737b', fontSize: 12, fontWeight: '700' }}>Anular</Text></TouchableOpacity></View></View>; })}</View> : tab === 'Categorías' ? <View style={styles.card}><Text style={styles.cardTitle}>Categorías de gastos</Text><Text style={styles.subtle}>Importes en USD según la tasa guardada al registrar cada movimiento. Las categorías sin movimientos muestran cero.</Text>{CATEGORIES.expense.map(c => { const txs = state.transactions.filter(t => !t.voided && t.kind === 'expense' && t.categoryId === c.id); const total = txs.reduce((sum, t) => sum + (t.historicalUsdEquivalent ?? 0), 0); const pending = txs.some(t => t.historicalUsdEquivalent === undefined); return <View key={c.id} style={styles.accountLine}><View style={{flex:1}}><Text style={styles.accountName}>{c.name}</Text><Text style={styles.subtle}>{txs.length} movimiento{txs.length === 1 ? '' : 's'}{pending ? ' · hay equivalentes pendientes' : ''}</Text></View><Text style={styles.amount}>{pending ? 'Parcial · ' : ''}{formatMoney(total, 'USD')}</Text></View>; })}<Text style={styles.note}>Por ahora son categorías iniciales; la creación y edición de categorías personalizadas se añadirá después.</Text></View> : tab === 'Estadísticas' ? <View style={styles.card}><Text style={styles.cardTitle}>Resumen de movimientos</Text><View style={styles.accountLine}><Text style={styles.accountName}>Ingresos registrados</Text><Text style={styles.income}>{formatMoney(totalIncome.value, 'USD')}</Text></View><View style={styles.accountLine}><Text style={styles.accountName}>Gastos registrados</Text><Text style={styles.expense}>{formatMoney(totalExpense.value, 'USD')}</Text></View><View style={styles.accountLine}><Text style={styles.accountName}>Balance neto histórico</Text><Text style={styles.amount}>{formatMoney(totalIncome.value - totalExpense.value, 'USD')}</Text></View><Text style={styles.subtle}>Los totales usan equivalentes históricos disponibles. {totalIncome.pendingAccounts.length || totalExpense.pendingAccounts.length ? 'Algunos movimientos no tienen tasa y no están incluidos en el total equivalente.' : 'No hay equivalentes pendientes.'}</Text></View> : <View style={styles.card}><Text style={styles.cardTitle}>{tab}</Text><Text style={styles.subtle}>Esta sección sigue en desarrollo; no se muestran datos inventados.</Text></View>}
    </ScrollView>
    <View style={styles.nav}>{(['Inicio', 'Categorías', '＋', 'Estadísticas', 'Movimientos'] as const).map(item => <TouchableOpacity key={item} style={styles.navItem} onPress={() => { if (item === '＋') openForm('expense'); else { setFormOpen(false); setAccountManagerOpen(false); setTransferManagerOpen(false); setTab(item); } }}><Text style={[styles.navText, (item === tab || (item === '＋' && formOpen)) && styles.navActive]}>{item}</Text></TouchableOpacity>)}</View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
 safe:{flex:1,backgroundColor:'#0b0f17'}, page:{padding:20,paddingBottom:30,gap:14}, brand:{color:'#f4f6fb',fontSize:25,fontWeight:'800'}, date:{color:'#929bad',fontSize:13,marginTop:-8,textTransform:'capitalize'},
 hero:{backgroundColor:'#121b29',borderColor:'#263347',borderWidth:1,borderRadius:22,padding:20,gap:8}, eyebrow:{color:'#a9b5c7',fontSize:11,fontWeight:'700',letterSpacing:1.1}, balance:{color:'#f5f7fb',fontSize:32,fontWeight:'800'}, subtle:{color:'#9ba7b8',fontSize:13,lineHeight:19}, rule:{height:1,backgroundColor:'#2b384b',marginVertical:7}, rate:{color:'#e4c36b',fontSize:20,fontWeight:'700'}, note:{color:'#8491a5',fontSize:12,lineHeight:17}, row:{flexDirection:'row',gap:12},
 statCard:{flex:1,backgroundColor:'#121b29',borderColor:'#263347',borderWidth:1,borderRadius:18,padding:15,gap:10}, income:{color:'#46d39a',fontSize:18,fontWeight:'800'}, expense:{color:'#ff737b',fontSize:18,fontWeight:'800'}, card:{backgroundColor:'#101722',borderColor:'#202c3d',borderWidth:1,borderRadius:18,padding:17,gap:10}, cardTitle:{color:'#f1f4f9',fontSize:17,fontWeight:'700'},
 accountLine:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:9,borderTopColor:'#202c3d',borderTopWidth:1,gap:10}, accountName:{color:'#f1f4f9',fontSize:15,fontWeight:'600'}, amount:{color:'#f1f4f9',fontSize:14,fontWeight:'700'}, nav:{flexDirection:'row',justifyContent:'space-around',alignItems:'center',paddingVertical:12,paddingHorizontal:4,borderTopColor:'#243044',borderTopWidth:1,backgroundColor:'#0e1520'}, navItem:{flex:1,alignItems:'center',paddingVertical:5},navText:{color:'#7f8ba0',fontSize:10,fontWeight:'600'},navActive:{color:'#6ee7b7'},
 label:{color:'#c4cede',fontSize:13,fontWeight:'700',marginTop:3}, input:{backgroundColor:'#0b111b',borderColor:'#2b384b',borderWidth:1,borderRadius:12,paddingHorizontal:14,paddingVertical:12,color:'#f5f7fb',fontSize:16}, kindButton:{flex:1,alignItems:'center',padding:13,borderRadius:12,backgroundColor:'#1b2636',borderWidth:1,borderColor:'#2b384b'},kindExpense:{backgroundColor:'#45232b',borderColor:'#ff737b'},kindIncome:{backgroundColor:'#143b32',borderColor:'#46d39a'},buttonText:{color:'#f1f4f9',fontWeight:'700',fontSize:13},choiceRow:{flexDirection:'row',flexWrap:'wrap',gap:8},choice:{padding:10,borderRadius:10,borderWidth:1,borderColor:'#2b384b',backgroundColor:'#0b111b'},choiceActive:{borderColor:'#e4c36b',backgroundColor:'#282719'},primaryButton:{alignItems:'center',padding:15,borderRadius:13,backgroundColor:'#d6b45d',marginTop:4},primaryButtonText:{color:'#101722',fontSize:15,fontWeight:'800'},cancelButton:{alignItems:'center',padding:12}
});
