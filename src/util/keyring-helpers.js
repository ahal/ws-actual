import keytar from 'keytar';

const KEYRING_SERVICE = 'ws-actual';
const KEYRING_ACCOUNT_PREFIX = 'actualbudget-';

/**
 * Get keyring key for a server URL
 * @param {string} serverUrl Server URL
 * @returns {string} Keyring key
 */
function getKeyringKey(serverUrl) {
  const safeUrl = serverUrl.replace(/[^a-zA-Z0-9]/g, '_');
  return `${KEYRING_ACCOUNT_PREFIX}${safeUrl}`;
}

/**
 * Get stored password from system keyring
 * @param {string} serverUrl Server URL
 * @returns {Promise<string|null>} Password or null
 */
export async function getStoredPassword(serverUrl) {
  try {
    const key = getKeyringKey(serverUrl);
    return await keytar.getPassword(KEYRING_SERVICE, key);
  } catch (error) {
    console.warn('Failed to retrieve password from keyring:', error.message);
    return null;
  }
}

/**
 * Store password in system keyring
 * @param {string} serverUrl Server URL
 * @param {string} password Password to store
 * @returns {Promise<boolean>} True if successful
 */
export async function storePassword(serverUrl, password) {
  try {
    const key = getKeyringKey(serverUrl);
    await keytar.setPassword(KEYRING_SERVICE, key, password);
    return true;
  } catch (error) {
    console.warn('Failed to store password in keyring:', error.message);
    return false;
  }
}

/**
 * Delete stored password from system keyring
 * @param {string} serverUrl Server URL
 * @returns {Promise<boolean>} True if successful
 */
export async function deleteStoredPassword(serverUrl) {
  try {
    const key = getKeyringKey(serverUrl);
    return await keytar.deletePassword(KEYRING_SERVICE, key);
  } catch (error) {
    console.warn('Failed to delete password from keyring:', error.message);
    return false;
  }
}

export default {
  getStoredPassword,
  storePassword,
  deleteStoredPassword
};
