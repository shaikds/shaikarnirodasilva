import { NextRequest, NextResponse } from 'next/server';
import { createOrder, getOrdersByEmail, getOrderById, getProductById } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const id = searchParams.get('id');

    if (id) {
      const order = getOrderById(Number(id));
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      return NextResponse.json(order);
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const orders = getOrdersByEmail(email);
    return NextResponse.json(orders);
  } catch (error) {
    console.error('Orders GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customer_name, customer_email, product_id, quantity, notes } = body;

    if (!customer_name || !customer_email || !product_id || !quantity) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const product = getProductById(product_id) as { price: number; stock_qty: number; name: string } | undefined;
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (product.stock_qty < quantity) {
      return NextResponse.json({ error: `Only ${product.stock_qty} units available` }, { status: 400 });
    }

    const id = createOrder({
      customer_name,
      customer_email,
      product_id,
      quantity,
      unit_price: product.price,
      notes,
    });

    return NextResponse.json({
      success: true,
      order_id: id,
      product_name: product.name,
      total_price: product.price * quantity,
      message: `Order confirmed! Your order for ${product.name} has been placed successfully.`,
    }, { status: 201 });
  } catch (error) {
    console.error('Orders POST error:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
