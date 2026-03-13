import { NextRequest, NextResponse } from 'next/server';
import { createJoinRequest, getJoinRequestsForTeam, approveJoinRequest, rejectJoinRequest } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('team_id');
    if (!teamId) return NextResponse.json({ error: 'team_id required' }, { status: 400 });

    const requests = getJoinRequestsForTeam(Number(teamId));
    return NextResponse.json(requests);
  } catch (error) {
    console.error('Join requests GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch join requests' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'request') {
      const { team_id, customer_name, customer_email, quantity } = body;
      if (!team_id || !customer_name || !customer_email) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      const id = createJoinRequest(Number(team_id), customer_name, customer_email, Number(quantity || 1));
      return NextResponse.json({ success: true, request_id: id }, { status: 201 });
    }

    if (action === 'approve') {
      const { request_id, admin_email } = body;
      if (!request_id || !admin_email) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      const result = approveJoinRequest(Number(request_id), admin_email);
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'reject') {
      const { request_id, admin_email } = body;
      if (!request_id || !admin_email) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      rejectJoinRequest(Number(request_id), admin_email);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    console.error('Join request POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
