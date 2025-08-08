# Office Snacks Bot Setup Guide

This guide provides detailed instructions for setting up and deploying the Office Snacks Bot.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ installed
- Slack workspace with admin privileges
- [OpenAI API key](https://platform.openai.com/api-keys)
- [EVM wallet](https://metamask.io/) (like MetaMask) with private key for Base-Sepolia
- [Crossmint API key](https://www.crossmint.com/)
- [Vercel](https://vercel.com) to deploy the bot

## Setup

### 1. Install Dependencies

```bash
npm install
# or
pnpm install
```

### 2. Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click "Create New App"
2. Choose "From scratch" and give your app a name
3. Select your workspace

### 3. Configure Slack App Settings

#### Basic Information

- Under "App Credentials", note down your "Signing Secret"

#### OAuth & Permissions

- Add the following [Bot Token Scopes](https://api.slack.com/scopes):

  - `app_mentions:read`
  - `assistant:write`
  - `chat:write`
  - `im:history`
  - `im:read`
  - `im:write`

- Install the app to your workspace and note down the "Bot User OAuth Token"

### 4. Setup EVM Wallet for Base-Sepolia

1. Install MetaMask or use your existing EVM wallet

2. Create or import a wallet that you'll use for the bot

3. Export your private key:
   - In MetaMask: Account Details > Export Private Key
   - Copy the private key (it should start with `0x`)

4. Get your wallet address:
   - This is the public address of your wallet (starts with `0x`)

5. Get Base-Sepolia RPC URL:
   - You can use public RPC URLs like `https://sepolia.base.org`
   - Or get one from providers like Alchemy, Infura, etc.

6. Create Crossmint Smart Wallet:
   
   **IMPORTANT:** Your smart wallet MUST be linked to your personal wallet address to avoid authentication errors.
   
   **Step 6a: Add your wallet address to environment variables**
   
   First, add your personal wallet address to your `.env` file:
   ```env
   SIGNER_WALLET_ADDRESS=0x-your-personal-wallet-address
   ```
   
   **Step 6b: Run the smart wallet creation script**
   
   ```bash
   npx tsx create-smart-wallet.ts
   ```
   
   **Step 6c: Update your .env file**
   
   The script will output a new smart wallet address. Add it to your `.env` file:
   ```env
   SMART_WALLET_ADDRESS=0x-your-new-smart-wallet-address
   ```
   
   > **Critical:** Make sure the smart wallet is created with YOUR personal wallet address as the signer. This ensures that your private key can control the smart wallet for transactions.

### 7. Fund the EVM Wallet

1. Fund the wallet with ETH (for gas fees):

   - You'll need a small amount of ETH (around 0.01 ETH) to cover gas fees on Base-Sepolia
   - You can get test ETH from Base-Sepolia faucets:
     - [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
     - [Alchemy Base Sepolia Faucet](https://sepoliafaucet.com/)
   - Transfer the ETH to your wallet's public address

2. Fund the wallet with USDC:

   - You'll need USDC for making purchases
   - You can transfer USDC directly to your wallet's public address
   - Or use the [Crossmint Fund Wallet API](https://docs.crossmint.com/api-reference/wallets/fund-wallet#fund-wallet) to fund your wallet with USDC
   - Make sure to use the correct USDC token address for Base-Sepolia network

3. Verify your balances:

   - Check your wallet in MetaMask or any block explorer
   - Visit [Base Sepolia Explorer](https://sepolia-explorer.base.org/) and search for your wallet address
   - Ensure you have both ETH (for gas) and USDC (for purchases)

### 8. Get a Crossmint Server-Side API Key

1. Create a Crossmint account if you don't have one already:

   - [Staging Console](https://staging.crossmint.com/console) (for development)
   - [Production Console](https://www.crossmint.com/console) (for production)

   > **Important**: When using Crossmint's staging environment, you should also use Base-Sepolia testnet for testing. Similarly, when using Crossmint's production environment, you should use Base mainnet. This ensures compatibility between the environments.

   > **Note**: While purchases will work in both staging and production environments, physical products ordered through the staging environment will not be delivered. Use staging for testing the payment flow and production for actual product orders.

2. Navigate to the API Keys section in the developer console:

   - [Staging API Keys](https://staging.crossmint.com/console/projects/apiKeys)
   - [Production API Keys](https://www.crossmint.com/console/projects/apiKeys)

3. Click the "Create new key" button in the server-side keys section.

4. In the modal that opens, expand the "Payments APIs" section and enable the following scope:

   - `orders.create` - Required for creating payment orders

5. Click the "Create server key" button at the bottom of the modal.

6. Copy your new API key and store it securely. You'll need to add it to your environment variables.

### 9. Set Environment Variables

Create a `.env` file in the root of your project with the following:

```
# Slack Credentials
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret

# OpenAI Credentials
OPENAI_API_KEY=your-openai-api-key

# EVM Wallet for Base-Sepolia
SIGNER_WALLET_SECRET_KEY=0x-your-evm-private-key
RPC_PROVIDER_URL=https://sepolia.base.org
SMART_WALLET_ADDRESS=your-crossmint-smart-wallet-address
SIGNER_WALLET_ADDRESS=your-evm-wallet-address

# Crossmint API Key
CROSSMINT_API_KEY=your-crossmint-api-key

# Office Addresses (JSON string array of objects, with these exact properties)
OFFICE_ADDRESSES='[{"name":"Miami Office","recipientName":"Alfonso Gómez-Jordana Mañas","line1":"1 SE 3rd Ave","line2":"STE 1440","city":"Miami","state":"FL","postalCode":"33131","country":"US"},{"name":"New York Office","recipientName":"Rodri Fernández Touza","line1":"310 Livingston St","city":"Brooklyn","state":"NY","postalCode":"11217","country":"US"},{"name":"Buenos Aires Office","recipientName":"ACO Workspace","line1":"Av. Raúl Scalabrini Ortiz 1135","city":"Cdad. Autónoma de Buenos Aires","state":"CABA","postalCode":"C1414","country":"AR"},{"name":"Madrid Office","recipientName":"Paella Inc","line1":"Calle de Valverde 2","line2":"8th Floor","city":"Madrid","state":"","postalCode":"28004","country":"ES"}]'
```

Replace the placeholder values with your actual tokens.

### 10. Deploy your app

- If building locally, follow steps in the Local Development section to tunnel your local environment and then copy the tunnel URL.
- If deploying to Vercel, follow the instructions in the Production Deployment section and copy your deployment URL.

### 11. Update your Slack App configuration:

Go to your [Slack App settings](https://api.slack.com/apps)

- Select your app
- Go to "Event Subscriptions"
- Enable Events
- Set the Request URL to either your local URL or your deployment URL: (e.g. `https://your-app.vercel.app/api/events`)
- Save Changes
- Under "Subscribe to bot events", add:
  - `app_mention`
  - `assistant_thread_started`
  - `message:im`

> Remember to include `/api/events` in the Request URL.

## Local Development

Use the [Vercel CLI](https://vercel.com/docs/cli) and [untun](https://github.com/unjs/untun) to test out this project locally:

```sh
pnpm i -g vercel
pnpm vercel dev --listen 3000 --yes
```

```sh
npx untun@latest tunnel http://localhost:3000
```

Make sure to modify the subscription URL to the `untun` URL.

> Note: you may encounter issues locally with `waitUntil`. This is being investigated.

## Production Deployment

### Deploying to Vercel

1. Push your code to a GitHub repository

2. Deploy to [Vercel](https://vercel.com):

   - Go to vercel.com
   - Create New Project
   - Import your GitHub repository

3. Add your environment variables in the Vercel project settings:

   - `SLACK_BOT_TOKEN`
   - `SLACK_SIGNING_SECRET`
   - `OPENAI_API_KEY`
   - `SIGNER_WALLET_SECRET_KEY`
   - `RPC_PROVIDER_URL`
   - `SMART_WALLET_ADDRESS`
   - `SIGNER_WALLET_ADDRESS`
   - `CROSSMINT_API_KEY`

4. After deployment, Vercel will provide you with a production URL

5. Update your Slack App configuration:
   - Go to your [Slack App settings](https://api.slack.com/apps)
   - Select your app
   - Go to "Event Subscriptions"
   - Enable Events
   - Set the Request URL to: `https://your-app.vercel.app/api/events`
   - Save Changes
   - Under "Subscribe to bot events", add:
     - `app_mention`
     - `assistant_thread_started`
     - `message:im`

## Usage

The bot will respond to:

1. Direct messages - Send a DM to your bot
2. Mentions - Mention your bot in a channel using `@YourBotName`

The bot maintains context within both threads and direct messages, so it can follow along with the conversation.

### Available Tools

1. **Office Locations**: The bot can retrieve office addresses for delivery.

   - Example: "I need to order snacks for the office"

2. **Item Purchasing**: The bot can process purchases from Amazon URLs.

   - Example: "Buy this https://www.amazon.com/Croix-Sparkling-Water-Grapefruit-Count/dp/B01MTDGVVY/"

3. **Financial Information**: The bot can share its wallet address and ETH/USDC balance.
   - Example: "What's your wallet address and USDC balance?"

### Extending with New Tools

The chatbot is built with an extensible architecture using the [AI SDK's tool system](https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling) and the [GOAT SDK](https://github.com/goat-sdk/goat/).
