# Background and Motivation

The current Slack bot (Snackbot) was designed to automate office snack and equipment ordering, but it has seen little to no adoption internally at Crossmint or externally. Manual purchasing is still the norm. The goal is to revamp the bot to make it more useful, reliable, and attractive for both internal and external users, and to prepare it for Slack App Store distribution.

**NEW FEATURE REQUEST: Thread-based Query Refinement**
Users want to refine their Amazon search queries through natural conversation in threads. After using `/amazon [query]`, users should be able to mention the bot in a thread reply with refinements like "I was looking for non-flavoured sparkling water" to get enhanced search results using the same formatting as the original slash command.

**NEW FEATURE REQUEST: ASIN Direct Lookup**
When users provide an Amazon ASIN (e.g., `/amazon B0DWQC12R5`), the bot should detect this is an ASIN identifier and fetch that specific product directly instead of doing a general search. This would make the bot much more efficient for users who know the exact product they want.

**NEW FEATURE REQUEST: Order History Lookup**
Users want to easily see products they've previously bought through the bot. A new `/orders` slash command should fetch and display their purchase history using Crossmint's orders API, showing order details, status, and purchase dates in a user-friendly Slack format.

**NEW FEATURE REQUEST: "Select This" Product Buttons**
After search results are displayed, it's unclear what the next step should be. Users need a clear UI element to indicate purchase intent. Each product result card should have a "Select This" button that:
1. Opens a thread reply to the search results
2. Auto-generates the purchase command: "@Office Snacks buy me this [ASIN]"
3. Waits for user to press enter to trigger the command
4. Streamlines the purchase flow from search → selection → purchase

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

**Order History Lookup Analysis:**
- **API Integration**: Crossmint orders endpoint `/api/2025-06-15/orders?recipient={email}&page={page}&perPage={perPage}`
- **Email Resolution**: Reuse existing Slack email fetching logic from `getUserEmail()` and `getUserProfile()`
- **Slash Command Structure**: Follow existing `/amazon` command pattern in `api/command.ts`
- **Response Formatting**: Display orders in Slack blocks with product details, dates, and status
- **Pagination Strategy**: Handle multiple pages of order history with navigation controls
- **Error Handling**: No orders found, API failures, email resolution issues

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
   - [x] **ASIN Direct Lookup** ✅ - Enable direct ASIN queries for specific product fetching
   - [x] **Order History Lookup** ✅ - Enable users to view their purchase history via `/orders` command
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

## COMPLETED: "Select This" Product Buttons with Automated Purchase Flow ✅

### Problem Solved
Users had no clear way to proceed from search results to actual purchase. The gap between "I found products" and "buy this specific one" was causing friction in the user experience.

### Solution Implemented
Added "🛒 Select This" buttons to each product result card that:

1. **Automated Purchase Trigger**: Directly posts buy command (`@bot buy me this [ASIN]`) and simulates app mention event
2. **No Manual Typing Required**: User just clicks button - no need to manually type purchase commands
3. **Preserved Search Results**: Fixed issue where search results would disappear when buttons were clicked
4. **Selection Tracking**: Maintains a single `🛒 Selected Products:` message that accumulates all selections
5. **Duplicate Prevention**: Prevents same product from being added to selection list multiple times

### Technical Implementation Details

**Button Integration:**
- Added to `formatProductBlocksStateless()` in both `api/command.ts` and `lib/handle-app-mention.ts`
- Each product gets a "Select This" button with ASIN, product index, and title in button value
- Primary style with shopping cart emoji for clear visual guidance

**Purchase Flow Automation:**
```typescript
// Direct purchase flow trigger (no self-tagging issues)
const buyCommandText = `<@${botUserId}> buy me this ${asin}`;
const buyMessage = await client.chat.postMessage({
    channel: channelId,
    thread_ts: messageTs,
    text: buyCommandText
});

// Simulate app mention to trigger existing purchase logic
const simulatedEvent = {
    type: 'app_mention',
    user: payload.user.id,
    text: buyCommandText,
    ts: buyMessage.ts,
    thread_ts: messageTs,
    channel: channelId
};
handleNewAppMention(simulatedEvent, botUserId);
```

**Search Results Preservation:**
- Added `replace_original: false` to all ephemeral responses
- Fixed duplicate handlers (both URL-encoded and JSON were processing same clicks)
- Unified selection logic across both content type handlers

**Selection Tracking:**
- Single accumulated message: `🛒 Selected Products:`
- Updates existing message instead of creating new ones per selection
- ASIN-based duplicate detection to prevent double entries

### User Experience Flow
1. **User searches**: `/amazon energy drinks` → Gets search results with products
2. **User selects**: Clicks "🛒 Select This" on preferred product
3. **Bot responds**: Posts buy command in thread and starts purchase flow
4. **Purchase proceeds**: Bot asks for office selection, processes payment automatically
5. **Clean tracking**: All selections accumulate in one message, search results stay visible

### Expected Logs
```
[COMMAND] Posted buy command message: <@U123> buy me this B0CW7K5ZWK
[COMMAND] Triggering purchase flow for ASIN: B0CW7K5ZWK
[COMMAND] Updated existing selection message with new product
```

This completes the streamlined search → selection → purchase flow that was requested!

## COMPLETED: Purchase vs Refinement Flow Separation ✅

### Problem Solved
Refinement queries (like `@bot green cases only`) were incorrectly triggering office detection and purchase flow instead of just performing search refinement. Users expected refinement to only search and display results, not ask for office location.

### Root Cause Identified
The `handleNewAppMention` function had a **flow-through issue**:
1. Refinement logic would execute and post results
2. **BUT** the function would continue executing and fall through to office detection logic
3. This caused refinement queries to trigger "I couldn't detect your office location" messages

### Solution Implemented
**Clear Flow Separation with Early Returns:**

**1. Purchase Intent Detection:**
```typescript
// Detect purchase vs refinement intent
const isPurchaseRequest = containsAmazonLink || containsAsinBuy || containsBuyIntent;

// Purchase patterns detected:
// - Amazon URLs
// - "buy this B0123456789" 
// - "buy", "purchase", "order", "get me" keywords
```

**2. Explicit Flow Routing:**
```typescript
if (isPurchaseRequest) {
  console.log("[DEBUG] PURCHASE FLOW: Processing purchase request");
  // Handle Amazon links, ASIN buys, general purchase requests
  // Continue to office detection logic
} else {
  console.log("[DEBUG] REFINEMENT FLOW: Not a purchase request");
  // Handle refinement queries
  // Search API + display results
  return; // ⭐ EARLY RETURN prevents office detection
}
```

**3. Improved Buy Intent Detection:**
- Enhanced ASIN pattern: `/buy\s+(this|me this)\s+([A-Z0-9\s]+)/i`
- General buy keywords: `/\b(buy|purchase|order|get me)\b/i`
- Multiple validation layers

### Expected User Experience

**✅ Refinement Query (No Office Detection):**
```
User: /amazon iPhone cases
Bot: [Shows search results]
User: @bot green cases only
Bot: 🔍 Refined Search Results for "iPhone cases green cases":
     [Shows refined results] 
     ✅ NO office location prompt
```

**✅ Purchase Request (With Office Detection):**
```
User: @bot buy me this B0123456789
Bot: Processing ASIN purchase...
Bot: I couldn't detect your office location. Please reply with...
     ✅ Office detection works as expected
```

### Key Improvements
- **Clean Flow Separation**: Purchase and refinement are completely isolated
- **Early Returns**: Refinement flow returns immediately after displaying results
- **Better Intent Detection**: Multiple patterns for detecting purchase vs refinement
- **Comprehensive Debugging**: Clear logging shows which flow is executing
- **User-Friendly Messages**: Clear error messages when no search context exists

### Test Scenarios Covered
✅ **Refinement queries**: No office detection triggered  
✅ **ASIN purchases**: Office detection works  
✅ **Amazon URL purchases**: Office detection works  
✅ **General buy requests**: Office detection works  
✅ **Invalid refinements**: Helpful error messages  

This fix ensures the bot behaves intuitively - refinement queries only refine searches, purchase requests only trigger purchases.

## Project Status Board

### Completed ✅
- [x] **Thread-based Query Refinement**: Full implementation with conflict resolution
- [x] **EST Timezone Button Fix**: Removed broken buttons, implemented manual typing  
- [x] **Enhanced Office Detection**: Support for multiple office name formats
- [x] **Enhanced Error Handling**: Specific error messages for different Crossmint failure scenarios
- [x] **ASIN Direct Lookup**: Enable direct product lookups via ASIN identifiers
- [x] **ASIN-based Buying**: Direct purchasing with ASINs (`@snack_bot buy this B0DWQC12R5`)
- [x] **Order History Lookup**: Complete `/orders` command with pagination and proper formatting
- [x] **"Select This" Product Buttons**: Streamlined purchase flow with auto-generated buy commands

### In Progress 🔄
- [ ] **Nothing currently in progress**

### Pending 📋  
- [ ] Switch model to Sonnet 3.7
- [ ] Wallet management and funding flows
- [ ] Slack App Store preparation

## Current Status / Progress Tracking

**Latest Completion**: ASIN-based Buying Enhancement ✅  
**Current Focus**: Order History Lookup Feature Planning ✅
**Status**: All thread-based functionality working correctly, EST timezone issues resolved, comprehensive error handling implemented, ASIN direct lookup and buying fully functional

**Next Priority**: Order History implementation to complete user purchase management experience

## Executor's Feedback or Assistance Requests

**Order History Feature Ready for Implementation** 🚀:
The planning phase for Order History lookup is complete with comprehensive technical analysis. Ready to proceed with systematic implementation:

**✅ Planning Complete**:
- **API Integration Strategy**: Crossmint orders endpoint `/api/2025-06-15/orders` fully analyzed
- **Infrastructure Reuse**: Leveraging existing slash command, email fetching, and pagination systems
- **Implementation Phases**: 5 detailed phases with clear success criteria defined
- **Technical Design**: Complete API client, formatting, and error handling patterns designed

**🔧 Implementation Ready**:
1. **Phase 1**: Crossmint Orders API Integration
2. **Phase 2**: `/orders` Slash Command Implementation  
3. **Phase 3**: Order Display Formatting
4. **Phase 4**: Error Handling & Edge Cases
5. **Phase 5**: Integration Testing & Polish

**🎯 Key Benefits**:
- **User Value**: Easy access to purchase history and order tracking
- **Infrastructure Reuse**: Leverages existing components for faster development
- **Consistent UX**: Matches existing command patterns and error handling
- **Scalable Design**: Pagination and API integration ready for high usage

**Previous Success - ASIN Enhancement** ✅:
Successfully implemented complete ASIN support including:
- Direct ASIN lookup: `/amazon B0DWQC12R5` 
- ASIN-based buying: `@snack_bot buy this B0DWQC12R5`
- Thread integration and comprehensive error handling

All technical details, patterns, and implementation approaches have been defined. The Order History feature integrates cleanly with existing systems without breaking current functionality.

## PLANNED: Order History Lookup Feature

### Technical Architecture Overview

**Current Infrastructure Analysis:**
- ✅ Slash command structure established in `api/command.ts` (`/amazon` command)
- ✅ Email fetching logic exists: `getUserEmail()` and `getUserProfile()` in `slack-utils.ts`
- ✅ Slack block formatting patterns in `formatProductBlocksStateless()`
- ✅ Pagination controls implementation in `getPaginationElements()`
- ✅ Error handling patterns established throughout codebase
- ✅ Enhanced error parsing for user-friendly messages in `generate-response.ts`

**Crossmint Orders API Integration:**
- **Endpoint**: `/api/2025-06-15/orders?recipient={email}&page={page}&perPage={perPage}`
- **Authentication**: Use existing `CROSSMINT_API_KEY` environment variable
- **Response Format**: JSON with order objects containing product details, dates, status
- **Pagination**: Built-in page/perPage parameters for handling large order histories

**Reusable Components Strategy:**
1. **Slash Command Framework**: Extend existing command handler in `api/command.ts`
2. **Email Resolution**: Reuse `getUserEmail(user)` pattern from app mentions
3. **Slack Formatting**: Adapt `formatProductBlocksStateless()` for order display
4. **Pagination Logic**: Reuse `getPaginationElements()` for order history navigation  
5. **Error Handling**: Extend existing Crossmint error parsing patterns

### Implementation Phases

**Phase 1: Crossmint Orders API Integration** 
- [ ] Create new Crossmint orders API client function
- [ ] Add order data type definitions (Order, OrderStatus, etc.)
- [ ] Implement API call with error handling and pagination
- [ ] Test API integration with valid email addresses
- **Success Criteria**: Successfully fetch order data from Crossmint API

**Phase 2: Slash Command Implementation**
- [ ] Add `/orders` command handler to `api/command.ts`
- [ ] Integrate email resolution from Slack user ID
- [ ] Handle command parsing and parameter validation
- [ ] Add command routing logic alongside existing `/amazon` command
- **Success Criteria**: `/orders` command correctly processes and routes requests

**Phase 3: Order Display Formatting**
- [ ] Create `formatOrderBlocksStateless()` function for Slack display
- [ ] Design order card layout with product details, date, status
- [ ] Implement pagination controls for order history navigation
- [ ] Add header with user email and total order count
- **Success Criteria**: Orders display clearly with all relevant information

**Phase 4: Error Handling & Edge Cases**
- [ ] Handle cases where user email is not found
- [ ] Handle empty order history with helpful messaging
- [ ] Handle Crossmint API errors with specific user messages
- [ ] Test pagination edge cases (first/last page, single page)
- **Success Criteria**: Comprehensive error handling for all failure scenarios

**Phase 5: Integration Testing & Polish**
- [ ] Test command with various user accounts and order histories
- [ ] Verify pagination works across multiple pages
- [ ] Test error scenarios and user experience
- [ ] Integration with existing slash command infrastructure
- **Success Criteria**: End-to-end functionality works reliably for all users

### Technical Implementation Details

**Crossmint API Client:**
```typescript
interface CrossmintOrder {
  id: string;
  status: string;
  createdAt: string;
  total: string;
  currency: string;
  recipient: string;
  lineItems: {
    productName: string;
    quantity: number;
    price: string;
    productUrl?: string;
  }[];
}

async function fetchUserOrders(email: string, page: number = 1, perPage: number = 10) {
  const apiKey = process.env.CROSSMINT_API_KEY;
  const response = await fetch(
    `https://api.crossmint.com/api/2025-06-15/orders?recipient=${encodeURIComponent(email)}&page=${page}&perPage=${perPage}`,
    { headers: { 'Authorization': `Bearer ${apiKey}` } }
  );
  return response.json();
}
```

**Order Display Format:**
```typescript
function formatOrderBlocksStateless(orders: CrossmintOrder[], page: number, totalPages: number, userEmail: string) {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Order History for:* ${userEmail}  |  *Page:* ${page} of ${totalPages}` }
    },
    ...orders.map(order => ({
      type: "section",
      text: {
        type: "mrkdwn", 
        text: `*Order #${order.id}*\n*Date:* ${formatDate(order.createdAt)}\n*Status:* ${order.status}\n*Total:* ${order.total} ${order.currency}\n*Items:* ${order.lineItems.map(item => item.productName).join(', ')}`
      }
    })),
    { type: "actions", elements: getPaginationElements(`orders:${userEmail}`, page, totalPages) }
  ];
}
```

**Slash Command Integration:**
```typescript
// In api/command.ts - extend existing command handling
if (params.command === "/orders") {
  const userId = params.user_id;
  const userEmail = await getUserEmail(userId);
  
  if (!userEmail) {
    return errorResponse("Could not retrieve your email address for order lookup.");
  }
  
  const { orders, pagination } = await fetchUserOrders(userEmail, 1, 5);
  const blocks = formatOrderBlocksStateless(orders, 1, pagination.totalPages, userEmail);
  
  return slackResponse("in_channel", `Your order history:`, blocks);
}
```

**Error Handling Scenarios:**
1. **No Email Found**: "❌ Could not retrieve your email address. Please ensure your Slack profile has an email configured."
2. **No Orders Found**: "📦 No previous orders found for your account. Start shopping with `/amazon [search query]`!"
3. **API Error**: "❌ Unable to retrieve order history. Please try again later or contact support."
4. **Pagination Error**: "❌ Error loading page. Please try navigating to a different page."

### Integration Points

**Slash Command Extension:**
- Extend existing command router in `api/command.ts`
- Add `/orders` alongside `/amazon` command processing
- Reuse form data parsing and response formatting patterns

**Email Resolution Integration:**
- Leverage existing `getUserEmail()` function from Slack utilities
- Handle email resolution errors with existing patterns
- Maintain user privacy and data handling standards

**Pagination System Integration:**
- Extend existing pagination button system for orders
- Reuse `getPaginationElements()` with order-specific parameters
- Handle order pagination alongside Amazon search pagination

**Error Handling Integration:**
- Extend existing Crossmint error parsing in `generate-response.ts`
- Add order-specific error patterns and user messages
- Maintain consistent error experience across all features 

**"Select This" Product Buttons Analysis:**
- **UX Enhancement**: Clear call-to-action buttons on each product card to indicate purchase intent
- **Automated Threading**: Automatically creates threaded replies to search results when button is clicked
- **Bot Self-Tagging**: Bot posts the buy command and tags itself: `@Office Snacks buy me this [ASIN]`
- **Seamless Flow**: User clicks button → Thread created → Buy command posted → Bot processes automatically
- **ASIN-based Integration**: Leverages existing ASIN buying capabilities for immediate purchase processing
- **Visual Design**: Primary-styled buttons with shopping cart emoji for clear user guidance 