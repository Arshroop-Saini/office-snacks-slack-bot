import type {
  AssistantThreadStartedEvent,
  GenericMessageEvent,
} from "@slack/web-api";
import { client, getThread, updateStatusUtil, getUserEmail } from "./slack-utils";
import { generateResponse } from "./generate-response";

export async function assistantThreadMessage(
  event: AssistantThreadStartedEvent
) {
  const { channel_id, thread_ts } = event.assistant_thread;
  console.log(`Thread started: ${channel_id} ${thread_ts}`);
  console.log(JSON.stringify(event));

  try {
    await client.chat.postMessage({
      channel: channel_id,
      thread_ts: thread_ts,
      text: "Hi there! I'm your office snacks assistant. What can I get for you today?",
    });

    await client.assistant.threads.setSuggestedPrompts({
      channel_id: channel_id,
      thread_ts: thread_ts,
      prompts: [
        {
          title: "Buy this product",
          message:
            "Buy this https://www.amazon.com/Croix-Sparkling-Water-Grapefruit-Count/dp/B01MTDGVVY/ref=sr_1_1?s=grocery&sr=1-1",
        },
      ],
    });
  } catch (error) {
    console.error("Error in assistantThreadMessage:", error);
  }
}

export async function handleNewAssistantMessage(
  event: GenericMessageEvent,
  botUserId: string
) {
  console.log("[DEBUG] handleNewAssistantMessage called with:", {
    type: event.type,
    channel: event.channel,
    thread_ts: event.thread_ts,
    text: event.text?.substring(0, 100) + "...",
    hasAppMention: event.text?.includes(`<@${botUserId}>`)
  });

  if (
    event.bot_id ||
    event.bot_id === botUserId ||
    event.bot_profile ||
    !event.thread_ts
  )
    return;

  // Skip if this message contains an app mention - let handleNewAppMention handle it
  if (event.text?.includes(`<@${botUserId}>`)) {
    console.log("[DEBUG] Message contains app mention, skipping handleNewAssistantMessage");
    return;
  }

  const { thread_ts, channel, user } = event;

  try {
    const updateStatus = updateStatusUtil(channel, thread_ts);
    await updateStatus("is thinking...");

    // Try to fetch the user's email from Slack
    let userEmail: string | null = null;
    if (user) {
      userEmail = await getUserEmail(user);
    }

    const messages = await getThread(channel, thread_ts, botUserId);
    let result = await generateResponse(messages, updateStatus, userEmail ?? undefined);
    console.log("Generated response for assistant message:", result);

    // Check if result is too long for blocks (Slack limit is 3000 chars)
    if (result.length > 2900) {
      console.log("[DEBUG] Response too long for blocks, sending as plain text");
      await client.chat.postMessage({
        channel: channel,
        thread_ts: thread_ts,
        text: result,
        unfurl_links: false,
      });
    } else {
      await client.chat.postMessage({
        channel: channel,
        thread_ts: thread_ts,
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
    }

    await updateStatus("");
  } catch (error) {
    console.error("Error in handleNewAssistantMessage:", error);
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
