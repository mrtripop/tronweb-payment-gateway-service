# TRON USDT Payment Gateway Recovery Scripts

This directory contains utility scripts for managing and recovering TRON USDT payments. These scripts are especially useful for troubleshooting payment issues, activating wallets, and recovering funds from temporary payment addresses.

## Prerequisites

Before using these scripts, ensure you have:

1. Proper environment variables set in your `.env` file:
   - `MONGO_URI`: MongoDB connection string
   - `TRON_FULL_HOST`: TRON API endpoint 
   - `TRON_PRIVATE_KEY`: Your main wallet's private key
   - `MAIN_WALLET_ADDRESS`: Your main wallet address
   - `USDT_CONTRACT_ADDRESS`: TRON USDT contract address

2. Node.js dependencies installed:
   ```
   npm install
   ```

## Available Scripts

### 1. Find Payment by Address (`find-payment-by-address.js`)

Retrieves payment details using a TRON wallet address.

**Usage:**
```bash
node scripts/find-payment-by-address.js <tron_address>
```

**Example:**
```bash
node scripts/find-payment-by-address.js TVijnPEvedsWjD9ymjJuC8keoEaUsPsBcN
```

**Output:**
```
Searching for payment with address: TVijnPEvedsWjD9ymjJuC8keoEaUsPsBcN
Connected to MongoDB
================================================================================
PAYMENT DETAILS:
================================================================================
Payment ID: order_1746997036128_8139
Order ID: ORDER-1746997036102-254
TRON Address: TVijnPEvedsWjD9ymjJuC8keoEaUsPsBcN
Amount: 12 USDT
Status: completed
Created At: Mon May 12 2025 03:57:16 GMT+0700 (Indochina Time)
Account Activated: Yes
Activation Attempts: 1
Transaction ID: N/A
Transfer Transaction ID: false
================================================================================
To recover funds, run: node scripts/activate-and-recover-funds.js order_1746997036128_8139
================================================================================
```

### 2. List Pending Payments (`list-pending-payments.js`)

Lists all payments that require attention, categorized by issue type.

**Usage:**
```bash
node scripts/list-pending-payments.js
```

**What it shows:**
- Unactivated accounts: Wallets that haven't been activated with TRX
- Completed payments pending transfer: Payments that have been received but funds not transferred to main wallet
- Funds received but not completed: Payments marked as funds_received but not fully processed

**Example output:**
```
Connected to MongoDB
================================================================================
PAYMENTS REQUIRING ATTENTION
================================================================================

🔄 UNACTIVATED ACCOUNTS: 2
================================================================================
1. Payment ID: order_1746997036128_8139
   Address: TVijnPEvedsWjD9ymjJuC8keoEaUsPsBcN
   Amount: 12 USDT
   Created: Mon May 12 2025 03:57:16 GMT+0700
   Status: pending
   Activation Attempts: 0
   Recovery Command: node scripts/activate-and-recover-funds.js order_1746997036128_8139
--------------------------------------------------------------------------------

💰 COMPLETED PAYMENTS PENDING TRANSFER: 1
================================================================================
1. Payment ID: order_1747001234567_5432
   Address: TRk9FJYQBsgyjyNDG8fE2ZmFtEGy9u13QV
   Amount: 25.5 USDT
   Created: Tue May 13 2025 10:22:45 GMT+0700
   Transaction ID: 7da63bf3c2ecabb8761a98234cfc2aaa8b582eb894626953698
   Recovery Command: node scripts/activate-and-recover-funds.js order_1747001234567_5432
--------------------------------------------------------------------------------
```

### 3. Activate and Recover Funds (`activate-and-recover-funds.js`)

Comprehensive recovery tool that activates wallets and recovers funds in a single operation.

**Usage:**
```bash
node scripts/activate-and-recover-funds.js <payment_id>
```

**Example:**
```bash
node scripts/activate-and-recover-funds.js order_1746997036128_8139
```

**Process:**
1. Retrieves payment details from database
2. Checks if the TRON wallet is activated on the blockchain
3. If not activated:
   - Sends 20 TRX to the address
   - Waits for activation confirmation
   - Updates the payment record
4. Checks USDT balance on the address
5. If USDT is available:
   - Transfers it to the main wallet
   - Updates payment status and transfer transaction ID
6. Checks TRX balance and transfers excess back to main wallet
7. Updates all relevant database records

**When to use:**
- When wallet activation has failed
- When payments are stuck in "completed" status but funds haven't moved to main wallet
- When manual recovery of funds is needed

## Common Troubleshooting Scenarios

### 1. Wallet not activated but customer sent USDT

If a customer has sent USDT to a wallet that hasn't been activated yet:

```bash
# First identify the payment
node scripts/find-payment-by-address.js <customer_address>

# Then recover the funds
node scripts/activate-and-recover-funds.js <payment_id>
```

### 2. Finding stuck payments

To identify all payments that need attention:

```bash
node scripts/list-pending-payments.js
```

Then use the recovery commands provided in the output.

### 3. Checking a specific payment

If you have a payment ID but want to check its status:

```bash
# Find the payment details first
mongosh
> use payment-gateway
> db.payments.findOne({paymentId: "your_payment_id"})

# Get the address then check it
node scripts/find-payment-by-address.js <address_from_query>
```

### 4. Batch recovery process

For recovering multiple stuck payments in sequence:

```bash
# Create a file with payment IDs (one per line)
echo "payment_id_1" > payments_to_recover.txt
echo "payment_id_2" >> payments_to_recover.txt

# Process each payment
cat payments_to_recover.txt | while read id; do node scripts/activate-and-recover-funds.js $id; done
```

## Important Notes

- These scripts should be run on the server with access to the main wallet's private key
- Always verify recovery operations by checking the blockchain explorer
- The recovery process may take some time as it requires multiple blockchain confirmations
- For security reasons, avoid exposing private keys in log files or command history 