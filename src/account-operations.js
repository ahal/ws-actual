import { createReadlineInterface, askQuestion } from './util/prompt-helpers.js';
import { getConfig, validateConfig, loadConfig, saveConfig } from './config.js';
import { createClient } from './actual-client.js';

/**
 * List ActualBudget accounts
 * @param {Object} options CLI options
 * @returns {Promise<Array>} List of accounts
 */
export async function listAccounts(options = {}) {
  const config = await getConfig(options);
  validateConfig(config);

  const client = await createClient(config);

  try {
    const accounts = client.getAccounts();

    if (options.json) {
      console.log(JSON.stringify(accounts, null, 2));
    } else {
      console.log('ActualBudget Accounts:');
      accounts.forEach((account) => {
        const budgetStatus = account.offbudget ? 'Off-budget' : 'On-budget';
        const status = account.closed ? 'Closed' : 'Open';

        console.log(`  ${account.name}`);
        console.log(`    ID: ${account.id}`);
        console.log(`    Status: ${status}`);
        console.log(`    Budget: ${budgetStatus}`);
        console.log('');
      });
    }

    return accounts;
  } finally {
    await client.shutdown();
  }
}

/**
 * Generate account configuration file interactively
 * @param {Object} options CLI options
 * @returns {Promise<void>}
 */
export async function generateAccountConfig(options = {}) {
  const config = await getConfig(options);
  validateConfig(config);

  const client = await createClient(config);
  const rl = createReadlineInterface();

  try {
    const accounts = client.getAccounts().filter((account) => !account.closed);
    const fullConfig = await loadConfig(options.config);

    console.log('🏦 Interactive Account Mapping Configuration\n');
    console.log(`Found ${accounts.length} open ActualBudget account(s).\n`);
    console.log('For each account, you can choose to map it to a WealthSimple account name.');
    console.log(
      'This mapping will be used to import transactions from WealthSimple CSV exports.\n'
    );

    let mappingsCreated = 0;

    for (const account of accounts) {
      const budgetStatus = account.offbudget ? 'Off-budget' : 'On-budget';
      console.log(`\n📋 ActualBudget Account: ${account.name}`);
      console.log(`   Status: ${budgetStatus}`);
      console.log(`   ID: ${account.id}`);

      const shouldMap = await askQuestion(
        rl,
        '\n❓ Map this account to a WealthSimple account? (y/N): '
      );

      if (shouldMap.toLowerCase() === 'y' || shouldMap.toLowerCase() === 'yes') {
        const wsPattern = await askQuestion(
          rl,
          '💰 Enter WealthSimple account name (as it appears in CSV): '
        );

        if (wsPattern) {
          // Add to accounts array
          if (!Array.isArray(fullConfig.accounts)) {
            fullConfig.accounts = [];
          }
          fullConfig.accounts.push({
            wsAccountName: wsPattern,
            actualAccountId: account.id
          });
          mappingsCreated++;
          console.log(`✅ Mapped account "${wsPattern}" → "${account.name}"`);
        } else {
          console.log('⚠️  Skipped (empty account name)');
        }
      } else {
        console.log('⏭️  Skipped');
      }
    }

    console.log('\n🎯 Configuration Summary:');
    console.log(`   Accounts mapped: ${mappingsCreated}`);
    console.log(`   Accounts skipped: ${accounts.length - mappingsCreated}`);

    if (mappingsCreated > 0) {
      const shouldSave = await askQuestion(rl, '\n💾 Save configuration to config.toml? (Y/n): ');

      if (shouldSave.toLowerCase() !== 'n' && shouldSave.toLowerCase() !== 'no') {
        await saveConfig(fullConfig);
        console.log('\n✅ Configuration saved successfully!');
        console.log('\nYou can now import WealthSimple transactions with:');
        console.log('   ws-actual import');
      } else {
        console.log(
          "\n📄 Configuration not saved. Here's what would be saved to accounts section:"
        );
        console.log(JSON.stringify(fullConfig.accounts, null, 2));
      }
    } else {
      console.log('\n⚠️  No mappings created. Configuration not saved.');
      console.log('You can run this command again anytime to set up account mappings.');
    }
  } finally {
    rl.close();
    await client.shutdown();
  }
}

/**
 * Validate account mappings
 * @param {Object} options CLI options
 * @returns {Promise<Object>} Validation results
 */
export async function validateAccountMappings(options = {}) {
  const config = await getConfig(options);
  validateConfig(config);

  const fullConfig = await loadConfig(options.config);
  const client = await createClient(config);

  try {
    const actualAccounts = client.getAccounts();
    const actualAccountIds = new Set(actualAccounts.map((a) => a.id));

    const results = {
      valid: [],
      invalid: [],
      unmapped: []
    };

    // Check each mapping in accounts array
    (fullConfig.accounts || []).forEach((mapping) => {
      if (actualAccountIds.has(mapping.actualAccountId)) {
        results.valid.push({
          wsAccountName: mapping.wsAccountName,
          id: mapping.actualAccountId
        });
      } else {
        results.invalid.push({
          wsAccountName: mapping.wsAccountName,
          id: mapping.actualAccountId,
          reason: 'Account ID not found in ActualBudget'
        });
      }
    });

    // Find unmapped ActualBudget accounts
    actualAccounts.forEach((account) => {
      const mapped = (fullConfig.accounts || []).some((m) => m.actualAccountId === account.id);

      if (!mapped && !account.closed) {
        results.unmapped.push({
          actualName: account.name,
          id: account.id
        });
      }
    });

    // Display results
    console.log('Account Mapping Validation:');
    console.log(`  Valid mappings: ${results.valid.length}`);
    console.log(`  Invalid mappings: ${results.invalid.length}`);
    console.log(`  Unmapped accounts: ${results.unmapped.length}`);

    if (results.invalid.length > 0) {
      console.log('\nInvalid mappings:');
      results.invalid.forEach(({ wsAccountName, reason }) => {
        console.log(`  - Account "${wsAccountName}": ${reason}`);
      });
    }

    if (results.unmapped.length > 0 && options.verbose) {
      console.log('\nUnmapped ActualBudget accounts:');
      results.unmapped.forEach(({ actualName }) => {
        console.log(`  - ${actualName}`);
      });
    }

    return results;
  } finally {
    await client.shutdown();
  }
}

export default {
  listAccounts,
  generateAccountConfig,
  validateAccountMappings
};
