/**
 * Weekly Subscription Runner — POST /api/subscriptions/run
 *
 * This endpoint is called automatically every week (by a cron job, Vercel Cron,
 * or any scheduler). For each due subscription, the AI agent decides:
 *   1. Is there an active group buy for this product? → join it (cheaper price)
 *   2. Otherwise → place individual order at regular price
 *
 * Protect with CRON_SECRET env var in production.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  getAllActiveSubscriptions,
  updateSubscriptionAfterRun,
  joinGroupBuy,
  createOrder,
  getProductById,
  getAllGroupBuys,
  getSubscriptionRunLog,
} from '@/lib/db';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface Subscription {
  id: number;
  customer_name: string;
  customer_email: string;
  product_id: number;
  product_name: string;
  quantity: number;
  unit: string;
  current_price: number;
  stock_qty: number;
  prefer_group_buy: number;
  notes: string | null;
  supplier_name: string;
  category: string;
}

interface GroupBuyRow {
  id: number;
  product_id: number;
  group_price: number;
  target_qty: number;
  current_qty: number;
  deadline: string;
  status: string;
}

interface RunResult {
  subscription_id: number;
  customer: string;
  product: string;
  quantity: number;
  order_id: number | bigint;
  order_type: 'group' | 'individual';
  price_paid: number;
  total: number;
  savings: number;
  message: string;
}

interface RunError {
  subscription_id: number;
  customer: string;
  product: string;
  error: string;
}

// ─── Agent Decision Function ───────────────────────────────────────────────────

async function agentDecideAndOrder(sub: Subscription): Promise<{
  order_id: number | bigint;
  order_type: 'group' | 'individual';
  price_paid: number;
  reasoning: string;
}> {
  const activeGroupBuys = getAllGroupBuys('active') as GroupBuyRow[];
  const matchingGroupBuy = sub.prefer_group_buy
    ? activeGroupBuys.find(gb => gb.product_id === sub.product_id)
    : null;

  const product = getProductById(sub.product_id) as { price: number; stock_qty: number } | undefined;
  if (!product) throw new Error('Product no longer available');
  if (product.stock_qty < sub.quantity) throw new Error(`Low stock: only ${product.stock_qty} ${sub.unit} available`);

  // Ask the agent to decide the best ordering strategy
  const decisionPrompt = `You are managing a weekly automatic order for a subscription customer.

Customer: ${sub.customer_name} (${sub.customer_email})
Product: ${sub.product_name} (ID: ${sub.product_id})
Requested quantity: ${sub.quantity} ${sub.unit}
Regular price: ₪${sub.current_price}/${sub.unit}
Customer preference: ${sub.prefer_group_buy ? 'prefers group buy if available' : 'individual order only'}
Notes: ${sub.notes || 'none'}

${matchingGroupBuy
  ? `ACTIVE GROUP BUY FOUND (ID: ${matchingGroupBuy.id}):
  - Group price: ₪${matchingGroupBuy.group_price}/${sub.unit}
  - Progress: ${matchingGroupBuy.current_qty}/${matchingGroupBuy.target_qty} ${sub.unit} pledged
  - Savings per ${sub.unit}: ₪${(sub.current_price - matchingGroupBuy.group_price).toFixed(2)}`
  : 'No active group buy found for this product.'}

Decide: should this customer join the group buy (if available and beneficial) or place an individual order?
Reply with a JSON object: { "action": "group_buy" | "individual", "group_buy_id": <number or null>, "reasoning": "<brief explanation>" }`;

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 512,
    output_config: { format: { type: 'json_schema', schema: { type: 'object', properties: { action: { type: 'string' }, group_buy_id: {}, reasoning: { type: 'string' } }, required: ['action', 'group_buy_id', 'reasoning'], additionalProperties: false } } },
    messages: [{ role: 'user', content: decisionPrompt }],
  });

  const decision = JSON.parse((response.content[0] as Anthropic.TextBlock).text) as {
    action: 'group_buy' | 'individual';
    group_buy_id: number | null;
    reasoning: string;
  };

  if (decision.action === 'group_buy' && decision.group_buy_id && matchingGroupBuy) {
    const result = joinGroupBuy(decision.group_buy_id, sub.customer_name, sub.customer_email, sub.quantity);
    return {
      order_id: result.orderId,
      order_type: 'group',
      price_paid: matchingGroupBuy.group_price,
      reasoning: decision.reasoning,
    };
  } else {
    const orderId = createOrder({
      customer_name: sub.customer_name,
      customer_email: sub.customer_email,
      product_id: sub.product_id,
      quantity: sub.quantity,
      unit_price: product.price,
      notes: `[Weekly Subscription] ${sub.notes || ''}`,
    });
    return {
      order_id: orderId,
      order_type: 'individual',
      price_paid: product.price,
      reasoning: decision.reasoning,
    };
  }
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Production guard: require secret
  const secret = request.headers.get('x-cron-secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dueSubs = getAllActiveSubscriptions() as Subscription[];

  if (dueSubs.length === 0) {
    return NextResponse.json({ message: 'No subscriptions due this week', processed: 0 });
  }

  const results: RunResult[] = [];
  const errors: RunError[] = [];

  for (const sub of dueSubs) {
    try {
      const { order_id, order_type, price_paid, reasoning } = await agentDecideAndOrder(sub);

      updateSubscriptionAfterRun(sub.id, order_id);

      const savings = order_type === 'group'
        ? (sub.current_price - price_paid) * sub.quantity
        : 0;

      results.push({
        subscription_id: sub.id,
        customer: `${sub.customer_name} <${sub.customer_email}>`,
        product: sub.product_name,
        quantity: sub.quantity,
        order_id,
        order_type,
        price_paid,
        total: price_paid * sub.quantity,
        savings,
        message: reasoning,
      });
    } catch (err) {
      errors.push({
        subscription_id: sub.id,
        customer: sub.customer_name,
        product: sub.product_name,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({
    run_at: new Date().toISOString(),
    total_due: dueSubs.length,
    processed: results.length,
    failed: errors.length,
    total_savings: results.reduce((s, r) => s + r.savings, 0),
    results,
    errors,
  });
}

// GET — view recent run history
export async function GET() {
  const log = getSubscriptionRunLog();
  return NextResponse.json(log);
}
