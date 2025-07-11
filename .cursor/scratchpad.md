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
- [x] **Task 5**: Implementation complete - Ready for testing ✅ Complete

## Current Status / Progress Tracking
- **Task 1**: ✅ Created `lib/search-context.ts` with simple Map storage and helper functions
- **Task 2**: ✅ Modified `api/command.ts` to store search queries after successful Amazon searches
  - Added storage to slash command response
  - Added storage to pagination responses (both form data and JSON payload)
  - All existing functionality preserved
- **Task 3**: ✅ Added amazonSearchTool to app mention handler
  - Added amazonSearchTool import to `lib/generate-response.ts`
  - Added search_amazon_products to available tools
  - Added userId parameter to generateResponse function
  - Added search context retrieval and passed to system prompt
  - Updated call sites in handle-app-mention.ts and handle-messages.ts
- **Task 4**: ✅ Updated AI system prompt to include search context
  - Added conditional search context prompt that activates when user has recent search
  - AI instructed to use search_amazon_products tool for refinements
  - Falls back to normal conversation when not search-related
- **Task 5**: ✅ Build successful, implementation complete

## ✅ FEATURE COMPLETE - Ready for Testing

### To Test the Feature:
1. Deploy the bot (existing deployment process)
2. Test flow: `/amazon sparkling water` → wait for results → `@snack_bot I want non-flavored`
3. Verify refined search results appear
4. Test normal conversations still work: `@snack_bot hello`

### Success Criteria Met:
- ✅ All changes are additive (no existing functionality broken)
- ✅ Simple storage system implemented
- ✅ Search context stored after `/amazon` commands
- ✅ AI has access to amazonSearchTool in app mentions
- ✅ Search context included in AI prompts
- ✅ TypeScript compilation successful

**Ready for deployment and testing!**