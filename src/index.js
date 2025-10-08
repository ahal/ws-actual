import { scrapeTransactions } from './scraper.js';
import { createClient } from './actual-client.js';
import { transformTransactions, calculateStatistics, validateTransaction } from './transformer.js';
import { getConfig, validateConfig, loadConfig, saveConfig, resolveAccount } from './config.js';
import { formatTransactionsTable } from './table-formatter.js';
import { getUniqueAccounts, promptForAccountMapping } from './account-mapper.js';

// Re-export auth functions
export { login, logout, testConnection, clearCache } from './auth-manager.js';

// Re-export account operations
export {
  listAccounts,
  generateAccountConfig,
  validateAccountMappings
} from './account-operations.js';

/**
 * Main import function
 * @param {Object} options CLI options
 * @returns {Promise<Object>} Import results
 */
export async function importTransactions(options = {}) {
  const config = await getConfig(options, !options.dryRun);
  const fullConfig = await loadConfig(options.config);
  let client = null;

  try {
    // Validate configuration
    if (!options.dryRun) {
      validateConfig(config);
    }

    if (config.verbose) {
      console.log('Configuration loaded:', {
        serverUrl: config.serverUrl,
        budgetId: config.budgetId ? '***' : undefined,
        dryRun: config.dryRun
      });
    }

    // Scrape transactions from WealthSimple
    if (options.remoteBrowserUrl) {
      console.log('Connecting to remote browser to extract transactions from WealthSimple...');
    } else {
      console.log('Launching browser to extract transactions from WealthSimple...');
    }
    const wsTransactions = await scrapeTransactions({
      verbose: config.verbose,
      remoteBrowserUrl: options.remoteBrowserUrl
    });

    if (wsTransactions.length === 0) {
      console.log('No transactions found');
      return { imported: 0, failed: 0, duplicates: 0 };
    }

    if (config.verbose) {
      console.log(`Found ${wsTransactions.length} transactions`);
    }

    // Get unique accounts
    const uniqueAccounts = getUniqueAccounts(wsTransactions);
    if (config.verbose) {
      console.log(`Accounts: ${uniqueAccounts.join(', ')}`);
    }

    // Account configuration is already loaded in fullConfig

    // Connect to ActualBudget (unless dry run)
    if (!config.dryRun) {
      if (config.verbose) {
        console.log('Connecting to ActualBudget...');
      }
      client = await createClient(config);
      if (config.verbose) {
        console.log('Connected successfully');
      }

      // Show available accounts
      const actualAccounts = client.getAccounts();
      if (config.verbose) {
        console.log('\nAvailable ActualBudget accounts:');
        actualAccounts.forEach((acc) => {
          console.log(`  - ${acc.name} (${acc.id})`);
        });
      }
    }

    // Transform and group transactions
    if (config.verbose) {
      console.log('\nTransforming transactions...');
    }
    const transformedGroups = new Map();
    const skippedAccounts = [];

    // Create a function to check if an account name is mapped (for transfer detection)
    const isAccountMapped = (accountName) => {
      return resolveAccount(accountName, fullConfig) !== null;
    };

    // First, handle transfer transactions that need to be created in their source account
    const transfersToProcess = [];
    const regularTransactionsByAccount = new Map();

    for (const wsAccount of uniqueAccounts) {
      const accountTransactions = wsTransactions.filter((t) => t.account === wsAccount);
      regularTransactionsByAccount.set(wsAccount, []);

      // Check each transaction to see if it's a transfer that needs special handling
      for (const transaction of accountTransactions) {
        if (transaction.from && transaction.to && transaction.from !== transaction.to) {
          // This is a transfer - check if it needs to be moved to source account
          if (transaction.account === transaction.to) {
            // Transaction is in destination account but should be in source for ActualBudget
            // Only move it if BOTH source and destination accounts are mapped
            if (isAccountMapped(transaction.from) && isAccountMapped(transaction.to)) {
              // Also need to negate the amount since it's now from the source perspective
              transfersToProcess.push({
                ...transaction,
                account: transaction.from, // Move to source account
                originalAccount: transaction.account,
                amount: transaction.amount ? String(-parseFloat(transaction.amount)) : '0',
                // Store transfer info to re-add after transformation
                _transferInfo: {
                  isTransfer: true,
                  toAccount: transaction.to
                }
              });
            } else {
              // One of the accounts is unmapped, treat as regular transaction
              regularTransactionsByAccount.get(wsAccount).push(transaction);
            }
          } else {
            // Transaction is already in source account
            regularTransactionsByAccount.get(wsAccount).push(transaction);
          }
        } else {
          // Regular transaction
          regularTransactionsByAccount.get(wsAccount).push(transaction);
        }
      }
    }

    // Add transfers to their source accounts
    for (const transfer of transfersToProcess) {
      if (!regularTransactionsByAccount.has(transfer.account)) {
        regularTransactionsByAccount.set(transfer.account, []);
      }
      regularTransactionsByAccount.get(transfer.account).push(transfer);
    }

    // Now process all accounts with their corrected transactions
    for (const [wsAccount, accountTransactions] of regularTransactionsByAccount) {
      if (accountTransactions.length === 0) {
        continue;
      }

      // Resolve account
      const resolved = resolveAccount(wsAccount, fullConfig);

      if (!resolved) {
        // No mapping found
        if (options.addMissingAccounts && !config.dryRun) {
          // Prompt user to map this account
          console.log(
            `\n❓ Unmapped account found: ${wsAccount} (${accountTransactions.length} transactions)`
          );

          const resolvedMapping = await promptForAccountMapping(wsAccount, client, fullConfig);
          if (resolvedMapping) {
            // Account was mapped, process it
            const transformed = transformTransactions(accountTransactions, {
              accountId: resolvedMapping.accountId,
              accountName: resolvedMapping.accountName,
              isAccountMapped: isAccountMapped
            });

            transformedGroups.set(wsAccount, {
              transactions: transformed,
              accountInfo: resolvedMapping
            });
            continue;
          }
        }

        // Skip this account (either user chose to skip or flag not set)
        skippedAccounts.push(wsAccount);
        console.log(
          `Skipping unmapped account: ${wsAccount} (${accountTransactions.length} transactions)`
        );
        continue;
      }

      // Show mapping type in verbose mode
      if (config.verbose) {
        const matchInfo =
          resolved.matchType === 'interactive' ? 'interactively mapped' : 'exact match';
        console.log(`Mapped "${wsAccount}" → "${resolved.accountName}" (${matchInfo})`);
      }

      // Transform transactions for this account with transfer detection
      if (config.verbose) {
        console.log(
          `Transforming ${accountTransactions.length} transactions for ${resolved.accountName}`
        );
        accountTransactions.forEach((t) => {
          if (t.from && t.to) {
            console.log(`  Transfer transaction: from=${t.from}, to=${t.to}, account=${t.account}`);
          }
        });
      }

      const transformed = transformTransactions(accountTransactions, {
        accountId: resolved.accountId,
        accountName: resolved.accountName,
        isAccountMapped: isAccountMapped
      });

      transformedGroups.set(wsAccount, {
        transactions: transformed,
        accountInfo: resolved
      });
    }

    if (skippedAccounts.length > 0) {
      console.log(
        `\nSkipped ${skippedAccounts.length} unmapped account(s). Configure mappings in accounts.json to import these transactions.`
      );
    }

    // Validate transformed transactions and filter out invalid ones
    let validationErrors = 0;
    const validatedGroups = new Map();

    transformedGroups.forEach((group, wsAccount) => {
      const validTransactions = [];

      group.transactions.forEach((transaction) => {
        const validationResult = validateTransaction(transaction);
        if (!validationResult.isValid) {
          validationErrors++;
          if (config.verbose) {
            console.error(
              `Validation error for transaction ${transaction.imported_id || transaction.Payee}:`,
              validationResult.errors.join(', ')
            );
          }
        } else {
          validTransactions.push(transaction);
        }
      });

      if (validTransactions.length > 0) {
        validatedGroups.set(wsAccount, {
          transactions: validTransactions,
          accountInfo: group.accountInfo
        });
      }
    });

    if (validationErrors > 0 && config.verbose) {
      console.warn(`Skipped ${validationErrors} invalid transactions`);
    }

    // Use validated groups for the rest of the import
    const transformedGroupsToImport = validatedGroups;

    // Calculate statistics
    const allTransformed = Array.from(transformedGroupsToImport.values()).flatMap(
      (group) => group.transactions
    );
    const stats = calculateStatistics(allTransformed);

    // Import transactions (unless dry run)
    const importResults = {
      imported: [],
      failed: [],
      duplicates: []
    };

    if (!config.dryRun) {
      if (config.verbose) {
        console.log('\nTransaction Summary:');
        console.log(`  Total transactions: ${stats.total}`);
        console.log(`  Date range: ${stats.dateRange.start} to ${stats.dateRange.end}`);
        console.log(`  Total credits: $${stats.totalCredits.toFixed(2)}`);
        console.log(`  Total debits: $${stats.totalDebits.toFixed(2)}`);
        console.log(`  Net amount: $${stats.netAmount.toFixed(2)}`);

        console.log('\n  By type:');
        Object.entries(stats.byType).forEach(([type, count]) => {
          console.log(`    ${type}: ${count}`);
        });
      }

      console.log('\nImporting transactions...');

      for (const [wsAccount, group] of transformedGroupsToImport) {
        const { transactions, accountInfo } = group;

        // All accounts in transformedGroups should have valid mappings now
        if (!accountInfo.accountId) {
          console.error(`Unexpected: No account ID for ${wsAccount}`);
          continue;
        }

        if (config.verbose) {
          console.log(
            `\nImporting ${transactions.length} transactions to ${accountInfo.accountName}...`
          );
        }

        // Inject account ID for API while preserving account name for display
        const transactionsWithAccountId = transactions.map((transaction) => {
          const processedTransaction = {
            ...transaction,
            _accountId: accountInfo.accountId
          };

          // For transfers, resolve the target account ID
          if (transaction._isTransfer && transaction._transferToAccount) {
            const targetAccountResolved = resolveAccount(
              transaction._transferToAccount,
              fullConfig
            );
            if (targetAccountResolved) {
              // Preserve transfer metadata with resolved account ID
              Object.defineProperty(processedTransaction, '_isTransfer', {
                value: transaction._isTransfer,
                writable: false,
                enumerable: false,
                configurable: false
              });
              Object.defineProperty(processedTransaction, '_transferToAccount', {
                value: targetAccountResolved.accountId,
                writable: false,
                enumerable: false,
                configurable: false
              });
              if (config.verbose) {
                console.log(
                  `  Transfer detected: ${accountInfo.accountName} → ${targetAccountResolved.accountName}`
                );
                console.log(`  Transfer target account ID: ${targetAccountResolved.accountId}`);
              }
            } else {
              if (config.verbose) {
                console.log(
                  `  Warning: Transfer target account "${transaction._transferToAccount}" not found, treating as regular transaction`
                );
              }
              // Remove transfer flags if target account not found
              delete processedTransaction._isTransfer;
              delete processedTransaction._transferToAccount;
            }
          }

          return processedTransaction;
        });

        const results = await client.importTransactions(
          transactionsWithAccountId,
          config.verbose
            ? (progress) => {
                process.stdout.write(`\r  Progress: ${progress.current}/${progress.total}`);
              }
            : null
        );

        if (config.verbose) {
          process.stdout.write('\n');
        }

        importResults.imported.push(...results.imported);
        importResults.failed.push(...results.failed);
        importResults.duplicates.push(...results.duplicates);
      }

      // Sync with server
      if (config.verbose) {
        console.log('\nSyncing with ActualBudget server...');
      }
      await client.sync();

      // Save updated configuration
      if ((fullConfig.accounts || []).length > 0) {
        await saveConfig(fullConfig);
      }

      // Display results
      console.log('\nImport Results:');
      console.log(`  Imported: ${importResults.imported.length}`);
      console.log(`  Failed: ${importResults.failed.length}`);
      console.log(`  Duplicates: ${importResults.duplicates.length}`);

      if (importResults.failed.length > 0 && config.verbose) {
        console.log('\n  Failed transactions:');
        importResults.failed.slice(0, 5).forEach(({ transaction, error }) => {
          console.log(`    - ${transaction.imported_id}: ${error}`);
        });
        if (importResults.failed.length > 5) {
          console.log(`    ... and ${importResults.failed.length - 5} more`);
        }
      }
    } else {
      // Display all transformed transactions in one table, sorted by date
      const sortedTransactions = [...allTransformed].sort((a, b) => {
        // Convert dates to Date objects for comparison
        const dateA = new Date(a.Date);
        const dateB = new Date(b.Date);
        return dateA - dateB;
      });
      console.log(formatTransactionsTable(sortedTransactions));
    }

    return {
      imported: importResults.imported.length,
      failed: importResults.failed.length,
      duplicates: importResults.duplicates.length,
      total: allTransformed.length
    };
  } finally {
    if (client) {
      await client.shutdown();
    }
  }
}

// Keep reset as an alias for backward compatibility but mark as deprecated
export { logout as reset } from './auth-manager.js';

export default {
  importTransactions,
  listAccounts: async (options) => {
    const { listAccounts: list } = await import('./account-operations.js');
    return list(options);
  },
  generateAccountConfig: async (options) => {
    const { generateAccountConfig: generate } = await import('./account-operations.js');
    return generate(options);
  },
  validateAccountMappings: async (options) => {
    const { validateAccountMappings: validate } = await import('./account-operations.js');
    return validate(options);
  },
  clearCache: async (options) => {
    const { clearCache: clear } = await import('./auth-manager.js');
    return clear(options);
  },
  login: async (options) => {
    const { login: doLogin } = await import('./auth-manager.js');
    return doLogin(options);
  },
  logout: async (options) => {
    const { logout: doLogout } = await import('./auth-manager.js');
    return doLogout(options);
  },
  reset: async (options) => {
    const { logout: doLogout } = await import('./auth-manager.js');
    return doLogout(options);
  }
};
