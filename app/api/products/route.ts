import { NextRequest, NextResponse } from 'next/server';
import { getAllProducts, searchProducts, createProduct } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const search = searchParams.get('search') || undefined;

    const products = search
      ? searchProducts(search)
      : getAllProducts(category);

    return NextResponse.json(products);
  } catch (error) {
    console.error('Products GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { supplier_id, name, category, price, unit, stock_qty, image_url, description } = body;

    if (!supplier_id || !name || !category || !price || !unit || !stock_qty) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const id = createProduct({ supplier_id, name, category, price, unit, stock_qty, image_url, description });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error('Products POST error:', error);
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
