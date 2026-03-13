import { NextResponse } from 'next/server';
import { checkCutoffDay, expireOldTeams } from '@/lib/db';

export async function POST() {
  try {
    // Run both: weekly cutoff check + 7-day expiration
    const cutoff = checkCutoffDay();
    const expired = expireOldTeams();

    return NextResponse.json({
      success: true,
      confirmed_teams: cutoff.confirmed_teams,
      total_orders_confirmed: cutoff.total_orders_confirmed,
      reset_teams: cutoff.reset_teams,
      expired_teams: expired.expired_count,
      message: [
        cutoff.confirmed_teams > 0
          ? `Confirmed ${cutoff.confirmed_teams} team(s) with ${cutoff.total_orders_confirmed} order(s).`
          : 'No teams reached their minimum today.',
        cutoff.reset_teams > 0
          ? `Reset ${cutoff.reset_teams} team(s) that didn't reach minimum.`
          : '',
        expired.expired_count > 0
          ? `Expired ${expired.expired_count} team(s) older than 7 days.`
          : '',
      ].filter(Boolean).join(' '),
    });
  } catch (error) {
    console.error('Teams check error:', error);
    return NextResponse.json({ error: 'Failed to run cutoff check' }, { status: 500 });
  }
}
