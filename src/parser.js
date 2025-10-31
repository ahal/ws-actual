import { parse, isValid } from 'date-fns';

function parseCurrencyValue(value) {
  // Handle both formats: "− $50.00" and "$-50.00"
  // Also handle: "+ $50.00", "$+50.00", etc.
  const match = value.match(/^([+−-])?\s*\$?([+−-])?\s*([\d,]+(?:\.\d{2})?)\s*([A-Z]{3})?$/);
  if (!match) {
    console.warn(`Failed to parse currency value: "${value}"`);
    return { amount: null, currency: undefined };
  }

  // Sign can be in position 1 (before $) or position 2 (after $)
  const signChar = match[1] || match[2];
  const sign = signChar === '−' || signChar === '-' ? -1 : 1;
  const amount = parseFloat(match[3].replace(/,/g, ''));
  const currency = match[4] || undefined;

  return { amount: amount * sign, currency };
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const normalizedValue = value
    .replace(/\s+/g, ' ')
    .replace(/(\d{4})\s*(\d)/, '$1 $2')
    .trim();

  const dateFormats = [
    'MMMM d, yyyy h:mm a', // Standard with space
    'MMMM d, yyyyh:mm a', // Legacy without space
    'MMMM d, yyyy' // Date only
  ];

  for (const format of dateFormats) {
    const parsedDate = parse(normalizedValue, format, new Date());
    if (isValid(parsedDate)) {
      // Format date without timezone conversion
      const year = parsedDate.getFullYear();
      const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
      const day = String(parsedDate.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  console.warn(`Failed to parse date: "${value}"`);
  return null;
}

function parseRow(name, value) {
  const normalizedName = name.toLowerCase();

  const simpleFields = {
    account: 'account',
    from: 'from',
    to: 'to',
    status: 'status',
    type: 'type',
    email: 'email',
    message: 'message',
    'entered quantity': 'enteredQuantity',
    'filled quantity': 'filledQuantity',
    'account number': 'accountNumber',
    'transaction id': 'transactionId'
  };

  if (simpleFields[normalizedName]) {
    return { [simpleFields[normalizedName]]: value };
  }

  const dateFields = ['date', 'submitted', 'filled'];
  if (dateFields.includes(normalizedName)) {
    const date = parseDate(value);
    return { [normalizedName]: date };
  }

  if (normalizedName === 'original amount') {
    if (!value) {
      return {};
    }
    const parsed = parseCurrencyValue(value);
    if (parsed.amount === null) {
      console.warn(`Invalid original amount: "${value}"`);
      return {};
    }
    return { originalAmount: parsed.amount, originalCurrency: parsed.currency };
  }

  if (normalizedName === 'exchange rate') {
    return value ? { exchangeRate: parseFloat(value) } : {};
  }

  const amountFields = ['total', 'amount', 'total value', 'total cost', 'estimated amount'];
  if (amountFields.includes(normalizedName)) {
    if (!value) {
      return {};
    }
    const parsed = parseCurrencyValue(value);
    if (parsed.amount === null) {
      console.warn(`Invalid total/amount: "${value}"`);
      return { amount: null, amountCurrency: undefined };
    }

    const amount = normalizedName === 'total cost' ? -Math.abs(parsed.amount) : parsed.amount;
    return { amount, amountCurrency: parsed.currency };
  }

  if (normalizedName.includes('spend rewards')) {
    if (!value) {
      return {};
    }
    const parsed = parseCurrencyValue(value);
    if (parsed.amount === null) {
      console.warn(`Invalid spend rewards: "${value}"`);
      return {};
    }
    return { spendRewards: parsed.amount, spendRewardsCurrency: parsed.currency };
  }

  return {};
}

export async function processTransactionDetails(page, elementSelector) {
  return page.evaluate((selector) => {
    /* eslint-disable no-undef */
    const element = document.querySelector(selector);
    if (!element) {
      return null;
    }

    // Extract rows from the transaction details
    let rows = [];
    for (let i = 0; i < element.children[0]?.children?.length ?? 0; i++) {
      const row = element.children[0].children[i];
      if (row.children.length === 2 && row.children[0].textContent) {
        rows.push(row);
      } else {
        // Handle nested structure (e.g., Interac transfers)
        const result = [];
        for (let j = 0; j < row.children.length; j++) {
          if (row.children[j].children.length === 2 && row.children[j].children[0].textContent) {
            result.push(row.children[j]);
          }
        }
        rows.push(result);
      }
    }
    rows = rows.flat();

    if (!rows || rows.length === 0) {
      return null;
    }

    const rowData = {};

    // Parse each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.children.length !== 2 || !row.children[0].textContent) {
        continue;
      }

      const name = row.children[0].textContent;
      const valueElement = row.children[1];
      let value;

      // Navigate through nested structure to get the actual value
      // Structure: div.iVjzra > div.ilQFqM > p
      if (valueElement.children.length > 0) {
        const firstChild = valueElement.children[0];
        if (firstChild.children.length > 0) {
          // Navigate one more level down
          value = firstChild.children[0].textContent ?? undefined;
        } else {
          value = firstChild.textContent ?? undefined;
        }
      } else {
        value = valueElement.textContent ?? undefined;
      }

      // Store raw data for parsing in Node.js context
      if (!rowData.fields) {
        rowData.fields = [];
      }
      rowData.fields.push({ name, value });
    }

    // Extract description and subheading from the transaction button (summary view)
    // The button ID is the region ID with -region replaced by -header
    const regionId = element.getAttribute('id');
    if (regionId) {
      const buttonId = regionId.replace(/-region$/, '-header');
      const button = document.getElementById(buttonId);

      if (button) {
        // Full description is the button's text content
        const description = button.textContent;
        if (description) {
          rowData.description = description;
        }

        // Extract subheading by looking for <p> tags with fontWeight >= 500
        // Structure: button > div > div > div > [p (name), div > p (subheading)]
        const allParagraphs = button.querySelectorAll('p');
        for (const p of allParagraphs) {
          const style = window.getComputedStyle(p);
          const fontWeight = parseInt(style.fontWeight) || 400;
          const text = p.textContent?.trim();

          // Look for medium-weight text that's not the full description and not empty
          // Skip the first paragraph (usually the main name)
          if (fontWeight >= 500 && text && text !== description) {
            // Find the second medium-weight paragraph - that's usually the subheading
            if (!rowData.firstBoldText) {
              rowData.firstBoldText = text;
            } else if (!rowData.subheading) {
              rowData.subheading = text;
              break;
            }
          }
        }

        // If we only found one bold text, that's probably the subheading
        if (!rowData.subheading && rowData.firstBoldText) {
          // Check if the first bold text looks like a transaction type
          const text = rowData.firstBoldText;
          // Common transaction types that should be considered subheadings
          const typeKeywords = [
            'interac',
            'transfer',
            'deposit',
            'withdrawal',
            'payment',
            'debit',
            'credit',
            'purchase',
            'refund',
            'dividend',
            'interest',
            'bonus'
          ];
          const lowerText = text.toLowerCase();
          const isLikelyType = typeKeywords.some((keyword) => lowerText.includes(keyword));

          if (isLikelyType) {
            rowData.subheading = text;
          }
        }

        // Clean up temporary field
        delete rowData.firstBoldText;
      }
    }

    return rowData;
  }, elementSelector);
}

export function parseTransaction(rawData) {
  if (!rawData || !rawData.fields) {
    return null;
  }

  let transaction = {};

  // Parse each field
  for (const field of rawData.fields) {
    const parsed = parseRow(field.name, field.value);
    transaction = { ...transaction, ...parsed };
  }

  // Add description
  if (rawData.description) {
    transaction.description = rawData.description;
  }

  // Infer type from subheading (bolded portion) if type is not present
  if (!transaction.type && rawData.subheading) {
    transaction.type = rawData.subheading;
  }

  // Handle transfers: infer account from amount direction
  if (!transaction.account && (transaction.to || transaction.from)) {
    transaction.account = (transaction.amount ?? 0) < 0 ? transaction.from : transaction.to;
  }

  return Object.keys(transaction).length === 0 ? null : transaction;
}
