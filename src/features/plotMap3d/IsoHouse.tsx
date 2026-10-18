import React from 'react';

export const ROOF_PALETTES = [
  { main: '#1a3c6e', light: '#2a5a9e', dark: '#102747' }, // 0: Navy
  { main: '#b5532f', light: '#d96c43', dark: '#8f3c1d' }, // 1: Terracotta
  { main: '#4a5568', light: '#718096', dark: '#2d3748' }, // 2: Slate
  { main: '#c28a2c', light: '#e7b861', dark: '#9c6c1f' }, // 3: Ochre
];

interface IsoHouseProps {
  width?: number | string;
  height?: number | string;
  size?: number | string;
  palette?: 0 | 1 | 2 | 3;
  variant?: 0 | 1 | 2;
  className?: string;
}

export const IsoHouse: React.FC<IsoHouseProps> = ({
  width,
  height,
  size,
  palette = 0,
  variant = 0,
  className = '',
}) => {
  const finalWidth = size !== undefined ? size : width || '100%';
  const finalHeight = size !== undefined ? size : height || '100%';
  const p = ROOF_PALETTES[palette % 4];

  return (
    <svg
      viewBox="0 0 100 100"
      width={finalWidth}
      height={finalHeight}
      className={`overflow-visible ${className}`}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`shadow-${palette}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.25)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>

      {/* Ground soft shadow */}
      <ellipse cx="50" cy="80" rx="36" ry="12" fill={`url(#shadow-${palette})`} />

      {/* Optional medium / large side wing (variants 1 & 2) */}
      {variant >= 1 && (
        <g id="side-wing">
          {/* Wing Left wall */}
          <polygon points="18,62 34,70 34,54 18,46" fill="#e8e1d7" />
          {/* Wing Front wall */}
          <polygon points="34,70 42,66 42,50 34,54" fill="#f5efe6" />
          {/* Wing Roof */}
          <polygon points="16,46 32,54 42,49 26,41" fill={p.dark} />
        </g>
      )}

      {/* Main Building Left Wall (shaded) */}
      <polygon points="32,68 50,78 50,54 32,44" fill="#e2dcd2" />

      {/* Main Building Front Wall */}
      <polygon points="50,78 74,65 74,41 50,54" fill="#f5efe6" />

      {/* Chimney */}
      <polygon points="38,36 43,39 43,31 38,28" fill="#8c4a32" />
      <polygon points="43,39 48,36 48,28 43,31" fill="#723924" />
      <polygon points="38,28 43,25 48,28 43,31" fill="#a3573c" />

      {/* Roof Left Slope */}
      <polygon points="30,44 50,33 50,54 30,65" fill={p.main} />

      {/* Roof Right Slope (Front facing) */}
      <polygon points="50,33 76,42 76,43 50,54" fill={p.light} />

      {/* Roof Gable Front Triangle */}
      <polygon points="50,33 76,42 50,54" fill={p.main} />

      {/* Front Door */}
      <polygon points="58,70 65,66 65,56 58,60" fill="#e7b861" />
      <circle cx="63.5" cy="63.5" r="0.8" fill="#1a3c6e" />

      {/* Front Windows */}
      <polygon points="53,58 57,56 57,50 53,52" fill="#9cc7f0" />
      <polygon points="67,51 71,49 71,43 67,45" fill="#9cc7f0" />

      {/* Large variant tree (variant 2) */}
      {variant === 2 && (
        <g id="tree">
          {/* Trunk */}
          <polygon points="78,74 81,74 81,64 78,64" fill="#6b4c38" />
          {/* Foliage Cone */}
          <polygon points="74,66 85,66 79.5,48" fill="#3f8f5a" />
          <polygon points="76,56 83,56 79.5,42" fill="#4fa86e" />
        </g>
      )}
    </svg>
  );
};
