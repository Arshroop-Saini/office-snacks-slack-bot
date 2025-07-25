import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

/**
 * Extracts product name/search term from user's natural language message
 * @param userMessage - The user's full message
 * @returns Promise<string> - The extracted product name for searching
 */
export async function extractProductName(userMessage: string): Promise<string> {
    const systemPrompt = `You are a product name extractor. Your job is to extract the main product name or search term from a user's natural language message.

Extract ONLY the product name/brand/item that the user wants to search for. Remove unnecessary words like:
- "I want to buy some..."
- "for miami office"
- "for the office"
- "can you find me..."
- "I'm looking for..."

Examples:
- "i want to buy some celsius for miami office" → "celsius"
- "can you find me wireless headphones" → "wireless headphones"
- "looking for energy drinks for the office" → "energy drinks"
- "I need some snacks for our team" → "snacks"
- "find me iphone 15 cases" → "iphone 15 cases"
- "coca cola for our break room" → "coca cola"

Return ONLY the product name, nothing else. If you cannot identify a clear product, return the original message.`;

    try {
        const response = await generateText({
            model: openai("gpt-4o-mini"), // Use faster/cheaper model for extraction
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Extract the product name from: "${userMessage}"` }
            ],
            temperature: 0.1, // Low temperature for consistent extraction
        });

        const extractedProduct = response.text.trim();
        console.log("[PRODUCT EXTRACTION] Original:", userMessage);
        console.log("[PRODUCT EXTRACTION] Extracted:", extractedProduct);

        // Return extracted product if it looks reasonable, otherwise fallback to original
        if (extractedProduct && extractedProduct.length > 0 && extractedProduct.length < userMessage.length) {
            return extractedProduct;
        } else {
            console.log("[PRODUCT EXTRACTION] Extraction failed, using original message");
            return userMessage;
        }

    } catch (error) {
        console.error("[PRODUCT EXTRACTION] Error:", error);
        // Fallback to original message if extraction fails
        return userMessage;
    }
} 