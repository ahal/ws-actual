import { describe, it } from 'node:test';
import assert from 'node:assert';
import { transformTransaction } from '../src/transformer.js';
import { ActualClient } from '../src/actual-client.js';

describe('Deterministic ID Generation Tests', () => {
  const mockConfig = {
    serverUrl: 'http://test',
    password: 'test',
    budgetId: 'test'
  };

  it('should generate same ID for identical WealthSimple transactions across multiple runs', () => {
    const wsTransaction = {
      account: 'WealthSimple Cash',
      date: '2024-01-15',
      amount: '100.50',
      description: 'Salary deposit',
      type: 'deposit',
      transactionId: ''
    };

    // Transform the transaction multiple times
    const transformed1 = transformTransaction(wsTransaction);
    const transformed2 = transformTransaction(wsTransaction);
    const transformed3 = transformTransaction(wsTransaction);

    // Create client and generate IDs
    const client = new ActualClient(mockConfig);

    const id1 = client.generateImportedId(transformed1);
    const id2 = client.generateImportedId(transformed2);
    const id3 = client.generateImportedId(transformed3);

    // All IDs should be identical
    assert.strictEqual(id1, id2, 'IDs should be identical between runs');
    assert.strictEqual(id2, id3, 'IDs should be identical between runs');
    assert.strictEqual(id1, id3, 'IDs should be identical between runs');
  });

  it('should generate different IDs for different transactions', () => {
    const wsTransaction1 = {
      account: 'WealthSimple Cash',
      date: '2024-01-15',
      amount: '100.50',
      description: 'Salary deposit',
      type: 'deposit',
      transactionId: ''
    };

    const wsTransaction2 = {
      account: 'WealthSimple Cash',
      date: '2024-01-15',
      amount: '200.00', // Different amount
      description: 'Salary deposit',
      type: 'deposit',
      transactionId: ''
    };

    const transformed1 = transformTransaction(wsTransaction1);
    const transformed2 = transformTransaction(wsTransaction2);

    const client = new ActualClient(mockConfig);

    const id1 = client.generateImportedId(transformed1);
    const id2 = client.generateImportedId(transformed2);

    assert.notStrictEqual(id1, id2, 'Different transactions should have different IDs');
  });

  it('should generate hash-based ID for all transactions', () => {
    const wsTransaction = {
      account: 'WealthSimple Cash',
      date: '2024-01-15',
      amount: '100.50',
      description: 'Salary deposit',
      type: 'deposit',
      transactionId: 'txn_12345'
    };

    const transformed = transformTransaction(wsTransaction);
    const client = new ActualClient(mockConfig);

    const id = client.generateImportedId(transformed);

    assert.ok(id.startsWith('ws_'), 'Should start with ws_ prefix');
    assert.strictEqual(id.length, 19, 'Should be ws_ + 16 character hash');
  });

  it('should generate deterministic hash-based ID structure', () => {
    const wsTransaction = {
      account: 'WealthSimple Cash',
      date: '2024-01-15',
      amount: '100.50',
      description: 'Salary deposit',
      type: 'deposit',
      transactionId: ''
    };

    const transformed = transformTransaction(wsTransaction);
    const client = new ActualClient(mockConfig);

    const id = client.generateImportedId(transformed);

    // Should start with 'ws_' prefix
    assert.ok(id.startsWith('ws_'), 'ID should start with ws_ prefix');

    // Should be a valid hash-based ID
    assert.strictEqual(id.length, 19, 'Should be ws_ + 16 character hash');
    assert.ok(/^ws_[a-f0-9]{16}$/.test(id), 'Should be valid hex hash format');
  });

  it('should handle missing fields gracefully in ID generation', () => {
    const wsTransaction = {
      // Minimal transaction with missing fields
      account: '',
      date: '',
      amount: '',
      description: '',
      type: '',
      transactionId: ''
    };

    const transformed = transformTransaction(wsTransaction);
    const client = new ActualClient(mockConfig);

    const id = client.generateImportedId(transformed);

    // Should still generate a valid ID
    assert.ok(id.startsWith('ws_'), 'Should generate valid ID even with missing fields');
    assert.strictEqual(id.length, 19, 'Should be ws_ + 16 character hash');
  });

  it('should use convertToImportFormat with hash-based ID', () => {
    const wsTransaction = {
      account: 'WealthSimple Cash',
      date: '2024-01-15',
      amount: '100.50',
      description: 'Salary deposit',
      type: 'deposit',
      transactionId: 'txn_12345'
    };

    const transformed = transformTransaction(wsTransaction);
    const client = new ActualClient(mockConfig);

    const importFormat = client.convertToImportFormat(transformed);

    // Should use hash-based ID
    assert.ok(importFormat.imported_id.startsWith('ws_'), 'Should start with ws_ prefix');
    assert.strictEqual(importFormat.imported_id.length, 19, 'Should be ws_ + 16 character hash');
    assert.ok(
      /^ws_[a-f0-9]{16}$/.test(importFormat.imported_id),
      'Should be valid hex hash format'
    );
  });

  it('should generate consistent IDs for same transformed content', () => {
    const wsTransaction1 = {
      account: 'WealthSimple Cash',
      date: '2024-01-15',
      filled: '2024-01-16',
      submitted: '2024-01-17',
      amount: '100.50',
      description: 'Test transaction',
      type: 'deposit',
      transactionId: ''
    };

    const wsTransaction2 = {
      account: 'WealthSimple Cash',
      date: '', // No date
      filled: '2024-01-15', // Use filled instead - results in same transformed date
      submitted: '2024-01-17',
      amount: '100.50',
      description: 'Test transaction',
      type: 'deposit',
      transactionId: ''
    };

    const transformed1 = transformTransaction(wsTransaction1);
    const transformed2 = transformTransaction(wsTransaction2);

    const client = new ActualClient(mockConfig);

    const id1 = client.generateImportedId(transformed1);
    const id2 = client.generateImportedId(transformed2);

    // Should be the same since both result in the same transformed content
    assert.strictEqual(id1, id2, 'Should generate same ID when transformed content is the same');
  });
});
