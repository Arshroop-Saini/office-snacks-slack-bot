import { generateResponse } from "./generate-response";
import { client } from "./slack-utils";
import { getSearchContext } from "./search-context";
import { amazonSearchTool } from "./tools/amazon-search.tool";
import { formatProductBlocksStateless } from "./amazon-block-formatter";
import type { AppMentionEvent } from "@slack/web-api";

/**
 * Scan thread messages to find original Amazon search query
 */
async function findOriginalSearchInThread(channelId: string, threadTs: string): Promise<string | undefined> {
  try {
    console.log(`[THREAD_SCAN] 🔍 Scanning thread ${threadTs} for original search...`);

    // Get thread messages
    const result = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 20 // Increase limit to catch more messages
    });

    if (!result.messages) {
      console.log(`[THREAD_SCAN] ❌ No messages found in thread`);
      return undefined;
    }

    console.log(`[THREAD_SCAN] 📋 Found ${result.messages.length} messages in thread`);

    // Look through ALL messages (not just bot messages)
    for (let i = 0; i < result.messages.length; i++) {
      const message = result.messages[i];
      console.log(`[THREAD_SCAN] 📝 Message ${i}:`, {
        bot_id: message.bot_id,
        user: message.user,
        text: message.text?.substring(0, 100) + '...',
        hasBlocks: !!message.blocks,
        blocksCount: message.blocks?.length || 0
      });

      const text = message.text || '';

      // Pattern 1: Look for "Amazon search results for" in ANY message
      const searchMatch = text.match(/Amazon search results for "([^"]+)"/);
      if (searchMatch) {
        const originalQuery = searchMatch[1];
        console.log(`[THREAD_SCAN] ✅ Found original search in text: "${originalQuery}"`);
        return originalQuery;
      }

      // Pattern 2: Look for slash command usage "/amazon query"
      const slashMatch = text.match(/\/amazon\s+(.+)/);
      if (slashMatch) {
        const originalQuery = slashMatch[1].trim();
        console.log(`[THREAD_SCAN] ✅ Found slash command: "${originalQuery}"`);
        return originalQuery;
      }

      // Pattern 3: Check blocks for search query (in buttons/actions)
      if (message.blocks) {
        const blocksText = JSON.stringify(message.blocks);
        console.log(`[THREAD_SCAN] 🔍 Checking blocks:`, blocksText.substring(0, 200) + '...');

        // Look for query in button values or action values
        const patterns = [
          /"query":"([^"]+)"/,
          /"value":"[^"]*query[^"]*:([^"]+)"/,
          /"text":"Amazon search results for ([^"]+)"/
        ];

        for (const pattern of patterns) {
          const blockSearchMatch = blocksText.match(pattern);
          if (blockSearchMatch) {
            const originalQuery = blockSearchMatch[1];
            console.log(`[THREAD_SCAN] ✅ Found original search in blocks: "${originalQuery}"`);
            return originalQuery;
          }
        }
      }
    }

    console.log(`[THREAD_SCAN] ❌ No Amazon search found in ${result.messages.length} messages`);
    return undefined;

  } catch (error) {
    console.error(`[THREAD_SCAN] ❌ Error scanning thread:`, error);
    return undefined;
  }
}

/**
 * Fast follow-up search handler - bypasses AI for instant results
 */
async function handleFollowUpSearch(
  event: AppMentionEvent,
  userMessage: string,
  searchContext: { query: string, page: number }
): Promise<boolean> {
  console.log(`[FOLLOW_UP] 🚀 Fast follow-up search: "${searchContext.query}" + "${userMessage}"`);

  try {
    // Combine original query with user refinement
    const enhancedQuery = `${searchContext.query} ${userMessage}`;
    console.log(`[FOLLOW_UP] 🔍 Enhanced query: "${enhancedQuery}"`);

    // Call Amazon API directly (same as slash command)
    const { products, pagination } = await amazonSearchTool.execute({
      query: enhancedQuery,
      page: 1,
      perPage: 5
    });

    if (!products.length) {
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts || event.ts,
        text: `No products found for "${enhancedQuery}".`
      });
      return true;
    }

    // Use exact same formatting as slash command
    const totalPages = pagination && pagination.other_pages ? Object.keys(pagination.other_pages).length + 1 : 1;
    const blocks = formatProductBlocksStateless(products.slice(0, 5), 1, totalPages, enhancedQuery);

    await client.chat.postMessage({
      channel: event.channel,
      thread_ts: event.thread_ts || event.ts,
      text: `Amazon search results for "${enhancedQuery}":`,
      blocks
    });

    console.log(`[FOLLOW_UP] ✅ Fast search complete: ${products.length} products found`);
    return true;

  } catch (error) {
    console.error("[FOLLOW_UP] ❌ Fast search failed:", error);
    return false; // Fall back to AI
  }
}

/**
 * Smart fallback to detect search intent without thread context
 */
function detectSearchIntent(userMessage: string): string | undefined {
  const msg = userMessage.toLowerCase();

  // Common patterns for product refinements
  const patterns = [
    { keywords: ['black', 'white', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'gray', 'grey', 'silver', 'gold'], base: 'phone cases' },
    { keywords: ['case', 'cases', 'cover', 'covers'], base: 'phone cases' },
    { keywords: ['headphone', 'headphones', 'earphone', 'earphones', 'earbuds'], base: 'headphones' },
    { keywords: ['water', 'bottle', 'bottles'], base: 'water bottles' },
    { keywords: ['snack', 'snacks', 'food'], base: 'snacks' },
    { keywords: ['charger', 'charging', 'cable'], base: 'phone chargers' },
    { keywords: ['laptop', 'computer'], base: 'laptop accessories' },
  ];

  for (const pattern of patterns) {
    if (pattern.keywords.some(keyword => msg.includes(keyword))) {
      console.log(`[SMART_FALLBACK] 🎯 Detected "${pattern.base}" from message: "${userMessage}"`);
      return pattern.base;
    }
  }

  return undefined;
}

export const handleAppMention = async (
  event: AppMentionEvent,
  updateStatus?: (status: string) => void
) => {
  try {
    const userMessage = event.text.replace(/<@[^>]+>/g, '').trim();
    console.log("📝 User message in app mention:", userMessage);

    // FAST PATH: Check for follow-up search context (thread only)
    if (event.thread_ts && event.user) {
      let searchContext = getSearchContext(event.thread_ts, event.channel, event.user);

      // If no context in storage, try multiple fallback methods
      if (!searchContext) {
        console.log(`[FOLLOW_UP] 🔍 No storage context, trying fallback methods...`);

        // Method 1: Scan thread messages for original search
        let originalQuery = await findOriginalSearchInThread(event.channel, event.thread_ts);

        // Method 2: Smart pattern detection if thread scan fails
        if (!originalQuery) {
          originalQuery = detectSearchIntent(userMessage);
        }

        if (originalQuery) {
          searchContext = { query: originalQuery, page: 1 };
          console.log(`[FOLLOW_UP] 🎯 Found search context via fallback: "${originalQuery}"`);
        }
      }

      if (searchContext) {
        console.log(`[FOLLOW_UP] 🎯 Using search context: "${searchContext.query}"`);

        // Try fast follow-up search (bypass AI)
        const handled = await handleFollowUpSearch(event, userMessage, searchContext);
        if (handled) {
          return; // Success! Exit early
        }
        console.log(`[FOLLOW_UP] ⚠️ Fast search failed, falling back to AI`);
      } else {
        console.log(`[FOLLOW_UP] ❌ No search context found in storage or thread`);
      }
    }

    // SLOW PATH: Fall back to AI for normal conversations and buying
    console.log(`[APP_MENTION] 🤖 Using AI for: "${userMessage}"`);

    // Get user profile to fetch email
    let userEmail: string | undefined;
    if (event.user) {
      try {
        const userInfo = await client.users.info({ user: event.user });
        userEmail = userInfo.user?.profile?.email || undefined;
        console.log("📧 User email from profile:", userEmail);
      } catch (error) {
        console.error("Failed to fetch user email:", error);
      }
    }

    // Generate AI response with thread context
    const response = await generateResponse(
      [{ role: "user", content: userMessage }],
      updateStatus,
      userEmail,
      event.user,
      event.thread_ts || event.ts, // Use thread_ts if available, otherwise event.ts
      event.channel
    );

    // Send response with blocks if available
    const messagePayload: any = {
      channel: event.channel,
      thread_ts: event.thread_ts || event.ts,
    };

    if (response.blocks) {
      messagePayload.blocks = response.blocks;
      messagePayload.text = response.text; // Fallback text for notifications
    } else {
      messagePayload.text = response.text;
    }

    console.log("[SLACK] Posting message payload:", JSON.stringify(messagePayload, null, 2));
    await client.chat.postMessage(messagePayload);
  } catch (error) {
    console.error("Error in app mention handler:", error);
    await client.chat.postMessage({
      channel: event.channel,
      thread_ts: event.thread_ts || event.ts,
      text: "Sorry, I encountered an error processing your request. Please try again.",
    });
  }
};
