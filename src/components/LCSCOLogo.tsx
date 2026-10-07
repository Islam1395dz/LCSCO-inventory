import React from 'react';

interface LCSCOLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

/**
 * Vector recreation of the official LCSCO Logo:
 * - Green pentagon emblem with white double-line border
 * - Isometric 4x4 3D sphere lattice (12 silver outer spheres + 4 blue central catalyst spheres)
 * - LCSCO green serif wordmark + "Laboratoire de Catalyse et Synthèse en Chimie Organique"
 */
export const LCSCOLogo: React.FC<LCSCOLogoProps> = ({
  size = 'md',
  showSubtitle = false,
}) => {
  const dimensions =
    size === 'sm' ? 'w-9 h-9' : size === 'lg' ? 'w-20 h-20' : 'w-11 h-11';

  // 4x4 isometric grid of spheres from back-to-front (painter's algorithm order)
  const gridBalls: Array<{ r: number; c: number; isBlue: boolean }> = [];
  for (let sum = 0; sum <= 6; sum++) {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (r + c === sum) {
          const isBlue = (r === 1 || r === 2) && (c === 1 || c === 2);
          gridBalls.push({ r, c, isBlue });
        }
      }
    }
  }

  return (
    <div className="inline-flex items-center gap-3 select-none">
      <svg
        viewBox="0 0 120 115"
        className={`${dimensions} shrink-0`}
        aria-label="LCSCO Logo"
      >
        <defs>
          <linearGradient id="lcscoGreen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#43A047" />
            <stop offset="100%" stopColor="#1B8A2A" />
          </linearGradient>
          <radialGradient id="silverSphere" cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="55%" stopColor="#D1D5DB" />
            <stop offset="100%" stopColor="#6B7280" />
          </radialGradient>
          <radialGradient id="blueSphere" cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#93C5FD" />
            <stop offset="50%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#1E3A8A" />
          </radialGradient>
        </defs>

        {/* Outer Green Pentagon (Flat Top, Point Bottom) */}
        <polygon
          points="24,6 96,6 114,66 60,109 6,66"
          fill="url(#lcscoGreen)"
          stroke="#15803D"
          strokeWidth="2"
        />
        {/* Inner White Line Pentagon */}
        <polygon
          points="27,11 93,11 108,64 60,103 12,64"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          opacity="0.9"
        />

        {/* Isometric 4x4 Molecular Catalyst Sphere Lattice */}
        {gridBalls.map(({ r, c, isBlue }) => {
          const cx = 60 + (c - r) * 11.5;
          const cy = 26 + (c + r) * 6.8;
          return (
            <circle
              key={`${r}-${c}`}
              cx={cx}
              cy={cy}
              r={8.4}
              fill={isBlue ? 'url(#blueSphere)' : 'url(#silverSphere)'}
              stroke={isBlue ? '#1E40AF' : '#9CA3AF'}
              strokeWidth="0.4"
            />
          );
        })}
      </svg>

      {showSubtitle && (
        <div className="flex flex-col">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-extrabold tracking-wider text-[#1B8A2A] font-serif">
              LCSCO
            </span>
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Inventory
            </span>
          </div>
          <span className="text-[11px] font-medium text-[#1E3A8A] leading-tight">
            Laboratoire de Catalyse et Synthèse en Chimie Organique
          </span>
        </div>
      )}
    </div>
  );
};
