import { useId } from 'react';

interface NexOpsLogoProps {
  className?: string;
  size?: number;
  title?: string;
}

export function NexOpsLogo({
  className = 'h-9 w-9',
  size,
  title = 'NexOps Enterprise Hub',
}: NexOpsLogoProps) {
  const uid = useId().replace(/:/g, '');
  const shieldGradId = `nexops-shield-${uid}`;
  const coreGradId = `nexops-core-${uid}`;
  const beamGradId = `nexops-beam-${uid}`;
  const glowGradId = `nexops-glow-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        {/* Corporate Gradient: Deep Indigo (#4F46E5) -> Electric Cyan (#06B6D4) */}
        <linearGradient
          id={shieldGradId}
          x1="6"
          y1="42"
          x2="42"
          y2="6"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="52%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>

        {/* High-Contrast Dark Shield Backdrop for Light & Dark Surfaces */}
        <linearGradient
          id={coreGradId}
          x1="24"
          y1="4"
          x2="24"
          y2="44"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#171E38" />
          <stop offset="100%" stopColor="#0B1120" />
        </linearGradient>

        {/* Subtle Inner Glow */}
        <radialGradient
          id={glowGradId}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(29 17) rotate(130) scale(24)"
        >
          <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.28" />
          <stop offset="55%" stopColor="#4F46E5" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#0B1120" stopOpacity="0" />
        </radialGradient>

        {/* Diagonal Monogram Beam Accent */}
        <linearGradient
          id={beamGradId}
          x1="17"
          y1="15"
          x2="31"
          y2="33"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#E0F2FE" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
      </defs>

      {/* Solid Hexagonal Shield Core (ensures sharp contrast on light & dark UIs) */}
      <path
        d="M24 4.2L41.2 14.1V33.9L24 43.8L6.8 33.9V14.1L24 4.2Z"
        fill={`url(#${coreGradId})`}
      />
      <path
        d="M24 4.2L41.2 14.1V33.9L24 43.8L6.8 33.9V14.1L24 4.2Z"
        fill={`url(#${glowGradId})`}
      />

      {/* Inner Geometric Facet Line */}
      <path
        d="M24 8.4L37.5 16.2V31.8L24 39.6L10.5 31.8V16.2L24 8.4Z"
        stroke={`url(#${shieldGradId})`}
        strokeWidth="1"
        strokeOpacity="0.35"
      />

      {/* Interlocking Hexagonal Shield Bracket A (Upper-Left to Bottom Lock) */}
      <path
        d="M28.6 6.6L24 3.9L6.5 14V34L17.9 40.6L19.7 37.5"
        stroke={`url(#${shieldGradId})`}
        strokeWidth="2.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Interlocking Hexagonal Shield Bracket B (Lower-Right to Top Lock) */}
      <path
        d="M19.4 41.4L24 44.1L41.5 34V14L30.1 7.4L28.3 10.5"
        stroke={`url(#${shieldGradId})`}
        strokeWidth="2.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Futuristic Monogram "N" — Left Chamfered Pillar */}
      <path
        d="M15.2 32.5V16.2L18.9 14.3V32.5H15.2Z"
        fill="#FFFFFF"
      />

      {/* Futuristic Monogram "N" — Diagonal Energy Bridge */}
      <path
        d="M17.5 15.6H20.6L29.8 29.2V32.5H26.7L17.5 18.9V15.6Z"
        fill={`url(#${beamGradId})`}
      />

      {/* Futuristic Monogram "N" — Right Chamfered Pillar */}
      <path
        d="M29.1 32.5V20.5H32.8V30.6L29.1 32.5Z"
        fill="#FFFFFF"
      />

      {/* Enterprise Network Node Accent & Trace */}
      <path
        d="M30.95 20.5V15.6L35.9 12.8"
        stroke="#06B6D4"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="30.95" cy="15.6" r="3.1" fill="#0B1120" />
      <circle cx="30.95" cy="15.6" r="2.35" fill="#06B6D4" />
      <circle cx="30.95" cy="15.6" r="1.0" fill="#FFFFFF" />
      <circle cx="35.9" cy="12.8" r="1.35" fill="#22D3EE" />
    </svg>
  );
}
