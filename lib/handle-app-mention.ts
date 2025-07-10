import { AppMentionEvent } from "@slack/web-api";
import { client, getThread, getUserEmail, getUserProfile, getOfficeForTimezone } from "./slack-utils";
import { generateResponse } from "./generate-response";

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

    // Fetch user profile (email, timezone)
    let userEmail: string | undefined = undefined;
    let userTz: string | null = null;
    let userTzLabel: string | null = null;
    let office: string | undefined = undefined;
    let messages: any[] = [];
    if (user) {
      const profile = await getUserProfile(user);
      console.log("[DEBUG] AppMention user profile:", profile);
      userEmail = profile.email || undefined;
      userTz = profile.tz;
      userTzLabel = profile.tz_label;
      // Fetch thread messages for context
      messages = await getThread(channel, rootTs, botUserId);
      const offices = getOfficeForTimezone(userTz, userTzLabel);
      console.log("[DEBUG] Office candidates:", offices);
      if (offices.length === 1) {
        office = offices[0];
      } else if (offices.length > 1) {
        // Ambiguous: prompt user to choose
        const context = {
          query: messages && messages.length > 0 ? messages[messages.length - 1].content : undefined,
          user,
          thread_ts: rootTs,
        };
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
                  value: JSON.stringify({ ...context, office: "New York City" }),
                  action_id: "select_office_nyc"
                },
                {
                  type: "button",
                  text: { type: "plain_text", text: "Miami" },
                  value: JSON.stringify({ ...context, office: "Miami" }),
                  action_id: "select_office_miami"
                }
              ]
            }
          ]
        });
        return;
      } else {
        // No match: prompt user to choose from all offices
        const context = {
          query: messages && messages.length > 0 ? messages[messages.length - 1].content : undefined,
          user,
          thread_ts: rootTs,
        };
        await client.chat.postMessage({
          channel,
          thread_ts: rootTs,
          text: `We couldn't detect your office location from your timezone. Please choose your office for delivery:`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `We couldn't detect your office location from your timezone. Please choose your office for delivery:`,
              },
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "New York City" },
                  value: JSON.stringify({ ...context, office: "New York City" }),
                  action_id: "select_office_nyc"
                },
                {
                  type: "button",
                  text: { type: "plain_text", text: "Miami" },
                  value: JSON.stringify({ ...context, office: "Miami" }),
                  action_id: "select_office_miami"
                },
                {
                  type: "button",
                  text: { type: "plain_text", text: "Buenos Aires" },
                  value: JSON.stringify({ ...context, office: "Buenos Aires" }),
                  action_id: "select_office_ba"
                },
                {
                  type: "button",
                  text: { type: "plain_text", text: "Madrid" },
                  value: JSON.stringify({ ...context, office: "Madrid" }),
                  action_id: "select_office_madrid"
                }
              ]
            }
          ]
        });
        return;
      }
    }

    // Ensure channel and thread_ts are strings
    const safeChannel = channel || "";
    const safeThreadTs = rootTs;

    const result = await generateResponse(messages, updateMessage, userEmail ?? undefined);
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
