import { createReadlineInterface, askQuestion } from './util/prompt-helpers.js';
import { saveConfig } from './config.js';

/**
 * Get unique accounts from transactions
 * @param {Array} transactions - Array of transactions
 * @returns {Array<string>} - Unique account names
 */
export function getUniqueAccounts(transactions) {
  const accounts = new Set();
  transactions.forEach((transaction) => {
    if (transaction.account) {
      accounts.add(transaction.account);
    }
  });
  return Array.from(accounts);
}

/**
 * Prompt user to map an unmapped account to an ActualBudget account
 * @param {string} wsAccountName WealthSimple account name
 * @param {Object} client ActualBudget client
 * @param {Object} fullConfig Full configuration object
 * @returns {Promise<Object|null>} Account mapping info or null if skipped
 */
export async function promptForAccountMapping(wsAccountName, client, fullConfig) {
  const rl = createReadlineInterface();

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

    // Add mapping to config
    if (!fullConfig.accounts) {
      fullConfig.accounts = [];
    }

    fullConfig.accounts.push({
      wsAccountName: wsAccountName,
      actualAccountId: selectedAccount.id
    });

    // Save updated config
    await saveConfig(fullConfig);
    console.log(`✅ Mapped "${wsAccountName}" → "${selectedAccount.name}"`);

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
    rl.close();
  }
}

export default {
  getUniqueAccounts,
  promptForAccountMapping
};
