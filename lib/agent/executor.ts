// ─── Tool Executor (Single Responsibility: maps tool names → DB calls) ─────────

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
        const { id } = input as { id?: number };
        if (id) {
          return JSON.stringify(getGroupBuyById(id) ?? { error: 'Group buy not found' });
        }
        return JSON.stringify(getAllGroupBuys('active'));
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
          message: `Order confirmed! ${quantity} ${product.unit} of ${product.name} ordered for ₪${(product.price * quantity).toFixed(2)}.`,
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

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : 'Tool execution failed' });
  }
}
