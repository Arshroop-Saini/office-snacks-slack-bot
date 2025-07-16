# Background and Motivation

The current Slack bot (Snackbot) was designed to automate office snack and equipment ordering, but it has seen little to no adoption internally at Crossmint or externally. Manual purchasing is still the norm. The goal is to revamp the bot to make it more useful, reliable, and attractive for both internal and external users, and to prepare it for Slack App Store distribution.

**NEW FEATURE REQUEST: Thread-based Query Refinement**
Users want to refine their Amazon search queries through natural conversation in threads. After using `/amazon [query]`, users should be able to mention the bot in a thread reply with refinements like "I was looking for non-flavoured sparkling water" to get enhanced search results using the same formatting as the original slash command.

**NEW FEATURE REQUEST: ASIN Direct Lookup**
When users provide an Amazon ASIN (e.g., `/amazon B0DWQC12R5`), the bot should detect this is an ASIN identifier and fetch that specific product directly instead of doing a general search. This would make the bot much more efficient for users who know the exact product they want.

# Key Challenges and Analysis

- **Product discovery does not start in Slack**: Users default to Amazon, not the bot.
- **No notification system**: No reminders or prompts for DRIs to purchase.
- **No automation/recurring purchase flow**: All purchases are manual.
- **Impossible to fund the agent's wallet easily**: No UI or flow for this.
- **Budget is shared, not user-based**: All users draw from a single wallet.
- **No context or recommendations**: The bot interface is a blank slate, with no personalized or historical suggestions.
- **No product search by name/description**: Users must paste Amazon links.
- **No product previews or details**: No images, cost, ratings, or ETA shown.
- **Does not work in channels**: Only DMs supported.
- **Not available on Slack App Store**: Not ready for external adoption.
- ~~**Generic error messages**: When products are out of stock or not supported by Crossmint, users get vague error messages~~. **FIXED** ✅

**Thread-based Query Refinement Analysis:**
- **Context Association**: Need to link thread conversations back to original `/amazon` slash command queries
- **Query Intelligence**: Must intelligently combine original query + user refinement into effective search terms
- **Thread Detection**: Distinguish between refinement requests vs new general queries in threads
- **Response Consistency**: Maintain exact same formatting and pagination as `/amazon` command
- **Storage Strategy**: Store original query context without adding database dependency
- **Conversation Flow**: Handle multiple refinements in same thread gracefully

**ASIN Direct Lookup Analysis:**
- **ASIN Pattern Detection**: ASINs are 10-character alphanumeric identifiers (e.g., B0DWQC12R5, B08SVZ775L)
- **SearchAPI Compatibility**: SearchAPI.io supports ASIN lookup via direct query parameter
- **Response Optimization**: Single product display vs. multi-product search results formatting
- **Error Handling**: Handle invalid ASINs, products not found, or region-specific availability
- **User Experience**: Instant direct product access vs. search result pagination

# High-level Task Breakdown

## V0 (Reliability & Core Features)
1. **Ensure bot works reliably for Amazon US orders**
   - [x] Test and fix order submission flow
   - [x] Ensure pasted Amazon links are processed and purchased
   - [x] **Enhanced Error Handling** ✅ - Implemented specific error messages for different failure scenarios
2. **Enable product search by name/description**
   - [x] Integrate Amazon product search API or scraping
   - [x] Return product options with preview image, cost, ratings, ETA
   - [x] Allow user to pick a product to purchase
   - [ ] **ASIN Direct Lookup** 🔄 - Enable direct ASIN queries for specific product fetching
3. **Channel support**
   - [ ] Make bot work in channels, not just DMs
4. **Switch model to Sonnet 3.7**
   - [ ] Update AI model integration
5. **Wallet management**
   - [ ] All orders use a single wallet
   - [ ] Manual wallet funding by Crossmint DRI (with low-balance notification)
   - [ ] On install, allow Slack admin to provide wallet
6. **Prepare for Slack App Store**
   - [ ] Ensure install flow is robust
   - [ ] Add onboarding and admin wallet setup
   - [ ] Polish UX and error handling

## PLANNED: ASIN Direct Lookup Feature

### Technical Architecture Overview

**Current State Analysis:**
- ✅ SearchAPI.io integration functional in `lib/tools/amazon-search.tool.ts`
- ✅ Existing product formatting in `api/command.ts` with `formatProductBlocksStateless()`
- ✅ Thread-based refinement logic already implemented in `lib/handle-app-mention.ts`
- ✅ ASIN patterns already exist in codebase (B0CND6BGC6, B07DJ16CD6, etc.)

**ASIN Pattern Detection Strategy:**
- **Primary Pattern**: `^B[0-9A-Z]{9}$` - Covers most modern ASINs (B0XXXXXXXX, B1XXXXXXXX, etc.)
- **Validation**: 10-character length, starts with 'B', alphanumeric only
- **Examples Found**: B0DWQC12R5, B08SVZ775L, B0CND6BGC6, B07DJ16CD6, B007R8XGJK, B0CBN8NMS5

**SearchAPI ASIN Lookup Compatibility:**
- ✅ SearchAPI.io supports direct ASIN queries via `q` parameter
- ✅ Returns single product when ASIN exists
- ✅ Returns empty results when ASIN not found/invalid
- ✅ Same response format as keyword searches (reuse existing parsing)

**Implementation Strategy:**
1. **Detection Phase**: Add ASIN pattern detection to `/amazon` command processing
2. **Query Optimization**: When ASIN detected, use it directly as SearchAPI query
3. **Response Enhancement**: Format single product with enhanced detail display
4. **Error Handling**: Specific messages for invalid ASINs or products not found
5. **Consistency**: Maintain same visual formatting as existing search results

### Implementation Phases

**Phase 1: ASIN Detection & Validation** ✅ COMPLETED
- [x] Add ASIN pattern regex detection to `/amazon` command in `api/command.ts`
- [x] Create ASIN validation helper function
- [x] Add unit tests for ASIN detection edge cases
- **Success Criteria**: Correctly identifies ASINs vs. regular search queries

**Phase 2: SearchAPI ASIN Query Integration** ✅ COMPLETED
- [x] Modify `amazonSearchTool.execute()` to handle ASIN queries efficiently
- [x] Test ASIN lookup via SearchAPI.io (valid/invalid cases)
- [x] Ensure same response format for consistency with existing parsing
- **Success Criteria**: Successful ASIN lookups return product data, invalid ASINs return empty results

**Phase 3: Single Product Display Optimization** ✅ COMPLETED
- [x] Create enhanced single product formatter based on `formatProductBlocksStateless()`
- [x] Remove pagination controls for single product results
- [x] Add ASIN-specific messaging ("Product Details for ASIN: [ASIN]")
- [x] Maintain all existing product information (price, rating, ETA, image)
- **Success Criteria**: Single product display is visually appealing and informative

**Phase 4: Error Handling & Edge Cases** ✅ COMPLETED
- [x] Handle invalid ASIN format with specific error message
- [x] Handle ASIN not found with helpful suggestion
- [x] Handle region-specific availability issues
- [x] Test with various ASIN formats and edge cases
- **Success Criteria**: Clear, actionable error messages for all failure scenarios

**Phase 5: Thread Integration & Testing** ✅ COMPLETED
- [x] Ensure ASIN lookup works in thread-based refinements
- [x] Test ASIN queries in both slash commands and thread replies
- [x] Verify buying flow works correctly with ASIN-sourced products
- [x] End-to-end testing with real ASINs
- **Success Criteria**: ASIN functionality works seamlessly across all bot interfaces

### Technical Implementation Details

**ASIN Detection Logic:**
```typescript
function isASIN(query: string): boolean {
  const asinPattern = /^B[0-9A-Z]{9}$/;
  return asinPattern.test(query.trim().toUpperCase());
}

function validateASIN(asin: string): { valid: boolean; normalized: string } {
  const normalized = asin.trim().toUpperCase();
  return {
    valid: /^B[0-9A-Z]{9}$/.test(normalized) && normalized.length === 10,
    normalized
  };
}
```

**Enhanced SearchAPI Integration:**
```typescript
// In amazon-search.tool.ts - modify execute function
if (isASIN(query)) {
  // Direct ASIN lookup - expect single result
  url = `https://www.searchapi.io/api/v1/search?engine=amazon_search&amazon_domain=amazon.com&q=${query}&api_key=${apiKey}`;
} else {
  // Regular keyword search with pagination
  url = `https://www.searchapi.io/api/v1/search?engine=amazon_search&amazon_domain=amazon.com&q=${encodeURIComponent(query)}&page=${page}&api_key=${apiKey}`;
}
```

**Single Product Response Format:**
```typescript
function formatSingleProduct(product: Product, asin: string) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Product Details for ASIN:* \`${asin}\``,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<${product.url}|${product.title}>*\n\n*Price:* ${product.price ?? "N/A"}   *Rating:* ${product.rating ?? "N/A"} (${product.ratings_total ?? "N/A"})\n*ETA:* ${product.eta ?? "N/A"}`,
      },
      accessory: product.image ? {
        type: "image",
        image_url: product.image,
        alt_text: product.title,
      } : undefined,
    }
  ];
}
```

**Error Handling Scenarios:**
1. **Invalid ASIN Format**: "❌ Invalid ASIN format. ASINs should be 10 characters starting with 'B' (e.g., B0DWQC12R5)"
2. **ASIN Not Found**: "❌ Product with ASIN `[ASIN]` not found on Amazon US. Please verify the ASIN or try a different search."
3. **Network/API Errors**: Existing error handling from enhanced error system

### Integration Points

**Slash Command Enhancement:**
- Modify `/amazon` command processing in `api/command.ts`
- Add ASIN detection before keyword search
- Route to appropriate search method based on input type

**Thread Refinement Compatibility:**
- ASIN detection works in thread-based queries
- ASIN queries skip refinement logic (can't refine specific product)
- Maintain thread context for buying flow

**Buying Flow Integration:**
- ASIN-sourced products work with existing Crossmint purchasing
- Thread-based buying (`@snack_bot buy this [url]`) unchanged
- Office selection and enhanced error handling unchanged

## COMPLETED: Enhanced Error Handling Implementation ✅

**Problem**: Users received generic error messages when Crossmint purchases failed, making it impossible to understand what went wrong (out of stock, not supported, payment issues, etc.).

**Solution**: Implemented comprehensive error parsing in `generateResponse()` that:

1. **Catches Tool Execution Errors**: Added try-catch around `generateText()` to intercept all tool failures
2. **Parses Crossmint Status Codes**: Created `parseCrossmintError()` function that identifies specific error patterns
3. **User-Friendly Messages**: Maps technical errors to clear, actionable user messages

**Specific Error Scenarios Handled**:
- ❌ **Product Out of Stock**: `quote:all-line-items-unavailable`, "out of stock", "unavailable"
- ❌ **Product Not Supported**: "not supported", "invalid product locator", regional restrictions
- ❌ **Quote Expired**: `quote:expired` - price quotes that have timed out
- ❌ **Shipping Address Required**: `quote:requires-physical-address` - missing delivery info
- ❌ **Payment Failed**: `payment:failed`, "insufficient funds" - wallet/payment issues
- ❌ **Verification Required**: `payment:requires-kyc` - KYC verification needed
- ❌ **Wallet Issue**: Solana/USDC/blockchain transaction problems
- ❌ **Service Busy**: Rate limiting, "too many requests"
- ❌ **Connection Issue**: Network timeouts, 502/503/504 errors
- ❌ **Service Configuration Issue**: API key, authentication problems

**Technical Implementation**:
- Comprehensive error pattern matching using string includes
- Hierarchical error checking (cause → response → data)
- Detailed logging for debugging while showing user-friendly messages
- Fallback to generic message for unrecognized errors

**User Experience Improvement**:
- **Before**: "Sorry, there was an error processing your order."
- **After**: "❌ **Product Out of Stock**: This product is currently unavailable on Amazon. Please try a different product or check back later."

This dramatically improves user experience by helping them understand exactly what went wrong and what action they should take next.

## COMPLETED: Thread-based Query Refinement Feature ✅

### Technical Architecture Overview

**UPDATED STORAGE STRATEGY (Even Better - User's Insight):**

**Recommended Approach: Extract from Bot's Response Message**
- When user replies to `/amazon` results, they're replying to bot's response
- Bot's response always contains: `"Amazon search results for \"[original query]\""`
- Simply scan thread for bot's message with this format and extract query
- **Pros**: 
  - ✅ Even simpler than command scanning
  - ✅ Always present when user replies to results
  - ✅ Consistent format: "Amazon Results for: [query]"
  - ✅ No need to find original slash command
  - ✅ Faster - looking for bot's message format
- **Cons**: 
  - None - this is the perfect approach!

**Implementation Logic:**
```typescript
// In handle-app-mention.ts
// 1. Check if user is replying in a thread to Amazon search results
const threadMessages = await getThread(channel, rootTs, botUserId);
const botResponseMessage = threadMessages.find(msg => 
  msg.role === 'assistant' && 
  typeof msg.content === 'string' && 
  msg.content.includes('Amazon search results for')
);

// 2. Extract the original query from bot's response message
if (botResponseMessage && typeof botResponseMessage.content === 'string') {
  const match = botResponseMessage.content.match(/Amazon search results for "([^"]+)":/);
  if (match) {
    const originalQuery = match[1].trim();
    const refinement = userMessageText; // User's current message
    const combinedQuery = `${originalQuery} ${refinement}`.trim();
    
    // 3. Execute new Amazon search with combined query
    const { products } = await amazonSearchTool.execute({ query: combinedQuery });
    // 4. Format and return results using same formatting as /amazon command
  }
}
```

### Implementation Phases

**Phase 1: Basic Query Extraction & Testing** ✅ COMPLETED
- [x] Implement query extraction from bot response messages  
- [x] Test with simple refinement: user types `@snack_bot i prefer black cases`
- [x] Verify bot correctly extracts "iPhone 15 case" from previous response
- [x] Simple query combination approach: `originalQuery + " " + refinement`

**Phase 2: Full Search Implementation** ✅ COMPLETED  
- [x] Copy Amazon search logic from `api/command.ts` to `handle-app-mention.ts`
- [x] Use identical formatting (`formatProductBlocksStateless`, `getPaginationElements`)
- [x] Return search results with same visual layout as `/amazon` command
- [x] Handle error cases (no products found, API failures)

**Phase 3: Conflict Resolution** ✅ COMPLETED
- [x] **CRITICAL FIX**: Amazon URL detection before refinement logic
- [x] Prevent buying flow interference - detect Amazon links first
- [x] Handle office selection conflicts during buying flow  
- [x] Ensure both flows work correctly in threads

**Phase 4: Enhanced Office Selection** ✅ COMPLETED
- [x] **CRITICAL FIX**: Remove broken Miami/NYC buttons for EST users
- [x] Replace button-based office selection with manual typing for all EST scenarios  
- [x] Enhanced office detection (handle both "Miami" and "Miami Office")
- [x] Consistent manual typing interface across all timezone scenarios

**Phase 5: Testing & Polish** ✅ COMPLETED
- [x] Test refinement flow: `/amazon iPhone case` → `@snack_bot black` → refined results
- [x] Test buying flow: `/amazon product` → select product → `@snack_bot buy this [url]` → purchase
- [x] Test office selection: EST users → manual typing → successful purchase
- [x] Verify no conflicts between the two flows

### Current Status: ✅ FULLY IMPLEMENTED & TESTED

Both thread-based flows now work seamlessly:

1. **Query Refinement Flow**: 
   - User: `/amazon iPhone 15 case`
   - Bot: Returns search results  
   - User: `@snack_bot i prefer black cases`
   - Bot: Returns refined search for "iPhone 15 case black cases"

2. **Buying Flow**: 
   - User: `@snack_bot buy this https://amazon.com/...`
   - Bot: Processes purchase, handles office selection correctly
   - EST users: Manual office typing (no broken buttons)
   - All timezones: Consistent experience

### Key Technical Achievements

✅ **Thread History Scanning**: Extract context from bot's previous response messages  
✅ **Query Intelligence**: Intelligent combination of original query + user refinement  
✅ **Flow Conflict Resolution**: Amazon links → office selection → refinement (priority order)  
✅ **Consistent UX**: Identical formatting between `/amazon` and thread-based searches  
✅ **EST Timezone Fix**: Removed broken buttons, implemented universal manual typing  
✅ **Enhanced Office Detection**: Handles both short ("Miami") and full ("Miami Office") names

## Project Status Board

### Completed ✅
- [x] **Thread-based Query Refinement**: Full implementation with conflict resolution
- [x] **EST Timezone Button Fix**: Removed broken buttons, implemented manual typing  
- [x] **Enhanced Office Detection**: Support for multiple office name formats
- [x] **Enhanced Error Handling**: Specific error messages for different Crossmint failure scenarios
- [x] **ASIN Direct Lookup**: Enable direct product lookups via ASIN identifiers

### In Progress 🔄
- [ ] No current active tasks

### Pending 📋  
- [ ] Switch model to Sonnet 3.7
- [ ] Wallet management and funding flows
- [ ] Slack App Store preparation

## Current Status / Progress Tracking

**Latest Completion**: ASIN Direct Lookup Feature ✅  
**Current Focus**: All major UX enhancement features completed ✅
**Status**: All thread-based functionality working correctly, EST timezone issues resolved, comprehensive error handling implemented, ASIN direct lookup fully functional

**Next Priority**: Switch model to Sonnet 3.7 for improved AI capabilities

## Executor's Feedback or Assistance Requests

**ASIN Lookup Feature Successfully Completed** ✅:
The ASIN Direct Lookup feature has been fully implemented and integrated across all bot interfaces:

**✅ Core Functionality Implemented**:
- **Slash Command**: `/amazon B0DWQC12R5` detects ASIN and shows single product details
- **Thread Support**: ASIN queries in threads work as direct lookups (not refinements)
- **Error Handling**: Invalid ASIN format and not-found cases have specific user messages
- **Single Product Display**: Optimized formatting without pagination for ASIN results

**✅ Technical Implementation**:
- ASIN pattern detection using regex `^B[0-9A-Z]{9}$`
- Validation and normalization functions
- Integrated with existing SearchAPI.io infrastructure
- Consistent visual formatting across slash commands and threads
- Proper error handling with user-friendly messages

**✅ Integration Points**:
- Works seamlessly with existing buying flow (threads → office selection → purchase)
- Compatible with enhanced error handling system
- Maintains thread context for purchase operations
- No conflicts with existing refinement or buying flows
- **NEW: ASIN Buying Support** - Users can now buy products directly with ASINs: `@snack_bot buy this B0DWQC12R5`

**All major UX enhancement features are now complete**. The bot now supports:
1. Thread-based query refinement for conversational search
2. Direct ASIN lookup for efficient product discovery
3. Enhanced error handling for all failure scenarios
4. Robust office selection across all timezone scenarios
5. **NEW: ASIN-based purchasing** - Direct buying with ASINs

The codebase is ready for the next phase of development (Sonnet 3.7 integration, wallet management, etc.). 

## Lessons

1. **EST timezone users experienced broken Miami/NYC office selection buttons** - Fixed by implementing universal manual typing interface for office selection
2. **Thread flows can conflict** - Amazon link detection must happen before refinement logic to prevent buying flow interference  
3. **Office name variations** - Users might type "Miami" or "Miami Office", system needs to handle both formats
4. **Query refinement requires careful thread scanning** - Bot's response message format "Amazon search results for \"[query]\":" is the most reliable source for original query extraction
5. **Testing both flows together is critical** - Individual flows working doesn't guarantee they work together without conflicts
6. **We will run `npm run build` to check for compilation errors before moving on to test the end-to-end flow** - Essential for catching TypeScript issues early
7. **Error handling at AI SDK level is too generic** - Need to catch tool execution errors and parse Crossmint-specific status codes for meaningful user feedback
8. **Crossmint returns specific status codes** - `quote:all-line-items-unavailable`, `payment:failed`, etc. that can be mapped to user-friendly messages
9. **Error parsing requires comprehensive pattern matching** - Check multiple error object properties (cause, response, data) and various string patterns
10. **ASIN detection requires precise pattern matching** - ASINs follow specific format `B[0-9A-Z]{9}` and SearchAPI.io supports direct ASIN queries for efficient lookups
11. **ASIN queries should be treated as new lookups, not refinements** - In thread contexts, ASIN queries should bypass refinement logic and execute direct product lookups for better UX
12. **ASIN buying can leverage existing URL-based flow** - By fetching product URL from SearchAPI and replacing the user message, ASIN purchases can reuse the existing Crossmint buying infrastructure seamlessly 