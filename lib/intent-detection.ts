import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

export type UserIntent = 'buy' | 'search' | 'conversation';

export interface IntentDetectionResult {
    intent: UserIntent;
    confidence: number;
    reasoning: string;
}

/**
 * Uses LLM to detect user intent from their message
 * @param userMessage - The user's message text
 * @returns Promise<IntentDetectionResult>
 */
export async function detectUserIntent(userMessage: string): Promise<IntentDetectionResult> {
    const systemPrompt = `You are an intent classifier for an office snacks bot. Analyze the user's message and classify it into one of three intents:

**BUY INTENT**: User wants to purchase a specific product
- Examples: "buy this", "purchase that", "order this item", contains Amazon URLs/ASINs
- Usually has clear purchase language or specific product identifiers

**SEARCH INTENT**: User wants to find/discover products  
- Examples: "coca cola", "wireless headphones", "energy drinks", "find snacks", "show me laptops"
- Product names, brand names, categories, or requests to find/search for items
- NOT general questions about the bot or conversation

**CONVERSATION INTENT**: General chat, questions about the bot, greetings, wallet queries, office info
- Examples: "what is your name?", "hi", "how are you?", "what can you do?", "help", "check balance", "what's my balance?", "how much SOL do I have?", "what's my wallet address?", "show me office locations", "recommend snacks", "what network am I on?"
- Questions about bot capabilities, greetings, thanks, general conversation, wallet/crypto queries, office information requests

Respond with ONLY a JSON object in this exact format:
{
  "intent": "buy|search|conversation",
  "confidence": 0.95,
  "reasoning": "Brief explanation of why this intent was chosen"
}`;

    try {
        const response = await generateText({
            model: openai("gpt-4o-mini"), // Use faster/cheaper model for classification
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Classify this message: "${userMessage}"` }
            ],
            temperature: 0.1, // Low temperature for consistent classification
        });

        console.log("[INTENT DETECTION] Raw LLM response:", response.text);

        // Parse the JSON response
        const parsed = JSON.parse(response.text.trim());

        // Validate the response
        if (!['buy', 'search', 'conversation'].includes(parsed.intent)) {
            throw new Error(`Invalid intent: ${parsed.intent}`);
        }

        const result: IntentDetectionResult = {
            intent: parsed.intent as UserIntent,
            confidence: parsed.confidence || 0.5,
            reasoning: parsed.reasoning || "No reasoning provided"
        };

        console.log("[INTENT DETECTION] Classified intent:", result);
        return result;

    } catch (error) {
        console.error("[INTENT DETECTION] Error:", error);

        // Fallback to conversation intent if LLM fails
        return {
            intent: 'conversation',
            confidence: 0.3,
            reasoning: "Failed to classify, defaulting to conversation"
        };
    }
} 