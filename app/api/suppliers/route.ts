import { NextRequest, NextResponse } from 'next/server';
import { getAllSuppliers, createSupplier } from '@/lib/db';

export async function GET() {
  try {
    const suppliers = getAllSuppliers();
    return NextResponse.json(suppliers);
  } catch (error) {
    console.error('Suppliers GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, location, phone, email, image_url } = body;

    if (!name || !location) {
      return NextResponse.json({ error: 'Name and location are required' }, { status: 400 });
    }

    const id = createSupplier({ name, description, location, phone, email, image_url });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error('Suppliers POST error:', error);
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 });
  }
}
