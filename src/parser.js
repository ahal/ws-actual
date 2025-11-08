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

  // Handle relative dates
  const today = new Date();
  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === 'today') {
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  if (normalizedValue === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const year = yesterday.getFullYear();
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const day = String(yesterday.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Handle standard date formats
  const cleanedValue = value
    .replace(/\s+/g, ' ')
    .replace(/(\d{4})\s*(\d)/, '$1 $2')
    .trim();

  const dateFormats = [
    'MMMM d, yyyy h:mm a', // Standard with space
    'MMMM d, yyyyh:mm a', // Legacy without space
    'MMMM d, yyyy' // Date only
  ];

  for (const format of dateFormats) {
    const parsedDate = parse(cleanedValue, format, new Date());
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
    let has5ChildRow = false;

    for (let i = 0; i < element.children[0]?.children?.length ?? 0; i++) {
      const row = element.children[0].children[i];

      if (row.children.length === 2 && row.children[0].textContent) {
        // Standard 2-child row (label-value pair)
        rows.push(row);
      } else if (row.children.length === 5) {
        // Today/Yesterday format: single row with 5 children
        // Child 0: Account, Child 1: Status, Child 2: Date, Child 3: empty, Child 4: Amount
        has5ChildRow = true;
        // We'll process this separately below
      } else {
        // Handle nested structure (e.g., Interac transfers)
        const result = [];
        for (let j = 0; j < row.children.length; j++) {
          if (row.children[j].children.length === 2 && row.children[j].children[0].textContent) {
            // Direct label-value pair
            result.push(row.children[j]);
          } else if (row.children[j].children.length > 2) {
            // Deeper nesting - check if children are label-value pairs
            for (let k = 0; k < row.children[j].children.length; k++) {
              const nestedChild = row.children[j].children[k];
              if (nestedChild.children.length === 2 && nestedChild.children[0].textContent) {
                result.push(nestedChild);
              }
            }
          }
        }
        rows.push(result);
      }
    }
    rows = rows.flat();

    if (rows.length === 0 && !has5ChildRow) {
      return null;
    }

    const rowData = {};

    // Handle 5-child row format (Today/Yesterday transactions)
    if (has5ChildRow && element.children[0]?.children?.length > 0) {
      const row = element.children[0].children[0];
      if (row.children.length === 5) {
        // Extract fields from the 5-child row
        // Each child contains the label and value as separate text nodes/elements
        const fields = [];

        // Process each child (Account, Status, Date, empty, Amount)
        for (let i = 0; i < 5; i++) {
          if (i === 3) continue; // Skip empty child

          const child = row.children[i];
          const fullText = child.textContent || '';

          // Split by newline to separate label from value
          const lines = fullText.split('\n').map(l => l.trim()).filter(l => l);

          if (lines.length >= 2) {
            const label = lines[0];
            const value = lines.slice(1).join(' ');
            fields.push({ name: label, value });
          } else if (lines.length === 1 && lines[0]) {
            // If only one line, it might be the value without a label
            // For amount, this is common
            if (i === 4) { // Amount child
              fields.push({ name: 'Amount', value: lines[0] });
            }
          }
        }

        rowData.fields = fields;
        rowData.is5ChildFormat = true;
      }
    }

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
        // Extract only the first paragraph as the main description
        // Header structure typically has:
        // - 1st paragraph (weight 500): Main type (e.g., "Institutional transfer")
        // - 2nd paragraph (weight 500): Subheading (e.g., "Questrade")
        // - 3rd paragraph (weight 100): Account
        // - 4th paragraph (weight 500): Amount
        const allParagraphs = button.querySelectorAll('p');
        const paragraphs = Array.from(allParagraphs);

        if (paragraphs.length > 0) {
          // First paragraph is always the main description
          const firstP = paragraphs[0];
          rowData.description = firstP.textContent?.trim();

          // Look for a second bold paragraph that could be a subheading
          // This is usually more specific than the first paragraph
          // Examples: "Questrade" for institutional transfers, "Referral bonus" for referrals
          if (paragraphs.length > 1) {
            const secondP = paragraphs[1];
            const style = window.getComputedStyle(secondP);
            const fontWeight = parseInt(style.fontWeight) || 400;
            const text = secondP.textContent?.trim();

            // If second paragraph is bold and different from first, capture it as subheading
            if (fontWeight >= 500 && text && text !== rowData.description) {
              rowData.subheading = text;
            }
          }
        }
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

  // Add subheading (e.g., "Questrade" for institutional transfers)
  if (rawData.subheading) {
    transaction.subheading = rawData.subheading;
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
