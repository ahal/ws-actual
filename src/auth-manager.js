import * as api from '@actual-app/api';
import { join } from 'path';
import { xdgData } from 'xdg-basedir';
import { mkdir } from 'fs/promises';
import { createReadlineInterface, askQuestion, askPassword } from './util/prompt-helpers.js';
import { loadConfig, saveConfig, storePassword, clearPassword, getConfig } from './config.js';
import { ActualClient } from './actual-client.js';

/**
 * Login to ActualBudget interactively
 * @param {Object} options CLI options
 * @returns {Promise<void>}
 */
export async function login(options = {}) {
  const rl = createReadlineInterface();

  try {
    console.log('🔐 ActualBudget Login\n');

    // Load existing config
    const fullConfig = await loadConfig(options.config);

    // Prompt for server URL
    const defaultUrl = fullConfig.actualServer?.url || 'http://localhost:5006';
    const serverUrlPrompt = await askQuestion(rl, `ActualBudget server URL [${defaultUrl}]: `);
    const serverUrl = serverUrlPrompt || defaultUrl;

    // Prompt for password with hidden input
    const password = await askPassword(rl, 'Password: ');

    if (!password) {
      throw new Error('Password is required');
    }

    // Ask about storing password right after entering it
    const shouldStorePassword = await askQuestion(
      rl,
      '\nStore password in system keyring for future use? (y/N): '
    );

    if (shouldStorePassword.toLowerCase() === 'y' || shouldStorePassword.toLowerCase() === 'yes') {
      const stored = await storePassword(serverUrl, password);
      if (stored) {
        console.log('✅ Password stored securely in system keyring');
      } else {
        console.log('⚠️  Password could not be stored (keyring may not be available)');
      }
    }

    // Initialize API to get budgets
    console.log('\nConnecting to ActualBudget server...');
    const dataDir = join(xdgData, 'ws-actual');

    // Ensure data directory exists
    await mkdir(dataDir, { recursive: true });

    await api.init({
      dataDir: dataDir,
      serverURL: serverUrl,
      password: password
    });

    // Get available budgets
    console.log('Fetching available budgets...');
    const budgets = await api.getBudgets();

    if (!budgets || budgets.length === 0) {
      throw new Error('No budgets found on the server');
    }

    // Debug: log the structure of the first budget
    if (options.verbose && budgets.length > 0) {
      console.log('Budget structure:', JSON.stringify(budgets[0], null, 2));
    }

    // Display budgets and prompt for selection
    console.log('\nAvailable budgets on this server:');
    budgets.forEach((budget, index) => {
      console.log(`  ${index + 1}. ${budget.name} (ID: ${budget.groupId})`);
    });

    let selectedBudget;
    if (budgets.length === 1) {
      selectedBudget = budgets[0];
      console.log(`\nAutomatically selecting the only available budget: ${selectedBudget.name}`);
    } else {
      const selection = await askQuestion(rl, '\nSelect a budget (enter number): ');
      const index = parseInt(selection) - 1;

      if (isNaN(index) || index < 0 || index >= budgets.length) {
        throw new Error('Invalid budget selection');
      }

      selectedBudget = budgets[index];
    }

    // Get the sync ID from the budget's groupId field
    console.log(`\n📝 Selected budget: ${selectedBudget.name}`);
    const selectedSyncId = selectedBudget.groupId;

    if (selectedSyncId) {
      console.log(`✅ Sync ID: ${selectedSyncId}`);
    } else {
      console.warn('⚠️  Warning: No sync ID found for this budget');
    }

    // Update config with server URL and sync ID
    if (!fullConfig.actualServer) {
      fullConfig.actualServer = {};
    }

    const configChanged =
      fullConfig.actualServer.url !== serverUrl ||
      fullConfig.actualServer.syncId !== selectedSyncId;

    if (configChanged) {
      fullConfig.actualServer.url = serverUrl;
      fullConfig.actualServer.syncId = selectedSyncId;

      await saveConfig(fullConfig);
      console.log('\n✅ Configuration updated successfully');
    }

    // Shutdown API
    await api.shutdown();

    console.log('\n🎉 Login successful!');
    console.log(`\nConnected to budget: ${selectedBudget.name}`);
    console.log(`Server: ${serverUrl}`);
    console.log('\nYou can now import transactions with:');
    console.log('  ws-actual import');
  } catch (error) {
    console.error('\n❌ Login failed:', error.message);
    throw error;
  } finally {
    rl.close();
  }
}

/**
 * Logout (clear all local data - cache + stored passwords)
 * @param {Object} options CLI options
 * @returns {Promise<void>}
 */
export async function logout(options = {}) {
  console.log('🔄 Logging out from ws-actual...\n');

  try {
    // Clear cache first
    console.log('1️⃣ Clearing ActualBudget cache...');
    const config = await getConfig(options, false); // Don't require password for logout

    // Create a temporary client just to use the clearCache method
    const client = new ActualClient(config);

    await client.clearCache();
    console.log('   ✅ Cache cleared successfully');

    // Clear stored password
    console.log('\n2️⃣ Clearing stored passwords...');
    const tomlConfig = await loadConfig(options.config);
    const serverUrl = options.serverUrl || tomlConfig.actualServer?.url || 'http://localhost:5006';

    const passwordCleared = await clearPassword(serverUrl);
    if (passwordCleared) {
      console.log(`   ✅ Password cleared from keyring for ${serverUrl}`);
    } else {
      console.log(`   ℹ️  No password found in keyring for ${serverUrl}`);
    }

    console.log('\n🎉 Logout completed successfully!');
    console.log('\nAll local data has been cleared:');
    console.log('   • ActualBudget cache directory removed');
    console.log('   • Stored passwords removed from system keyring');
    console.log('\nYou will need to login again to connect to ActualBudget.');
  } catch (error) {
    console.error('\n❌ Logout failed:', error.message);
    throw error;
  }
}

/**
 * Test ActualBudget connection
 * @param {Object} options CLI options
 * @returns {Promise<Object>} Connection test results
 */
export async function testConnection(options = {}) {
  const { createClient } = await import('./actual-client.js');
  const config = await getConfig(options);
  const results = {
    serverUrl: config.serverUrl,
    hasPassword: !!config.password,
    hasBudgetId: !!config.budgetId,
    connectionSuccess: false,
    error: null
  };

  console.log('Testing ActualBudget connection...\n');
  console.log(`Server URL: ${config.serverUrl}`);
  console.log(`Password: ${config.password ? '***' : '(not set)'}`);
  console.log(`Budget ID: ${config.budgetId || '(not set)'}`);
  console.log('');

  // Check required configuration
  if (!config.password) {
    results.error =
      'Password is required. Set ACTUAL_PASSWORD environment variable or use --password option';
    console.error(`❌ ${results.error}`);
    return results;
  }

  if (!config.budgetId) {
    results.error =
      'Budget ID is required. Set ACTUAL_BUDGET_ID environment variable or use --budget-id option';
    console.error(`❌ ${results.error}`);
    return results;
  }

  // Try to connect
  let client = null;
  try {
    console.log('Attempting to connect...');
    client = await createClient({ ...config, verbose: true });
    results.connectionSuccess = true;

    console.log('✅ Successfully connected to ActualBudget!\n');

    // List available accounts
    const accounts = client.getAccounts();
    console.log(`Found ${accounts.length} account(s):`);
    accounts.forEach((account) => {
      console.log(`  - ${account.name} (${account.id})`);
    });

    return results;
  } catch (error) {
    results.error = error.message;
    console.error('❌ Connection failed:\n');
    console.error(error.message);
    return results;
  } finally {
    if (client) {
      await client.shutdown();
    }
  }
}

/**
 * Clear ActualBudget cache
 * @param {Object} options CLI options
 * @returns {Promise<void>}
 */
export async function clearCache(options = {}) {
  const config = await getConfig(options, false); // Don't require password for cache clear

  // Create a temporary client just to use the clearCache method
  const client = new ActualClient(config);

  try {
    await client.clearCache();
    console.log('✅ ActualBudget cache cleared successfully');
  } catch (error) {
    console.error('❌ Failed to clear cache:', error.message);
    throw error;
  }
}

export default {
  login,
  logout,
  testConnection,
  clearCache
};
