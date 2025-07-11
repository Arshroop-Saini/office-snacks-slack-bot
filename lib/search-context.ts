// Simple in-memory storage for thread-scoped search queries and pagination
// threadSearchQueries: Map<threadTs, { query: string, page: number }>
const threadSearchQueries = new Map<string, { query: string, page: number }>();

// Temporary storage for recent searches before thread is created
const recentSearches = new Map<string, { query: string, timestamp: number }>();

// Global cache for better persistence (survives longer in Vercel)
const globalSearchCache = new Map<string, { query: string, timestamp: number }>();

/**
 * Store a recent search for a user in a channel (before thread is created)
 * @param channelId - The Slack channel ID
 * @param userId - The Slack user ID  
 * @param query - The search query
 */
export function storeRecentSearch(channelId: string, userId: string, query: string): void {
    const key = `${channelId}-${userId}`;
    const timestamp = Date.now();

    // Store in both local and global cache
    recentSearches.set(key, { query, timestamp });
    globalSearchCache.set(key, { query, timestamp });

    console.log(`[SEARCH_CONTEXT] ✅ Stored recent search for ${key}: "${query}"`);
    console.log(`[SEARCH_CONTEXT] 📊 Storage state:`, {
        recentSearches: Array.from(recentSearches.entries()),
        threadSearches: Array.from(threadSearchQueries.entries()),
        globalCache: Array.from(globalSearchCache.entries())
    });
}

/**
 * Store the search query and page for a thread (when we have the thread timestamp)
 * @param threadTs - The Slack thread timestamp
 * @param query - The search query
 * @param page - The current page number
 */
export function storeThreadSearch(threadTs: string, query: string, page: number = 1): void {
    threadSearchQueries.set(threadTs, { query, page });

    // Also store in global cache with thread key
    globalSearchCache.set(`thread-${threadTs}`, { query, timestamp: Date.now() });

    console.log(`[SEARCH_CONTEXT] ✅ Stored thread search for ${threadTs}: "${query}" (page ${page})`);
    console.log(`[SEARCH_CONTEXT] 📊 Storage state:`, {
        recentSearches: Array.from(recentSearches.entries()),
        threadSearches: Array.from(threadSearchQueries.entries()),
        globalCache: Array.from(globalSearchCache.entries())
    });
}

/**
 * Get search context for an app mention - checks thread first, then recent searches
 * @param threadTs - The Slack thread timestamp (if in a thread)
 * @param channelId - The Slack channel ID
 * @param userId - The Slack user ID
 * @returns { query: string, page: number } or undefined if none exists
 */
export function getSearchContext(threadTs: string | undefined, channelId: string, userId: string): { query: string, page: number } | undefined {
    console.log(`[SEARCH_CONTEXT] 🔍 Looking for context:`, {
        threadTs,
        channelId,
        userId,
        recentSearches: Array.from(recentSearches.entries()),
        threadSearches: Array.from(threadSearchQueries.entries()),
        globalCache: Array.from(globalSearchCache.entries())
    });

    // First check if we have thread-specific context
    if (threadTs) {
        const threadData = threadSearchQueries.get(threadTs);
        if (threadData) {
            console.log(`[SEARCH_CONTEXT] ✅ Found thread search for ${threadTs}: "${threadData.query}" (page ${threadData.page})`);
            return threadData;
        }
        console.log(`[SEARCH_CONTEXT] ❌ No thread search found for ${threadTs}`);
    }

    // Then check recent searches (within last 10 minutes)
    const key = `${channelId}-${userId}`;
    const recent = recentSearches.get(key);
    console.log(`[SEARCH_CONTEXT] 🔍 Checking recent searches for key ${key}:`, recent);

    if (recent && (Date.now() - recent.timestamp < 10 * 60 * 1000)) {
        console.log(`[SEARCH_CONTEXT] ✅ Found recent search for ${key}: "${recent.query}" (age: ${(Date.now() - recent.timestamp) / 1000}s)`);

        // If we're in a thread, promote this to thread-specific storage
        if (threadTs) {
            console.log(`[SEARCH_CONTEXT] 🔄 Promoting recent search to thread ${threadTs}`);
            storeThreadSearch(threadTs, recent.query, 1);
            // Don't delete the recent search yet - keep it as backup
            return { query: recent.query, page: 1 };
        }

        return { query: recent.query, page: 1 };
    }

    if (recent) {
        console.log(`[SEARCH_CONTEXT] ❌ Recent search found but expired for ${key}: "${recent.query}" (age: ${(Date.now() - recent.timestamp) / 1000}s)`);
    } else {
        console.log(`[SEARCH_CONTEXT] ❌ No recent search found for ${key}`);
    }

    // ENHANCED: Check global cache for better persistence
    console.log(`[SEARCH_CONTEXT] 🔄 Checking global cache...`);
    const globalKey = `${channelId}-${userId}`;
    const globalData = globalSearchCache.get(globalKey);
    if (globalData && (Date.now() - globalData.timestamp < 30 * 60 * 1000)) { // 30 min expiry
        console.log(`[SEARCH_CONTEXT] 🔄 Found in global cache: ${globalKey} -> "${globalData.query}"`);

        // If we're in a thread, promote this to thread-specific storage
        if (threadTs) {
            console.log(`[SEARCH_CONTEXT] 🔄 Promoting global cache to thread ${threadTs}`);
            storeThreadSearch(threadTs, globalData.query, 1);
            return { query: globalData.query, page: 1 };
        }

        return { query: globalData.query, page: 1 };
    }

    // ENHANCED: Check if we can find a recent search for ANY user in this channel (fallback)
    console.log(`[SEARCH_CONTEXT] 🔄 Checking for any recent searches in channel ${channelId}...`);
    for (const [searchKey, searchData] of recentSearches.entries()) {
        if (searchKey.startsWith(`${channelId}-`) && (Date.now() - searchData.timestamp < 10 * 60 * 1000)) {
            console.log(`[SEARCH_CONTEXT] 🔄 Found channel fallback search: ${searchKey} -> "${searchData.query}"`);

            // If we're in a thread, promote this to thread-specific storage
            if (threadTs) {
                console.log(`[SEARCH_CONTEXT] 🔄 Promoting channel fallback to thread ${threadTs}`);
                storeThreadSearch(threadTs, searchData.query, 1);
                return { query: searchData.query, page: 1 };
            }

            return { query: searchData.query, page: 1 };
        }
    }

    // ENHANCED: Check global cache for any channel searches
    console.log(`[SEARCH_CONTEXT] 🔄 Checking global cache for channel searches...`);
    for (const [searchKey, searchData] of globalSearchCache.entries()) {
        if (searchKey.startsWith(`${channelId}-`) && (Date.now() - searchData.timestamp < 30 * 60 * 1000)) {
            console.log(`[SEARCH_CONTEXT] 🔄 Found global channel search: ${searchKey} -> "${searchData.query}"`);

            // If we're in a thread, promote this to thread-specific storage
            if (threadTs) {
                console.log(`[SEARCH_CONTEXT] 🔄 Promoting global channel search to thread ${threadTs}`);
                storeThreadSearch(threadTs, searchData.query, 1);
                return { query: searchData.query, page: 1 };
            }

            return { query: searchData.query, page: 1 };
        }
    }

    console.log(`[SEARCH_CONTEXT] ❌ No search context found for thread ${threadTs} or ${key}`);
    return undefined;
}

/**
 * Update the page for a thread context
 */
export function updateThreadPage(threadTs: string, page: number): void {
    const data = threadSearchQueries.get(threadTs);
    if (data) {
        threadSearchQueries.set(threadTs, { ...data, page });
        console.log(`[SEARCH_CONTEXT] 🔄 Updated page for thread ${threadTs} to ${page}`);
    }
}

/**
 * Get current storage size (for debugging)
 */
export function getStorageSize(): number {
    return threadSearchQueries.size + recentSearches.size + globalSearchCache.size;
} 