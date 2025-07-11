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
import { getSearchContext } from "./search-context";
import { formatProductBlocksStateless, type Product } from "./amazon-block-formatter";

type GenerateResponseResult = {
  text: string;
  blocks?: any[];
};

export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
  userEmail?: string,
  userId?: string,
  threadTs?: string,
  channelId?: string
): Promise<GenerateResponseResult> => {
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

  // Inject the user's email as a message if available
  let messagesWithEmail = messages;
  if (userEmail) {
    messagesWithEmail = [
      ...messages,
      { role: "user", content: `My email address is ${userEmail}` }
    ];
  }

  // Get search context (thread-scoped or recent)
  const lastSearchQuery = (userId && channelId) ? getSearchContext(threadTs, channelId, userId) : undefined;

  console.log(`🔍 [SEARCH_CONTEXT] Debug info:`, {
    userId,
    channelId,
    threadTs,
    lastSearchQuery,
    userMessage: messages[messages.length - 1]?.content
  });

  const generateTextResponse = await generateText({
    model: openai("gpt-4o"),
    messages: messagesWithEmail,
    tools,
    maxSteps: 10,
    system: getSystemPrompt(payerKeypair.publicKey.toBase58(), userEmail, lastSearchQuery),
  });

  console.log(
    "🛠️ Generate text response:",
    JSON.stringify(generateTextResponse, null, 2)
  );

  // Check if Amazon search tool was used
  const amazonSearchStep = generateTextResponse.steps?.find(
    (step) => step.toolCalls?.some((call) => call.toolName === "search_amazon_products")
  );

  if (amazonSearchStep) {
    // Find the Amazon search tool call and its corresponding result
    const amazonCallIndex = amazonSearchStep.toolCalls?.findIndex(
      (call) => call.toolName === "search_amazon_products"
    );

    if (amazonCallIndex !== undefined && amazonCallIndex >= 0 && amazonSearchStep.toolResults) {
      const amazonCall = amazonSearchStep.toolCalls?.[amazonCallIndex];
      const amazonResult = amazonSearchStep.toolResults[amazonCallIndex];

      if (amazonCall && amazonResult) {
        try {
          // Extract search query and products from the tool result
          const result = typeof amazonResult.result === 'string'
            ? JSON.parse(amazonResult.result)
            : amazonResult.result;

          const { products, query } = result;
          const queryParam = (amazonCall.args as any)?.query || query || "unknown";

          if (products && Array.isArray(products) && products.length > 0) {
            // Format as blocks using the shared utility
            const blocks = formatProductBlocksStateless(
              products as Product[],
              1, // page
              1, // totalPages (AI responses don't paginate)
              queryParam
            );

            return {
              text: `Here are some options for ${queryParam}:`,
              blocks
            };
          }
        } catch (err) {
          console.error("Error parsing Amazon search result:", err);
        }
      }
    }
  }

  const text = generateTextResponse.text || "Failed to generate response";

  // Convert markdown to Slack mrkdwn format
  return {
    text: text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*")
  };
};

const getSystemPrompt = (payerAddress: string, userEmail?: string, lastSearchQuery?: string) => {
  let emailStep = `3. Once they specify the office, you already have the email address from Slack, this is the user's email address: ${userEmail}, so you can proceed to the next step.`;
  if (userEmail) {
    emailStep = `3. Once they specify the office, say: 'I found your email as ${userEmail} from Slack and will use it for your order.' Do not ask the user for their email or confirmation. Proceed to the next step.`;
  }
  // Add office disambiguation step
  const officeDisambiguation = `\nIf the user's timezone matches both New York City and Miami (Eastern Daylight Time), prompt the user to choose between the two offices before proceeding. For example, say: 'We have offices in both New York City and Miami for your timezone. Which one would you like to use for your order?' and wait for their response.\nIf you cannot determine the user's office from their timezone, ask them to reply with their office location (choose from: Miami Office, New York Office, Buenos Aires Office, Madrid Office).`;

  // Add search context information
  const searchContext = lastSearchQuery ? `

🔍 CRITICAL SEARCH CONTEXT: The user recently searched for "${lastSearchQuery}" on Amazon. 

IMPORTANT: If the user mentions ANYTHING related to products, items, colors, specifications, features, brands, or modifications to their search - you MUST use the search_amazon_products tool with a combined query.

Examples that should trigger Amazon search:
- "I want black ones" → search for "${lastSearchQuery} black"
- "looking for something cheaper" → search for "${lastSearchQuery} cheap"  
- "I need wireless" → search for "${lastSearchQuery} wireless"
- "what about red cases" → search for "${lastSearchQuery} red cases"

Do NOT ask for office location or start ordering process unless they explicitly say they want to order a specific product.` : '';

  return `
You are a friendly and helpful Office Snacks Assistant. Your name is SnackBot. Your job is to help team members order snacks and supplies for their office location.${searchContext}

IMPORTANT FLOW RULES:
1. Only start the ordering process when users explicitly say they want to BUY/ORDER a specific product (with Amazon URL or clear product selection)
2. For search refinements, modifications, or general product questions - use search_amazon_products tool to show more results
3. Do NOT ask for office location unless they're ready to make a purchase

When someone requests snacks or supplies FOR SEARCH ONLY:
- Use search_amazon_products tool to find and show products
- Help them refine searches with different queries
- Answer questions about products

When someone wants to BUY/ORDER a specific product (they say "buy this", "order this", provide Amazon URL, or clearly indicate purchase intent):
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
6. The payment.payerAddress MUST be '${payerAddress}'
7. After purchasing the product, assume the payment is successful and the order is complete - do not tell the user the order is awaiting payment
8. After purchasing the product, if you have the image or image url, show it to the user. Also mention the email addresss that you used from slack so that the user knows which email to check for the order confirmation.

Keep your tone friendly, helpful, and enthusiastic. Use emojis occasionally to add personality. After confirming an order, always ask if there's anything else you can help with.
`;
};
