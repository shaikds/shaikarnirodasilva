'use client';
import Image from 'next/image';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { CountdownTimer } from './CountdownTimer';
import { useI18n } from '@/lib/i18n';
import type { BuyingTeam } from '@/types';

interface TeamCardProps {
  team: BuyingTeam;
  onJoin: (team: BuyingTeam) => void;
  onRequestJoin: (team: BuyingTeam) => void;
}

export function TeamCard({ team, onJoin, onRequestJoin }: TeamCardProps) {
  const { t } = useI18n();
  const minQty = team.team_min_qty ?? 10;
  const progressPct = Math.min(100, Math.round((team.current_qty / minQty) * 100));
  const savePct = team.regular_price && team.group_price
    ? Math.round((1 - team.group_price / team.regular_price) * 100)
    : 0;

  const isPrivate = !!team.is_private;

  return (
    <Card>
      <div className="relative h-40">
        <Image
          src={team.image_url || 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=400'}
          alt={team.product_name ?? ''}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        <div className="absolute top-2 start-2 flex gap-1.5">
          {savePct > 0 && <Badge variant="orange">{t.groups.saveBadge} {savePct}{t.common.off}</Badge>}
          {isPrivate ? (
            <Badge variant="gray">
              <svg className="w-3 h-3 inline me-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              {t.teams.privateGroup}
            </Badge>
          ) : (
            <Badge variant="green">{t.teams.publicGroup}</Badge>
          )}
        </div>
        <div className="absolute top-2 end-2">
          <CountdownTimer expiresAt={team.expires_at} compact />
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-bold text-gray-900">{team.product_name}</h3>
          <p className="text-xs text-gray-500">{team.supplier_name}</p>
          {(team.city || team.neighborhood) && (
            <p className="text-xs text-harvest-600 mt-0.5">
              {[team.city, team.neighborhood].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-harvest-600">
            {t.common.currency}{team.group_price}/{team.unit}
          </span>
          {team.regular_price && (
            <span className="text-sm text-gray-400 line-through">
              {t.common.currency}{team.regular_price}
            </span>
          )}
        </div>

        <ProgressBar
          value={progressPct}
          label={`${team.current_qty}/${minQty} ${team.unit}`}
          labelRight={`${progressPct}%`}
        />

        <div className="text-xs text-gray-500">
          {t.teams.cutoffExplain}
        </div>

        {isPrivate ? (
          <Button className="w-full" variant="secondary" onClick={() => onRequestJoin(team)}>
            <svg className="w-4 h-4 inline me-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            {t.teams.requestToJoin}
          </Button>
        ) : (
          <Button className="w-full" onClick={() => onJoin(team)}>
            {t.teams.joinTeam}
          </Button>
        )}
      </div>
    </Card>
  );
}
