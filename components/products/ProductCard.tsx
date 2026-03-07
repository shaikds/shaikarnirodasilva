'use client';
import Image from 'next/image';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n';
import type { Product } from '@/types';

interface ProductCardProps {
  product: Product;
  onOrder: (product: Product) => void;
}

export function ProductCard({ product, onOrder }: ProductCardProps) {
  const { t } = useI18n();
  const inStock = product.stock_qty > 0;

  return (
    <Card>
      <div className="relative h-44 sm:h-48">
        <Image
          src={product.image_url || 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=400'}
          alt={product.name}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        <div className="absolute top-2 end-2">
          <Badge variant={inStock ? 'green' : 'red'}>
            {inStock ? t.shop.inStock : t.shop.outOfStock}
          </Badge>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-bold text-gray-900 leading-snug">{product.name}</h3>
          <Badge variant="gray">{product.category}</Badge>
        </div>

        <p className="text-sm text-gray-500 mb-1">
          📍 {product.supplier_name} · {product.supplier_location}
        </p>

        {product.description && (
          <p className="text-sm text-gray-600 line-clamp-2 mb-3">{product.description}</p>
        )}

        <div className="flex items-center justify-between mt-3">
          <div>
            <span className="text-xl font-bold text-harvest-600">
              {t.common.currency}{product.price}
            </span>
            <span className="text-sm text-gray-400 ms-1">
              {t.common.perUnit} {product.unit}
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => onOrder(product)}
            disabled={!inStock}
          >
            {t.shop.orderBtn}
          </Button>
        </div>
      </div>
    </Card>
  );
}
