import * as api from '@actual-app/api';
import { xdgData } from 'xdg-basedir';
import { join } from 'path';
import { rm, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { createHash } from 'crypto';

/**
 * Get the data directory path using XDG specification
 * @returns {string} Data directory path
 */
function getDataDir() {
  return join(xdgData, 'ws-actual');
}

/**
 * ActualBudget API client wrapper
 */
export class ActualClient {
  constructor(config) {
    this.config = config;
    this.connected = false;
    this.accounts = [];
    this.accountMap = new Map();
    this.payees = [];
    this.transferPayeeMap = new Map();
  }

  /**
   * Clear the local cache directory
   * @returns {Promise<void>}
   */
  async clearCache() {
    const dataDir = this.config.dataDir || getDataDir();
    if (existsSync(dataDir)) {
      if (this.config.verbose) {
        console.log(`Clearing cache directory: ${dataDir}`);
      }
      await rm(dataDir, { recursive: true, force: true });
    }
  }

  /**
   * Initialize and connect to ActualBudget
   * @returns {Promise<void>}
   */
  async connect() {
    const dataDir = this.config.dataDir || getDataDir();

    try {
      // Ensure data directory exists
      await mkdir(dataDir, { recursive: true });

      // Log connection attempt for debugging
      if (this.config.verbose) {
        console.log(`Connecting to ActualBudget server at: ${this.config.serverUrl}`);
        console.log(`Using data directory: ${dataDir}`);
      }

      await api.init({
        dataDir: dataDir,
        serverURL: this.config.serverUrl,
        password: this.config.password
      });

      if (this.config.verbose) {
        console.log(`Downloading budget: ${this.config.budgetId}`);
      }

      await api.downloadBudget(this.config.budgetId);
      this.connected = true;

      // Load accounts and payees
      await this.loadAccounts();
      await this.loadPayees();
    } catch (error) {
      const errorString = `${error.toString()} ${error.stack || ''}`;
      const isDatabaseError =
        errorString.includes('out-of-sync') ||
        errorString.includes('Database is out of sync') ||
        errorString.includes('checkDatabaseValidity');

      if (isDatabaseError) {
        if (this.config.verbose) {
          console.log('Database error detected. Clearing cache and retrying...');
        }

        try {
          await api.shutdown();
        } catch {
          // Ignore shutdown errors
        }
        await this.clearCache();
        await mkdir(dataDir, { recursive: true });

        await api.init({
          dataDir: dataDir,
          serverURL: this.config.serverUrl,
          password: this.config.password
        });

        await api.downloadBudget(this.config.budgetId);
        this.connected = true;
        await this.loadAccounts();
        await this.loadPayees();

        if (this.config.verbose) {
          console.log('✅ Connection successful after cache clear');
        }
        return;
      }

      throw new Error(`Failed to connect to ActualBudget: ${error.message}`);
    }
  }

  /**
   * Load and cache accounts
   * @returns {Promise<void>}
   */
  async loadAccounts() {
    this.accounts = await api.getAccounts();
    this.accountMap.clear();

    this.accounts.forEach((account) => {
      this.accountMap.set(account.name, account);
      this.accountMap.set(account.id, account);
    });
  }

  /**
   * Load and cache payees
   * @returns {Promise<void>}
   */
  async loadPayees() {
    this.payees = await api.getPayees();
    this.transferPayeeMap.clear();

    this.payees.forEach((payee) => {
      // If payee has transfer_acct field, it's a transfer payee
      if (payee.transfer_acct) {
        // Map account ID to transfer payee
        this.transferPayeeMap.set(payee.transfer_acct, payee);

        // Also map account name to transfer payee for convenience
        const account = this.findAccount(payee.transfer_acct);
        if (account) {
          this.transferPayeeMap.set(account.name, payee);
        }

        if (this.config.verbose) {
          console.log(`  Loaded transfer payee: ${payee.name} for account ${payee.transfer_acct}`);
        }
      }
    });
  }

  /**
   * Get all accounts
   * @returns {Array} List of accounts
   */
  getAccounts() {
    return this.accounts;
  }

  /**
   * Find account by name or ID
   * @param {string} nameOrId Account name or ID
   * @returns {Object|null} Account object or null
   */
  findAccount(nameOrId) {
    return this.accountMap.get(nameOrId) || null;
  }

  /**
   * Get account ID by name
   * @param {string} accountName Account name
   * @returns {string|null} Account ID or null
   */
  getAccountId(accountName) {
    const account = this.findAccount(accountName);
    return account ? account.id : null;
  }

  /**
   * Get all payees
   * @returns {Array} List of payees
   */
  getPayees() {
    return this.payees;
  }

  /**
   * Find transfer payee for a given account
   * @param {string} accountNameOrId Account name or ID
   * @returns {Object|null} Transfer payee or null
   */
  findTransferPayee(accountNameOrId) {
    return this.transferPayeeMap.get(accountNameOrId) || null;
  }

  /**
   * List all available transfer payees for debugging
   * @returns {Array} List of transfer payees with account info
   */
  listTransferPayees() {
    const transferPayees = [];
    for (const [key, payee] of this.transferPayeeMap.entries()) {
      if (payee.transfer_acct) {
        const account = this.findAccount(payee.transfer_acct);
        transferPayees.push({
          payeeId: payee.id,
          payeeName: payee.name,
          accountId: payee.transfer_acct,
          accountName: account ? account.name : 'Unknown',
          mapKey: key
        });
      }
    }
    return transferPayees;
  }

  /**
   * Generate a deterministic imported_id for deduplication using hash of transaction contents
   * @param {Object} transaction Transformed transaction data
   * @returns {string} Deterministic imported ID
   */
  generateImportedId(transaction) {
    // Create a hash of the entire transaction contents for deterministic ID
    // Build the object with sorted keys to ensure deterministic JSON.stringify
    const sortedTransaction = {
      account: transaction.Account,
      amount: transaction.Amount,
      date: transaction.Date,
      notes: transaction.Notes,
      payee: transaction.Payee
    };

    const transactionString = JSON.stringify(sortedTransaction);
    const hash = createHash('sha256').update(transactionString).digest('hex');
    return `ws_${hash.substring(0, 16)}`; // Use first 16 characters of hash
  }

  /**
   * Convert CLAUDE.md format transaction to ActualBudget import format
   * @param {Object} transaction Transaction data (using CLAUDE.md format)
   * @returns {Object} ActualBudget import format
   */
  convertToImportFormat(transaction) {
    // Generate imported_id using hash of transaction contents
    const imported_id = this.generateImportedId(transaction);

    const actualTransaction = {
      date: transaction.Date,
      amount: transaction.Amount, // Should be in cents
      imported_id: imported_id,
      cleared: false // Default to false for new transactions
    };

    // Set account from Account field (convert from name to ID)
    if (transaction.Account) {
      const account = this.findAccount(transaction.Account);
      if (account) {
        actualTransaction.account = account.id;
      }
    }

    if (this.config.verbose && transaction._isTransfer) {
      console.log(
        `    Converting transfer transaction: _isTransfer=${transaction._isTransfer}, _transferToAccount=${transaction._transferToAccount}`
      );
    }

    // Handle transfers
    if (transaction._isTransfer && transaction._transferToAccount) {
      // For transfers, use the transfer payee instead of payee_name
      const transferPayee = this.findTransferPayee(transaction._transferToAccount);
      if (transferPayee) {
        actualTransaction.payee = transferPayee.id;
        actualTransaction.notes = transaction.Notes || '';
        if (this.config.verbose) {
          console.log(`    Using transfer payee: ${transferPayee.name} (${transferPayee.id})`);
        }
      } else {
        // Fallback to regular transaction if transfer payee not found
        if (this.config.verbose) {
          console.log(
            `    Warning: Transfer payee not found for account ID: ${transaction._transferToAccount}`
          );
          console.log(
            '    Available transfer payee keys:',
            Array.from(this.transferPayeeMap.keys()).slice(0, 20)
          );
          console.log(`    Looking for: "${transaction._transferToAccount}"`);
        }
        // Only set payee_name if we have a valid payee value
        if (transaction.Payee) {
          actualTransaction.payee_name = transaction.Payee;
        }
        actualTransaction.notes = transaction.Notes || '';
      }
    } else {
      // Regular transaction
      // Only set payee_name if we have a valid payee value
      if (transaction.Payee) {
        actualTransaction.payee_name = transaction.Payee;
      }
      actualTransaction.notes = transaction.Notes || '';
    }

    // Add optional fields - only add category if it's not null/undefined
    // ActualBudget doesn't accept null for category, it should be omitted instead
    if (transaction.category) {
      actualTransaction.category = transaction.category;
    }

    // Ensure cleared is a boolean (ActualBudget might expect 0/1)
    if (actualTransaction.cleared === undefined) {
      actualTransaction.cleared = false;
    }

    return actualTransaction;
  }

  /**
   * Import multiple transactions using ActualBudget's batch import API
   * @param {Array} transactions Array of transaction data (CLAUDE.md format)
   * @param {Function} onProgress Progress callback
   * @returns {Promise<Object>} Import results
   */
  async importTransactions(transactions, onProgress) {
    if (!this.connected) {
      throw new Error('Not connected to ActualBudget');
    }

    if (!transactions || transactions.length === 0) {
      return {
        imported: [],
        updated: [],
        failed: [],
        duplicates: [],
        summary: { total: 0, added: 0, updated: 0, errors: 0 }
      };
    }

    // Group transactions by account for batch import, expanding transfers
    const transactionsByAccount = new Map();
    const errors = [];

    transactions.forEach((transaction, index) => {
      try {
        // Resolve account ID
        let accountId;
        if (transaction._accountId) {
          accountId = transaction._accountId;
        } else {
          if (!transaction.Account) {
            throw new Error('Account is required');
          }
          const account = this.findAccount(transaction.Account);
          if (!account) {
            throw new Error(`Account not found: ${transaction.Account}`);
          }
          accountId = account.id;
        }

        // Convert to import format
        const importTransaction = this.convertToImportFormat(transaction);

        // Group by account
        if (!transactionsByAccount.has(accountId)) {
          transactionsByAccount.set(accountId, []);
        }
        transactionsByAccount.get(accountId).push({
          original: transaction,
          import: importTransaction,
          index
        });

        // For transfers, also create the corresponding transaction in the destination account
        if (transaction._isTransfer && transaction._transferToAccount) {
          const transferPayee = this.findTransferPayee(transaction._transferToAccount);
          if (transferPayee) {
            if (this.config.verbose) {
              console.log(
                `  Creating corresponding transfer transaction in destination account: ${transaction._transferToAccount}`
              );
            }

            // Create the mirror transaction for the destination account
            const mirrorTransaction = {
              date: transaction.Date,
              amount: -transaction.Amount, // Opposite amount
              imported_id: `${importTransaction.imported_id}_mirror`,
              cleared: false,
              payee: transferPayee.id,
              notes: transaction.Notes || ''
            };

            // Group by destination account
            if (!transactionsByAccount.has(transaction._transferToAccount)) {
              transactionsByAccount.set(transaction._transferToAccount, []);
            }
            transactionsByAccount.get(transaction._transferToAccount).push({
              original: transaction, // Same original transaction for reference
              import: mirrorTransaction,
              index,
              isMirrorTransfer: true
            });
          } else if (this.config.verbose) {
            console.log(
              `  Warning: No transfer payee found for destination account: ${transaction._transferToAccount}`
            );
          }
        }
      } catch (error) {
        errors.push({
          transaction,
          index,
          error: error.message
        });
      }
    });

    // Process each account's transactions in batch
    const results = {
      imported: [],
      updated: [],
      failed: errors,
      duplicates: [],
      summary: { total: transactions.length, added: 0, updated: 0, errors: errors.length }
    };

    let processedCount = 0;

    for (const [accountId, accountTransactions] of transactionsByAccount) {
      try {
        // Extract just the import format transactions
        const importData = accountTransactions.map((t) => t.import);

        // Call ActualBudget's importTransactions API
        const importResult = await api.importTransactions(accountId, importData);

        // Process results
        if (importResult.added && importResult.added.length > 0) {
          importResult.added.forEach((transactionId, idx) => {
            if (idx < accountTransactions.length) {
              results.imported.push({
                transaction: accountTransactions[idx].original,
                actualId: transactionId
              });
              results.summary.added++;
            }
          });
        }

        if (importResult.updated && importResult.updated.length > 0) {
          importResult.updated.forEach((transactionId, idx) => {
            if (idx < accountTransactions.length) {
              results.updated.push({
                transaction: accountTransactions[idx].original,
                actualId: transactionId
              });
              results.summary.updated++;
            }
          });
        }

        if (importResult.errors && importResult.errors.length > 0) {
          importResult.errors.forEach((error, idx) => {
            if (idx < accountTransactions.length) {
              results.failed.push({
                transaction: accountTransactions[idx].original,
                error: error.message || error
              });
              results.summary.errors++;
            }
          });
        }

        // Update progress
        processedCount += accountTransactions.length;
        if (onProgress) {
          onProgress({
            current: processedCount,
            total: transactions.length,
            phase: 'importing',
            account: this.findAccount(accountId)?.name || accountId
          });
        }
      } catch (error) {
        // If batch import fails, mark all transactions in this account as failed
        accountTransactions.forEach(({ original }) => {
          results.failed.push({
            transaction: original,
            error: `Batch import failed for account: ${error.message}`
          });
          results.summary.errors++;
        });
      }
    }

    return results;
  }

  /**
   * Get categories
   * @returns {Promise<Array>} List of categories
   */
  async getCategories() {
    try {
      return await api.getCategories();
    } catch (error) {
      throw new Error(`Failed to get categories: ${error.message}`);
    }
  }

  /**
   * Get account balance from ActualBudget
   * @param {string} accountId Account ID
   * @returns {Promise<number>} Account balance in cents
   */
  async getAccountBalance(accountId) {
    if (!this.connected) {
      throw new Error('Not connected to ActualBudget');
    }

    try {
      const result = await api.runQuery(
        api.q('transactions')
          .filter({ account: accountId })
          .calculate({ $sum: '$amount' })
      );
      return result.data || 0;
    } catch (error) {
      throw new Error(`Failed to get account balance: ${error.message}`);
    }
  }

  /**
   * Create balance adjustment transactions for accounts
   * @param {Array} wsBalances WealthSimple account balances [{name, balance}]
   * @param {Function} resolveAccount Function to resolve WealthSimple account name to ActualBudget account
   * @returns {Promise<Object>} Adjustment results
   */
  async adjustAccountBalances(wsBalances, resolveAccount) {
    if (!this.connected) {
      throw new Error('Not connected to ActualBudget');
    }

    const adjustments = [];
    const skipped = [];
    const errors = [];

    for (const wsBalance of wsBalances) {
      try {
        // Resolve WealthSimple account to ActualBudget account
        const resolved = resolveAccount(wsBalance.name);
        if (!resolved) {
          skipped.push({
            account: wsBalance.name,
            reason: 'Not mapped to ActualBudget account'
          });
          continue;
        }

        // Get current ActualBudget balance
        const actualBalanceCents = await this.getAccountBalance(resolved.accountId);
        const actualBalance = actualBalanceCents / 100;

        // Calculate difference
        const difference = wsBalance.balance - actualBalance;

        if (Math.abs(difference) < 0.01) {
          // Balance is already accurate (within 1 cent)
          if (this.config.verbose) {
            console.log(
              `  ${resolved.accountName}: Already balanced ($${actualBalance.toFixed(2)})`
            );
          }
          continue;
        }

        // Create adjustment transaction
        const adjustmentTransaction = {
          Date: new Date().toISOString().split('T')[0], // Today's date
          Account: wsBalance.name,
          Payee: 'Balance Adjustment',
          Notes: `Adjustment to match WealthSimple balance of $${wsBalance.balance.toFixed(2)}`,
          Amount: Math.round(difference * 100), // Convert to cents
          _accountId: resolved.accountId
        };

        // Import the adjustment transaction
        const result = await this.importTransactions([adjustmentTransaction], null);

        if (result.imported.length > 0) {
          adjustments.push({
            account: resolved.accountName,
            wsBalance: wsBalance.balance,
            actualBalance: actualBalance,
            adjustment: difference,
            transactionId: result.imported[0].actualId
          });

          if (this.config.verbose) {
            console.log(
              `  ${resolved.accountName}: Adjusted by $${difference.toFixed(2)} (was $${actualBalance.toFixed(2)}, now $${wsBalance.balance.toFixed(2)})`
            );
          }
        } else {
          errors.push({
            account: wsBalance.name,
            error: 'Failed to create adjustment transaction'
          });
        }
      } catch (error) {
        errors.push({
          account: wsBalance.name,
          error: error.message
        });
        if (this.config.verbose) {
          console.error(`  Error adjusting ${wsBalance.name}:`, error.message);
        }
      }
    }

    return {
      adjustments,
      skipped,
      errors
    };
  }

  /**
   * Sync changes with server
   * @returns {Promise<void>}
   */
  async sync() {
    if (!this.connected) {
      throw new Error('Not connected to ActualBudget');
    }

    try {
      await api.sync();
    } catch (error) {
      throw new Error(`Failed to sync: ${error.message}`);
    }
  }

  /**
   * Shutdown the client
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.connected) {
      await api.shutdown();
      this.connected = false;
      this.accounts = [];
      this.accountMap.clear();
      this.payees = [];
      this.transferPayeeMap.clear();
    }
  }

  /**
   * Run a query
   * @param {string} query Query to run
   * @returns {Promise<any>} Query result
   */
  async runQuery(query) {
    if (!this.connected) {
      throw new Error('Not connected to ActualBudget');
    }

    try {
      return await api.runQuery(query);
    } catch (error) {
      throw new Error(`Query failed: ${error.message}`);
    }
  }
}

/**
 * Create and connect ActualBudget client
 * @param {Object} config Configuration object
 * @returns {Promise<ActualClient>} Connected client
 */
export async function createClient(config) {
  const client = new ActualClient(config);
  await client.connect();
  return client;
}

export default ActualClient;
