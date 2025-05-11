/**
 * Generate a unique order ID
 * @returns {string} A unique order ID
 */
exports.generateOrderId = () => {
  const timestamp = new Date().getTime();
  const random = Math.floor(Math.random() * 10000);
  return `order_${timestamp}_${random}`;
};

/**
 * Convert USDT amount from human readable format to atomic units
 * @param {number} amount - Amount in human readable format (e.g., 10.5 USDT)
 * @returns {string} Amount in atomic units (e.g., 10500000 for 10.5 USDT)
 */
exports.toAtomicUnits = (amount) => {
  // USDT on TRON has 6 decimal places
  return (amount * 1000000).toString();
};

/**
 * Convert USDT amount from atomic units to human readable format
 * @param {string} amount - Amount in atomic units
 * @returns {number} Amount in human readable format
 */
exports.fromAtomicUnits = (amount) => {
  return parseFloat(amount) / 1000000;
};

/**
 * Sleep function for async operations
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after ms milliseconds
 */
exports.sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}; 