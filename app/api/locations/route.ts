import { NextRequest, NextResponse } from 'next/server';
import { ISRAEL_LOCATIONS, getNeighborhoods } from '@/lib/israel-locations';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get('city');

  if (city) {
    return NextResponse.json({ neighborhoods: getNeighborhoods(city) });
  }

  return NextResponse.json({ cities: ISRAEL_LOCATIONS });
}
