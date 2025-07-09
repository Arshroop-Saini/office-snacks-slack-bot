# Background and Motivation

The current Slack bot (Snackbot) was designed to automate office snack and equipment ordering, but it has seen little to no adoption internally at Crossmint or externally. Manual purchasing is still the norm. The goal is to revamp the bot to make it more useful, reliable, and attractive for both internal and external users, and to prepare it for Slack App Store distribution.

# Key Challenges and Analysis

- **Product discovery does not start in Slack**: Users default to Amazon, not the bot.
- **No notification system**: No reminders or prompts for DRIs to purchase.
- **No automation/recurring purchase flow**: All purchases are manual.
- **Impossible to fund the agent’s wallet easily**: No UI or flow for this.
- **Budget is shared, not user-based**: All users draw from a single wallet.
- **No context or recommendations**: The bot interface is a blank slate, with no personalized or historical suggestions.
- **No product search by name/description**: Users must paste Amazon links.
- **No product previews or details**: No images, cost, ratings, or ETA shown.
- **Does not work in channels**: Only DMs supported.
- **Not available on Slack App Store**: Not ready for external adoption.

# High-level Task Breakdown

## V0 (Reliability & Core Features)
1. **Ensure bot works reliably for Amazon US orders**
   - [x] Test and fix order submission flow
   - [x] Ensure pasted Amazon links are processed and purchased
2. **Enable product search by name/description**
   - [ ] Integrate Amazon product search API or scraping
   - [ ] Return product options with preview image, cost, ratings, ETA
   - [ ] Allow user to pick a product to purchase
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

## V1+ (Product/UX Improvements)
- [ ] Notification system for DRIs
- [ ] Automation/recurring purchase flows
- [ ] User-based budgets and funding
- [ ] Personalized recommendations (history, office, user)
- [ ] Contextual interface improvements

## Project Status Board

- [x] 1. Initial slash command returns valid Slack message with product blocks
- [x] 2. Pagination: Only 10 products per page, robust Next/Back navigation, never more than 50 blocks
- [x] 3. Next/Back buttons update the message in place and always show correct products
- [ ] 4. Product selection (Select button) triggers order flow (to be implemented)
- [x] Test and fix Amazon order submission flow
- [x] Process pasted Amazon links for purchase
- [ ] Integrate Amazon product search (name/description) (in progress)
- [ ] Return product options with preview, cost, ratings, ETA
- [ ] Allow user to pick product to purchase
- [ ] Channel support
- [ ] Switch to Sonnet 3.7 model
- [ ] Single wallet for all orders
- [ ] Manual wallet funding (DRI)
- [ ] Admin wallet setup on install
- [ ] Slack App Store prep (onboarding, error handling)

# Executor's Feedback or Assistance Requests

- Verified: Bot is working for general order placement when sent an Amazon link. Order submission flow and link processing are complete and functional.
- Starting implementation of Amazon product search tool (SearchApi.io) for /search command integration.
- User reports: Select button does not trigger order flow, and bot only responds when tagged. Needs end-to-end fix so Select triggers order flow and bot responds in thread/DM without tagging.

# Lessons

_(To be filled during execution)_ 