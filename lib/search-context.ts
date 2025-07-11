// Simple in-memory storage for thread-scoped search queries
const threadSearchQueries = new Map<string, string>();

// Temporary storage for recent searches before thread is created
const recentSearches = new Map<string, { query: string, timestamp: number }>();

/**
 * Store a recent search for a user in a channel (before thread is created)
 * @param channelId - The Slack channel ID
 * @param userId - The Slack user ID  
 * @param query - The search query
 */
export function storeRecentSearch(channelId: string, userId: string, query: string): void {
    const key = `${channelId}-${userId}`;
    recentSearches.set(key, { query, timestamp: Date.now() });
    console.log(`[SEARCH_CONTEXT] Stored recent search for ${key}: "${query}"`);
}

/**
 * Store the search query for a thread (when we have the thread timestamp)
 * @param threadTs - The Slack thread timestamp
 * @param query - The search query
 */
export function storeThreadSearch(threadTs: string, query: string): void {
    threadSearchQueries.set(threadTs, query);
    console.log(`[SEARCH_CONTEXT] Stored search for thread ${threadTs}: "${query}"`);
}

/**
 * Get search context for an app mention - checks thread first, then recent searches
 * @param threadTs - The Slack thread timestamp (if in a thread)
 * @param channelId - The Slack channel ID
 * @param userId - The Slack user ID
 * @returns The search query or undefined if none exists
 */
export function getSearchContext(threadTs: string | undefined, channelId: string, userId: string): string | undefined {
    // First check if we have thread-specific context
    if (threadTs) {
        const threadQuery = threadSearchQueries.get(threadTs);
        if (threadQuery) {
            console.log(`[SEARCH_CONTEXT] Found thread search for ${threadTs}: "${threadQuery}"`);
            return threadQuery;
        }
    }

    // Then check recent searches (within last 10 minutes)
    const key = `${channelId}-${userId}`;
    const recent = recentSearches.get(key);
    if (recent && (Date.now() - recent.timestamp < 10 * 60 * 1000)) {
        console.log(`[SEARCH_CONTEXT] Found recent search for ${key}: "${recent.query}"`);

        // If we're in a thread, promote this to thread-specific storage
        if (threadTs) {
            storeThreadSearch(threadTs, recent.query);
            recentSearches.delete(key); // Clean up
        }

        return recent.query;
    }

    console.log(`[SEARCH_CONTEXT] No search context found for thread ${threadTs} or ${key}`);
    return undefined;
}

/**
 * Get current storage size (for debugging)
 */
export function getStorageSize(): number {
    return threadSearchQueries.size + recentSearches.size;
} 