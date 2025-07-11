# Conversational Search Enhancement Feature

## Goal
Allow users to refine Amazon searches conversationally after using `/amazon` slash command.

**User Flow:**
1. User: `/amazon sparkling water`
2. Bot: Shows Amazon results
3. User: `@snack_bot I was looking for non-flavored ones`
4. Bot: Searches Amazon for "sparkling water non-flavored" and shows results

## ✅ PHASE 1 COMPLETE: Thread-Scoped Conversational Search
The basic conversational search enhancement is **WORKING** ✅

### Enhanced User Flow:
1. User: `/amazon sparkling water` in channel
2. Bot: Posts search results message
3. User: **Replies in thread** → `@snack_bot I want non-flavored ones`
4. Bot: Searches Amazon for "sparkling water non-flavored" and shows results **in same thread**

## 🔧 PHASE 2: Fix Follow-up Search Format & Buying Flow

### New Issues Identified:
1. **Follow-up search results format**: Currently not using the same pagination format as slash command
   - Need exactly 5 products per page with Back/Next buttons
   - Should copy the exact format from normal `/amazon` command
   
2. **Buying flow broken in threads**: When users paste Amazon links in thread for purchase
   - Should identify timezone → apply timezone logic → fetch email from Slack → place order → show confirmation
   - Current flow is breaking and not completing end-to-end

### Background and Motivation
The conversational search is working, but the user experience needs to be consistent:
- Follow-up searches should look identical to slash command results
- Users should be able to seamlessly buy products from thread conversations

### Key Challenges and Analysis
1. **Search Result Formatting**: The AI-generated follow-up searches aren't using the same block formatter that the slash command uses
2. **Buying Flow Integration**: The existing buying flow logic needs to work properly in thread contexts
3. **Consistency**: Both flows should feel like native slash command interactions

### High-level Task Breakdown

#### Task 1: Fix Follow-up Search Result Formatting
- **Objective**: Make AI-generated follow-up searches use the exact same format as `/amazon` command
- **Success Criteria**: 
  - Follow-up searches show exactly 5 products per page
  - Back/Next pagination buttons work identically to slash command
  - Visual format is identical to original search results
- **Implementation**: Modify amazonSearchTool response to use the same block formatter with pagination

#### Task 2: Fix Buying Flow in Threads
- **Objective**: Ensure buying flow works end-to-end when Amazon links are pasted in threads
- **Success Criteria**:
  - Detect Amazon product links in thread messages
  - Identify user timezone correctly
  - Fetch user email from Slack
  - Place order automatically
  - Display confirmation with product info, office location, and email
- **Implementation**: Debug and fix the existing buying flow logic for thread contexts

### Project Status Board
- [ ] **Task 1**: Fix follow-up search result formatting (pagination + 5 per page)
- [ ] **Task 2**: Fix buying flow for Amazon links in threads

### Current Status / Progress Tracking
**PHASE 1 COMPLETED**: ✅ Thread-scoped conversational search is working
- Users can refine searches by replying in thread
- Search context is properly stored and retrieved
- AI successfully uses amazonSearchTool for follow-ups

**PHASE 2 IN PROGRESS**: 🔧 Fixing format consistency and buying flow

**Task 1 COMPLETED**: ✅ Fixed follow-up search result formatting
- Modified `lib/generate-response.ts` to extract pagination info from amazonSearchTool results
- Follow-up searches now show exactly 5 products per page with Back/Next buttons
- Format is now identical to slash command results
- Fixed TypeScript compilation errors

**Task 2 INVESTIGATION**: 🔍 Analyzed buying flow structure
- Buying flow uses GOAT SDK's `crossmintHeadlessCheckout` plugin for on-chain payments
- AI system prompt includes detailed buying flow instructions
- Tools available: `get_office_addresses`, on-chain payment tools from GOAT SDK
- Issue may be in AI prompt execution or missing tool functionality

**Task 2 COMPLETED**: ✅ Fixed buying flow for Amazon links in threads
- Enhanced `lib/tools/office-addresses.tool.ts` to include timezone detection logic
- Tool now accepts `userId` parameter and automatically detects user timezone from Slack
- Uses existing `getUserProfile` and `getOfficeForTimezone` functions from `slack-utils.ts`
- Updated system prompt to instruct AI to use timezone-aware office detection
- AI now automatically suggests offices based on user timezone, handles multiple matches, and falls back gracefully
- Complete end-to-end buying flow: Amazon URL → timezone detection → office suggestion → email from Slack → order placement → confirmation

### Executor's Feedback or Assistance Requests
**Both Tasks Complete**: ✅ 

**Task 1**: Search result formatting is now identical to slash command with proper pagination
**Task 2**: Buying flow now includes automatic timezone detection and office suggestion

**READY FOR TESTING**: The enhanced buying flow should now work end-to-end:
1. User pastes Amazon link in thread
2. Bot detects timezone from Slack profile  
3. Bot suggests appropriate office(s) based on timezone
4. Bot uses email from Slack profile
5. Bot places order using GOAT SDK + Crossmint
6. Bot shows confirmation with product, office, and email details

### Lessons
- **Task 1**: AI-generated search results needed explicit pagination logic from SearchApi.io response
- **Task 2**: Existing timezone detection logic in `slack-utils.ts` wasn't connected to the buying flow - needed to enhance the office addresses tool to bridge this gap
- **TypeScript**: Careful parameter passing required when updating system prompts with dynamic user data

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