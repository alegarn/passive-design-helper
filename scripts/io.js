// Refactor derived from logic.js
const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * List all CSV files in the current directory, sorted alphabetically
 * @returns {string[]} Array of CSV filenames
 */
function listCsvFiles() {
  try {
    const files = fs.readdirSync(process.cwd())
      .filter(f => f.toLowerCase().endsWith('.csv'))
      .sort();
    return files;
  } catch (error) {
    throw new Error(`IOError: Cannot read directory: ${error.message}`);
  }
}

/**
 * Read first N non-empty lines from a file (including header)
 * @param {string} filePath - Path to the file
 * @param {number} maxLines - Maximum number of lines to read (default: 10)
 * @returns {string[]} Array of lines
 */
function readFileSample(filePath, maxLines = 10) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/)
      .filter(line => line.trim().length > 0)
      .slice(0, maxLines);
    return lines;
  } catch (error) {
    throw new Error(`IOError: Cannot read file ${filePath}: ${error.message}`);
  }
}

/**
 * Read entire file content as string
 * @param {string} filePath - Path to the file
 * @returns {string} File content
 */
function readAllFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`IOError: Cannot read file ${filePath}: ${error.message}`);
  }
}

/**
 * Write file atomically (using sync write for simplicity)
 * @param {string} filePath - Path to write
 * @param {string} content - Content to write
 */
function writeFileAtomic(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
  } catch (error) {
    throw new Error(`IOError: Cannot write file ${filePath}: ${error.message}`);
  }
}

/**
 * Check if file exists
 * @param {string} filePath - Path to check
 * @returns {boolean} True if file exists
 */
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
}

/**
 * Get file stats
 * @param {string} filePath - Path to stat
 * @returns {fs.Stats} File stats object
 */
function stat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch (error) {
    throw new Error(`IOError: Cannot stat file ${filePath}: ${error.message}`);
  }
}

/**
 * Create a readline interface for streaming a file line by line
 * @param {string} filePath - Path to the file
 * @returns {readline.Interface} Readline interface for streaming
 */
function createReadStream(filePath) {
  try {
    const fileStream = fs.createReadStream(filePath, 'utf8');
    return readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
  } catch (error) {
    throw new Error(`IOError: Cannot create read stream for ${filePath}: ${error.message}`);
  }
}

/**
 * Create a write stream for output files
 * @param {string} filePath - Path to the file
 * @returns {fs.WriteStream} Write stream
 */
function createWriteStream(filePath) {
  try {
    return fs.createWriteStream(filePath, 'utf8');
  } catch (error) {
    throw new Error(`IOError: Cannot create write stream for ${filePath}: ${error.message}`);
  }
}

module.exports = {
  listCsvFiles,
  readFileSample,
  readAllFile,
  writeFileAtomic,
  fileExists,
  stat,
  createReadStream,
  createWriteStream
};