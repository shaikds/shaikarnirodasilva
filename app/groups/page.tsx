'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useGroupBuys } from '@/hooks/useGroupBuys';
import { useTeams } from '@/hooks/useTeams';
import { GroupBuyCard } from '@/components/groups/GroupBuyCard';
import { TeamCard } from '@/components/groups/TeamCard';
import { JoinModal } from '@/components/groups/JoinModal';
import { CreateTeamModal } from '@/components/groups/CreateTeamModal';
import { JoinRequestModal } from '@/components/groups/JoinRequestModal';
import { ISRAEL_LOCATIONS } from '@/lib/israel-locations';
import type { GroupBuy, BuyingTeam } from '@/types';

type Tab = 'group_buys' | 'all_groups';

export default function GroupsPage() {
  const { t } = useI18n();
  const g = t.groups;
  const isHe = t.lang === 'he';

  const [tab, setTab] = useState<Tab>('group_buys');
  const [cityFilter, setCityFilter] = useState('');

  const { groupBuys, loading: gbLoading, refetch: refetchGb } = useGroupBuys();
  const { teams, loading: teamsLoading, refetch: refetchTeams } = useTeams(cityFilter || undefined);

  const [joinTarget, setJoinTarget] = useState<GroupBuy | null>(null);
  const [teamTarget, setTeamTarget] = useState<GroupBuy | null>(null);
  const [joinRequestTarget, setJoinRequestTarget] = useState<BuyingTeam | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const HOW_STEPS = isHe
    ? ['מצא רכישה קבוצתית', 'הקם קבוצה או הצטרף', 'שתף עם שכנים מאותה עיר', 'הגיע למינימום ביום הנקוב — כולם מקבלים את המחיר']
    : ['Find a group buy', 'Start a team or join one', 'Share with neighbors in your city', 'Reach the minimum by cutoff day — everyone gets the group price'];

  function handleJoinTeam(team: BuyingTeam) {
    const gb: GroupBuy = {
      id: team.group_buy_id,
      product_id: team.product_id ?? 0,
      product_name: team.product_name ?? '',
      image_url: team.image_url ?? '',
      unit: team.unit ?? '',
      category: '',
      supplier_name: team.supplier_name ?? '',
      supplier_location: '',
      target_qty: team.team_min_qty ?? 10,
      current_qty: team.current_qty,
      regular_price: team.regular_price ?? 0,
      group_price: team.group_price ?? 0,
      deadline: team.deadline ?? '',
      status: 'active',
      city: team.city ?? null,
      neighborhood: team.neighborhood ?? null,
      cutoff_day: team.cutoff_day ?? null,
      team_min_qty: team.team_min_qty ?? null,
      progress_pct: 0,
      created_at: team.created_at,
    };
    setJoinTarget(gb);
  }

  const tabCls = (active: boolean) =>
    `px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
      active
        ? 'bg-harvest-600 text-white shadow-sm'
        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
    }`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{g.title}</h1>
        <p className="text-gray-500 mt-1">{g.subtitle}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button className={tabCls(tab === 'group_buys')} onClick={() => setTab('group_buys')}>
          {g.title}
        </button>
        <button className={tabCls(tab === 'all_groups')} onClick={() => setTab('all_groups')}>
          {t.teams.allGroups}
        </button>
      </div>

      {/* How it works */}
      {tab === 'group_buys' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10 p-5 bg-harvest-50 rounded-2xl border border-harvest-100">
          {HOW_STEPS.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="bg-harvest-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">
                {i + 1}
              </div>
              <p className="text-sm text-gray-600 mt-1">{step}</p>
            </div>
          ))}
        </div>
      )}

      {/* City filter for All Groups tab */}
      {tab === 'all_groups' && (
        <div className="mb-6 flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">{t.teams.filterByCity}</label>
          <select
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-harvest-500 bg-white"
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
          >
            <option value="">{t.teams.filterAll}</option>
            {ISRAEL_LOCATIONS.map(c => (
              <option key={c.name} value={isHe ? c.name_he : c.name}>
                {isHe ? c.name_he : c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Success banner */}
      {successMsg && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm font-medium">
          {successMsg}
        </div>
      )}

      {/* Group Buys Tab */}
      {tab === 'group_buys' && (
        gbLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card animate-pulse">
                <div className="h-48 bg-gray-200" />
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                  <div className="h-10 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : groupBuys.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg font-medium">{g.noGroups}</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {groupBuys.map(gb => (
              <GroupBuyCard
                key={gb.id}
                groupBuy={gb}
                onJoin={setJoinTarget}
                onStartTeam={setTeamTarget}
              />
            ))}
          </div>
        )
      )}

      {/* All Groups Tab */}
      {tab === 'all_groups' && (
        teamsLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card animate-pulse">
                <div className="h-40 bg-gray-200" />
                <div className="p-4 space-y-3">
                  <div className="h-5 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                  <div className="h-10 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : teams.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg font-medium">
              {isHe ? 'אין קבוצות פעילות כרגע' : 'No active groups at the moment'}
            </p>
            <p className="text-sm mt-2">
              {isHe ? 'הקם קבוצה חדשה מעמוד הרכישות הקבוצתיות' : 'Start a new group from the Group Buys tab'}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map(team => (
              <TeamCard
                key={team.id}
                team={team}
                onJoin={handleJoinTeam}
                onRequestJoin={setJoinRequestTarget}
              />
            ))}
          </div>
        )
      )}

      <JoinModal
        groupBuy={joinTarget}
        onClose={() => setJoinTarget(null)}
        onSuccess={(thresholdReached) => {
          setSuccessMsg(thresholdReached ? g.thresholdReached : g.joinSuccess);
          refetchGb();
          refetchTeams();
          setTimeout(() => setSuccessMsg(''), 6000);
        }}
      />

      <CreateTeamModal
        groupBuy={teamTarget}
        onClose={() => { setTeamTarget(null); refetchTeams(); }}
      />

      <JoinRequestModal
        team={joinRequestTarget}
        onClose={() => setJoinRequestTarget(null)}
        onSuccess={() => {
          setSuccessMsg(t.teams.requestSent);
          setTimeout(() => setSuccessMsg(''), 6000);
        }}
      />
    </div>
  );
}
