import { generateResponse } from "./generate-response";
import { client } from "./slack-utils";
import type { AppMentionEvent } from "@slack/web-api";

export const handleAppMention = async (
  event: AppMentionEvent,
  updateStatus?: (status: string) => void
) => {
  try {
    const userMessage = event.text.replace(/<@[^>]+>/g, '').trim();
    console.log("📝 User message in app mention:", userMessage);

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
