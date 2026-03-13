import type Anthropic from '@anthropic-ai/sdk';

// ─── Tool Definitions (Single Responsibility: only definitions, no logic) ─────

export const agentTools: Anthropic.Tool[] = [
  {
    name: 'search_products',
    description: 'Search for fresh produce and products available from local farmers. Use this to find specific vegetables, fruits, or herbs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search term (e.g., "tomatoes", "citrus", "herbs")' },
        category: { type: 'string', description: 'Optional: filter by category (Vegetables, Fruits, Herbs)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_all_products',
    description: 'Get all available products from local farmers. Optionally filter by category.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: { type: 'string', description: 'Optional filter: Vegetables, Fruits, or Herbs' },
      },
    },
  },
  {
    name: 'get_suppliers',
    description: 'Get a list of all local farmers and suppliers on the platform.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_group_buys',
    description: 'Get active group buying deals. Optionally filter by city to show only local groups.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'number', description: 'Optional: get a specific group buy by ID' },
        city: { type: 'string', description: 'Optional: filter by city to show local groups' },
      },
    },
  },
  {
    name: 'find_local_group',
    description: 'Search for active group buys AND other consumers in the same city looking to buy similar products. Use this when a consumer wants to buy something and you want to find neighbors to buy with.',
    input_schema: {
      type: 'object' as const,
      properties: {
        city: { type: 'string', description: 'The consumer\'s city (must be an Israeli city)' },
        product_query: { type: 'string', description: 'What the consumer wants to buy (e.g., "fruits and vegetables", "tomatoes oranges")' },
      },
      required: ['city', 'product_query'],
    },
  },
  {
    name: 'register_buying_intent',
    description: 'Register a consumer\'s intent to buy something locally. The agent will try to form a local group until the deadline. Use this when no immediate local group is found.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_name: { type: 'string', description: 'Consumer full name' },
        customer_email: { type: 'string', description: 'Consumer email address' },
        city: { type: 'string', description: 'Consumer city (Israeli city)' },
        neighborhood: { type: 'string', description: 'Optional: neighborhood within the city' },
        product_query: { type: 'string', description: 'What they want to buy' },
        deadline: { type: 'string', description: 'ISO date string: how long to keep searching (e.g., "2025-03-15")' },
      },
      required: ['customer_name', 'customer_email', 'city', 'product_query', 'deadline'],
    },
  },
  {
    name: 'get_my_requests',
    description: 'Get all open buying requests for a consumer by their email. Shows status of group-forming attempts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_email: { type: 'string', description: 'Consumer email address' },
      },
      required: ['customer_email'],
    },
  },
  {
    name: 'join_group_buy',
    description: 'Join a group buying deal for a product. The customer will get the discounted group price when the target quantity is reached. Always get explicit approval from the user before calling this.',
    input_schema: {
      type: 'object' as const,
      properties: {
        group_buy_id: { type: 'number', description: 'The ID of the group buy to join' },
        customer_name: { type: 'string', description: 'Customer full name' },
        customer_email: { type: 'string', description: 'Customer email address' },
        quantity: { type: 'number', description: 'Quantity to order (in the product unit, e.g., kg)' },
      },
      required: ['group_buy_id', 'customer_name', 'customer_email', 'quantity'],
    },
  },
  {
    name: 'place_order',
    description: 'Place an individual order for a product at the regular price. Always get explicit approval from the user before calling this.',
    input_schema: {
      type: 'object' as const,
      properties: {
        product_id: { type: 'number', description: 'The ID of the product to order' },
        customer_name: { type: 'string', description: 'Customer full name' },
        customer_email: { type: 'string', description: 'Customer email address' },
        quantity: { type: 'number', description: 'Quantity to order' },
        notes: { type: 'string', description: 'Optional special instructions or notes' },
      },
      required: ['product_id', 'customer_name', 'customer_email', 'quantity'],
    },
  },
  {
    name: 'get_order_status',
    description: 'Check the status of orders for a customer by their email address.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_email: { type: 'string', description: 'Customer email to look up orders' },
        order_id: { type: 'number', description: 'Optional: check a specific order by ID' },
      },
      required: ['customer_email'],
    },
  },
  {
    name: 'create_buying_team',
    description: 'Create a buying team within an active group buy. The consumer becomes the team creator and gets a shareable invite link to send to friends and neighbors. Use this when a consumer wants to invite specific people to buy together.',
    input_schema: {
      type: 'object' as const,
      properties: {
        group_buy_id: { type: 'number', description: 'The ID of the group buy to create a team within' },
        customer_name: { type: 'string', description: 'Team creator full name' },
        customer_email: { type: 'string', description: 'Team creator email address' },
        quantity: { type: 'number', description: "Creator's own quantity to pledge" },
      },
      required: ['group_buy_id', 'customer_name', 'customer_email', 'quantity'],
    },
  },
  {
    name: 'recommend_alternatives',
    description: 'When a local group could not be formed by the deadline, recommend nearby Israeli supermarkets and online grocery options.',
    input_schema: {
      type: 'object' as const,
      properties: {
        city: { type: 'string', description: 'The consumer\'s city' },
        product_query: { type: 'string', description: 'What they wanted to buy' },
      },
      required: ['city'],
    },
  },
];

export const AGENT_SYSTEM_PROMPT = `You are Harvest, the AI assistant for LocalHarvest — a platform that connects communities with local farmers and fresh produce in Israel.

Your primary goal is to help consumers buy together with their neighbors from the same city or neighborhood. Local group buying is the most convenient option because everyone is nearby for pickup or delivery coordination.

HOW YOU WORK:

1. When a consumer wants to buy produce:
   - First ask for their city (and optionally neighborhood) if not provided.
   - Explain that buying locally with neighbors is most convenient — same area means easy coordination.
   - Call find_local_group to check if there are active group buys or other requests in their city.
   - If a matching local group exists: present it and ask for approval before joining.
   - If no local group exists yet: ask until what date they want you to keep searching. Then call register_buying_intent to register their request. Tell them you will keep looking for neighbors in their city.
   - Groups are ONLY formed within the same city or neighborhood. Never mix people from different cities.

2. Before placing any order (individual or group):
   - Always present the details (product, quantity, price, total) and ask for explicit confirmation.
   - Never execute an order without the consumer saying yes.

3. If deadline passes with no local group formed:
   - Call recommend_alternatives to suggest nearby supermarkets and online grocery options in their city.

4. For subscriptions (weekly orders):
   - The system automatically tries to join a local group buy first, then falls back to individual order.
   - Consumers can set up weekly auto-orders for recurring needs.

5. For order status checks: use get_order_status.

PLATFORM FACTS:
- All produce is locally grown in Israel — vegetables, fruits, and herbs.
- Prices are in Israeli Shekels (ILS).
- Group buying: consumers collectively reach a quantity target to unlock discounted prices.
- When a group buy threshold is reached, ALL pending group orders are automatically confirmed.
- Delivery or pickup is arranged directly with the supplier.
- Groups are city/neighborhood based — only people from the same area.

TONE:
- Be clear and direct. No filler words.
- Do not use emojis.
- Always confirm before executing any purchase.
- When no local group exists, proactively suggest the consumer connect with neighbors — it is most convenient for everyone in the area.`;
