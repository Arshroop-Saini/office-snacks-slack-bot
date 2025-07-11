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
      limit: 10 // Only check recent messages
    });

    if (!result.messages) {
      console.log(`[THREAD_SCAN] ❌ No messages found in thread`);
      return undefined;
    }

    // Look for bot messages with Amazon search results
    for (const message of result.messages) {
      if (message.bot_id) {
        const text = message.text || '';

        // Check for "Amazon search results for" pattern
        const searchMatch = text.match(/Amazon search results for "([^"]+)"/);
        if (searchMatch) {
          const originalQuery = searchMatch[1];
          console.log(`[THREAD_SCAN] ✅ Found original search: "${originalQuery}"`);
          return originalQuery;
        }

        // Also check blocks for search query
        if (message.blocks) {
          const blocksText = JSON.stringify(message.blocks);
          const blockSearchMatch = blocksText.match(/"query":"([^"]+)"/);
          if (blockSearchMatch) {
            const originalQuery = blockSearchMatch[1];
            console.log(`[THREAD_SCAN] ✅ Found original search in blocks: "${originalQuery}"`);
            return originalQuery;
          }
        }
      }
    }

    console.log(`[THREAD_SCAN] ❌ No Amazon search found in thread`);
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

      // If no context in storage, scan thread messages for original search
      if (!searchContext) {
        console.log(`[FOLLOW_UP] 🔍 No storage context, scanning thread messages...`);
        const originalQuery = await findOriginalSearchInThread(event.channel, event.thread_ts);
        if (originalQuery) {
          searchContext = { query: originalQuery, page: 1 };
          console.log(`[FOLLOW_UP] 🎯 Found search context via thread scan: "${originalQuery}"`);
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
