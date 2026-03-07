import { NextResponse } from 'next/server';
import { seedDatabase } from '@/lib/db';

export async function POST() {
  try {
    const result = seedDatabase();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ error: 'Failed to seed database' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = seedDatabase();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ error: 'Failed to seed database' }, { status: 500 });
  }
}
