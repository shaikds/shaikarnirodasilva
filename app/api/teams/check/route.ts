import { NextResponse } from 'next/server';
import { checkCutoffDay } from '@/lib/db';

export async function POST() {
  try {
    const result = checkCutoffDay();
    return NextResponse.json({
      success: true,
      confirmed_teams: result.confirmed_teams,
      total_orders_confirmed: result.total_orders_confirmed,
      message: result.confirmed_teams > 0
        ? `Confirmed ${result.confirmed_teams} team(s) with ${result.total_orders_confirmed} order(s) total.`
        : 'No teams reached their minimum today.',
    });
  } catch (error) {
    console.error('Teams check error:', error);
    return NextResponse.json({ error: 'Failed to run cutoff check' }, { status: 500 });
  }
}
