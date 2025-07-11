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
  const searchContext = (userId && channelId) ? getSearchContext(threadTs, channelId, userId) : undefined;
  const lastSearchQuery = searchContext?.query;

  // Get the last message for debugging and fallback detection
  const lastMessage = messages[messages.length - 1];

  console.log(`🔍 [SEARCH_CONTEXT] Debug info:`, {
    userId,
    channelId,
    threadTs,
    lastSearchQuery,
    userMessage: typeof lastMessage?.content === 'string' ? lastMessage.content : '[non-text content]'
  });

  // Fallback: detect search refinements even without explicit context
  let fallbackSearchContext = undefined;
  const userMessage = (typeof lastMessage?.content === 'string' ? lastMessage.content : '').toLowerCase();

  // IMPROVED: More specific and faster fallback detection
  if (!lastSearchQuery) {
    // Quick pattern matching for common refinement phrases
    if (/\b(black|white|red|blue|green|yellow|pink|purple|orange|gray|grey|silver|gold)\b/.test(userMessage)) {
      if (/\b(case|cases|cover|covers)\b/.test(userMessage)) {
        fallbackSearchContext = 'phone cases';
      } else if (/\b(headphone|headphones|earphone|earphones|earbuds)\b/.test(userMessage)) {
        fallbackSearchContext = 'headphones';
      } else if (/\b(water|bottle|bottles)\b/.test(userMessage)) {
        fallbackSearchContext = 'water bottles';
      } else {
        // Generic product search based on color
        const colorMatch = userMessage.match(/\b(black|white|red|blue|green|yellow|pink|purple|orange|gray|grey|silver|gold)\b/);
        if (colorMatch) {
          fallbackSearchContext = `${colorMatch[0]} products`;
        }
      }
    }

    if (fallbackSearchContext) {
      console.log(`🔍 [FALLBACK] Detected refinement without context, using: "${fallbackSearchContext}"`);
    }
  }

  const searchQuery = lastSearchQuery || fallbackSearchContext;

  const generateTextResponse = await generateText({
    model: openai("gpt-4o"),
    messages: messagesWithEmail,
    tools,
    maxSteps: 3, // Reduce from 5 to 3 to prevent timeouts
    system: getSystemPrompt(payerKeypair.publicKey.toBase58(), userEmail, searchQuery, userId),
  });

  console.log("[AI] Finished generateText call. Response:", JSON.stringify(generateTextResponse, null, 2));

  console.log(
    "🛠️ Generate text response:",
    JSON.stringify(generateTextResponse, null, 2)
  );

  // Check if Amazon search tool was used
  const amazonSearchStep = generateTextResponse.steps?.find(
    (step) => step.toolCalls?.some((call) => call.toolName === "search_amazon_products")
  );

  let blocks: any[] | undefined;
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
          const queryParam = String((amazonCall.args as any)?.query || query || "unknown");

          if (products && Array.isArray(products) && products.length > 0) {
            // Extract pagination info from the result
            const pagination = result.pagination || {};
            const currentPage = result.page || 1;

            // Calculate total pages from SearchApi.io pagination
            let totalPages = 1;
            if (pagination.other_pages && typeof pagination.other_pages === 'object') {
              const pageNumbers = Object.keys(pagination.other_pages).map(p => parseInt(p)).filter(p => !isNaN(p));
              if (pageNumbers.length > 0) {
                totalPages = Math.max(currentPage, ...pageNumbers);
              }
            }

            // Limit to 5 products for consistent formatting
            const displayProducts = products.slice(0, 5);

            // Format as blocks using the shared utility with proper pagination
            blocks = formatProductBlocksStateless(
              displayProducts as Product[],
              currentPage,
              totalPages,
              queryParam
            );
          }
        } catch (err) {
          console.error("Error parsing Amazon search result:", err);
        }
      }
    }
  }

  const text = generateTextResponse.text || "Failed to generate response";

  // Convert markdown to Slack mrkdwn format
  const responseObj = {
    text: text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*"),
    ...(blocks ? { blocks } : {})
  };
  console.log("[AI] Returning response to handler:", JSON.stringify(responseObj, null, 2));
  return responseObj;
};

const getSystemPrompt = (payerAddress: string, userEmail?: string, lastSearchQuery?: string, userId?: string) => {
  let emailStep = `3. Once they specify the office, you already have the email address from Slack, this is the user's email address: ${userEmail}, so you can proceed to the next step.`;
  if (userEmail) {
    emailStep = `3. Once they specify the office, say: 'I found your email as ${userEmail} from Slack and will use it for your order.' Do not ask the user for their email or confirmation. Proceed to the next step.`;
  }
  // Add office disambiguation step
  const officeDisambiguation = `\nIf the user's timezone matches both New York City and Miami (Eastern Daylight Time), prompt the user to choose between the two offices before proceeding. For example, say: 'We have offices in both New York City and Miami for your timezone. Which one would you like to use for your order?' and wait for their response.\nIf you cannot determine the user's office from their timezone, ask them to reply with their office location (choose from: Miami Office, New York Office, Buenos Aires Office, Madrid Office).`;

  // Add search context information
  const searchContext = lastSearchQuery ? `

🔍 CRITICAL SEARCH CONTEXT: The user recently searched for "${lastSearchQuery}" on Amazon. 

MANDATORY BEHAVIOR: When the user mentions ANY product attribute, color, feature, or modification, you MUST automatically combine it with their previous search and use search_amazon_products immediately. DO NOT ask for clarification.

AUTOMATIC SEARCH COMBINATIONS (examples):
- Previous: "iphone 15 cases" + User: "black case" → IMMEDIATELY search for "iphone 15 cases black"
- Previous: "sparkling water" + User: "non-flavored ones" → IMMEDIATELY search for "sparkling water non-flavored" 
- Previous: "bluetooth headphones" + User: "wireless" → IMMEDIATELY search for "bluetooth headphones wireless"
- Previous: "office chairs" + User: "ergonomic" → IMMEDIATELY search for "office chairs ergonomic"
- Previous: "protein bars" + User: "chocolate ones" → IMMEDIATELY search for "protein bars chocolate"

NEVER ask "what type of X are you looking for?" when the user already searched for X. Just combine and search immediately.

Current user search was: "${lastSearchQuery}" - any mention of features/colors/attributes should be combined with this automatically.` : '';

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
1. Use the get_office_addresses tool with userId: "${userId || 'unknown'}" to automatically detect their timezone and suggest appropriate offices
2. If the tool suggests one office, proceed with that office. If it suggests multiple offices (like NYC and Miami for Eastern timezone), ask the user to choose between them. If no office matches their timezone, show all available offices and ask them to choose.
${emailStep}
3. Once you have both the office location and email address (which you already have from Slack), proceed with the purchase using that office's address

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
