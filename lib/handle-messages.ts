import type {
  AssistantThreadStartedEvent,
  GenericMessageEvent,
} from "@slack/web-api";
import { client, getThread, updateStatusUtil, getUserEmail, getUserProfile, getOfficeForTimezone } from "./slack-utils";
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
  if (
    event.bot_id ||
    event.bot_id === botUserId ||
    event.bot_profile ||
    !event.thread_ts
  )
    return;

  const { thread_ts, channel, user } = event;

  try {
    const updateStatus = updateStatusUtil(channel, thread_ts);
    await updateStatus("is thinking...");

    // Fetch user's profile including email and timezone from Slack
    let userEmail: string | null = null;
    let userTimezoneOffices: string[] = [];
    let timezonePrompt = "";

    if (user) {
      const profile = await getUserProfile(user);
      console.log("[DM] User profile:", profile);
      userEmail = profile.email;

      // Use same timezone logic as app mentions
      const offices = getOfficeForTimezone(profile.tz, profile.tz_label);
      userTimezoneOffices = offices;
      console.log("[DM] Timezone-based offices:", offices);

      if (offices.length === 1) {
        // Single office for their timezone - use it directly
        timezonePrompt = `The user's timezone automatically maps to ${offices[0]} office. Use this office for delivery without asking.`;
      } else if (offices.length > 1) {
        // Multiple offices for their timezone - ask them to choose
        timezonePrompt = `The user's timezone matches multiple offices: ${offices.join(", ")}. Ask them to choose which office location they want for delivery from these options: ${offices.map(o => o + " Office").join(", ")}.`;
      } else {
        // No offices match their timezone - ask them to manually select
        timezonePrompt = `The user's timezone doesn't match any of our office locations. Ask them to reply with their office location (choose from: Miami Office, New York Office, Buenos Aires Office, Madrid Office).`;
      }
    }

    const messages = await getThread(channel, thread_ts, botUserId);
    let result = await generateResponse(messages, updateStatus, userEmail ?? undefined, timezonePrompt);
    console.log("Generated response for assistant message:", result);

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
