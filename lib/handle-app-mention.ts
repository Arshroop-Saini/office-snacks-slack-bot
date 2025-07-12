import { AppMentionEvent } from "@slack/web-api";
import { client, getThread, getUserEmail, getUserProfile, getOfficeForTimezone } from "./slack-utils";
import { generateResponse } from "./generate-response";
import { amazonSearchTool } from "./tools/amazon-search.tool";

// Product type definition (copied from command.ts)
type Product = {
  title: string;
  url: string;
  image?: string;
  price?: string;
  currency?: string;
  rating?: number;
  ratings_total?: number;
  eta?: string;
  description?: string;
};

// Simple query combination function
function combineQueries(originalQuery: string, refinement: string): string {
  // Simple approach: just combine with a space
  return `${originalQuery} ${refinement}`.trim();
}

// Helper to generate pagination buttons (copied from command.ts)
function getPaginationElements(query: string, page: number, totalPages: number, loading: boolean = false) {
  const elements = [];
  if (page > 1) {
    elements.push({
      type: "button",
      text: { type: "plain_text", text: "Back" },
      value: JSON.stringify({ query, page: page - 1 }),
      action_id: "back_page",
      ...(loading ? { style: "danger", disabled: true } : {})
    });
  }
  if (page < totalPages) {
    elements.push({
      type: "button",
      text: { type: "plain_text", text: "Next" },
      value: JSON.stringify({ query, page: page + 1 }),
      action_id: "next_page",
      ...(loading ? { style: "danger", disabled: true } : {})
    });
  }
  return elements;
}

// Format product blocks for Slack (copied from command.ts)
function formatProductBlocksStateless(products: Product[], page: number, totalPages: number, query: string, loading: boolean = false) {
  const blocks = [];
  // Header
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Amazon Results for:* \`${query}\`  |  *Page:* ${page} of ${totalPages}`,
    },
  });
  // Products
  if (products.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: ":warning: No products found for this page." },
    });
  } else {
    for (const product of products) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*<${product.url}|${product.title}>*\n\n*Price:* ${product.price ?? "N/A"}   *Rating:* ${product.rating ?? "N/A"} (${product.ratings_total ?? "N/A"})\n*ETA:* ${product.eta ?? "N/A"}`,
        },
        accessory: product.image ? {
          type: "image",
          image_url: product.image,
          alt_text: product.title,
        } : undefined,
      });
      blocks.push({ type: "divider" });
    }
  }
  // Pagination controls
  const elements = getPaginationElements(query, page, totalPages, loading);
  if (elements.length > 0) {
    blocks.push({ type: "actions", elements });
  }
  return blocks;
}

const updateStatusUtil = async (
  initialStatus: string,
  event: AppMentionEvent,
) => {
  const initialMessage = await client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts ?? event.ts,
    text: initialStatus,
  });

  if (!initialMessage || !initialMessage.ts)
    throw new Error("Failed to post initial message");

  const updateMessage = async (status: string) => {
    try {
      console.log("Updating message with status:", status);
      await client.chat.update({
        channel: event.channel,
        ts: initialMessage.ts as string,
        text: status,
      });
      console.log("Message updated successfully");
    } catch (error) {
      console.error("Error updating message:", error);
      // If update fails, try to post a new message
      try {
        await client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.thread_ts ?? event.ts,
          text: status,
        });
        console.log("Posted new message as fallback");
      } catch (fallbackError) {
        console.error("Fallback message posting failed:", fallbackError);
      }
    }
  };
  return updateMessage;
};

export async function handleNewAppMention(
  event: AppMentionEvent,
  botUserId: string,
) {
  console.log("Handling app mention");
  if (event.bot_id || event.bot_id === botUserId || event.bot_profile) {
    console.log("Skipping app mention");
    return;
  }

  const { thread_ts, channel, user } = event;
  // Use event.ts if thread_ts is missing (for new messages)
  const rootTs = thread_ts || (event as any).ts;
  if (!rootTs) {
    console.error('[ERROR] No valid thread_ts or ts found in event:', event);
    return;
  }

  try {
    const updateMessage = await updateStatusUtil("is thinking...", event);

    // NEW: Test Amazon query extraction functionality
    // Check if this thread contains Amazon search results
    const threadMessages = await getThread(channel, rootTs, botUserId);
    const botResponseMessage = threadMessages.find(msg =>
      msg.role === 'assistant' &&
      typeof msg.content === 'string' &&
      msg.content.includes('Amazon search results for')
    );

    if (botResponseMessage && typeof botResponseMessage.content === 'string') {
      console.log("[DEBUG] Found bot response message:", botResponseMessage.content);
      const match = botResponseMessage.content.match(/Amazon search results for "([^"]+)":/);
      if (match) {
        const originalQuery = match[1].trim(); // Extract from quotes
        console.log("[DEBUG] Extracted original query:", originalQuery);

        // Extract refinement text from user's mention
        const refinementText = event.text?.replace(`<@${botUserId}>`, '').trim() || '';
        console.log("[DEBUG] User refinement text:", refinementText);

        // Check if user's message contains an Amazon URL - if so, let it fall through to buying flow
        const amazonUrlPattern = /amazon\.com\/.*\/dp\/|amazon\.com\/dp\/|amzn\.to\/|a\.co\//i;
        if (amazonUrlPattern.test(refinementText)) {
          console.log("[DEBUG] User message contains Amazon URL - skipping refinement, using normal buying flow");
          // Don't return early - let it fall through to normal buying flow
        } else {
          // This is a refinement request, not a buying request
          console.log("[DEBUG] User message is refinement request - executing refined search");

          // Combine original query with refinement
          const combinedQuery = combineQueries(originalQuery, refinementText);
          console.log("[DEBUG] Combined query:", combinedQuery);

          // Execute Amazon search with combined query
          try {
            const perPage = 5;
            const page = 1;
            const { products, pagination } = await amazonSearchTool.execute({
              query: combinedQuery,
              page,
              perPage
            });

            if (!products.length) {
              await client.chat.postMessage({
                channel: channel,
                thread_ts: rootTs,
                text: `No products found for refined search: "${combinedQuery}"`
              });
              await updateMessage("No products found for refined search");
              return;
            }

            const totalPages = pagination && pagination.other_pages ? Object.keys(pagination.other_pages).length + 1 : 1;
            const blocks = formatProductBlocksStateless(products.slice(0, 5), page, totalPages, combinedQuery);

            // Post results using blocks (same as /amazon command)
            await client.chat.postMessage({
              channel: channel,
              thread_ts: rootTs,
              text: `Refined Amazon search results for "${combinedQuery}":`,
              blocks,
              unfurl_links: false
            });

            await updateMessage("Refined search completed");
            return;

          } catch (err) {
            console.error("[DEBUG] Error in refined Amazon search:", err);
            await client.chat.postMessage({
              channel: channel,
              thread_ts: rootTs,
              text: `Sorry, there was an error with your refined search. Please try again.`
            });
            await updateMessage("Error in refined search");
            return;
          }
        }
      }
    }

    // Fetch user profile (email, timezone)
    let userEmail: string | undefined = undefined;
    let userTz: string | null = null;
    let userTzLabel: string | null = null;
    let office: string | undefined = undefined;
    // Check if the user's message contains a valid office name
    const officeNames = [
      "Miami Office",
      "New York Office",
      "Buenos Aires Office",
      "Madrid Office"
    ];
    let officeFromMessage: string | undefined = undefined;
    if (event.text) {
      for (const name of officeNames) {
        if (event.text.toLowerCase().includes(name.toLowerCase())) {
          officeFromMessage = name;
          break;
        }
      }
    }
    if (officeFromMessage) {
      office = officeFromMessage;
    } else if (user) {
      const profile = await getUserProfile(user);
      console.log("[DEBUG] AppMention user profile:", profile);
      userEmail = profile.email || undefined;
      userTz = profile.tz;
      userTzLabel = profile.tz_label;
      const offices = getOfficeForTimezone(userTz, userTzLabel);
      console.log("[DEBUG] Office candidates:", offices);
      if (offices.length === 1) {
        office = offices[0];
      } else if (offices.length > 1) {
        // Ambiguous: prompt user to choose
        await client.chat.postMessage({
          channel,
          thread_ts: rootTs,
          text: `We have offices in both New York City and Miami for your timezone. Which one would you like to use for your order?`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `We have offices in both *New York City* and *Miami* for your timezone. Which one would you like to use for your order?`,
              },
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "New York City" },
                  value: "New York City",
                  action_id: "select_office_nyc"
                },
                {
                  type: "button",
                  text: { type: "plain_text", text: "Miami" },
                  value: "Miami",
                  action_id: "select_office_miami"
                }
              ]
            }
          ]
        });
        return;
      } else {
        // Not in any known timezone: ask user to reply with their office
        await client.chat.postMessage({
          channel,
          thread_ts: rootTs,
          text: `I couldn't detect your office location from your timezone. Please reply with your office location (choose from: Miami Office, New York Office, Buenos Aires Office, Madrid Office).`,
        });
        return;
      }
    }

    // After office is determined, always fetch user email if not already set
    if (!userEmail && user) {
      const profile = await getUserProfile(user);
      userEmail = profile.email || undefined;
    }

    // Ensure channel and thread_ts are strings
    const safeChannel = channel || "";
    const safeThreadTs = rootTs;

    const messages = await getThread(safeChannel, safeThreadTs, botUserId);
    let result = await generateResponse(messages, updateMessage, userEmail ?? undefined);
    console.log("Generated response for app mention:", result);

    await client.chat.postMessage({
      channel: safeChannel,
      thread_ts: safeThreadTs,
      text: result,
      unfurl_links: false,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: result,
          },
        },
      ],
    });

    await updateMessage("");
  } catch (error) {
    console.error("Error in handleNewAppMention:", error);
    try {
      await client.chat.postMessage({
        channel: channel,
        thread_ts: thread_ts,
        text: "Sorry, I encountered an error while processing your request. Please try again.",
      });
    } catch (errorPostingError) {
      console.error("Failed to post error message:", errorPostingError);
    }
  }
}
