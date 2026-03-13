import { NextRequest, NextResponse } from 'next/server';
import { getTeamByInviteCode, getTeamMemberCount, createTeam, joinTeam, getDayName, getNextCutoffDate, getAllTeams, getTeamsByCity, setTeamPrivacy } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const inviteCode = searchParams.get('invite_code');
    const listAll = searchParams.get('list');
    const city = searchParams.get('city');

    // List all teams
    if (listAll === 'true') {
      const teams = city ? getTeamsByCity(city) : getAllTeams();
      return NextResponse.json(teams);
    }

    if (!inviteCode) return NextResponse.json({ error: 'invite_code required' }, { status: 400 });

    const team = getTeamByInviteCode(inviteCode);
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

    const members_count = getTeamMemberCount(team.id);
    const cutoff_day_name = team.cutoff_day != null ? getDayName(team.cutoff_day) : 'Wednesday';
    const next_cutoff_date = team.cutoff_day != null ? getNextCutoffDate(team.cutoff_day) : '';

    return NextResponse.json({ ...team, members_count, cutoff_day_name, next_cutoff_date });
  } catch (error) {
    console.error('Teams GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'create') {
      const { group_buy_id, customer_name, customer_email, quantity, is_private, city, neighborhood } = body;
      if (!group_buy_id || !customer_name || !customer_email || !quantity) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      const result = createTeam(
        Number(group_buy_id), customer_name, customer_email, Number(quantity),
        { is_private: !!is_private, city: city || undefined, neighborhood: neighborhood || undefined },
      );
      return NextResponse.json({
        success: true,
        team_id: result.teamId,
        invite_code: result.inviteCode,
        invite_url: `/groups/team/${result.inviteCode}`,
        message: `Team created! Share the invite link with your friends and neighbors to buy together.`,
      }, { status: 201 });
    }

    if (action === 'join') {
      const { invite_code, customer_name, customer_email, quantity } = body;
      if (!invite_code || !customer_name || !customer_email || !quantity) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      const result = joinTeam(invite_code, customer_name, customer_email, Number(quantity));
      return NextResponse.json({
        success: true,
        order_id: result.orderId,
        team_completed: result.team_completed,
        product_name: result.product_name,
        message: result.team_completed
          ? `Team target reached! All team orders for ${result.product_name} are now confirmed at the group price.`
          : `You joined the team! Once the team reaches its minimum quantity, all orders will be confirmed at the group price.`,
      }, { status: 201 });
    }

    if (action === 'set_privacy') {
      const { team_id, is_private, admin_email } = body;
      if (team_id == null || is_private == null || !admin_email) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      setTeamPrivacy(Number(team_id), !!is_private, admin_email);
      return NextResponse.json({ success: true, is_private: !!is_private });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    console.error('Teams POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
