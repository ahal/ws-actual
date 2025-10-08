import { describe, it } from 'node:test';
import assert from 'node:assert';
import { transformTransactions } from '../src/transformer.js';

/**
 * Simple integration test for transaction transformation
 * Tests the key behaviors without getting into complex details
 */

describe('Transaction Transformation Basic Tests', () => {
  it('should transform a basic deposit correctly', () => {
    const wsTransactions = [
      {
        account: 'WealthSimple Cash',
        status: 'filled',
        date: '2024-01-15',
        submitted: '2024-01-15T10:00:00Z',
        filled: '2024-01-15T10:01:00Z',
        amount: '100.50',
        amountCurrency: 'CAD',
        type: 'deposit',
        description: 'Test deposit',
        email: 'test@example.com',
        message: '',
        enteredQuantity: '1',
        filledQuantity: '1',
        accountNumber: '12345',
        transactionId: 'txn_123'
      }
    ];

    const result = transformTransactions(wsTransactions);

    assert.strictEqual(result.length, 1, 'Should transform 1 transaction');

    const transaction = result[0];
    assert.strictEqual(
      transaction.Account,
      'WealthSimple Cash',
      'Should use original WealthSimple account name'
    );
    assert.strictEqual(
      transaction.Date,
      '2024-01-15',
      'Should use date field (priority over filled)'
    );
    assert.strictEqual(transaction.Amount, 10050, 'Should convert amount to cents');
    assert.ok(transaction.Notes.includes('Test deposit'), 'Notes should include description');
    assert.ok(transaction.Notes.includes('deposit'), 'Notes should include type');
    assert.ok(
      transaction.Notes.includes('[txn_123]'),
      'Notes should include transaction ID in brackets'
    );
  });

  it('should handle negative amounts correctly', () => {
    const wsTransactions = [
      {
        account: 'Test Account',
        status: 'filled',
        date: '2024-02-01',
        filled: '2024-02-01T14:31:00Z',
        amount: '-250.00',
        type: 'withdrawal',
        description: 'ATM withdrawal',
        transactionId: 'txn_456'
      }
    ];

    const result = transformTransactions(wsTransactions);
    const transaction = result[0];

    assert.strictEqual(transaction.Amount, -25000, 'Negative amount should stay negative');
  });

  it('should identify debit transactions by type', () => {
    const wsTransactions = [
      {
        account: 'Test Account',
        status: 'filled',
        date: '2024-03-01',
        filled: '2024-03-01T10:00:00Z',
        amount: '50.00', // Positive amount
        type: 'payment', // But payment type = debit
        description: 'Store payment',
        transactionId: 'txn_789'
      }
    ];

    const result = transformTransactions(wsTransactions);
    const transaction = result[0];

    assert.strictEqual(transaction.Amount, -5000, 'Payment type should make amount negative');
  });

  it('should combine description and message in notes', () => {
    const wsTransactions = [
      {
        account: 'Test Account',
        status: 'filled',
        date: '2024-04-01',
        filled: '2024-04-01T12:01:00Z',
        amount: '1000.00',
        type: 'deposit',
        description: 'Salary deposit',
        message: 'Biweekly payroll',
        transactionId: 'txn_salary'
      }
    ];

    const result = transformTransactions(wsTransactions);
    const transaction = result[0];

    assert.ok(transaction.Notes.includes('Salary deposit'), 'Notes should include description');
    assert.ok(
      transaction.Notes.includes('Biweekly payroll'),
      'Notes should include message when different'
    );
  });

  it('should extract payee name from description', () => {
    const wsTransactions = [
      {
        account: 'Test Account',
        status: 'filled',
        date: '2024-05-01',
        filled: '2024-05-01T10:00:00Z',
        amount: '25.00',
        type: 'deposit',
        description: 'ACME Corporation',
        transactionId: 'txn_payee'
      }
    ];

    const result = transformTransactions(wsTransactions);
    const transaction = result[0];

    assert.strictEqual(
      transaction.Payee,
      'ACME Corporation',
      'Should extract payee from description'
    );
  });

  it('should handle multiple transactions', () => {
    const wsTransactions = [
      {
        account: 'Test Account',
        status: 'filled',
        date: '2024-06-01',
        filled: '2024-06-01T10:00:00Z',
        amount: '100.00',
        type: 'deposit',
        description: 'First deposit',
        transactionId: 'txn_first'
      },
      {
        account: 'Test Account',
        status: 'filled',
        date: '2024-06-02',
        filled: '2024-06-02T11:00:00Z',
        amount: '50.00',
        type: 'withdrawal',
        description: 'Cash withdrawal',
        transactionId: 'txn_second'
      }
    ];

    const result = transformTransactions(wsTransactions);

    assert.strictEqual(result.length, 2, 'Should transform 2 transactions');
    assert.strictEqual(result[0].Amount, 10000, 'First transaction should be positive');
    assert.strictEqual(
      result[1].Amount,
      -5000,
      'Second transaction should be negative (withdrawal)'
    );
  });

  it('should have required CLAUDE.md fields only', () => {
    const wsTransactions = [
      {
        account: 'Test Account',
        status: 'filled',
        date: '2024-07-01',
        filled: '2024-07-01T10:00:00Z',
        amount: '75.25',
        amountCurrency: 'CAD',
        type: 'transfer',
        description: 'Monthly transfer',
        transactionId: 'txn_transfer'
      }
    ];

    const result = transformTransactions(wsTransactions);
    const transaction = result[0];

    // Check that all required CLAUDE.md fields are present
    assert.ok(transaction.Date, 'Should have Date field');
    assert.ok(transaction.Account, 'Should have Account field');
    assert.ok(transaction.Payee !== undefined, 'Should have Payee field');
    assert.ok(transaction.Notes, 'Should have Notes field');
    assert.ok(typeof transaction.Amount === 'number', 'Should have Amount field as number');

    // Check that no extra fields are present
    const allowedFields = ['Date', 'Account', 'Payee', 'Notes', 'Amount'];
    const actualFields = Object.keys(transaction);
    const extraFields = actualFields.filter((field) => !allowedFields.includes(field));
    assert.strictEqual(
      extraFields.length,
      0,
      `Should only have allowed fields, found extra: ${extraFields.join(', ')}`
    );
  });
});
