// ─── Tool Executor (Single Responsibility: maps tool names → DB calls) ─────────

import {
  searchProducts,
  getAllProducts,
  getAllSuppliers,
  getGroupBuyById,
  getAllGroupBuys,
  getGroupBuysByCity,
  findMatchingGroupBuys,
  joinGroupBuy,
  createOrder,
  getProductById,
  getOrdersByEmail,
  getOrderById,
  registerBuyingIntent,
  getRequestsByEmail,
  findMatchingRequests,
  createTeam,
  getDayName,
  getNextCutoffDate,
} from '@/lib/db';

const ISRAELI_SUPERMARKETS = [
  { name: 'Shufersal', website: 'https://www.shufersal.co.il', note: 'Largest chain, delivery available nationwide' },
  { name: 'Rami Levy', website: 'https://www.rami-levy.co.il', note: 'Competitive prices, many branches' },
  { name: 'Victory', website: 'https://www.victory.co.il', note: 'Wide selection, online ordering' },
  { name: 'Yochananof', website: 'https://www.yochananof.co.il', note: 'Fresh produce focus' },
  { name: 'Mega', website: 'https://www.mega.co.il', note: 'Online grocery delivery' },
  { name: 'AM:PM', website: 'https://www.ampm.co.il', note: 'Convenience stores, extended hours' },
  { name: 'Osher Ad', website: 'https://www.osherad.co.il', note: 'Warehouse prices' },
];

export function executeTool(name: string, input: Record<string, unknown>): string {
  try {
    switch (name) {
      case 'search_products': {
        const { query, category } = input as { query: string; category?: string };
        const results = searchProducts(query);
        const filtered = category
          ? results.filter(p => p.category?.toLowerCase() === category.toLowerCase())
          : results;
        return JSON.stringify(filtered.length > 0 ? filtered : { message: 'No products found' });
      }

      case 'get_all_products': {
        const { category } = input as { category?: string };
        return JSON.stringify(getAllProducts(category));
      }

      case 'get_suppliers': {
        return JSON.stringify(getAllSuppliers());
      }

      case 'get_group_buys': {
        const { id, city } = input as { id?: number; city?: string };
        if (id) {
          return JSON.stringify(getGroupBuyById(id) ?? { error: 'Group buy not found' });
        }
        if (city) {
          return JSON.stringify(getGroupBuysByCity(city));
        }
        return JSON.stringify(getAllGroupBuys('active'));
      }

      case 'find_local_group': {
        const { city, product_query } = input as { city: string; product_query: string };
        const matchingGroupBuys = findMatchingGroupBuys(city, product_query);
        const matchingRequests = findMatchingRequests(city, product_query);
        return JSON.stringify({
          city,
          product_query,
          matching_group_buys: matchingGroupBuys,
          neighbors_also_looking: matchingRequests.map(r => ({
            id: r.id,
            city: r.city,
            neighborhood: r.neighborhood,
            product_query: r.product_query,
            deadline: r.deadline,
          })),
          summary: matchingGroupBuys.length > 0
            ? `Found ${matchingGroupBuys.length} active group buy(s) in ${city} matching "${product_query}".`
            : matchingRequests.length > 0
              ? `No active group buys yet, but ${matchingRequests.length} neighbor(s) in ${city} are also looking to buy similar items. Registering this consumer will help form a group.`
              : `No active group buys or requests found in ${city} for "${product_query}". Register the consumer's intent to start building a local group.`,
        });
      }

      case 'register_buying_intent': {
        const { customer_name, customer_email, city, neighborhood, product_query, deadline } = input as {
          customer_name: string; customer_email: string; city: string;
          neighborhood?: string; product_query: string; deadline: string;
        };
        const requestId = registerBuyingIntent({ customer_name, customer_email, city, neighborhood, product_query, deadline });
        return JSON.stringify({
          success: true,
          request_id: requestId,
          message: `Registered buying intent for ${customer_name} in ${city}${neighborhood ? ` (${neighborhood})` : ''}. Will search for local neighbors buying "${product_query}" until ${deadline}. If no group forms by then, alternatives will be recommended.`,
        });
      }

      case 'get_my_requests': {
        const { customer_email } = input as { customer_email: string };
        const requests = getRequestsByEmail(customer_email);
        return JSON.stringify(requests.length > 0 ? requests : { message: 'No open requests found for this email' });
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
          product_id: number; customer_name: string; customer_email: string;
          quantity: number; notes?: string;
        };
        const product = getProductById(product_id);
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
          message: `Order confirmed: ${quantity} ${product.unit} of ${product.name} for ILS ${(product.price * quantity).toFixed(2)}.`,
        });
      }

      case 'get_order_status': {
        const { customer_email, order_id } = input as { customer_email: string; order_id?: number };
        if (order_id) {
          return JSON.stringify(getOrderById(order_id) ?? { error: 'Order not found' });
        }
        const orders = getOrdersByEmail(customer_email);
        return JSON.stringify(orders.length > 0 ? orders : { message: 'No orders found for this email' });
      }

      case 'create_buying_team': {
        const { group_buy_id, customer_name, customer_email, quantity } = input as {
          group_buy_id: number; customer_name: string; customer_email: string; quantity: number;
        };
        const gb = getGroupBuyById(group_buy_id);
        if (!gb) return JSON.stringify({ error: 'Group buy not found' });
        const result = createTeam(group_buy_id, customer_name, customer_email, quantity);
        const dayName = gb.cutoff_day != null ? getDayName(gb.cutoff_day) : 'Wednesday';
        const nextCutoff = gb.cutoff_day != null ? getNextCutoffDate(gb.cutoff_day) : '';
        return JSON.stringify({
          success: true,
          team_id: result.teamId,
          invite_code: result.inviteCode,
          invite_url: `/groups/team/${result.inviteCode}`,
          cutoff_day: dayName,
          next_cutoff: nextCutoff,
          team_min_qty: gb.team_min_qty,
          unit: gb.unit,
          message: `Team created for ${gb.product_name}! Share the invite link /groups/team/${result.inviteCode} with friends. The team needs ${gb.team_min_qty} ${gb.unit} total. If reached by ${dayName} (next: ${nextCutoff}), all team orders will be confirmed at the group price of ILS ${gb.group_price}/${gb.unit}.`,
        });
      }

      case 'recommend_alternatives': {
        const { city, product_query } = input as { city?: string; product_query?: string };
        return JSON.stringify({
          message: `No local group could be formed in time${city ? ` in ${city}` : ''}. Here are alternative options for buying${product_query ? ` "${product_query}"` : ''}:`,
          supermarkets: ISRAELI_SUPERMARKETS,
          tip: 'Most of these offer online ordering and delivery or pickup. Compare prices and check which has branches closest to your location.',
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : 'Tool execution failed' });
  }
}
