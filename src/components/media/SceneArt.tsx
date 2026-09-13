import type { ReactNode } from 'react';
import { INDIA_MAP_LITE, INDIA_VIEWBOX } from '@/data/generated/india-map';
import type { SceneThemeId } from '@/data/types';
import { cn } from '@/utils/cn';

interface ArtSpec {
  sky: [top: string, bottom: string];
  draw: (accent: string, id: string) => ReactNode;
}

/**
 * Hand-drawn, resolution-independent vignettes for every scene theme. They
 * stand in wherever a rendered still or photograph is not yet available, so
 * no card or fallback is ever blank.
 */
const ART: Record<SceneThemeId, ArtSpec> = {
  india: {
    sky: ['#0d1426', '#2a3a5e'],
    draw: (accent) => (
      <g transform="translate(142 34) scale(0.34)" fill="none" stroke={accent} strokeWidth="2.2" opacity="0.85">
        {INDIA_MAP_LITE.map((r) => (
          <path key={r.id} d={r.d} />
        ))}
      </g>
    ),
  },
  himalaya: {
    sky: ['#86a9d2', '#f0dcc6'],
    draw: () => (
      <>
        <circle cx="300" cy="118" r="24" fill="#fff4de" opacity="0.9" />
        <path d="M0 192 40 160l30 15 40-55 40 50 40-30 40 35 40-65 40 50 40-25 50 35V300H0Z" fill="#9fb3c9" opacity="0.8" />
        <path d="M0 232 50 186l40 30 50-66 50 70 50-45 50 50 50-55 50 45V300H0Z" fill="#3c4858" />
        <path d="m140 150-12 16 8-3 6 7 8-8Zm150 70-10 12 7-2 5 5 6-6Zm50-55-9 11 6-2 5 5 6-6Z" fill="#f4f6f8" />
      </>
    ),
  },
  ganga: {
    sky: ['#e9a26a', '#f7d8b0'],
    draw: (accent) => (
      <>
        <circle cx="210" cy="176" r="42" fill={accent} opacity="0.55" />
        <path d="M0 214h400v86H0Z" fill="#b9825a" opacity="0.55" />
        <path d="M150 232h120M175 248h70M195 262h30" stroke="#ffd9a6" strokeWidth="2" opacity="0.6" />
        <path d="M0 214V150h26v-18h18v18h20l12-34 12 34h14v64Zm296 0v-54h24v-20h16v20h18l12-30 12 30h22v54Z" fill="#4e3325" />
        <path d="M0 214h124M0 222h110M0 230h96M296 214h104M310 222h90M324 230h76" stroke="#3a261b" strokeWidth="3" />
      </>
    ),
  },
  hampi: {
    sky: ['#e3bd8f', '#f5e2c6'],
    draw: () => (
      <>
        <ellipse cx="70" cy="235" rx="72" ry="48" fill="#9a7052" />
        <ellipse cx="120" cy="205" rx="46" ry="34" fill="#865e43" />
        <ellipse cx="360" cy="228" rx="80" ry="54" fill="#8e654a" />
        <path d="M200 256h150v-10H200Zm8-10h8v-44h-8Zm30 0h8v-44h-8Zm30 0h8v-44h-8Zm30 0h8v-44h-8Zm30 0h8v-44h-8ZM196 202h162v-10H196Zm20-10 60-22 60 22Z" fill="#5f4130" />
        <path d="M0 256h400v44H0Z" fill="#6f5039" />
      </>
    ),
  },
  temple: {
    sky: ['#c8683f', '#f0bf8c'],
    draw: (accent) => (
      <>
        <circle cx="96" cy="120" r="28" fill={accent} opacity="0.5" />
        <path
          d="M130 300V250h140v50Zm12-50 8-34h100l8 34Zm18-34 7-30h66l7 30Zm16-30 6-26h42l6 26Zm14-26 5-22h22l5 22Zm11-22 3-16h8l3 16Z"
          fill="#4e261a"
        />
        <path d="M196 116h8v-10h-8Z" fill={accent} />
        <path d="M0 270h130v30H0Zm270 0h130v30H270Z" fill="#3b1d14" />
      </>
    ),
  },
  battlefield: {
    sky: ['#b0714a', '#e7b07a'],
    draw: () => (
      <>
        <path d="M0 220c80-40 150-50 230-30s120 10 170-10v120H0Z" fill="#5a3b2a" />
        <path d="M250 196v-30h12v8h10v-8h12v8h10v-8h12v30Z" fill="#43291d" />
        <path d="M40 300v-70m30 70v-80m30 80v-66m150 66v-74m30 74v-82m30 82v-70" stroke="#2c1a12" strokeWidth="3" />
        <path d="M70 220l22 8-22 8Zm210-2 22 8-22 8Z" fill="#9c3b24" />
        <path d="M0 300h400v-24H0Z" fill="#3a2418" />
      </>
    ),
  },
  taj: {
    sky: ['#e8b7a5', '#f8e3d8'],
    draw: () => (
      <>
        <path d="M0 236h400v64H0Z" fill="#c9a99a" opacity="0.6" />
        <path d="M188 236h24v64h-24Z" fill="#b3d0dc" opacity="0.7" />
        <path d="M140 236v-56h120v56Zm30-56c0-42 60-42 60 0Zm26-40h8v-14h-8Z" fill="#fbf4ee" />
        <path d="M104 236v-92h8v92Zm184 0v-92h8v92Z" fill="#fbf4ee" />
        <path d="M140 236v56h120v-56Zm30 56c0 30 60 30 60 0Z" fill="#f3e6de" opacity="0.35" />
      </>
    ),
  },
  forest: {
    sky: ['#9bb389', '#dce7c9'],
    draw: () => (
      <>
        <path d="M120 0 60 300h60Zm120 0-20 300h70Z" fill="#fffbe6" opacity="0.14" />
        <circle cx="50" cy="120" r="70" fill="#3e5a30" />
        <circle cx="160" cy="80" r="80" fill="#35502a" />
        <circle cx="300" cy="110" r="90" fill="#2f4826" />
        <circle cx="390" cy="160" r="60" fill="#3a5530" />
        <path d="M44 300V170h10v130Zm112 0V150h12v150Zm140 0V180h12v120Z" fill="#2a2018" />
        <path d="M0 262c90-20 210-10 400 6v32H0Z" fill="#2e3d22" />
      </>
    ),
  },
  coast: {
    sky: ['#79a5ab', '#e9e4cf'],
    draw: () => (
      <>
        <path d="M0 214h400v86H0Z" fill="#4f8b8c" />
        <path d="M0 248c60-10 120 8 200 0s140-6 200 6v46H0Z" fill="#dcc79a" />
        <path d="M70 250c6-60 20-100 44-130" stroke="#3e3222" strokeWidth="6" fill="none" />
        <path d="M114 120c-20-10-44-6-58 8m58-8c-8-20-28-30-48-28m48 28c18-12 42-12 56 2m-56-2c10-18 30-24 50-20" stroke="#2f4a2c" strokeWidth="7" fill="none" strokeLinecap="round" />
        <path d="M300 214h60l-10 14h-44Z" fill="#3b2a1c" />
        <path d="M306 214c8-16 36-16 44 0Z" fill="#7a5a36" />
      </>
    ),
  },
  desert: {
    sky: ['#df8249', '#f7c985'],
    draw: (accent) => (
      <>
        <circle cx="120" cy="170" r="46" fill={accent} opacity="0.7" />
        <path d="M0 232c80-44 170-44 250-10s110 20 150 0v78H0Z" fill="#c67a3f" />
        <path d="M0 270c100-30 200-26 400 4v26H0Z" fill="#a85c2e" />
        <path d="M280 214v-26h8v6h8v-6h8v6h8v-6h8v26Z" fill="#8a4a24" />
        <path d="M60 252c4-8 10-8 14 0h6c2-6 8-6 10 0" stroke="#3b2214" strokeWidth="3" fill="none" />
      </>
    ),
  },
  festival: {
    sky: ['#0f0b1c', '#3a1e36'],
    draw: (accent) => (
      <>
        {[
          [60, 90, 7],
          [120, 60, 5],
          [180, 110, 6],
          [250, 70, 8],
          [320, 100, 5],
          [360, 50, 6],
          [90, 150, 4],
          [290, 150, 4],
        ].map(([cx, cy, r], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r={(r ?? 5) * 3} fill={accent} opacity="0.12" />
            <circle cx={cx} cy={cy} r={r} fill="#ffc062" />
          </g>
        ))}
        <path d="M0 262h400v38H0Z" fill="#1a0f12" />
        {Array.from({ length: 12 }, (_, i) => (
          <circle key={i} cx={20 + i * 33} cy={258} r="3" fill="#ffb24a" />
        ))}
      </>
    ),
  },
  food: {
    sky: ['#170f0a', '#3a2517'],
    draw: (accent) => (
      <>
        <ellipse cx="200" cy="200" rx="150" ry="62" fill="#b08547" />
        <ellipse cx="200" cy="196" rx="136" ry="54" fill="#7a5a33" />
        <ellipse cx="140" cy="188" rx="30" ry="13" fill="#c9a263" />
        <ellipse cx="140" cy="185" rx="24" ry="9" fill="#d58a2c" />
        <ellipse cx="250" cy="182" rx="30" ry="13" fill="#c9a263" />
        <ellipse cx="250" cy="179" rx="24" ry="9" fill="#8f3a1d" />
        <ellipse cx="200" cy="214" rx="34" ry="14" fill="#efe6d2" />
        <path d="M180 140c-6-14 6-20 0-34m20 34c-6-14 6-20 0-34m20 34c-6-14 6-20 0-34" stroke={accent} strokeWidth="2" opacity="0.45" fill="none" />
      </>
    ),
  },
  city: {
    sky: ['#060a1a', '#1b2452'],
    draw: () => (
      <>
        <path d="M0 300V210h30v-40h24v60h20v-90h26v70h22v-40h30v-56h20v96h24v-30h28v50h22v-70h30v40h20v-24h26v60h22v-30h36v84Z" fill="#0a0e1e" />
        {Array.from({ length: 36 }, (_, i) => (
          <rect key={i} x={10 + ((i * 53) % 380)} y={180 + ((i * 29) % 100)} width="3" height="3" fill="#ffd28a" opacity={0.5 + ((i * 7) % 5) / 10} />
        ))}
        <path d="M0 286c120-18 260-18 400 0" stroke="#ffc36b" strokeWidth="2" strokeDasharray="2 5" fill="none" opacity="0.8" />
      </>
    ),
  },
  meghalaya: {
    sky: ['#b2c5bf', '#e8eeea'],
    draw: () => (
      <>
        <path d="M0 170c60-30 120-20 180 0s130 10 220-20v170H0Z" fill="#8fa89a" opacity="0.7" />
        <path d="M0 210c80-40 160-30 240-6s110 10 160-10v106H0Z" fill="#5f7d66" opacity="0.85" />
        <path d="M0 250c100-30 220-24 400 0v50H0Z" fill="#35503c" />
        <path d="M120 258c40-40 120-40 160 0" stroke="#4a3525" strokeWidth="6" fill="none" />
        <path d="M0 196h400" stroke="#ffffff" strokeWidth="14" opacity="0.18" />
      </>
    ),
  },
};

export function SceneArt({
  theme,
  accent = '#E8A04B',
  className,
  label,
}: {
  theme: SceneThemeId;
  accent?: string;
  className?: string;
  label?: string;
}) {
  const spec = ART[theme] ?? ART.india;
  const gradientId = `sky-${theme}`;
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      className={cn('absolute inset-0 h-full w-full', className)}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={spec.sky[0]} />
          <stop offset="1" stopColor={spec.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${gradientId})`} />
      {spec.draw(accent, theme)}
    </svg>
  );
}

export { INDIA_VIEWBOX };
