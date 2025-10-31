import { chromium } from 'playwright';

async function debugDOM() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const page = contexts[0].pages()[0];

  console.log('Connected to browser');
  console.log('Current URL:', await page.url());

  // Wait for activity page
  await page.waitForSelector('[role="button"][id$="-header"]', { timeout: 10000 });

  // Find all transaction header buttons (already expanded)
  const buttons = await page.locator('[role="button"][id$="-header"]').all();
  console.log(`\nFound ${buttons.length} transaction header buttons`);

  // Look for Matt Suttak transaction
  for (let i = 0; i < buttons.length; i++) {
    const buttonText = await buttons[i].textContent();

    if (buttonText.includes('Matt Suttak')) {
      console.log(`\n=== Found Matt Suttak at button index ${i} ===`);
      console.log('Button text:', buttonText);

      const buttonId = await buttons[i].getAttribute('id');
      console.log('Button ID:', buttonId);

      // Get the transaction details region ID
      const regionId = buttonId.replace(/-header$/, '-region');
      console.log('Looking for region ID:', regionId);

      // Find the region
      const region = page.locator(`[id="${regionId}"]`);
      const regionHTML = await region.evaluate((el) => {
        // Try the XPath from this region
        const headerExp =
          '../child::*[1]/child::*[1]/child::*[1]/child::*[1]/child::*[2]/child::*[1]';
        const result = document.evaluate(
          headerExp,
          el,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        const header = result.singleNodeValue;

        // Also try to get the button element which contains the description
        const button = document.getElementById(el.id.replace(/-region$/, '-header'));
        const buttonStructure = {
          innerHTML: button?.innerHTML.substring(0, 2000),
          textContent: button?.textContent,
          childrenCount: button?.children.length,
          children: []
        };

        // Recursively explore the first child to find all text nodes
        function exploreElement(el, depth = 0, maxDepth = 4) {
          if (depth > maxDepth) return null;

          const result = {
            tag: el.tagName,
            text: el.textContent,
            ownText: '',
            fontWeight: window.getComputedStyle(el).fontWeight,
            childrenCount: el.children.length,
            children: []
          };

          // Get text that belongs directly to this element (not children)
          for (const node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
              result.ownText += node.textContent;
            }
          }

          for (let i = 0; i < Math.min(10, el.children.length); i++) {
            result.children.push(exploreElement(el.children[i], depth + 1, maxDepth));
          }

          return result;
        }

        for (let i = 0; i < Math.min(2, button?.children.length || 0); i++) {
          buttonStructure.children.push(exploreElement(button.children[i]));
        }

        return {
          headerFound: !!header,
          headerText: header?.textContent,
          headerHTML: header?.outerHTML,
          buttonStructure
        };
      });

      console.log('\n--- Transaction Header Button Structure ---');
      console.log('Children count:', regionHTML.buttonStructure.childrenCount);
      console.log('\nButton structure (JSON):');
      console.log(JSON.stringify(regionHTML.buttonStructure, null, 2));

      break;
    }
  }

  await browser.close();
}

debugDOM().catch(console.error);
