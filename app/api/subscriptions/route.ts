import { NextRequest, NextResponse } from 'next/server';
import {
  createSubscription,
  getSubscriptionsByEmail,
  deactivateSubscription,
} from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');

  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  const subs = getSubscriptionsByEmail(email);
  return NextResponse.json(subs);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { customer_name, customer_email, product_id, quantity, prefer_group_buy, notes } = body;

  if (!customer_name || !customer_email || !product_id || !quantity) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const id = createSubscription({ customer_name, customer_email, product_id, quantity, prefer_group_buy, notes });
  return NextResponse.json({ id, message: 'Weekly subscription created successfully' }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
  deactivateSubscription(Number(id));
  return NextResponse.json({ message: 'Subscription cancelled' });
}
