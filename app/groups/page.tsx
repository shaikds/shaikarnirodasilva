'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useGroupBuys } from '@/hooks/useGroupBuys';
import { GroupBuyCard } from '@/components/groups/GroupBuyCard';
import { JoinModal } from '@/components/groups/JoinModal';
import type { GroupBuy } from '@/types';

export default function GroupsPage() {
  const { t } = useI18n();
  const g = t.groups;
  const { groupBuys, loading, refetch } = useGroupBuys();
  const [joinTarget, setJoinTarget] = useState<GroupBuy | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const HOW_STEPS = t.lang === 'he'
    ? ['מצא רכישה קבוצתית שמעניינת אותך', 'התחייב לכמות במחיר הקבוצתי', 'הקהילה מתחייבת ביחד לעבר היעד', 'היעד הושג → כל ההזמנות מאושרות אוטומטית!']
    : ['Find a group buy you want to join', 'Pledge your quantity at the group price', 'Community pledges build up toward the target', 'Target reached → all orders auto-confirmed!'];
  const HOW_ICONS = ['1', '2', '3', '4'];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900">{g.title}</h1>
        <p className="text-gray-500 mt-1">{g.subtitle}</p>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 p-5 bg-harvest-50 rounded-2xl border border-harvest-100">
        {HOW_STEPS.map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="bg-harvest-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">
              {i + 1}
            </div>
            <div>
              <p className="text-sm text-gray-600 mt-1">{step}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Success banner */}
      {successMsg && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm font-medium">
          {successMsg}
        </div>
      )}

      {/* Cards */}
      {loading ? (
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
            />
          ))}
        </div>
      )}

      {/* Join Modal */}
      <JoinModal
        groupBuy={joinTarget}
        onClose={() => setJoinTarget(null)}
        onSuccess={(thresholdReached) => {
          setSuccessMsg(thresholdReached ? g.thresholdReached : g.joinSuccess);
          refetch();
          setTimeout(() => setSuccessMsg(''), 6000);
        }}
      />
    </div>
  );
}
