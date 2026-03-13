import { NextRequest, NextResponse } from 'next/server';
import { getAllGroupBuys, getGroupBuyById, getGroupBuysByCity, createGroupBuy, joinGroupBuy } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const status = searchParams.get('status') || 'active';
    const city = searchParams.get('city');

    if (id) {
      const groupBuy = getGroupBuyById(Number(id));
      if (!groupBuy) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(groupBuy);
    }

    if (city) {
      return NextResponse.json(getGroupBuysByCity(city));
    }

    return NextResponse.json(getAllGroupBuys(status));
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
          ? `Target reached! Your order for ${result.product_name} has been confirmed at the group price.`
          : `Joined the group buy for ${result.product_name}. Your order will be confirmed when the group target is reached.`,
      }, { status: 201 });
    }

    // Create new group buy
    const { product_id, target_qty, regular_price, group_price, deadline, city, cutoff_day, team_min_qty } = body;
    if (!product_id || !target_qty || !regular_price || !group_price || !deadline) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const id = createGroupBuy({ product_id, target_qty, regular_price, group_price, deadline, city: city || null, cutoff_day: cutoff_day ?? 3, team_min_qty: team_min_qty ?? 10 });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error: unknown) {
    console.error('Groups POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
