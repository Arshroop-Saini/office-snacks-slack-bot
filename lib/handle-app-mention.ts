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
  asin?: string;
};

// ASIN Detection and Validation Functions (copied from command.ts)
function isASIN(query: string): boolean {
  const asinPattern = /^B[0-9A-Z]{9}$/;
  return asinPattern.test(query.trim().toUpperCase());
}

function validateASIN(asin: string): { valid: boolean; normalized: string } {
  const normalized = asin.trim().toUpperCase();
  return {
    valid: /^B[0-9A-Z]{9}$/.test(normalized) && normalized.length === 10,
    normalized
  };
}

// Note: Query combination removed - all searches are now independent

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
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*<${product.url}|${product.title}>*\n\n*Price:* ${product.price ?? "N/A"}   *Rating:* ${product.rating ?? "N/A"} (${product.ratings_total ?? "N/A"})\n*ETA:* ${product.eta ?? "N/A"}\n*ASIN:* ${product.asin ?? "N/A"}`,
        },
        accessory: product.image ? {
          type: "image",
          image_url: product.image,
          alt_text: product.title,
        } : undefined,
      });

      // Add "Select This" button for each product
      if (product.asin) {
        blocks.push({
          type: "actions",
          elements: [{
            type: "button",
            text: {
              type: "plain_text",
              text: "🛒 Select This",
              emoji: true
            },
            value: JSON.stringify({
              asin: product.asin,
              productIndex: i,
              productTitle: product.title
            }),
            action_id: `select_product_${i}`,
            style: "primary"
          }]
        });
      }

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

  const { thread_ts, channel, user, ts } = event;
  // Use event.ts if thread_ts is missing (for new messages)
  const rootTs = thread_ts || ts;
  if (!rootTs) {
    console.error('[ERROR] No valid thread_ts or ts found in event:', event);
    return;
  }

  try {
    const updateMessage = await updateStatusUtil("is thinking...", event);

    // Extract user's message text
    const userMessageText = event.text?.replace(`<@${botUserId}>`, '').trim() || '';
    console.log("[DEBUG] User message text:", userMessageText);

    // Check if this is in a thread (not main channel/DM)
    const isInThread = !!thread_ts && thread_ts !== ts;
    console.log("[DEBUG] Is in thread:", isInThread);

    // Check for purchase intent (allow buy flow everywhere)
    const amazonLinkPattern = /(amazon\.com|amazon\.co\.|amzn\.to|amazon\.ca|amazon\.de|amazon\.fr|amazon\.it|amazon\.es|amazon\.in|amazon\.com\.au|amazon\.com\.br|amazon\.com\.mx|amazon\.co\.jp)/i;
    const containsAmazonLink = amazonLinkPattern.test(userMessageText);

    const buyThisPattern = /buy\s+(this|me this)\s+([A-Z0-9\s]+)/i;
    const buyThisMatch = userMessageText.match(buyThisPattern);
    let containsAsinBuy = false;
    if (buyThisMatch) {
      const potentialAsin = buyThisMatch[2].trim();
      if (isASIN(potentialAsin)) {
        containsAsinBuy = true;
      }
    }

    const buyIntentPattern = /\b(buy|purchase|order|get me)\b/i;
    const containsBuyIntent = buyIntentPattern.test(userMessageText);

    const isPurchaseRequest = containsAmazonLink || containsAsinBuy || containsBuyIntent;
    console.log("[DEBUG] Is purchase request:", isPurchaseRequest);

    // Check for search queries that should be restricted to threads only
    const isProductSearchQuery = !isPurchaseRequest && /\b(search|find|look for|show me)\s+(products?|items?|snacks?|headphones?|electronics?|supplies?)\b/i.test(userMessageText);
    console.log("[DEBUG] Is product search query:", isProductSearchQuery);

    // If not in a thread and it's a product search query, silently ignore
    if (!isInThread && isProductSearchQuery) {
      console.log("[DEBUG] Product search query in main channel/DM - ignoring silently");
      return;
    }

    // If it's not a purchase request and not a restricted search query, use natural conversation
    if (!isPurchaseRequest && !isProductSearchQuery) {
      console.log("[DEBUG] Natural conversation detected - switching to chatbot mode");
      await updateMessage("💭 Thinking...");

      // Get thread history for context
      const threadMessages = await getThread(channel, rootTs, botUserId);

      // Get user profile for email
      const userProfile = user ? await getUserProfile(user) : null;
      const userEmail = userProfile?.email;

      // Generate natural response using the bot's AI
      const response = await generateResponse(
        threadMessages,
        (status) => updateMessage(status),
        userEmail ?? undefined
      );

      await updateMessage(response);
      return;
    }

    console.log("[DEBUG] Proceeding with purchase flow or thread-based search");

    // PRIORITY CHECK: Is this continuing an ongoing purchase flow?
    const threadMessages = await getThread(channel, rootTs, botUserId);

    // Check if purchase flow is active (not completed)
    const hasActivePurchaseFlow = threadMessages.some(msg =>
      msg.role === 'assistant' &&
      typeof msg.content === 'string' &&
      (msg.content.includes('office location') ||
        msg.content.includes('choose from:') ||
        (msg.content.includes('Processing') && msg.content.includes('purchase')))
    );

    // Check if purchase flow was completed (order placed)
    const hasPurchaseCompleted = threadMessages.some(msg =>
      msg.role === 'assistant' &&
      typeof msg.content === 'string' &&
      (msg.content.includes('Order confirmed') ||
        msg.content.includes('order is complete') ||
        msg.content.includes('purchase successful') ||
        msg.content.includes('✅'))
    );

    const isOfficeSelection = ["Miami Office", "New York Office", "Buenos Aires Office", "Madrid Office", "Miami", "New York", "Buenos Aires", "Madrid"].some(office =>
      userMessageText.toLowerCase().includes(office.toLowerCase())
    );

    // Purchase flow state logic
    if (hasActivePurchaseFlow && !hasPurchaseCompleted && isOfficeSelection) {
      console.log("[DEBUG] PURCHASE CONTINUATION: Office selection for ongoing purchase - bypassing intent analysis");
      await updateMessage("Processing office selection...");
      // Skip ALL intent analysis and go directly to purchase flow
    } else if (hasPurchaseCompleted) {
      console.log("[DEBUG] PURCHASE COMPLETED: Previous purchase completed - resuming intent analysis for new requests");
      console.log("[DEBUG] INTENT ANALYSIS: Analyzing intent for new request");
    } else {
      console.log("[DEBUG] INTENT ANALYSIS: No active purchase flow - analyzing intent for new request");

      // Check if user's message contains an Amazon link
      const amazonLinkPattern = /(amazon\.com|amazon\.co\.|amzn\.to|amazon\.ca|amazon\.de|amazon\.fr|amazon\.it|amazon\.es|amazon\.in|amazon\.com\.au|amazon\.com\.br|amazon\.com\.mx|amazon\.co\.jp)/i;
      const containsAmazonLink = amazonLinkPattern.test(userMessageText);
      console.log("[DEBUG] Contains Amazon link:", containsAmazonLink);

      // Check if user's message contains "buy this" with an ASIN
      const buyThisPattern = /buy\s+(this|me this)\s+([A-Z0-9\s]+)/i;
      const buyThisMatch = userMessageText.match(buyThisPattern);
      let containsAsinBuy = false;
      let asinFromBuyMessage = '';

      if (buyThisMatch) {
        const potentialAsin = buyThisMatch[2].trim();
        if (isASIN(potentialAsin)) {
          containsAsinBuy = true;
          asinFromBuyMessage = potentialAsin;
          console.log("[DEBUG] ASIN buy detected:", asinFromBuyMessage);
        }
      }

      // Check for general buy intent keywords
      const buyIntentPattern = /\b(buy|purchase|order|get me)\b/i;
      const containsBuyIntent = buyIntentPattern.test(userMessageText);
      console.log("[DEBUG] Contains buy intent:", containsBuyIntent);

      // Determine if this is a purchase request or a refinement query
      const isPurchaseRequest = containsAmazonLink || containsAsinBuy || containsBuyIntent;
      console.log("[DEBUG] Is purchase request:", isPurchaseRequest);

      if (isPurchaseRequest) {
        console.log("[DEBUG] PURCHASE FLOW: Processing purchase request");

        if (containsAmazonLink) {
          console.log("[DEBUG] Amazon link detected - proceeding with normal buying flow");
          await updateMessage("Processing Amazon link for purchase...");
          // Continue to office detection and purchase flow
        } else if (containsAsinBuy) {
          console.log("[DEBUG] ASIN buy detected - fetching product details and proceeding with buying flow");
          await updateMessage("Looking up product details for purchase...");

          try {
            // Validate ASIN first
            const validation = validateASIN(asinFromBuyMessage);
            if (!validation.valid) {
              await client.chat.postMessage({
                channel,
                thread_ts: rootTs,
                text: `❌ Invalid ASIN format. ASINs should be 10 characters starting with 'B' (e.g., B0DWQC12R5).`
              });
              return;
            }

            // Fetch product details using SearchAPI
            const { products } = await amazonSearchTool.execute({
              query: validation.normalized,
              page: 1,
              perPage: 1
            });

            if (!products.length) {
              await client.chat.postMessage({
                channel,
                thread_ts: rootTs,
                text: `❌ Product with ASIN \`${validation.normalized}\` not found on Amazon US. Please verify the ASIN or try a different search.`
              });
              return;
            }

            // Extract the Amazon URL from the product
            const productUrl = products[0].url;
            console.log("[DEBUG] Found product URL for ASIN:", productUrl);

            // Replace the user's message with Amazon URL format for the buying flow
            // This allows the existing Crossmint tools to process it correctly
            if (buyThisMatch && event.text) {
              event.text = event.text.replace(buyThisMatch[0], `buy this ${productUrl}`);
              console.log("[DEBUG] Modified user message for buying flow:", event.text);
            }

            await updateMessage("Processing ASIN purchase...");
            // Continue to office detection and purchase flow
          } catch (error) {
            console.error("[DEBUG] Error in ASIN buy lookup:", error);
            await client.chat.postMessage({
              channel,
              thread_ts: rootTs,
              text: "Sorry, there was an error looking up that ASIN for purchase. Please try again later."
            });
            return;
          }
        } else {
          console.log("[DEBUG] General buy intent detected - proceeding with buying flow");
          await updateMessage("Processing purchase request...");
          // Continue to office detection and purchase flow
        }

        // Purchase requests continue to office detection logic below
        console.log("[DEBUG] PURCHASE FLOW: Continuing to office detection and purchase processing");
      } else {
        console.log("[DEBUG] REFINEMENT FLOW: Not a purchase request - checking for refinement scenario");

        // SIMPLIFIED LOGIC: All non-purchase mentions in threads = Independent search
        console.log("[DEBUG] INDEPENDENT SEARCH: Treating user message as standalone search query");

        // Check if user message is an ASIN query
        const isAsinQuery = isASIN(userMessageText.trim());
        if (isAsinQuery) {
          console.log("[DEBUG] ASIN query detected in thread:", userMessageText);
          const validation = validateASIN(userMessageText.trim());
          if (!validation.valid) {
            await client.chat.postMessage({
              channel: channel,
              thread_ts: rootTs,
              text: `❌ Invalid ASIN format. ASINs should be 10 characters starting with 'B' (e.g., B0DWQC12R5).`
            });
            return;
          }

          // Execute ASIN lookup
          try {
            const { products } = await amazonSearchTool.execute({
              query: validation.normalized,
              page: 1,
              perPage: 1
            });

            if (!products.length) {
              await client.chat.postMessage({
                channel: channel,
                thread_ts: rootTs,
                text: `❌ Product with ASIN \`${validation.normalized}\` not found on Amazon US. Please verify the ASIN or try a different search.`
              });
              return;
            }

            // Format single product (no pagination for ASIN)
            const blocks = formatProductBlocksStateless([products[0]], 1, 1, validation.normalized, false);
            await client.chat.postMessage({
              channel: channel,
              thread_ts: rootTs,
              text: `Product Details for ASIN: \`${validation.normalized}\``,
              blocks,
            });
            return;
          } catch (error) {
            console.error("[DEBUG] Error in ASIN lookup:", error);
            await client.chat.postMessage({
              channel: channel,
              thread_ts: rootTs,
              text: "Sorry, there was an error looking up that ASIN. Please try again later."
            });
            return;
          }
        }

        // Execute independent search with user's message (no combining with previous queries)
        const newQuery = userMessageText.trim();
        console.log("[DEBUG] Using user message as independent search query:", newQuery);

        if (newQuery.length < 2) {
          await client.chat.postMessage({
            channel,
            thread_ts: rootTs,
            text: "Please provide a more specific search query (at least 2 characters)."
          });
          await updateMessage("Query too short");
          return;
        }

        await updateMessage(`Searching for: "${newQuery}"`);

        // Execute independent search
        try {
          const perPage = 5;
          const page = 1;
          const { products, pagination } = await amazonSearchTool.execute({
            query: newQuery,
            page,
            perPage
          });

          if (!products.length) {
            await client.chat.postMessage({
              channel: channel,
              thread_ts: rootTs,
              text: `No products found for "${newQuery}". Try a different search term.`
            });
            await updateMessage("No products found");
            return;
          }

          const totalPages = pagination && pagination.other_pages ? Object.keys(pagination.other_pages).length + 1 : 1;
          const blocks = formatProductBlocksStateless(products.slice(0, 5), page, totalPages, newQuery);

          // Post results using blocks (same as /amazon command)
          await client.chat.postMessage({
            channel: channel,
            thread_ts: rootTs,
            text: `🔍 **Search Results** for "${newQuery}":`,
            blocks,
            unfurl_links: false
          });

          await updateMessage("Search completed");
          return;

        } catch (err) {
          console.error("[DEBUG] Error in independent search:", err);
          await client.chat.postMessage({
            channel: channel,
            thread_ts: rootTs,
            text: `Sorry, there was an error searching for "${newQuery}". Please try again.`
          });
          await updateMessage("Error in search");
          return;
        }

        // Refinement flow complete - return early to avoid office detection
        return;
      }
    }

    // PURCHASE FLOW: Office detection and user profile processing
    console.log("[DEBUG] PURCHASE FLOW: Starting office detection logic");

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
      "Madrid Office",
      "Miami",
      "New York",
      "Buenos Aires",
      "Madrid"
    ];
    let officeFromMessage: string | undefined = undefined;
    if (event.text) {
      for (const name of officeNames) {
        if (event.text.toLowerCase().includes(name.toLowerCase())) {
          // Normalize to full office name
          if (name.toLowerCase().includes("miami")) {
            officeFromMessage = "Miami Office";
          } else if (name.toLowerCase().includes("new york")) {
            officeFromMessage = "New York Office";
          } else if (name.toLowerCase().includes("buenos aires")) {
            officeFromMessage = "Buenos Aires Office";
          } else if (name.toLowerCase().includes("madrid")) {
            officeFromMessage = "Madrid Office";
          }
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
        // Ambiguous: prompt user to choose by typing (no buttons)
        await client.chat.postMessage({
          channel,
          thread_ts: rootTs,
          text: `We have offices in both New York City and Miami for your timezone. Please reply with your office location (choose from: Miami Office, New York Office).`,
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
