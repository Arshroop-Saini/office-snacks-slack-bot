# Office Snacks Bot: AI-Powered Purchasing Assistant for Slack

![Office Snacks Bot Hero](hero.png)

A powerful AI assistant that helps your team order office snacks and supplies directly from Slack, with crypto payments, intelligent search, and automated delivery.

## 🚀 Key Features

### 🤖 **Smart Intent Detection**
- **AI-Powered Understanding**: Automatically detects whether you want to buy, search, or chat
- **Natural Language Processing**: Understands context and intent from your messages
- **Seamless Experience**: No need to remember specific commands - just talk naturally

### 🛒 **Intelligent Product Search**
- **Amazon Product Search**: Search for any product by name, brand, or category
- **ASIN Direct Lookup**: Find specific products using Amazon ASIN codes
- **Smart Product Extraction**: Automatically extracts product names from natural language
- **Rich Product Cards**: View prices, ratings, ETA, and product images
- **"Select This" Buttons**: One-click product selection for easy purchasing

### 💳 **Crypto-Powered Purchasing**
- **USDC Payments**: Pay with USDC on Solana for all purchases
- **Crossmint Integration**: Secure on-chain payments for physical products
- **Automatic Office Detection**: Smart timezone-based office location detection
- **Email Receipts**: Instant confirmation emails with purchase details

### 📋 **Order Management**
- **Order History**: View your complete purchase history with `/orders` command
- **Pagination Support**: Browse through multiple pages of orders
- **Order Status Tracking**: See payment status, delivery status, and order details

### 🏢 **Multi-Office Support**
- **Automatic Office Detection**: Detects your office based on timezone
- **Manual Office Selection**: Choose from Miami, New York, Buenos Aires, or Madrid offices
- **Smart Routing**: Ensures deliveries go to the correct office location

### 💬 **Natural Conversation**
- **General Chat**: Ask questions, get help, or just chat with the bot
- **Wallet Queries**: Check balances, view wallet addresses, and crypto information
- **Office Information**: Get details about office locations and addresses
- **Snack Recommendations**: Get personalized snack suggestions

## 💡 How to Use

### **Product Search & Purchasing**
```
@SnackBot I need some energy drinks for the office
@SnackBot can you find me wireless headphones?
@SnackBot buy this https://amazon.com/product/...
@SnackBot buy this B08N5WRWNW
```

### **Order History**
```
/orders
```
View your complete purchase history with pagination support.

### **General Conversation**
```
@SnackBot hi
@SnackBot what's my wallet balance?
@SnackBot show me office locations
@SnackBot recommend some snacks
```

## 🎯 Use Cases

### **Office Managers**
"I need to order snacks for the Miami office. @SnackBot find me some healthy options"

### **Team Leads**
"Can you order these headphones for our new developer? @SnackBot buy this [Amazon link]"

### **Remote Employees**
"We need more La Croix for next week's team meeting. @SnackBot search for La Croix"

### **Anyone**
"@SnackBot what's my order history?" or "@SnackBot check my wallet balance"

## 🛠️ How It Works

### **1. Smart Intent Detection**
The bot uses AI to understand your intent:
- **Buy Intent**: When you share Amazon links or ASINs
- **Search Intent**: When you ask for products or brands
- **Conversation Intent**: For general chat, wallet queries, and help

### **2. Product Discovery**
- **Natural Language Search**: Just describe what you want
- **ASIN Lookup**: Use Amazon product codes for specific items
- **Rich Results**: View product details, prices, and ratings
- **Easy Selection**: Click "Select This" to start purchasing

### **3. Seamless Purchasing**
- **Office Detection**: Automatically detects your office from timezone
- **Manual Selection**: Choose office if multiple options available
- **Crypto Payment**: Pay with USDC on Solana
- **Confirmation**: Get email receipt with order details

### **4. Order Management**
- **History Tracking**: View all your past orders
- **Status Updates**: Track payment and delivery status
- **Easy Access**: Use `/orders` command anytime

## 🔧 Technology Stack

- **[Vercel AI SDK](https://sdk.vercel.ai/docs)**: Powers the conversational AI interface
- **[OpenAI GPT-4o-mini](https://openai.com/)**: Intelligent intent detection and product extraction
- **[GOAT SDK](https://github.com/goat-sdk/goat/)**: On-chain tools and crypto payments
- **[Crossmint Headless Checkout](https://docs.crossmint.com/)**: Secure on-chain payments for physical products
- **[Solana Blockchain](https://solana.com/)**: Fast, low-cost crypto transactions
- **[Slack API](https://api.slack.com)**: Seamless messaging integration
- **[SearchAPI.io](https://www.searchapi.io/)**: Amazon product search and data

## 🏢 Supported Offices

- **Miami Office** (EST timezone)
- **New York Office** (EST timezone) 
- **Buenos Aires Office** (ART timezone)
- **Madrid Office** (CET timezone)

## 📚 Getting Started

Ready to deploy your own Office Snacks Bot? Check out the [setup guide](SETUP.md).

## 📝 License

MIT License - feel free to use and modify for your organization!