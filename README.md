# TRON USDT Payment Gateway

A payment gateway for accepting USDT payments on the TRON blockchain network with comprehensive transaction tracking and management.

## Features

- Generate unique payment addresses for each transaction
- Real-time payment monitoring with two-phase verification:
  - Payment detection: Track when a customer sends USDT to the payment address
  - Fund transfer: Confirm when funds are moved to the main wallet
- Automatic account activation and TRX funding for new addresses
- Transaction history dashboard with filtering and detailed views:
  - View all transactions with pagination and status filtering
  - Detailed transaction view with QR codes and payment progress tracking
  - Easy address copying for manual payment verification
- Automatic transfer to main wallet when payment is received
- Merchant callback system
- QR code generation for easy payments
- REST API for integration with your application

## Requirements

- Node.js 14+
- MongoDB
- TRON wallet with private key

## Installation

### Standard Installation

1. Clone the repository
```
git clone <repository-url>
cd tron-usdt-payment-gateway
```

2. Install dependencies
```
npm install
```

3. Copy the environment file and edit it with your settings
```
cp .env.example .env
```

4. Update the `.env` file with your TRON wallet information and MongoDB URI

### Docker Installation

1. Clone the repository
```
git clone <repository-url>
cd tron-usdt-payment-gateway
```

2. Set up your environment variables either by:
   - Creating a `.env` file with the required variables using the provided helper script:
     ```
     ./docker-setup.sh --env
     ```
   - Or setting them directly in your environment

3. Run with Docker Compose
```
docker-compose up -d
```

This will start the payment gateway API and a MongoDB instance.

## Environment Variables

- `PORT`: Server port (default: 3000)
- `MONGO_URI`: MongoDB connection string
- `TRON_FULL_HOST`: TRON API endpoint (default: https://api.trongrid.io)
- `TRON_PRIVATE_KEY`: Your TRON wallet private key
- `MAIN_WALLET_ADDRESS`: Your main TRON wallet address where funds will be transferred
- `USDT_CONTRACT_ADDRESS`: TRON USDT contract address (default: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t)

## Usage

### Start the server

For standard installation:
```
npm start
```

For development:
```
npm run dev
```

For Docker:
```
docker-compose up -d
```

### Frontend Examples

The repository includes two example HTML pages:

1. **Payment Page** (`examples/payment-page.html`): Demonstrates how to create and monitor a payment
2. **Transaction History** (`examples/transaction-history.html`): Provides a dashboard to view and manage all transactions

### Payment Flow

The payment process follows these steps:

1. **Payment Creation**: A unique TRON address is generated for each payment
2. **Payment Detection**: The system monitors the address for incoming USDT
3. **Payment Verification**: Once payment is received, status changes to "completed"
4. **Fund Transfer**: Funds are automatically transferred from the payment address to your main wallet
5. **Transfer Verification**: The transfer transaction is recorded and linked to the payment

### Two-Phase Status Tracking

Each payment has two distinct status indicators:

1. **Payment Status**: Indicates whether USDT has been received at the payment address
   - `pending`: Waiting for payment
   - `completed`: Payment received
   - `failed`: Payment failed
   - `processing`: Payment is being processed

2. **Transfer Status**: Indicates whether funds have been transferred to the main wallet
   - `pending_transfer`: Funds received but not yet transferred
   - `transferred`: Funds have been transferred to the main wallet

A payment is only considered fully complete when both statuses are positive.

### TRON Wallet Activation Process

TRON blockchain requires new wallet addresses to be "activated" before they can interact with tokens and contracts. This activation system works as follows:

1. **Wallet Creation**: When a payment is created, a new TRON wallet is generated with a unique address and private key
   
2. **Activation Requirement**: Before the wallet can receive USDT or perform any token operations, it must:
   - Receive a small amount of TRX (TRON's native token)
   - Have enough Energy and Bandwidth resources to execute smart contract calls
   
3. **Automatic Activation**: The gateway handles this process automatically:
   - Sends 5-20 TRX from the main wallet to the payment address
   - Delegates Energy and Bandwidth resources from the main wallet
   - Tracks activation status in the database with the `accountActivated` field
   
4. **Progressive Retry Logic**: If activation fails, the system will try multiple times with increasing TRX amounts

5. **Resource Delegation**: To process USDT tokens (which are TRC-20 contracts), Energy and Bandwidth are required:
   - Energy: Used for smart contract execution (USDT transfers)
   - Bandwidth: Used for basic transactions
   - The system delegates these resources from the main wallet to payment addresses

6. **Recovery Process**: If automatic activation fails, the manual recovery scripts can:
   - Send a larger amount of TRX (20 TRX) to ensure activation
   - Retry the activation with improved waiting logic
   - Recover both USDT and excess TRX back to the main wallet

**Note**: This activation process is specific to TRON blockchain and is required due to its resource model. It differs from other blockchains like Ethereum or Bitcoin.

### API Endpoints

#### Create a new payment
```
POST /api/payment/create
```
Request body:
```json
{
  "amount": 10.5,
  "customerEmail": "customer@example.com",
  "description": "Order #123",
  "callbackUrl": "https://yourwebsite.com/payment-webhook"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "paymentId": "order_1629304878_1234",
    "address": "TYouRTRonAddRessHere123456789",
    "amount": 10.5,
    "status": "pending",
    "qrCode": "data:image/png;base64,..."
  }
}
```

#### Get all payments (Transaction History)
```
GET /api/payment?status=pending&page=1&limit=10
```

Query parameters:
- `status` (optional): Filter by payment status
- `page` (optional): Pagination page number (default: 1)
- `limit` (optional): Number of results per page (default: 10)

Response:
```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "paymentId": "order_1629304878_1234",
        "amount": 10.5,
        "description": "Order #123",
        "address": "TYouRTRonAddRessHere123456789",
        "status": "completed",
        "transferStatus": "transferred",
        "fullPaymentComplete": true,
        "transferTransactionId": "hash123456789",
        "transactionId": "hash987654321",
        "createdAt": "2023-08-18T15:14:38.123Z",
        "updatedAt": "2023-08-18T15:20:12.456Z"
      },
      // More payments...
    ],
    "pagination": {
      "total": 25,
      "page": 1,
      "limit": 10,
      "pages": 3
    }
  }
}
```

#### Check payment status
```
GET /api/payment/status/:paymentId
```

Response:
```json
{
  "success": true,
  "data": {
    "paymentId": "order_1629304878_1234",
    "status": "completed",
    "amount": 10.5,
    "address": "TYouRTRonAddRessHere123456789",
    "transferStatus": "transferred",
    "transferTransactionId": "hash123456789",
    "fullPaymentComplete": true,
    "createdAt": "2023-08-18T15:14:38.123Z",
    "updatedAt": "2023-08-18T15:20:12.456Z"
  }
}
```

#### Get payment details
```
GET /api/payment/:paymentId
```

Response:
```json
{
  "success": true,
  "data": {
    "paymentId": "order_1629304878_1234",
    "amount": 10.5,
    "description": "Order #123",
    "address": "TYouRTRonAddRessHere123456789",
    "status": "completed",
    "transferStatus": "transferred",
    "transferTransactionId": "hash123456789",
    "createdAt": "2023-08-18T15:14:38.123Z",
    "updatedAt": "2023-08-18T15:20:12.456Z"
  }
}
```

## Utility Scripts

The project includes several utility scripts for managing payments:

- `update-payment-status.js`: Update the status of a specific payment
- `check-pending-payments.js`: Check the status of all pending payments
- `transfer-funds.js`: Manually transfer funds from payment addresses to the main wallet
- `check-transaction.js`: Check the status of a transaction on the blockchain
- `direct-transfer.js`: Directly transfer USDT between addresses (for testing)

### Recovery Scripts

The project includes specialized scripts for handling wallet activation issues and recovering funds:

#### `scripts/find-payment-by-address.js`

This script retrieves payment details using a TRON wallet address.

**Usage:**
```bash
node scripts/find-payment-by-address.js <tron_address>
```

**Example:**
```bash
node scripts/find-payment-by-address.js TVijnPEvedsWjD9ymjJuC8keoEaUsPsBcN
```

**What it does:**
- Searches the database for a payment with the specified TRON address
- Displays detailed information about the payment including ID, status, amount, and activation state
- Provides a command to use for recovery if issues are found

#### `scripts/list-pending-payments.js`

This script lists all payments that require attention, sorted by issues that need to be resolved.

**Usage:**
```bash
node scripts/list-pending-payments.js
```

**What it does:**
- Searches for payments with unactivated accounts
- Identifies payments with "completed" status but no transfer transaction
- Finds payments with "funds_received" status that haven't been processed
- Displays detailed information and recovery commands for each payment
- Groups payments by issue type for easier management

#### `scripts/activate-and-recover-funds.js`

This is a comprehensive recovery tool that handles wallet activation and fund recovery in a single operation.

**Usage:**
```bash
node scripts/activate-and-recover-funds.js <payment_id>
```

**Example:**
```bash
node scripts/activate-and-recover-funds.js order_1746997036128_8139
```

**What it does:**
1. **Wallet status check**: Verifies if the wallet exists on the blockchain
2. **Activation**: If needed, sends 20 TRX to activate the wallet and waits for confirmation
3. **USDT recovery**: Checks USDT balance and transfers it to the main wallet
4. **TRX recovery**: Transfers excess TRX back to the main wallet (keeps 1 TRX for future operations)
5. **Database updates**: Updates payment status and transaction records throughout the process

**When to use:**
- When a payment shows as "completed" but funds aren't in the main wallet
- When a wallet hasn't been activated properly
- When you need to manually recover funds from a payment address
- When troubleshooting payment issues visible in the TRON wallet UI

To run any utility script:
```
node script-name.js
```

## Troubleshooting

### Payment shows as "completed" but funds not in main wallet

This indicates the payment was received but the transfer to the main wallet hasn't happened yet or failed. Check:

1. If the payment shows "completed" status but "pending_transfer" for transfer status
2. Run the list-pending-payments.js script to identify problematic payments:
   ```
   node scripts/list-pending-payments.js
   ```
3. Use the address to check the payment:
   ```
   node scripts/find-payment-by-address.js <address>
   ```
4. For unactivated wallets or pending transfers, run the recovery script:
   ```
   node scripts/activate-and-recover-funds.js <payment_id>
   ```
5. For regular payment processing, run:
   ```
   node transfer-funds.js
   ```
6. Check blockchain explorer using the payment address to verify balance

### Account activation failures

If payment addresses aren't being activated properly:

1. Ensure your main wallet has sufficient TRX to fund new addresses
2. Check that the TRON_PRIVATE_KEY environment variable is correctly set
3. The system has been enhanced to automatically detect inactive accounts and activate them
4. For persistent issues, you can manually activate an account by using the utility script:
   ```
   node activate-then-transfer.js
   ```

### Payment monitoring not working

Ensure that:
1. The TRON API endpoint is accessible 
2. Your private key has permission to check balances
3. The payment processor service is running
4. MongoDB is properly connected

### Transaction doesn't appear in history

If a transaction is not showing up in the history:
1. Ensure your MongoDB connection is working
2. Verify that the transaction was properly recorded in the database
3. Check for any errors in the logs

## Docker Management

### Start services
```
docker-compose up -d
```

### Stop services
```
docker-compose down
```

### View logs
```
docker-compose logs -f
```

### Rebuild and restart services
```
docker-compose up -d --build
```

### Start with MongoDB Express (Database UI)
```
docker-compose --profile dev up -d
```

This will start the MongoDB Express web interface at http://localhost:8081, which allows you to manage your MongoDB database through a user-friendly interface.

Default credentials for MongoDB Express:
- Username: admin
- Password: admin123

## Security Considerations

- Never expose your private key
- Use HTTPS in production
- Validate all input data
- Consider implementing additional authentication for API endpoints
- Store the private keys securely
- In production, change all default passwords in the docker-compose.yml file

## License

MIT 