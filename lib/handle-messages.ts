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

    // Get the user's message for potential office selection detection
    const threadMessages = await getThread(channel, thread_ts, botUserId);
    const latestUserMessage = threadMessages.filter(msg => msg.role === 'user').pop();
    const userMessageText = typeof latestUserMessage?.content === 'string' ? latestUserMessage.content : '';

    // Check if user's message contains an Amazon link (CRITICAL: same logic as app mention handler)
    const amazonLinkPattern = /(amazon\.com|amazon\.co\.|amzn\.to|amazon\.ca|amazon\.de|amazon\.fr|amazon\.it|amazon\.es|amazon\.in|amazon\.com\.au|amazon\.com\.br|amazon\.com\.mx|amazon\.co\.jp)/i;
    const containsAmazonLink = amazonLinkPattern.test(userMessageText);
    console.log("[DEBUG] DM Contains Amazon link:", containsAmazonLink);

    if (containsAmazonLink) {
      console.log("[DEBUG] DM Amazon link detected - proceeding with buying flow (same as app mention)");
      // Skip ALL other logic and proceed with normal AI conversation for buying flow
      let userEmail: string | null = null;
      if (user) {
        userEmail = await getUserEmail(user);
      }
      let result = await generateResponse(threadMessages, updateStatus, userEmail ?? undefined);
      console.log("Generated response for DM Amazon link:", result);

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
      return;
    }

    // Check if this looks like an office selection (from buying flow)
    const officeNames = ["Miami Office", "New York Office", "Buenos Aires Office", "Madrid Office", "Miami", "New York", "Buenos Aires", "Madrid"];
    const looksLikeOfficeSelection = officeNames.some(office =>
      userMessageText.toLowerCase().includes(office.toLowerCase())
    );
    console.log("[DEBUG] DM Looks like office selection:", looksLikeOfficeSelection);

    if (looksLikeOfficeSelection) {
      console.log("[DEBUG] DM Office selection detected - proceeding with buying flow");
      // Skip timezone detection and proceed with normal AI conversation for buying flow
      let userEmail: string | null = null;
      if (user) {
        userEmail = await getUserEmail(user);
      }
      let result = await generateResponse(threadMessages, updateStatus, userEmail ?? undefined);
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
      return;
    }

    // Try to fetch the user's email and timezone from Slack (for new purchase flows)
    let userEmail: string | null = null;
    let userTz: string | null = null;
    let userTzLabel: string | null = null;
    let office: string | null = null;

    if (user) {
      userEmail = await getUserEmail(user);
      const profile = await getUserProfile(user);
      console.log("[DEBUG] DM user profile:", profile);
      userTz = profile.tz;
      userTzLabel = profile.tz_label;

      // Apply same timezone detection logic as app mention handler
      const offices = getOfficeForTimezone(userTz, userTzLabel);
      console.log("[DEBUG] DM Office candidates:", offices);

      if (offices.length === 1) {
        office = offices[0];
        console.log("[DEBUG] DM Single office detected:", office);
      } else if (offices.length > 1) {
        // Ambiguous: prompt user to choose by typing (same as app mention handler)
        await client.chat.postMessage({
          channel,
          thread_ts: thread_ts,
          text: `We have offices in both New York City and Miami for your timezone. Please reply with your office location (choose from: Miami Office, New York Office).`,
        });
        return;
      } else {
        // Not in any known timezone: ask user to reply with their office (same as app mention handler)
        await client.chat.postMessage({
          channel,
          thread_ts: thread_ts,
          text: `I couldn't detect your office location from your timezone. Please reply with your office location (choose from: Miami Office, New York Office, Buenos Aires Office, Madrid Office).`,
        });
        return;
      }
    }

    const finalMessages = await getThread(channel, thread_ts, botUserId);
    let result = await generateResponse(finalMessages, updateStatus, userEmail ?? undefined);
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
