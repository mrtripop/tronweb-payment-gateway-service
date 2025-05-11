const TronWeb = require('tronweb');
// Replace logger with console for the scripts to work
// const logger = require('./logger');
require('dotenv').config();

// Initialize TronWeb with the main wallet's private key
const tronWeb = new TronWeb({
  fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
  privateKey: process.env.TRON_PRIVATE_KEY
});

/**
 * Check if an account exists on the TRON blockchain
 * @param {string} address - The address to check
 * @returns {Promise<boolean>} - Whether the account exists
 */
async function accountExists(address) {
  try {
    const account = await tronWeb.trx.getAccount(address);
    return !!account.address;
  } catch (error) {
    return false;
  }
}

/**
 * Activate a TRON account by sending a minimal amount of TRX
 * @param {string} address - The address to activate
 * @returns {Promise<{success: boolean, txid?: string, error?: string}>}
 */
async function activateAccount(address) {
  try {
    // Check if account already exists
    const exists = await accountExists(address);
    if (exists) {
      console.log(`Account ${address} already exists on the blockchain`);
      return { success: true };
    }

    // Send a minimal amount of TRX (0.1) to activate the account
    const activationAmount = 100000; // 0.1 TRX in SUN units
    console.log(`Activating account ${address} with ${activationAmount/1000000} TRX`);

    const transaction = await tronWeb.trx.sendTransaction(
      address,
      activationAmount.toString(),
      process.env.TRON_PRIVATE_KEY
    );

    return { 
      success: true, 
      txid: transaction.txid,
      message: `Account activated with ${activationAmount/1000000} TRX. Transaction ID: ${transaction.txid}`
    };
  } catch (error) {
    console.error(`Error activating account ${address}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Delegate energy to a TRON account
 * @param {string} receiverAddress - The address to receive the delegated energy
 * @param {number} energyAmount - Amount of energy to delegate
 * @returns {Promise<{success: boolean, txid?: string, error?: string}>}
 */
async function delegateEnergy(receiverAddress, energyAmount) {
  try {
    const mainWalletAddress = tronWeb.address.fromPrivateKey(process.env.TRON_PRIVATE_KEY);
    console.log(`Delegating ${energyAmount} energy from ${mainWalletAddress} to ${receiverAddress}`);

    // Construct the delegateResource transaction
    const transaction = await tronWeb.transactionBuilder.delegateResource(
      energyAmount, // amount
      receiverAddress, // receiver address
      'ENERGY', // resource type (ENERGY or BANDWIDTH)
      mainWalletAddress, // owner address
      false, // lock (for whether the resource is locked for 3 days)
    );

    // Sign the transaction
    const signedTransaction = await tronWeb.trx.sign(transaction);

    // Broadcast the transaction
    const receipt = await tronWeb.trx.sendRawTransaction(signedTransaction);

    return {
      success: true,
      txid: receipt.txid,
      message: `Delegated ${energyAmount} energy to ${receiverAddress}. Transaction ID: ${receipt.txid}`
    };
  } catch (error) {
    console.error(`Error delegating energy to ${receiverAddress}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Delegate bandwidth to a TRON account
 * @param {string} receiverAddress - The address to receive the delegated bandwidth
 * @param {number} bandwidthAmount - Amount of bandwidth to delegate
 * @returns {Promise<{success: boolean, txid?: string, error?: string}>}
 */
async function delegateBandwidth(receiverAddress, bandwidthAmount) {
  try {
    const mainWalletAddress = tronWeb.address.fromPrivateKey(process.env.TRON_PRIVATE_KEY);
    console.log(`Delegating ${bandwidthAmount} bandwidth from ${mainWalletAddress} to ${receiverAddress}`);

    // Construct the delegateResource transaction
    const transaction = await tronWeb.transactionBuilder.delegateResource(
      bandwidthAmount, // amount
      receiverAddress, // receiver address 
      'BANDWIDTH', // resource type
      mainWalletAddress, // owner address
      false, // lock
    );

    // Sign the transaction
    const signedTransaction = await tronWeb.trx.sign(transaction);

    // Broadcast the transaction
    const receipt = await tronWeb.trx.sendRawTransaction(signedTransaction);

    return {
      success: true,
      txid: receipt.txid,
      message: `Delegated ${bandwidthAmount} bandwidth to ${receiverAddress}. Transaction ID: ${receipt.txid}`
    };
  } catch (error) {
    console.error(`Error delegating bandwidth to ${receiverAddress}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Check account resources (bandwidth and energy)
 * @param {string} address - The address to check
 * @returns {Promise<{bandwidth: number, energy: number, success: boolean, error?: string}>}
 */
async function getAccountResources(address) {
  try {
    const resources = await tronWeb.trx.getAccountResources(address);
    return {
      success: true,
      bandwidth: resources.NetLimit || 0,
      energy: resources.EnergyLimit || 0
    };
  } catch (error) {
    console.error(`Error getting account resources for ${address}: ${error.message}`);
    return { success: false, bandwidth: 0, energy: 0, error: error.message };
  }
}

module.exports = {
  activateAccount,
  delegateEnergy,
  delegateBandwidth,
  accountExists,
  getAccountResources
}; 