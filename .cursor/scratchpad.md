# Conversational Search Enhancement Feature

## Goal
Allow users to refine Amazon searches conversationally after using `/amazon` slash command.

**User Flow:**
1. User: `/amazon sparkling water`
2. Bot: Shows Amazon results
3. User: `@snack_bot I was looking for non-flavored ones`
4. Bot: Searches Amazon for "sparkling water non-flavored" and shows results

## Implementation Plan

### Simple Approach
- Store last search query per user (no expiration)
- Let AI decide when to use search context vs normal conversation
- Reuse existing `amazonSearchTool` and UI blocks

### Files to Modify
1. `lib/search-context.ts` - Simple storage for last search queries
2. `api/command.ts` - Store query after successful Amazon search
3. `lib/generate-response.ts` - Add amazonSearchTool to app mentions
4. `lib/generate-response.ts` - Update system prompt with search context

### Tasks
- [x] **Task 1**: Create simple search context storage ✅ Complete
- [x] **Task 2**: Store query in `/amazon` command after success ✅ Complete  
- [x] **Task 3**: Add amazonSearchTool to app mention handler ✅ Complete
- [x] **Task 4**: Update AI prompt to include last search context ✅ Complete
- [x] **Task 5**: Adapt for thread-scoped context (BETTER UX) ✅ Complete

## Current Status / Progress Tracking
- **Task 1**: ✅ Created `lib/search-context.ts` with hybrid storage system
  - Recent searches: Map<channelId-userId, {query, timestamp}> (10min expiry)
  - Thread searches: Map<threadTs, query> (permanent until replaced)
  - Smart `getSearchContext()` that checks thread first, then recent searches
- **Task 2**: ✅ Modified `api/command.ts` to store search queries after successful Amazon searches
  - Initial slash command: stores as recent search (before thread exists)
  - Pagination: maintains recent search context
  - All existing functionality preserved
- **Task 3**: ✅ Added amazonSearchTool to app mention handler
  - Added amazonSearchTool import to `lib/generate-response.ts`
  - Added search_amazon_products to available tools
  - Added threadTs and channelId parameters to generateResponse function
  - Updated call sites in handle-app-mention.ts and handle-messages.ts
- **Task 4**: ✅ Updated AI system prompt to include search context
  - Added conditional search context prompt that activates when user has recent search
  - AI instructed to use search_amazon_products tool for refinements
  - Falls back to normal conversation when not search-related
- **Task 5**: ✅ Adapted for thread-scoped context (IMPROVED UX)
  - Context only applies when user replies in the thread of search results
  - Prevents confusion from cross-channel or unrelated conversations
  - Automatic promotion from recent → thread-specific when thread is created
  - Build successful, no compilation errors

## ✅ THREAD-SCOPED FEATURE COMPLETE - Ready for Testing

### Enhanced User Flow:
1. User: `/amazon sparkling water` in channel
2. Bot: Posts search results message
3. User: **Replies in thread** → `@snack_bot I want non-flavored ones`
4. Bot: Searches Amazon for "sparkling water non-flavored" and shows results **in same thread**

### To Test the Feature:
1. Deploy the bot (existing deployment process)
2. Test flow: `/amazon sparkling water` → **reply in thread** → `@snack_bot I want non-flavored`
3. Verify refined search results appear in the thread
4. Test normal conversations still work: `@snack_bot hello` in different context

### Success Criteria Met:
- ✅ All changes are additive (no existing functionality broken)
- ✅ Thread-scoped storage system implemented (much better UX)
- ✅ Search context stored after `/amazon` commands
- ✅ AI has access to amazonSearchTool in app mentions
- ✅ Search context included in AI prompts when in relevant thread
- ✅ TypeScript compilation successful

**Ready for deployment and testing! Thread-scoped approach is much cleaner.**