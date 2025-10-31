import { createReadlineInterface, askQuestion } from './util/prompt-helpers.js';
import { saveConfig } from './config.js';

/**
 * Get unique accounts from transactions
 * Includes accounts from main account field and from/to fields in transfers
 * Excludes accounts from Interac e-Transfers, Pre-authorized debits, and Direct deposits
 * @param {Array} transactions - Array of transactions
 * @returns {Array<string>} - Unique account names
 */
export function getUniqueAccounts(transactions) {
  const accounts = new Set();

  transactions.forEach((transaction) => {
    const typeStr = transaction.type ? transaction.type.toLowerCase() : '';
    const isInteracTransfer = typeStr.includes('interac e-transfer');
    const isPreAuthorizedDebit = typeStr.includes('pre-authorized debit');
    const isDirectDeposit = typeStr.includes('direct deposit');

    // Add main account (WealthSimple account)
    if (transaction.account) {
      accounts.add(transaction.account);
    }

    // Add from/to accounts for transfers (but skip excluded transaction types)
    if (!isInteracTransfer && !isPreAuthorizedDebit && !isDirectDeposit) {
      if (transaction.from && transaction.from.trim()) {
        accounts.add(transaction.from);
      }
      if (transaction.to && transaction.to.trim()) {
        accounts.add(transaction.to);
      }
    }
  });

  return Array.from(accounts);
}

/**
 * Prompt user to map an unmapped account to an ActualBudget account
 * @param {string} wsAccountName WealthSimple account name
 * @param {Object} client ActualBudget client
 * @param {Object} fullConfig Full configuration object
 * @param {Object} [rl] Optional readline interface (if not provided, creates a new one)
 * @returns {Promise<Object|null>} Account mapping info or null if skipped
 */
export async function promptForAccountMapping(wsAccountName, client, fullConfig, rl = null) {
  const shouldCloseRl = !rl;
  if (!rl) {
    rl = createReadlineInterface();
  }

  try {
    // Get available ActualBudget accounts and sort alphabetically
    const actualAccounts = client
      .getAccounts()
      .filter((account) => !account.closed)
      .sort((a, b) => a.name.localeCompare(b.name));

    console.log('\n📋 Available ActualBudget accounts:');
    actualAccounts.forEach((account, index) => {
      const budgetStatus = account.offbudget ? 'Off-budget' : 'On-budget';
      console.log(`  ${index + 1}. ${account.name} (${budgetStatus})`);
    });

    const selection = await askQuestion(
      rl,
      `\nMap "${wsAccountName}" to which ActualBudget account? (1-${actualAccounts.length}, or Enter to skip): `
    );

    // Default to skip if no input
    if (!selection || selection.trim() === '') {
      console.log('⏭️  Skipping account');
      return null;
    }

    const index = parseInt(selection) - 1;

    if (isNaN(index) || index < 0 || index >= actualAccounts.length) {
      console.log('❌ Invalid selection');
      return null;
    }

    const selectedAccount = actualAccounts[index];

    // Add or update mapping in config
    if (!fullConfig.accounts) {
      fullConfig.accounts = [];
    }

    // Check if mapping already exists for this WealthSimple account
    const existingIndex = fullConfig.accounts.findIndex(
      (acc) => acc.wsAccountName === wsAccountName
    );

    if (existingIndex >= 0) {
      // Update existing mapping
      fullConfig.accounts[existingIndex].actualAccountId = selectedAccount.id;
      console.log(`✅ Updated mapping: "${wsAccountName}" → "${selectedAccount.name}"`);
    } else {
      // Add new mapping
      fullConfig.accounts.push({
        wsAccountName: wsAccountName,
        actualAccountId: selectedAccount.id
      });
      console.log(`✅ Mapped "${wsAccountName}" → "${selectedAccount.name}"`);
    }

    // Save updated config
    await saveConfig(fullConfig);

    return {
      accountId: selectedAccount.id,
      accountName: selectedAccount.name,
      needsLookup: false,
      matchType: 'interactive'
    };
  } catch (error) {
    console.error('❌ Error during account mapping:', error.message);
    return null;
  } finally {
    if (shouldCloseRl) {
      rl.close();
    }
  }
}

export default {
  getUniqueAccounts,
  promptForAccountMapping
};
