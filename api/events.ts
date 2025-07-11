export const maxDuration = 60; // Set maximum duration to 60 seconds

import type { SlackEvent } from "@slack/web-api";
import { handleMessages } from "../lib/handle-messages";
import { waitUntil } from "@vercel/functions";
import { handleAppMention } from "../lib/handle-app-mention";
import { verifyRequest, getBotId } from "../lib/slack-utils";
import { updateThreadPage, storeThreadSearch, getSearchContext } from "../lib/search-context";
import { amazonSearchTool } from "../lib/tools/amazon-search.tool";
import { formatProductBlocksStateless } from "../lib/amazon-block-formatter";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const payload = JSON.parse(rawBody);
  const requestType = payload.type as "url_verification" | "event_callback";

  // See https://api.slack.com/events/url_verification
  if (requestType === "url_verification") {
    return new Response(payload.challenge, { status: 200 });
  }

  await verifyRequest({ requestType, request, rawBody });

  try {
    const botUserId = await getBotId();

    const event = payload.event as SlackEvent;

    console.log("Event details", {
      type: event.type,
      subtype: "subtype" in event ? event.subtype : undefined,
      channel_type: "channel_type" in event ? event.channel_type : undefined,
      bot_id: "bot_id" in event ? event.bot_id : undefined,
      bot_profile: "bot_profile" in event ? event.bot_profile : undefined,
      botUserId,
      text: "text" in event ? event.text : undefined,
    });

    if (event.type === "app_mention") {
      waitUntil(handleAppMention(event));
    }

    if (
      event.type === "message" &&
      !event.subtype &&
      ["im", "channel"].includes(event.channel_type) &&
      !event.bot_id &&
      !event.bot_profile &&
      event.bot_id !== botUserId
    ) {
      waitUntil(handleMessages(event));
    }

    // Block action handler for thread pagination
    if (payload.type === "block_actions") {
      const action = payload.actions[0];
      let parsedValue;
      try {
        parsedValue = JSON.parse(action.value);
      } catch (err) {
        return new Response(JSON.stringify({ response_type: "ephemeral", text: `Error: Invalid button value format.` }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (action.action_id === "next_page" || action.action_id === "back_page") {
        // Extract context from the payload
        const { query, page } = parsedValue;
        const perPage = 5;
        // If this is in a thread, update the thread context
        const threadTs = payload.message?.thread_ts || payload.message?.ts;
        if (threadTs) {
          storeThreadSearch(threadTs, query, page);
        }
        // Run the Amazon search for this page
        const { products, pagination } = await amazonSearchTool.execute({ query, page, perPage });
        const totalPages = pagination && pagination.other_pages ? Object.keys(pagination.other_pages).length + 1 : 1;
        const blocks = formatProductBlocksStateless(products.slice(0, 5), page, totalPages, query);
        // Respond to Slack
        await fetch(payload.response_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            response_type: "in_channel",
            replace_original: true,
            blocks,
          }),
        });
        return new Response("", { status: 200 });
      }
    }

    return new Response("Success!", { status: 200 });
  } catch (error) {
    console.error("Error generating response", error);
    return new Response("Error generating response", { status: 500 });
  }
}
