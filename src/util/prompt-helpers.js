import { createInterface } from 'readline';

/**
 * Create a readline interface for user prompts
 * @returns {Object} Readline interface
 */
export function createReadlineInterface() {
  return createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Prompt user for input
 * @param {Object} rl Readline interface
 * @param {string} question Question to ask
 * @returns {Promise<string>} User's response
 */
export function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt user for password with hidden input
 * @param {Object} rl Readline interface
 * @param {string} prompt Password prompt
 * @returns {Promise<string>} User's password
 */
export function askPassword(rl, prompt) {
  return new Promise((resolve) => {
    // Save the original output stream
    const output = rl.output;
    let muted = false;

    // Override write to hide password characters
    rl._writeToOutput = function (stringToWrite) {
      if (!muted) {
        output.write(stringToWrite);
      }
    };

    rl.question(prompt, (password) => {
      // Restore normal output
      rl._writeToOutput = function (stringToWrite) {
        output.write(stringToWrite);
      };
      output.write('\n');
      resolve(password);
    });

    // Start muting after the prompt is shown
    muted = true;
  });
}

export default {
  createReadlineInterface,
  askQuestion,
  askPassword
};
