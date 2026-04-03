import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ActualClient } from '../src/actual-client.js';
import { mockActualAccounts, mockActualPayees } from './fixtures/transactions.js';

/**
 * Integration tests for ActualClient
 * Tests the client wrapper with mocked ActualBudget API
 */

describe('ActualClient Integration Tests', () => {
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      serverUrl: 'http://test.local:5006',
      password: 'test-password',
      budgetId: 'test-budget-id',
      verbose: false
    };
  });

  describe('Client Initialization', () => {
    it('should create client with config', () => {
      const client = new ActualClient(mockConfig);

      assert.ok(client);
      assert.strictEqual(client.config.serverUrl, mockConfig.serverUrl);
      assert.strictEqual(client.config.password, mockConfig.password);
      assert.strictEqual(client.config.budgetId, mockConfig.budgetId);
      assert.strictEqual(client.connected, false);
    });

    it('should initialize with empty accounts and payees', () => {
      const client = new ActualClient(mockConfig);

      assert.ok(Array.isArray(client.accounts));
      assert.strictEqual(client.accounts.length, 0);
      assert.ok(Array.isArray(client.payees));
      assert.strictEqual(client.payees.length, 0);
      assert.ok(client.accountMap instanceof Map);
      assert.ok(client.transferPayeeMap instanceof Map);
    });
  });

  describe('Account Management', () => {
    it('should load and index accounts', () => {
      const client = new ActualClient(mockConfig);

      // Simulate loading accounts
      client.accounts = [...mockActualAccounts];
      client.accountMap.clear();

      client.accounts.forEach((account) => {
        client.accountMap.set(account.name, account);
        client.accountMap.set(account.id, account);
      });

      assert.strictEqual(client.accounts.length, mockActualAccounts.length);
      assert.ok(client.accountMap.has('Checking Account'));
      assert.ok(client.accountMap.has('acc_checking_001'));
    });

    it('should find account by name', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [...mockActualAccounts];

      client.accountMap.clear();
      client.accounts.forEach((account) => {
        client.accountMap.set(account.name, account);
        client.accountMap.set(account.id, account);
      });

      const account = client.findAccount('Checking Account');

      assert.ok(account);
      assert.strictEqual(account.id, 'acc_checking_001');
      assert.strictEqual(account.name, 'Checking Account');
    });

    it('should find account by ID', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [...mockActualAccounts];

      client.accountMap.clear();
      client.accounts.forEach((account) => {
        client.accountMap.set(account.name, account);
        client.accountMap.set(account.id, account);
      });

      const account = client.findAccount('acc_checking_001');

      assert.ok(account);
      assert.strictEqual(account.id, 'acc_checking_001');
      assert.strictEqual(account.name, 'Checking Account');
    });

    it('should return null for non-existent account', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [...mockActualAccounts];

      client.accountMap.clear();
      client.accounts.forEach((account) => {
        client.accountMap.set(account.name, account);
        client.accountMap.set(account.id, account);
      });

      const account = client.findAccount('Non-existent Account');

      assert.strictEqual(account, null);
    });

    it('should filter closed accounts', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [...mockActualAccounts];

      const openAccounts = client.accounts.filter((acc) => !acc.closed);

      assert.ok(openAccounts.length < mockActualAccounts.length);
      assert.ok(openAccounts.every((acc) => !acc.closed));
    });
  });

  describe('Transfer Payee Management', () => {
    it('should load and index transfer payees', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [...mockActualAccounts];
      client.payees = [...mockActualPayees];

      // Build maps
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

      assert.ok(client.transferPayeeMap.size > 0);
    });

    it('should find transfer payee by account ID', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [...mockActualAccounts];
      client.payees = [...mockActualPayees];

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

      const transferPayee = client.findTransferPayee('acc_checking_001');

      assert.ok(transferPayee);
      assert.strictEqual(transferPayee.transfer_acct, 'acc_checking_001');
    });

    it('should find transfer payee by account name', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [...mockActualAccounts];
      client.payees = [...mockActualPayees];

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

      const transferPayee = client.findTransferPayee('Checking Account');

      assert.ok(transferPayee);
      assert.strictEqual(transferPayee.transfer_acct, 'acc_checking_001');
    });

    it('should return null for non-transfer payee', () => {
      const client = new ActualClient(mockConfig);
      client.transferPayeeMap.clear();

      const transferPayee = client.findTransferPayee('Non-existent Account');

      assert.strictEqual(transferPayee, null);
    });
  });

  describe('Transaction Format Conversion', () => {
    it('should convert regular transaction to import format', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [
        {
          id: 'acc_001',
          name: 'Test Account'
        }
      ];

      client.accountMap.clear();
      client.accountMap.set('Test Account', client.accounts[0]);
      client.accountMap.set('acc_001', client.accounts[0]);

      const transaction = {
        Date: '2024-01-15',
        Account: 'Test Account',
        Payee: 'Test Payee',
        Notes: 'Test transaction',
        Amount: 10000
      };

      const importFormat = client.convertToImportFormat(transaction);

      assert.strictEqual(importFormat.date, '2024-01-15');
      assert.strictEqual(importFormat.account, 'acc_001');
      assert.strictEqual(importFormat.payee_name, 'Test Payee');
      assert.strictEqual(importFormat.notes, 'Test transaction');
      assert.strictEqual(importFormat.amount, 10000);
      assert.ok(importFormat.imported_id.startsWith('ws_'));
    });

    it('should convert transfer transaction with transfer payee', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [
        { id: 'acc_checking', name: 'Checking Account' },
        { id: 'acc_savings', name: 'Savings Account' }
      ];

      client.payees = [
        {
          id: 'payee_transfer_savings',
          name: 'Transfer : Savings Account',
          transfer_acct: 'acc_savings'
        }
      ];

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
        Notes: 'transfer Monthly savings',
        Amount: -50000,
        _isTransfer: true,
        _transferToAccount: 'acc_savings'
      };

      const importFormat = client.convertToImportFormat(transaction);

      assert.strictEqual(importFormat.date, '2024-01-15');
      assert.strictEqual(importFormat.account, 'acc_checking');
      assert.strictEqual(importFormat.payee, 'payee_transfer_savings');
      assert.strictEqual(importFormat.amount, -50000);
      assert.ok(!importFormat.payee_name, 'Should not have payee_name for transfers');
    });

    it('should generate deterministic imported_id', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [
        {
          id: 'acc_001',
          name: 'Test Account'
        }
      ];

      client.accountMap.set('Test Account', client.accounts[0]);
      client.accountMap.set('acc_001', client.accounts[0]);

      const transaction = {
        Date: '2024-01-15',
        Account: 'Test Account',
        Payee: 'Test Payee',
        Notes: 'Test transaction',
        Amount: 10000
      };

      const id1 = client.generateImportedId(transaction);
      const id2 = client.generateImportedId(transaction);

      assert.strictEqual(id1, id2, 'Should generate same ID for same transaction');
      assert.ok(id1.startsWith('ws_'));
      assert.strictEqual(id1.length, 19); // ws_ + 16 hex chars
    });

    it('should generate different IDs for different transactions', () => {
      const client = new ActualClient(mockConfig);

      const transaction1 = {
        Date: '2024-01-15',
        Account: 'Test Account',
        Payee: 'Payee 1',
        Notes: 'Transaction 1',
        Amount: 10000
      };

      const transaction2 = {
        Date: '2024-01-15',
        Account: 'Test Account',
        Payee: 'Payee 2',
        Notes: 'Transaction 2',
        Amount: 20000
      };

      const id1 = client.generateImportedId(transaction1);
      const id2 = client.generateImportedId(transaction2);

      assert.notStrictEqual(id1, id2, 'Should generate different IDs for different transactions');
    });

    it('should handle transaction with missing account', () => {
      const client = new ActualClient(mockConfig);

      const transaction = {
        Date: '2024-01-15',
        Account: 'Non-existent Account',
        Payee: 'Test Payee',
        Notes: 'Test',
        Amount: 10000
      };

      const importFormat = client.convertToImportFormat(transaction);

      // Should still convert, but account will be null or original name
      assert.strictEqual(importFormat.date, '2024-01-15');
      assert.ok(importFormat.imported_id);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty account list', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [];

      const accounts = client.getAccounts();

      assert.ok(Array.isArray(accounts));
      assert.strictEqual(accounts.length, 0);
    });

    it('should handle null findAccount result', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [];

      const account = client.findAccount('Any Account');

      assert.strictEqual(account, null);
    });

    it('should handle conversion with invalid data', () => {
      const client = new ActualClient(mockConfig);

      const transaction = {
        Date: null,
        Account: '',
        Payee: '',
        Notes: '',
        Amount: NaN
      };

      // Should not throw
      const importFormat = client.convertToImportFormat(transaction);

      assert.ok(importFormat);
      assert.ok(importFormat.imported_id);
    });
  });

  describe('Duplicate Detection', () => {
    it('should use imported_id for duplicate detection', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [
        {
          id: 'acc_001',
          name: 'Test Account'
        }
      ];

      client.accountMap.set('Test Account', client.accounts[0]);

      const transaction = {
        Date: '2024-01-15',
        Account: 'Test Account',
        Payee: 'Test Payee',
        Notes: 'Test transaction',
        Amount: 10000
      };

      const format1 = client.convertToImportFormat(transaction);
      const format2 = client.convertToImportFormat(transaction);

      // Same transaction should get same imported_id
      assert.strictEqual(format1.imported_id, format2.imported_id);
    });

    it('should generate unique IDs for similar but different transactions', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [
        {
          id: 'acc_001',
          name: 'Test Account'
        }
      ];

      client.accountMap.set('Test Account', client.accounts[0]);

      const transaction1 = {
        Date: '2024-01-15',
        Account: 'Test Account',
        Payee: 'Test Payee',
        Notes: 'Transaction 1',
        Amount: 10000
      };

      const transaction2 = {
        ...transaction1,
        Notes: 'Transaction 2' // Different notes
      };

      const format1 = client.convertToImportFormat(transaction1);
      const format2 = client.convertToImportFormat(transaction2);

      assert.notStrictEqual(format1.imported_id, format2.imported_id);
    });
  });

  describe('Account Filtering', () => {
    it('should get all accounts', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [...mockActualAccounts];

      const accounts = client.getAccounts();

      assert.strictEqual(accounts.length, mockActualAccounts.length);
    });

    it('should filter on-budget accounts', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [...mockActualAccounts];

      const onBudgetAccounts = client.accounts.filter((acc) => !acc.offbudget && !acc.closed);

      assert.ok(onBudgetAccounts.length > 0);
      assert.ok(onBudgetAccounts.length < mockActualAccounts.length);
      assert.ok(onBudgetAccounts.every((acc) => !acc.offbudget && !acc.closed));
    });

    it('should filter off-budget accounts', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [...mockActualAccounts];

      const offBudgetAccounts = client.accounts.filter((acc) => acc.offbudget && !acc.closed);

      assert.ok(offBudgetAccounts.length > 0);
      assert.ok(offBudgetAccounts.every((acc) => acc.offbudget));
    });

    it('should exclude closed accounts', () => {
      const client = new ActualClient(mockConfig);
      client.accounts = [...mockActualAccounts];

      const openAccounts = client.accounts.filter((acc) => !acc.closed);

      assert.ok(openAccounts.every((acc) => !acc.closed));
      assert.ok(openAccounts.length < mockActualAccounts.length);
    });
  });
});
