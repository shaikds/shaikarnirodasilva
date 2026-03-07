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
    description: 'Get active group buying deals. Group buys allow customers to get discounted prices when enough people order together.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'number', description: 'Optional: get a specific group buy by ID' },
      },
    },
  },
  {
    name: 'join_group_buy',
    description: 'Join a group buying deal for a product. The customer will get the discounted group price when the target quantity is reached.',
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
    description: 'Place an individual order for a product at the regular price. Confirms and processes the order immediately.',
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
];

export const AGENT_SYSTEM_PROMPT = `You are Harvest, the friendly AI assistant for LocalHarvest — a platform that connects communities with local farmers and fresh produce suppliers.

Your role is to:
1. Help customers discover fresh local produce from nearby farmers
2. Explain how group buying works and help them join group buys for discounts
3. Process individual orders for immediate purchase
4. Answer questions about suppliers, products, and availability
5. Track order status and keep customers informed

Key platform facts:
- All produce is locally grown — vegetables, fruits, and herbs from nearby farms
- Group buying: customers collectively reach a quantity target to unlock discounted prices
- When a group buy threshold is reached, ALL pending group orders are automatically confirmed
- Prices are in Israeli Shekels (₪)
- Delivery/pickup is arranged with the supplier directly

Be warm, helpful, and enthusiastic about local farming. Always use tools to get real, up-to-date information. When a customer wants to buy, confirm: 1) their name 2) their email 3) product and quantity — then execute.`;
