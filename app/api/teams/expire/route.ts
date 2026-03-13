import { NextResponse } from 'next/server';
import { expireOldTeams } from '@/lib/db';

export async function POST() {
  try {
    const result = expireOldTeams();
    return NextResponse.json({
      success: true,
      expired_count: result.expired_count,
      message: result.expired_count > 0
        ? `Expired ${result.expired_count} team(s) that didn't reach minimum within 7 days.`
        : 'No teams expired.',
    });
  } catch (error) {
    console.error('Teams expire error:', error);
    return NextResponse.json({ error: 'Failed to run expiration check' }, { status: 500 });
  }
}
