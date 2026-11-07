// A camera snapshot with an SVG overlay that covers it exactly. The overlay's viewBox is the
// rendered pixel size, so circles stay round and strokes/labels keep a constant on-screen size;
// geometry stays normalized (0..1) and is scaled with `toPixels`.
import { Spinner, cn, useTranslation } from '@rv/shared';
import { ImageOff } from 'lucide-react';
import {
  forwardRef,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type SVGProps,
} from 'react';
import type { Size } from '../lib/geometry';

const FALLBACK_WIDTH = 960;

export interface SnapshotFrameProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'ref'> {
  imageUrl: string | null;
  imageAlt: string;
  loading?: boolean;
  /** Shown over the frame when there is no picture (error, not loaded yet). */
  placeholder?: ReactNode;
  children: (size: Size) => ReactNode;
  className?: string;
}

export const SnapshotFrame = forwardRef<SVGSVGElement, SnapshotFrameProps>(function SnapshotFrame(
  { imageUrl, imageAlt, loading, placeholder, children, className, ...svgProps },
  ref,
) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  // Kept when the picture goes away (other camera), so the layout does not jump.
  const [ratio, setRatio] = useState(16 / 9);
  const [measured, setMeasured] = useState<Size | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setMeasured({ width: r.width, height: r.height });
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const size: Size = measured ?? { width: FALLBACK_WIDTH, height: FALLBACK_WIDTH / ratio };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full overflow-hidden rounded-lg border border-border bg-surface-2',
        className,
      )}
      style={{ aspectRatio: String(ratio) }}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt={imageAlt}
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth > 0 && img.naturalHeight > 0)
              setRatio(img.naturalWidth / img.naturalHeight);
          }}
        />
      )}
      {!imageUrl && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted">
          {loading ? (
            <Spinner size="lg" label={t('snapshot.loading')} />
          ) : (
            (placeholder ?? (
              <>
                <ImageOff aria-hidden="true" className="h-8 w-8" />
                <span>{t('snapshot.none')}</span>
              </>
            ))
          )}
        </div>
      )}
      <svg
        ref={ref}
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${size.width} ${size.height}`}
        preserveAspectRatio="none"
        {...svgProps}
      >
        {children(size)}
      </svg>
      {imageUrl && loading && (
        <span className="absolute end-2 top-2 rounded-full bg-surface/90 p-1.5 shadow">
          <Spinner size="sm" label={t('snapshot.loading')} />
        </span>
      )}
    </div>
  );
});
