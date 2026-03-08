'use client';
import Image from 'next/image';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useI18n } from '@/lib/i18n';
import type { GroupBuy } from '@/types';

interface GroupBuyCardProps {
  groupBuy: GroupBuy;
  onJoin: (groupBuy: GroupBuy) => void;
}

function daysUntil(deadline: string): number {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000));
}

export function GroupBuyCard({ groupBuy: gb, onJoin }: GroupBuyCardProps) {
  const { t } = useI18n();
  const savePct = Math.round((1 - gb.group_price / gb.regular_price) * 100);
  const days = daysUntil(gb.deadline);

  return (
    <Card id={`gb-${gb.id}`}>
      <div className="relative h-44 sm:h-48">
        <Image
          src={gb.image_url || 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=400'}
          alt={gb.product_name}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        <div className="absolute top-2 start-2">
          <Badge variant="orange">{t.groups.saveBadge} {savePct}{t.common.off}</Badge>
        </div>
        <div className="absolute top-2 end-2">
          <Badge variant="gray">{days} {t.common.daysLeft}</Badge>
        </div>
      </div>

      <div className="p-5 space-y-3">
        <div>
          <h3 className="font-bold text-gray-900 text-lg">{gb.product_name}</h3>
          <p className="text-sm text-gray-500">{gb.supplier_name} · {gb.supplier_location}</p>
          {gb.city && <p className="text-xs text-harvest-600 mt-0.5">{gb.city}</p>}
        </div>

        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold text-harvest-600">
            {t.common.currency}{gb.group_price}/{gb.unit}
          </span>
          <span className="text-sm text-gray-400 line-through">
            {t.common.currency}{gb.regular_price}
          </span>
        </div>

        <ProgressBar
          value={gb.progress_pct}
          label={`${gb.current_qty}/${gb.target_qty} ${gb.unit} ${t.groups.pledged}`}
          labelRight={`${gb.progress_pct}%`}
        />

        <Button className="w-full" onClick={() => onJoin(gb)}>
          {t.groups.joinBtn}
        </Button>
      </div>
    </Card>
  );
}
