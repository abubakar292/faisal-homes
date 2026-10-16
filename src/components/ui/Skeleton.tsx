import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', width, height }) => (
  <div
    className={`rounded-lg skeleton-shimmer ${className}`}
    style={{ width, height: height || '1rem' }}
  />
);

/* ── Dashboard stats skeleton ── */
export const StatCardSkeleton: React.FC = () => (
  <div className="card flex items-center gap-4">
    <div className="skeleton-shimmer w-12 h-12 rounded-2xl flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <Skeleton width="60%" height="0.75rem" />
      <Skeleton width="40%" height="1.5rem" />
      <Skeleton width="50%" height="0.65rem" />
    </div>
  </div>
);

/* ── Table row skeleton ── */
export const TableRowSkeleton: React.FC<{ cols?: number }> = ({ cols = 6 }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="table-td">
        <Skeleton width={i === 0 ? '80%' : '60%'} height="0.85rem" />
      </td>
    ))}
  </tr>
);

/* ── Table skeleton ── */
export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 6, cols = 6 }) => (
  <>
    {Array.from({ length: rows }).map((_, i) => (
      <TableRowSkeleton key={i} cols={cols} />
    ))}
  </>
);

/* ── Card skeleton ── */
export const CardSkeleton: React.FC = () => (
  <div className="card space-y-3">
    <Skeleton width="40%" height="1rem" />
    <Skeleton width="100%" height="0.75rem" />
    <Skeleton width="80%" height="0.75rem" />
    <Skeleton width="60%" height="0.75rem" />
  </div>
);

export default Skeleton;
