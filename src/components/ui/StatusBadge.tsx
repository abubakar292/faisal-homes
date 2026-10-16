import React from 'react';

type Status = string;

interface Props {
  status: Status;
  size?: 'sm' | 'md';
  dot?: boolean;
}

const map: Record<string, { cls: string; label: string }> = {
  available:  { cls: 'badge-available',  label: 'Available' },
  booked:     { cls: 'badge-booked',     label: 'Booked' },
  sold:       { cls: 'badge-sold',       label: 'Sold' },
  cancelled:  { cls: 'badge-cancelled',  label: 'Cancelled' },
  reserved:   { cls: 'badge-reserved',   label: 'Reserved' },
  paid:       { cls: 'badge-paid',       label: 'Paid' },
  pending:    { cls: 'badge-pending',    label: 'Pending' },
  overdue:    { cls: 'badge-overdue',    label: 'Overdue' },
  upcoming:   { cls: 'badge-upcoming',   label: 'Upcoming' },
  confirmed:  { cls: 'badge-confirmed',  label: 'Confirmed' },
  converted:  { cls: 'badge-converted',  label: 'Converted' },
  active:     { cls: 'badge-active',     label: 'Active' },
  completed:  { cls: 'badge-completed',  label: 'Completed' },
};

const dotColors: Record<string, string> = {
  available: '#15803d', booked: '#b45309', sold: '#1d4ed8',
  cancelled: '#b91c1c', reserved: '#7c3aed', paid: '#15803d',
  pending: '#b45309', overdue: '#b91c1c', upcoming: '#0369a1',
  confirmed: '#15803d', converted: '#0f766e', active: '#15803d', completed: '#1d4ed8',
};

const StatusBadge: React.FC<Props> = ({ status, size = 'md', dot = false }) => {
  const key = status?.toLowerCase() || 'pending';
  const cfg = map[key] || { cls: 'badge-pending', label: status };

  return (
    <span
      className={cfg.cls}
      style={size === 'sm' ? { fontSize: '10px', padding: '2px 8px' } : undefined}
    >
      {dot && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full mr-1"
          style={{ background: dotColors[key] || '#b45309' }}
        />
      )}
      {cfg.label}
    </span>
  );
};

export default StatusBadge;
