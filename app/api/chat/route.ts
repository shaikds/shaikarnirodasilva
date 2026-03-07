import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  searchProducts,
  getAllProducts,
  getAllSuppliers,
  getGroupBuyById,
  getAllGroupBuys,
  joinGroupBuy,
  createOrder,
  getProductById,
  getOrdersByEmail,
  getOrderById,
} from '@/lib/db';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const tools: Anthropic.Tool[] = [
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
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
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
    description: 'Join a group buying deal for a product. The customer will get the discounted group price when the target quantity is reached. If the threshold is met, all orders are automatically confirmed.',
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

// ─── Tool Executor ─────────────────────────────────────────────────────────────

function executeTool(name: string, input: Record<string, unknown>): string {
  try {
    switch (name) {
      case 'search_products': {
        const { query, category } = input as { query: string; category?: string };
        const results = searchProducts(query);
        const filtered = category
          ? results.filter((p: Record<string, unknown>) => (p.category as string)?.toLowerCase() === category.toLowerCase())
          : results;
        return JSON.stringify(filtered.length > 0 ? filtered : { message: 'No products found for that search' });
      }

      case 'get_all_products': {
        const { category } = input as { category?: string };
        const products = getAllProducts(category);
        return JSON.stringify(products);
      }

      case 'get_suppliers': {
        const suppliers = getAllSuppliers();
        return JSON.stringify(suppliers);
      }

      case 'get_group_buys': {
        const { id } = input as { id?: number };
        if (id) {
          const gb = getGroupBuyById(id);
          return JSON.stringify(gb || { error: 'Group buy not found' });
        }
        const groupBuys = getAllGroupBuys('active');
        return JSON.stringify(groupBuys);
      }

      case 'join_group_buy': {
        const { group_buy_id, customer_name, customer_email, quantity } = input as {
          group_buy_id: number; customer_name: string; customer_email: string; quantity: number;
        };
        const result = joinGroupBuy(group_buy_id, customer_name, customer_email, quantity);
        return JSON.stringify({
          success: true,
          order_id: result.orderId,
          threshold_reached: result.threshold_reached,
          product_name: result.product_name,
          message: result.threshold_reached
            ? `The group buy target was reached! All orders for ${result.product_name} are now confirmed at the group discount price.`
            : `Successfully joined the group buy for ${result.product_name}. Your order will be confirmed when the group reaches its target.`,
        });
      }

      case 'place_order': {
        const { product_id, customer_name, customer_email, quantity, notes } = input as {
          product_id: number; customer_name: string; customer_email: string; quantity: number; notes?: string;
        };
        const product = getProductById(product_id) as { price: number; stock_qty: number; name: string; unit: string } | undefined;
        if (!product) return JSON.stringify({ error: 'Product not found' });
        if (product.stock_qty < quantity) {
          return JSON.stringify({ error: `Only ${product.stock_qty} ${product.unit} available in stock` });
        }
        const orderId = createOrder({ customer_name, customer_email, product_id, quantity, unit_price: product.price, notes });
        return JSON.stringify({
          success: true,
          order_id: orderId,
          product_name: product.name,
          quantity,
          unit: product.unit,
          unit_price: product.price,
          total_price: product.price * quantity,
          message: `Order confirmed! ${quantity} ${product.unit} of ${product.name} ordered for ₪${(product.price * quantity).toFixed(2)}.`,
        });
      }

      case 'get_order_status': {
        const { customer_email, order_id } = input as { customer_email: string; order_id?: number };
        if (order_id) {
          const order = getOrderById(order_id);
          return JSON.stringify(order || { error: 'Order not found' });
        }
        const orders = getOrdersByEmail(customer_email);
        return JSON.stringify(orders.length > 0 ? orders : { message: 'No orders found for this email' });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : 'Tool execution failed' });
  }
}

// ─── Chat Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json() as {
      messages: Anthropic.MessageParam[];
    };

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
    }

    const systemPrompt = `You are Harvest, the friendly AI assistant for LocalHarvest — a platform that connects communities with local farmers and fresh produce suppliers.

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

Be warm, helpful, and enthusiastic about local farming. Always use tools to get real, up-to-date information about products and availability. When a customer wants to buy something, guide them through the process step by step.

If a customer wants to place an order, always confirm:
1. Their name
2. Their email
3. The product and quantity

Then proceed to execute the order using the appropriate tool.`;

    let currentMessages = [...messages];

    // Agentic loop — run until no more tool calls
    while (true) {
      const response = await client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        thinking: { type: 'adaptive' },
        system: systemPrompt,
        tools,
        messages: currentMessages,
      });

      if (response.stop_reason === 'end_turn') {
        // Extract only text content for the final reply
        const textBlocks = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('');

        return NextResponse.json({
          role: 'assistant',
          content: textBlocks,
        });
      }

      if (response.stop_reason === 'tool_use') {
        // Add assistant response to history
        currentMessages.push({ role: 'assistant', content: response.content });

        // Execute all tool calls
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            const result = executeTool(block.name, block.input as Record<string, unknown>);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        // Add tool results to history and continue
        currentMessages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Unexpected stop reason
      break;
    }

    return NextResponse.json({ error: 'Unexpected agent state' }, { status: 500 });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: 'Failed to process chat message' }, { status: 500 });
  }
}
