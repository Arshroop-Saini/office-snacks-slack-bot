import { openai } from "@ai-sdk/openai";
import { getOnChainTools } from "@goat-sdk/adapter-vercel-ai";
import { solana } from "@goat-sdk/wallet-solana";
import { type CoreMessage, generateText } from "ai";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { crossmintHeadlessCheckout } from "@goat-sdk/plugin-crossmint-headless-checkout";
import { splToken } from "@goat-sdk/plugin-spl-token";
import { officeAddressesTool } from "./tools/office-addresses.tool";
import { recommendedSnacksTool } from "./tools/recommended-snacks.tool";
import { amazonSearchTool } from "./tools/amazon-search.tool";

// Helper function to parse Crossmint errors and return user-friendly messages
function parseCrossmintError(error: any): string | null {
  console.log("🔍 Parsing Crossmint error:", JSON.stringify(error, null, 2));

  // Try to extract error from various possible locations in the error object
  let errorData = error;
  if (error.cause) errorData = error.cause;
  if (error.response) errorData = error.response;
  if (error.data) errorData = error.data;

  // Convert to string if it's not already
  const errorString = typeof errorData === 'string' ? errorData : JSON.stringify(errorData);

  // Check for specific Crossmint status codes and error patterns

  // Product availability issues
  if (errorString.includes('quote:all-line-items-unavailable') ||
    errorString.includes('out of stock') ||
    errorString.includes('unavailable') ||
    errorString.includes('not available')) {
    return "❌ **Product Out of Stock**: This product is currently unavailable on Amazon. Please try a different product or check back later.";
  }

  // Product not supported by Crossmint
  if (errorString.includes('not supported') ||
    errorString.includes('unsupported') ||
    errorString.includes('cannot process this product') ||
    errorString.includes('invalid product locator') ||
    errorString.includes('product not found')) {
    return "❌ **Product Not Supported**: This Amazon product cannot be purchased through our system. This might be due to regional restrictions, seller limitations, or product type restrictions.";
  }

  // Quote/pricing issues
  if (errorString.includes('quote:expired')) {
    return "❌ **Quote Expired**: The price quote for this product has expired. Please try your purchase again to get a fresh quote.";
  }

  // Address/shipping issues
  if (errorString.includes('quote:requires-physical-address') ||
    errorString.includes('requires-physical-address') ||
    errorString.includes('shipping address')) {
    return "❌ **Shipping Address Required**: We need a valid shipping address for this physical product. Please ensure your office address is properly configured.";
  }

  // Payment issues
  if (errorString.includes('payment:failed') ||
    errorString.includes('payment failed') ||
    errorString.includes('insufficient funds') ||
    errorString.includes('insufficient balance')) {
    return "❌ **Payment Failed**: Unable to complete payment. This could be due to insufficient wallet balance or payment processing issues. Please check wallet funding or try again later.";
  }

  if (errorString.includes('payment:requires-kyc') ||
    errorString.includes('kyc') ||
    errorString.includes('verification required')) {
    return "❌ **Verification Required**: This purchase requires additional verification. Please contact your administrator for assistance.";
  }

  // Wallet/crypto issues
  if (errorString.includes('wallet') ||
    errorString.includes('solana') ||
    errorString.includes('usdc') ||
    errorString.includes('crypto')) {
    return "❌ **Wallet Issue**: There was a problem with the crypto wallet or blockchain transaction. Please try again or contact support if the issue persists.";
  }

  // Rate limiting or API issues
  if (errorString.includes('rate limit') ||
    errorString.includes('too many requests') ||
    errorString.includes('429')) {
    return "❌ **Service Busy**: Our payment service is currently busy. Please wait a moment and try again.";
  }

  // Network/connectivity issues
  if (errorString.includes('network') ||
    errorString.includes('timeout') ||
    errorString.includes('connection') ||
    errorString.includes('502') ||
    errorString.includes('503') ||
    errorString.includes('504')) {
    return "❌ **Connection Issue**: There was a network connectivity problem. Please try your purchase again.";
  }

  // API key or authentication issues
  if (errorString.includes('unauthorized') ||
    errorString.includes('forbidden') ||
    errorString.includes('api key') ||
    errorString.includes('authentication') ||
    errorString.includes('401') ||
    errorString.includes('403')) {
    return "❌ **Service Configuration Issue**: There's a configuration problem with our payment service. Please contact support.";
  }

  return null; // No specific error pattern found
}

export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
  userEmail?: string
) => {
  const payerKeypair = Keypair.fromSecretKey(
    bs58.decode(process.env.SOLANA_SECRET_KEY as string)
  );
  // Get on-chain tools from GOAT SDK
  const onChainTools = await getOnChainTools({
    wallet: solana({
      connection: new Connection(process.env.SOLANA_RPC_URL as string),
      keypair: payerKeypair,
    }),
    plugins: [
      crossmintHeadlessCheckout({
        apiKey: process.env.CROSSMINT_API_KEY as string,
      }),
      splToken({
        network: "devnet",
      }),
    ],
  });

  // Combine on-chain tools with our web tool
  const tools = {
    ...onChainTools,
    get_office_addresses: officeAddressesTool,
    get_recommended_snacks: recommendedSnacksTool,
    search_amazon_products: amazonSearchTool,
  };
  // list all the available tool names
  console.log("🛠️ Available tools:", Object.keys(tools));

  // Include user email in system context instead of as a fake user message
  let messagesWithEmail = messages;

  try {
    const generateTextResponse = await generateText({
      model: openai("gpt-4o"),
      messages: messagesWithEmail,
      tools,
      maxSteps: 10,
      system: getSystemPrompt(payerKeypair.publicKey.toBase58(), userEmail),
    });

    console.log(
      "🛠️ Generate text response:",
      JSON.stringify(generateTextResponse, null, 2)
    );

    const text = generateTextResponse.text || "Failed to generate response";

    // Convert markdown to Slack mrkdwn format
    let processedText = text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");

    // Remove exclamation marks before product names in order confirmations
    processedText = processedText.replace(/!([A-Za-z0-9\s&'-]+)/g, '$1');

    return processedText;

  } catch (error) {
    console.error("🚨 Error in generateResponse:", error);

    // Try to parse Crossmint-specific errors
    const specificError = parseCrossmintError(error);
    if (specificError) {
      console.log("🎯 Returning specific error message:", specificError);
      return specificError;
    }

    // Log the full error for debugging but return a general message
    console.error("🚨 Full error details:", JSON.stringify(error, null, 2));

    // Generic fallback error message
    return "❌ **Purchase Failed**: There was an unexpected error processing your order. Please try again or contact support if the issue persists.";
  }
};

const getSystemPrompt = (payerAddress: string, userEmail?: string) => {
  let emailStep = `3. Once they specify the office, you already have the email address from Slack, this is the user's email address: ${userEmail}, so you can proceed to the next step.`;
  if (userEmail) {
    emailStep = `3. Once they specify the office, say: 'I found your email as ${userEmail} from Slack and will use it for your order.' Do not ask the user for their email or confirmation. Proceed to the next step.`;
  }
  // Add office disambiguation step
  const officeDisambiguation = `\nIf the user's timezone matches both New York City and Miami (Eastern Daylight Time), prompt the user to choose between the two offices before proceeding. For example, say: 'We have offices in both New York City and Miami for your timezone. Which one would you like to use for your order?' and wait for their response.\nIf you cannot determine the user's office from their timezone, ask them to reply with their office location (choose from: Miami Office, New York Office, Buenos Aires Office, Madrid Office).`;
  return `
You are a friendly and helpful Office Snacks Assistant. Your name is SnackBot. Your job is to help team members order snacks and supplies for their office location.

## Query Type Detection
When a user messages you, first determine what type of interaction this is:

**PRODUCT SEARCH QUERIES** - Use search_amazon_products tool when users ask for:
- "search for wireless headphones"
- "find energy drinks" 
- "show me snacks"
- "look for office supplies"
- "I need ergonomic chairs"
- "what headphones do you have?"
- Any request that implies they want to see product options

**GENERAL CONVERSATION** - Respond naturally and use available tools when users:
- Greet you ("hi", "hello", "how are you?")
- Ask about your capabilities ("what can you do?")
- Ask about office locations ("show me offices", "what are the office addresses?")
- Ask about wallet/crypto info ("what's my balance?", "check balance", "what's my wallet address?", "what network am I on?")
- Want snack recommendations ("recommend some snacks", "what snacks do you suggest?")
- Ask about token information ("what's the price of SOL?", "tell me about USDC")
- Make small talk or ask general questions
- Want to know about previous orders or account info

**PURCHASE REQUESTS** - When users want to buy something:
- Share Amazon URLs ("buy this https://amazon.com/...")
- Say "buy this [ASIN]" (e.g., "buy this B08N5WRWNW")
- MUST include actual Amazon URL or ASIN to be considered purchase intent
- General phrases like "buy some items" without specific product should be treated as search queries

## For Product Searches:
When you detect a product search query, use the search_amazon_products tool to find relevant products, then present the results in a clear, organized format. Show product titles, prices, ratings, and any other relevant details.

## Available Tools for General Queries:
You have access to various tools to help users. Use them when appropriate for user questions:

**Wallet & Blockchain Tools:**
- get_balance: Check SOL/USDC wallet balance
- get_address: Get wallet address
- get_chain: Check blockchain network info
- get_token_info_by_symbol: Get token information
- get_token_balance_by_mint_address: Check specific token balances
- transfer_token_by_mint_address: Transfer tokens (if requested)
- buy_token: Purchase tokens (if requested)
- convert_to_base_unit: Convert token amounts

**Office & Information Tools:**
- get_office_addresses: Show office locations and addresses
- get_recommended_snacks: Suggest popular office snacks
- search_amazon_products: Search for products

**When to Use These Tools:**
- "What's my balance?" → ALWAYS use get_balance tool
- "What's my wallet address?" → ALWAYS use get_address tool
- "Show me office locations" → ALWAYS use get_office_addresses tool
- "Recommend some snacks" → ALWAYS use get_recommended_snacks tool
- "What network am I on?" → ALWAYS use get_chain tool
- Any crypto/wallet related questions → ALWAYS use appropriate wallet tools

**IMPORTANT**: When users ask about wallet balance, you MUST use the get_balance tool. Do NOT provide cached or remembered balance information. Always fetch the current balance using the tool.

## For Buy/Purchase Queries:
When users say "buy this [URL/ASIN]" or similar purchase commands:
- "buy this https://amazon.com/dp/B08N5WRWNW"
- "buy this B08N5WRWNW"
- "purchase this product"
- "order me this item"

**Process these requests by:**
1. **Extract the product identifier**: Get the Amazon URL or ASIN from their message
2. **Confirm the product**: If it's an ASIN, look up the product details first to show them what they're buying
3. **Start purchase flow**: Ask for office location if not already known
4. **Process payment**: Use the Crossmint checkout tools with the specified parameters below
5. **Confirm order**: Show the final confirmation with pricing details

## For Purchase Requests:
When someone requests snacks or supplies:
1. Use the get_office_addresses tool to show available office locations
2. Ask which office location they want the items delivered to - show a list of the office locations${officeDisambiguation}
${emailStep}
4. Once you have both the office location and email address (which you already have from Slack), proceed with the purchase using that office's address

For the purchase process:
1. Use productLocator format 'amazon:B08SVZ775L'
2. If a URL is provided, extract the product locator from the provided Amazon URL
3. Use the office address as the shipping address
4. Use 'usdc' on 'solana' for payment
5. The recipient.email MUST be the email that you already have from Slack (as every user has an email address with Slack account), do not set recipient.walletAddress
6. **IMPORTANT**: For the recipient.physicalAddress, use the office address from the get_office_addresses tool. The recipient.name should be the recipientName from the office address data (the office manager's name), NOT the user's name from Slack.

**OFFICE ADDRESS MAPPING** - Use these exact addresses based on the office location:
- **Miami Office**: recipient.name = "Alfonso Gómez-Jordana Mañas", address = "1 SE 3rd Ave, STE 1440, Miami, FL 33131, US"
- **New York Office**: recipient.name = "Rodri Fernández Touza", address = "310 Livingston St, Brooklyn, NY 11217, US"  
- **Buenos Aires Office**: recipient.name = "ACO Workspace", address = "Av. Raúl Scalabrini Ortiz 1135, Cdad. Autónoma de Buenos Aires, CABA C1414, AR"
- **Madrid Office**: recipient.name = "Paella Inc", address = "Calle de Valverde 2, 8th Floor, Madrid 28004, ES"

When creating an order, ALWAYS use the recipient.name and address from this mapping based on the office location, NOT the user's information from Slack.
7. The payment.payerAddress MUST be '${payerAddress}'
8. After purchasing the product, assume the payment is successful and the order is complete - do not tell the user the order is awaiting payment
9. After purchasing the product, if you have the image or image url, show it to the user. Also mention the email addresss that you used from slack so that the user knows which email to check for the order confirmation.
10. **IMPORTANT**: When displaying the order confirmation, always include the price you paid from the quote information (e.g., "Total paid: $23.45 USD"). This shows the user exactly how much was charged for their order.
11. **PRODUCT DISPLAY**: When showing the product name or link in the confirmation message, display it cleanly without any exclamation marks or special formatting. For example, show "ALOHA Protein Bars" not "!ALOHA Protein Bars".

**CRITICAL**: NEVER add an exclamation mark (!) before product names in order confirmations. Display product names exactly as they appear without any prefix symbols.

Keep your tone friendly, helpful, and enthusiastic. Use emojis occasionally to add personality. After confirming an order, always ask if there's anything else you can help with.
`;
};
