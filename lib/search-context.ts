// Simple in-memory storage for last search queries
const lastSearchQueries = new Map<string, string>();

/**
 * Store the last search query for a user
 * @param userId - The Slack user ID
 * @param query - The search query
 */
export function storeLastSearch(userId: string, query: string): void {
    lastSearchQueries.set(userId, query);
    console.log(`[SEARCH_CONTEXT] Stored search for user ${userId}: "${query}"`);
}

/**
 * Get the last search query for a user
 * @param userId - The Slack user ID
 * @returns The last search query or undefined if none exists
 */
export function getLastSearch(userId: string): string | undefined {
    const query = lastSearchQueries.get(userId);
    console.log(`[SEARCH_CONTEXT] Retrieved search for user ${userId}: "${query || 'none'}"`);
    return query;
}

/**
 * Clear the last search query for a user
 * @param userId - The Slack user ID
 */
export function clearLastSearch(userId: string): void {
    lastSearchQueries.delete(userId);
    console.log(`[SEARCH_CONTEXT] Cleared search for user ${userId}`);
}

/**
 * Get current storage size (for debugging)
 */
export function getStorageSize(): number {
    return lastSearchQueries.size;
} 