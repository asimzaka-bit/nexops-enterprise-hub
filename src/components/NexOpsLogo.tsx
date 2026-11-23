import { useId } from 'react';

interface NexOpsLogoProps {
  className?: string;
  size?: number;
  title?: string;
  tagline?: string;
  showWordmark?: boolean;
  layout?: 'horizontal' | 'stacked';
  surface?: 'light' | 'dark';
  wordmarkClassName?: string;
  taglineClassName?: string;
}

const LEGACY_VERBOSE_TAGLINE = 'Unified Operations, QA & Approval Management System';
const DEFAULT_COMPACT_TAGLINE = 'Unified Operations, QA & Approval';

export function resolveCorporateTagline(tagline?: string): string {
  const trimmed = tagline?.trim();
  if (!trimmed || trimmed === LEGACY_VERBOSE_TAGLINE) {
    return DEFAULT_COMPACT_TAGLINE;
  }
  return trimmed;
}

export function NexOpsLogo({
  className = '',
  size = 36,
  title = 'NexOps Enterprise Hub',
  tagline = DEFAULT_COMPACT_TAGLINE,
  showWordmark = false,
  layout = 'horizontal',
  surface = 'light',
  wordmarkClassName,
  taglineClassName,
}: NexOpsLogoProps) {
  const uid = useId().replace(/:/g, '');
  const badgeGradId = `nexops-badge-${uid}`;
  const accentGradId = `nexops-accent-${uid}`;
  const resolvedTagline = resolveCorporateTagline(tagline);
  const isDark = surface === 'dark';

  const svgMark = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 44 44"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      fill="none"
      role="img"
      aria-label={title}
      className={`shrink-0 rounded-[10px] ${
        isDark ? '' : 'shadow-sm'
      } ${!showWordmark ? className : ''}`.trim()}
    >
      <defs>
        {/* Subtle Satin-Slate Vertical Tone (#0F172A -> #1E293B) */}
        <linearGradient
          id={badgeGradId}
          x1="22"
          y1="1"
          x2="22"
          y2="43"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#0F172A" />
          <stop offset="100%" stopColor="#1E293B" />
        </linearGradient>

        {/* Royal Indigo to Sky Blue Diagonal Ribbon Accent (#6366F1 -> #38BDF8) */}
        <linearGradient
          id={accentGradId}
          x1="14"
          y1="12"
          x2="30"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
      </defs>

      {/* Rounded-Square Badge Container (rx="10") with Crisp Hairline Border */}
      <rect
        x="0.75"
        y="0.75"
        width="42.5"
        height="42.5"
        rx="10"
        fill={`url(#${badgeGradId})`}
        stroke="rgba(148,163,184,0.28)"
        strokeWidth="1.15"
      />

      {/* Sleek "N" Geometric Ribbon: Diagonal Accent Bar */}
      <path d="M13.6 11.5H17.2L30.4 32.5H26.8L13.6 11.5Z" fill={`url(#${accentGradId})`} />

      {/* Sleek "N" Geometric Ribbon: Crisp White Vertical Pillars (#F8FAFC) */}
      <rect x="11.5" y="11.5" width="4.4" height="21" rx="1.4" fill="#F8FAFC" />
      <rect x="28.1" y="11.5" width="4.4" height="21" rx="1.4" fill="#F8FAFC" />

      {/* Understated Geometric Accent Node at Upper-Right Corner */}
      <circle cx="36.2" cy="7.8" r="1.75" fill="#38BDF8" />
    </svg>
  );

  if (!showWordmark) {
    return svgMark;
  }

  if (layout === 'stacked') {
    return (
      <div className={`flex flex-col items-center text-center font-sans ${className}`.trim()}>
        {svgMark}
        <h1
          className={
            wordmarkClassName ||
            `mt-4 font-sans text-2xl font-semibold tracking-tight ${
              isDark ? 'text-white' : 'text-slate-900'
            }`
          }
        >
          {title}
        </h1>
        {resolvedTagline && (
          <p
            className={
              taglineClassName ||
              `mt-1 font-sans text-sm font-normal ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`
            }
          >
            {resolvedTagline}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 items-center gap-2.5 font-sans ${className}`.trim()}>
      {svgMark}
      <div className="min-w-0 leading-tight">
        <span
          className={
            wordmarkClassName ||
            `block truncate font-sans text-sm font-semibold tracking-tight ${
              isDark ? 'text-white' : 'text-slate-900'
            }`
          }
        >
          {title}
        </span>
        {resolvedTagline && (
          <span
            className={
              taglineClassName ||
              `mt-0.5 block truncate font-sans text-[11px] font-normal ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`
            }
          >
            {resolvedTagline}
          </span>
        )}
      </div>
    </div>
  );
}
