import { describe, it } from 'node:test';
import assert from 'node:assert';
import { transformTransaction } from '../src/transformer.js';
import { ActualClient } from '../src/actual-client.js';

describe('Transfer Detection and Handling Tests', () => {
  // Mock isAccountMapped function
  const mockIsAccountMapped = (accountName) => {
    const mappedAccounts = ['Checking Account', 'Savings Account', 'Credit Card'];
    return mappedAccounts.includes(accountName);
  };

  it('should detect transfer when both from and to accounts are mapped', () => {
    const wsTransaction = {
      account: 'Checking Account',
      date: '2024-01-15',
      amount: '500.00',
      description: 'Transfer to savings',
      type: 'transfer',
      from: 'Checking Account',
      to: 'Savings Account',
      transactionId: 'txn_transfer_1'
    };

    const transformed = transformTransaction(wsTransaction, {
      isAccountMapped: mockIsAccountMapped
    });

    assert.ok(transformed._isTransfer, 'Should detect as transfer');
    assert.strictEqual(
      transformed._transferToAccount,
      'Savings Account',
      'Should identify target account'
    );
    assert.ok(
      transformed.Notes.includes(': from Checking Account, to Savings Account'),
      'Should include from/to info in Notes'
    );
  });

  it('should not detect transfer when to account is not mapped', () => {
    const wsTransaction = {
      account: 'Checking Account',
      date: '2024-01-15',
      amount: '500.00',
      description: 'Transfer to external',
      type: 'transfer',
      from: 'Checking Account',
      to: 'External Bank Account', // Not mapped
      transactionId: 'txn_transfer_2'
    };

    const transformed = transformTransaction(wsTransaction, {
      isAccountMapped: mockIsAccountMapped
    });

    assert.ok(!transformed._isTransfer, 'Should not detect as transfer');
    assert.ok(!transformed._transferToAccount, 'Should not have transfer target');
  });

  it('should not detect transfer when from and to columns are missing', () => {
    const wsTransaction = {
      account: 'Checking Account',
      date: '2024-01-15',
      amount: '500.00',
      description: 'Regular transaction',
      type: 'payment',
      transactionId: 'txn_regular_1'
    };

    const transformed = transformTransaction(wsTransaction, {
      isAccountMapped: mockIsAccountMapped
    });

    assert.ok(!transformed._isTransfer, 'Should not detect as transfer');
    assert.ok(!transformed._transferToAccount, 'Should not have transfer target');
  });

  it('should identify correct target account based on transaction perspective', () => {
    // Transaction from the perspective of Savings Account receiving from Checking
    const wsTransaction = {
      account: 'Savings Account',
      date: '2024-01-15',
      amount: '500.00',
      description: 'Transfer from checking',
      type: 'transfer',
      from: 'Checking Account',
      to: 'Savings Account',
      transactionId: 'txn_transfer_3'
    };

    const transformed = transformTransaction(wsTransaction, {
      isAccountMapped: mockIsAccountMapped
    });

    assert.ok(transformed._isTransfer, 'Should detect as transfer');
    assert.strictEqual(
      transformed._transferToAccount,
      'Checking Account',
      'Should identify source account as target'
    );
    assert.ok(
      transformed.Notes.includes(': from Checking Account, to Savings Account'),
      'Should include from/to info in Notes'
    );
  });

  it('should handle empty from/to values gracefully', () => {
    const wsTransaction = {
      account: 'Checking Account',
      date: '2024-01-15',
      amount: '500.00',
      description: 'Regular transaction',
      type: 'payment',
      from: '',
      to: '',
      transactionId: 'txn_regular_2'
    };

    const transformed = transformTransaction(wsTransaction, {
      isAccountMapped: mockIsAccountMapped
    });

    assert.ok(!transformed._isTransfer, 'Should not detect as transfer');
    assert.ok(!transformed._transferToAccount, 'Should not have transfer target');
  });

  it('should work without isAccountMapped function', () => {
    const wsTransaction = {
      account: 'Checking Account',
      date: '2024-01-15',
      amount: '500.00',
      description: 'Transfer',
      type: 'transfer',
      from: 'Checking Account',
      to: 'Savings Account',
      transactionId: 'txn_transfer_4'
    };

    const transformed = transformTransaction(wsTransaction, {});

    assert.ok(!transformed._isTransfer, 'Should not detect as transfer without mapping function');
    assert.ok(!transformed._transferToAccount, 'Should not have transfer target');
    assert.ok(
      !transformed.Notes.includes(': from '),
      'Should not include transfer info in Notes for non-transfers'
    );
  });

  it('should format Notes correctly for transfers with existing content', () => {
    const wsTransaction = {
      account: 'Checking Account',
      date: '2024-01-15',
      amount: '500.00',
      description: 'Monthly savings transfer',
      type: 'transfer',
      message: 'Automated transfer',
      email: 'user@example.com',
      from: 'Checking Account',
      to: 'Savings Account',
      transactionId: 'txn_transfer_5'
    };

    const transformed = transformTransaction(wsTransaction, {
      isAccountMapped: mockIsAccountMapped
    });

    assert.ok(transformed._isTransfer, 'Should detect as transfer');
    assert.ok(
      transformed.Notes.includes('transfer Monthly savings transfer'),
      'Should include original transaction details'
    );
    assert.ok(transformed.Notes.includes('(user@example.com)'), 'Should include email');
    assert.ok(transformed.Notes.includes(': Automated transfer'), 'Should include message');
    assert.ok(
      transformed.Notes.endsWith(': from Checking Account, to Savings Account'),
      'Should end with transfer account info'
    );
  });
});

describe('ActualClient Transfer Payee Tests', () => {
  it('should find transfer payee by account ID', () => {
    const mockConfig = {
      serverUrl: 'http://test',
      password: 'test',
      budgetId: 'test'
    };
    const client = new ActualClient(mockConfig);

    // Mock accounts and payees
    client.accounts = [
      { id: 'acc_1', name: 'Checking Account' },
      { id: 'acc_2', name: 'Savings Account' }
    ];

    client.payees = [
      { id: 'payee_1', name: 'Regular Payee' },
      { id: 'payee_transfer_1', name: 'Transfer : Checking Account', transfer_acct: 'acc_1' },
      { id: 'payee_transfer_2', name: 'Transfer : Savings Account', transfer_acct: 'acc_2' }
    ];

    // Rebuild maps
    client.accountMap.clear();
    client.transferPayeeMap.clear();

    client.accounts.forEach((account) => {
      client.accountMap.set(account.name, account);
      client.accountMap.set(account.id, account);
    });

    client.payees.forEach((payee) => {
      if (payee.transfer_acct) {
        client.transferPayeeMap.set(payee.transfer_acct, payee);
        const account = client.findAccount(payee.transfer_acct);
        if (account) {
          client.transferPayeeMap.set(account.name, payee);
        }
      }
    });

    const transferPayee = client.findTransferPayee('acc_1');
    assert.ok(transferPayee, 'Should find transfer payee');
    assert.strictEqual(transferPayee.transfer_acct, 'acc_1', 'Should find correct transfer payee');
  });

  it('should find transfer payee by account name', () => {
    const mockConfig = {
      serverUrl: 'http://test',
      password: 'test',
      budgetId: 'test'
    };
    const client = new ActualClient(mockConfig);

    // Mock accounts and payees
    client.accounts = [
      { id: 'acc_1', name: 'Checking Account' },
      { id: 'acc_2', name: 'Savings Account' }
    ];

    client.payees = [
      { id: 'payee_transfer_1', name: 'Transfer : Checking Account', transfer_acct: 'acc_1' },
      { id: 'payee_transfer_2', name: 'Transfer : Savings Account', transfer_acct: 'acc_2' }
    ];

    // Rebuild maps
    client.accountMap.clear();
    client.transferPayeeMap.clear();

    client.accounts.forEach((account) => {
      client.accountMap.set(account.name, account);
      client.accountMap.set(account.id, account);
    });

    client.payees.forEach((payee) => {
      if (payee.transfer_acct) {
        client.transferPayeeMap.set(payee.transfer_acct, payee);
        const account = client.findAccount(payee.transfer_acct);
        if (account) {
          client.transferPayeeMap.set(account.name, payee);
        }
      }
    });

    const transferPayee = client.findTransferPayee('Savings Account');
    assert.ok(transferPayee, 'Should find transfer payee by name');
    assert.strictEqual(transferPayee.transfer_acct, 'acc_2', 'Should find correct transfer payee');
  });

  it('should return null for non-existent transfer payee', () => {
    const mockConfig = {
      serverUrl: 'http://test',
      password: 'test',
      budgetId: 'test'
    };
    const client = new ActualClient(mockConfig);
    client.transferPayeeMap.clear();

    const transferPayee = client.findTransferPayee('Non-existent Account');
    assert.strictEqual(transferPayee, null, 'Should return null for non-existent account');
  });

  it('should convert transfer transaction to correct import format', () => {
    const mockConfig = {
      serverUrl: 'http://test',
      password: 'test',
      budgetId: 'test'
    };
    const client = new ActualClient(mockConfig);

    // Mock accounts and payees
    client.accounts = [
      { id: 'acc_1', name: 'Checking Account' },
      { id: 'acc_2', name: 'Savings Account' }
    ];

    client.payees = [
      { id: 'payee_transfer_2', name: 'Transfer : Savings Account', transfer_acct: 'acc_2' }
    ];

    // Rebuild maps
    client.accountMap.clear();
    client.transferPayeeMap.clear();

    client.accounts.forEach((account) => {
      client.accountMap.set(account.name, account);
      client.accountMap.set(account.id, account);
    });

    client.payees.forEach((payee) => {
      if (payee.transfer_acct) {
        client.transferPayeeMap.set(payee.transfer_acct, payee);
        const account = client.findAccount(payee.transfer_acct);
        if (account) {
          client.transferPayeeMap.set(account.name, payee);
        }
      }
    });

    const transaction = {
      Date: '2024-01-15',
      Account: 'Checking Account',
      Payee: 'Transfer to Savings',
      Notes: 'transfer Transfer to savings',
      Amount: 50000,
      _isTransfer: true,
      _transferToAccount: 'acc_2'
    };

    const importFormat = client.convertToImportFormat(transaction);

    assert.strictEqual(importFormat.payee, 'payee_transfer_2', 'Should use transfer payee ID');
    assert.ok(!importFormat.payee_name, 'Should not have payee_name for transfers');
    assert.strictEqual(importFormat.amount, 50000, 'Should preserve amount');
    assert.strictEqual(importFormat.date, '2024-01-15', 'Should preserve date');
  });
});
