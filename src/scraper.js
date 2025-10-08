import { chromium } from 'playwright';
import { processTransactionDetails, parseTransaction } from './parser.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function expandTransactions(page, verbose = false) {
  const expandedCount = await page.evaluate(() => {
    /* eslint-disable no-undef */
    const elements = document.querySelectorAll('[role="button"]');
    const headerRegex = /-header$/;
    let count = 0;

    elements.forEach((element) => {
      if (headerRegex.test(element.id)) {
        if (element instanceof HTMLElement) {
          if (element.getAttribute('aria-expanded') === 'false') {
            element.click();
            count++;
          }
        }
      }
    });

    return count;
  });

  if (verbose) {
    console.log(`Clicked ${expandedCount} transaction headers to expand them`);
  }

  await wait(3000);

  const regionCount = await page.evaluate(() => {
    /* eslint-disable no-undef */
    return document.querySelectorAll('[role="region"]').length;
  });

  if (verbose) {
    console.log(`Found ${regionCount} expanded regions after waiting`);
  }

  return { expandedCount, regionCount };
}

async function loadAllTransactions(page, verbose = false) {
  let clickCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Scroll to bottom to make "Load More" button visible if it exists
    await page.evaluate(() => {
      /* eslint-disable no-undef */
      window.scrollTo(0, document.body.scrollHeight);
    });
    await wait(1000); // Wait for button to appear after scroll

    // Count transactions before clicking
    const transactionCountBefore = await page.evaluate(() => {
      /* eslint-disable no-undef */
      const buttons = document.querySelectorAll('button[role="button"]');
      let count = 0;
      buttons.forEach((button) => {
        if (button.id && button.id.endsWith('-header')) {
          count++;
        }
      });
      return count;
    });

    const buttonClicked = await page.evaluate(() => {
      /* eslint-disable no-undef */
      const buttons = Array.from(document.querySelectorAll('button'));
      const loadMoreButton = buttons.find((button) => {
        const text = button.textContent?.toLowerCase() || '';
        return text.includes('load more') || text.includes('show more');
      });

      if (loadMoreButton && !loadMoreButton.disabled) {
        loadMoreButton.click();
        return true;
      }
      return false;
    });

    if (!buttonClicked) {
      if (verbose) {
        console.log('No more transactions to load');
      }
      break;
    }

    clickCount++;

    // Wait for new content to load (wait for transaction count to increase)
    // Try for up to 10 seconds
    let newTransactionsLoaded = false;
    for (let i = 0; i < 20; i++) {
      await wait(500);

      const transactionCountAfter = await page.evaluate(() => {
        /* eslint-disable no-undef */
        const buttons = document.querySelectorAll('button[role="button"]');
        let count = 0;
        buttons.forEach((button) => {
          if (button.id && button.id.endsWith('-header')) {
            count++;
          }
        });
        return count;
      });

      if (transactionCountAfter > transactionCountBefore) {
        newTransactionsLoaded = true;
        if (verbose) {
          console.log(
            `Clicked "Load More" (${clickCount} times) - loaded ${transactionCountAfter - transactionCountBefore} more transactions (total: ${transactionCountAfter})`
          );
        }
        break;
      }
    }

    if (!newTransactionsLoaded && verbose) {
      console.log('Warning: Clicked "Load More" but no new transactions appeared after 10 seconds');
    }

    // Small additional wait before next iteration
    await wait(500);
  }

  return clickCount;
}

async function waitForActivityPage(page, timeoutMs = 300000) {
  console.log('Waiting for activity page to load (timeout: 5 minutes)...');
  console.log('Please log in to WealthSimple if prompted.');
  console.log('');

  const startTime = Date.now();

  try {
    if (page.isClosed()) {
      throw new Error('Page was closed before waiting for activity');
    }

    await page.waitForFunction(
      () => {
        /* eslint-disable no-undef */
        const buttons = document.querySelectorAll('button[role="button"]');
        for (const button of buttons) {
          if (button.id && button.id.endsWith('-header') && button.getAttribute('aria-controls')) {
            return true;
          }
        }
        return false;
      },
      { timeout: timeoutMs, polling: 1000 }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Activity page detected after ${elapsed} seconds`);
    return true;
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (error.message.includes('closed')) {
      throw error;
    }

    console.error(`Timeout after ${elapsed} seconds waiting for activity page.`);
    console.error('Please ensure you are logged in and on the activity page.');
    console.error('Error details:', error.message);
    return false;
  }
}

async function getBrowserInfo() {
  const { xdgData } = await import('xdg-basedir');
  const { join } = await import('path');
  const userDataDir = join(xdgData, 'ws-actual', 'browser-chromium');

  return { launcher: chromium, name: 'Chromium', userDataDir };
}

/**
 * Extract all transactions from the WealthSimple activity page
 * @param {Object} options - Scraper options
 * @param {boolean} options.verbose - Log detailed progress
 * @param {string} options.remoteBrowserUrl - Chrome DevTools Protocol URL for remote browser connection
 * @returns {Promise<Array>} - Array of parsed transactions
 */
export async function scrapeTransactions({ verbose = false, remoteBrowserUrl = null }) {
  let context;
  let shouldCloseContext = true;

  if (remoteBrowserUrl) {
    // Connect to remote browser via Chrome DevTools Protocol
    if (verbose) {
      console.log(`Connecting to remote browser at ${remoteBrowserUrl}...`);
      console.log('');
    }

    const browser = await chromium.connectOverCDP(remoteBrowserUrl);
    context = browser.contexts()[0];
    shouldCloseContext = false; // Don't close remote browser

    if (verbose) {
      console.log('Connected to remote browser');
      console.log('');
    }
  } else {
    // Launch Chromium with persistent profile
    const { userDataDir } = await getBrowserInfo();

    if (verbose) {
      console.log('Launching Chromium with persistent profile...');
      console.log(`Profile directory: ${userDataDir}`);
      console.log('');
    }

    // Use launchPersistentContext to save login session
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false
    });
  }

  try {
    // Get existing page or create new one
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    // Set a longer default timeout for all operations
    page.setDefaultTimeout(300000); // 5 minutes

    if (verbose) {
      console.log('Navigating to WealthSimple activity page...');
    }

    // Navigate with longer timeout to allow for login and 2FA
    await page.goto('https://my.wealthsimple.com/app/activity', {
      waitUntil: 'domcontentloaded',
      timeout: 300000 // 5 minutes for navigation (includes login + 2FA)
    });

    // Wait for user to log in and activity page to load
    let pageLoaded = false;
    try {
      pageLoaded = await waitForActivityPage(page, 300000);
    } catch (error) {
      // Check if the page is still open
      if (page.isClosed()) {
        throw new Error('Browser was closed during login');
      }
      throw error;
    }

    if (!pageLoaded) {
      throw new Error(
        'Failed to load activity page - please ensure you are logged in and on the activity page'
      );
    }

    if (verbose) {
      console.log('Activity page detected. Loading all transactions...');
    }

    // Load all transactions
    const clickCount = await loadAllTransactions(page, verbose);

    // Count how many transactions are now visible
    const totalTransactions = await page.evaluate(() => {
      /* eslint-disable no-undef */
      const buttons = document.querySelectorAll('button[role="button"]');
      let count = 0;
      buttons.forEach((button) => {
        if (button.id && button.id.endsWith('-header')) {
          count++;
        }
      });
      return count;
    });

    if (verbose) {
      console.log(
        `Loaded all transactions (clicked "Load More" ${clickCount} times, found ${totalTransactions} transactions)`
      );
    } else {
      console.log(`Found ${totalTransactions} transactions`);
    }

    // Expand all collapsed transactions
    if (verbose) {
      console.log('Expanding all transactions...');
    }
    const expansionResult = await expandTransactions(page, verbose);

    if (verbose) {
      console.log(
        `Expansion complete. Clicked: ${expansionResult.expandedCount}, Regions visible: ${expansionResult.regionCount}`
      );
    }

    // Give more time for all expansions to complete
    await wait(2000);

    // Count transaction headers (not regions, since regions only exist when expanded)
    const transactionHeaders = await page.evaluate(() => {
      /* eslint-disable no-undef */
      const buttons = document.querySelectorAll('button[role="button"]');
      const headers = [];
      buttons.forEach((button) => {
        if (button.id && button.id.endsWith('-header') && button.getAttribute('aria-controls')) {
          headers.push({
            headerId: button.id,
            regionId: button.getAttribute('aria-controls')
          });
        }
      });
      return headers;
    });

    if (verbose) {
      console.log(`Found ${transactionHeaders.length} transactions. Parsing...`);
    }

    // Extract transaction data using the region IDs
    const rawTransactions = [];
    for (let i = 0; i < transactionHeaders.length; i++) {
      const { headerId, regionId } = transactionHeaders[i];

      // Ensure this specific transaction is expanded by clicking its header
      // This handles cases where aria-expanded="true" but region content hasn't loaded
      await page.evaluate((id) => {
        /* eslint-disable no-undef */
        const header = document.querySelector(`[id="${id}"]`);
        if (header && header.getAttribute('aria-expanded') === 'false') {
          header.click();
        }
      }, headerId);

      // Wait a bit for the expansion to complete
      await wait(100);

      // Use attribute selector since IDs might start with numbers
      const selector = `[id="${regionId}"]`;
      const rawData = await processTransactionDetails(page, selector);
      if (rawData) {
        rawTransactions.push(rawData);
      } else if (verbose && i === 0) {
        console.log(`WARNING: First transaction returned no data. Region ID: ${regionId}`);
      }

      if (verbose && (i + 1) % 10 === 0) {
        console.log(`Parsed ${i + 1}/${transactionHeaders.length} transactions...`);
      }
    }

    if (verbose) {
      console.log(`Extracted ${rawTransactions.length} raw transactions from DOM`);
    }

    // Parse transactions in Node.js context
    if (verbose && rawTransactions.length > 0) {
      console.log('Sample raw transaction data (first transaction):');
      console.log(JSON.stringify(rawTransactions[0], null, 2));
    } else if (rawTransactions.length === 0) {
      console.log('WARNING: No raw transactions were extracted from the DOM!');
    }

    const transactions = rawTransactions.map(parseTransaction).filter(Boolean);

    if (verbose && transactions.length === 0 && rawTransactions.length > 0) {
      console.log(
        'WARNING: Parsing returned 0 transactions from',
        rawTransactions.length,
        'raw transactions'
      );
      console.log('First raw transaction:', JSON.stringify(rawTransactions[0], null, 2));
    }

    if (verbose) {
      console.log(`Successfully parsed ${transactions.length} transactions`);
    }

    return transactions;
  } finally {
    if (shouldCloseContext) {
      if (verbose) {
        console.log('\nClosing browser...');
      }
      await context.close();
    } else if (verbose) {
      console.log('\nLeaving remote browser open...');
    }
  }
}
