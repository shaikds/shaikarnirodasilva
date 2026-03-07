import { NextRequest, NextResponse } from 'next/server';
import { getAllGroupBuys, getGroupBuyById, createGroupBuy, joinGroupBuy } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const status = searchParams.get('status') || 'active';

    if (id) {
      const groupBuy = getGroupBuyById(Number(id));
      if (!groupBuy) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(groupBuy);
    }

    const groupBuys = getAllGroupBuys(status);
    return NextResponse.json(groupBuys);
  } catch (error) {
    console.error('Groups GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch group buys' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'join') {
      const { group_buy_id, customer_name, customer_email, quantity } = body;

      if (!group_buy_id || !customer_name || !customer_email || !quantity) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }

      const result = joinGroupBuy(group_buy_id, customer_name, customer_email, quantity);
      return NextResponse.json({
        success: true,
        order_id: result.orderId,
        threshold_reached: result.threshold_reached,
        product_name: result.product_name,
        message: result.threshold_reached
          ? `Congratulations! The group buy threshold was reached! Your order for ${result.product_name} has been confirmed at the group price.`
          : `You've joined the group buy for ${result.product_name}. Your order will be confirmed when the group target is reached.`,
      }, { status: 201 });
    }

    // Create new group buy
    const { product_id, target_qty, regular_price, group_price, deadline } = body;
    if (!product_id || !target_qty || !regular_price || !group_price || !deadline) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const id = createGroupBuy({ product_id, target_qty, regular_price, group_price, deadline });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error: unknown) {
    console.error('Groups POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
