import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
  index?: number;
  onClick?: () => void;
}

/* Counts up a numeric value over 800ms */
function useCountUp(target: number, duration = 800) {
  const [display, setDisplay] = useState(0);
  const frame = useRef<number>(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      // ease-out
      setDisplay(Math.floor(p * target));
      if (p < 1) frame.current = requestAnimationFrame(tick);
      else setDisplay(target);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);
  return display;
}

const StatCard: React.FC<Props> = ({ title, value, icon, trend, trendUp, index = 0, onClick }) => {
  const isNumber = typeof value === 'number';
  const countedNum = useCountUp(isNumber ? (value as number) : 0);

  /* Format Rs. amounts with count-up */
  let displayValue: string;
  if (typeof value === 'string' && value.startsWith('Rs.')) {
    const raw = parseInt(value.replace(/[^\d]/g, ''), 10) || 0;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const counted = useCountUp(raw);
    displayValue = `Rs. ${counted.toLocaleString('en-PK')}`;
  } else if (isNumber) {
    displayValue = countedNum.toLocaleString();
  } else {
    displayValue = String(value);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.07, ease: 'easeOut' }}
      whileHover={{ y: -2, boxShadow: '0 8px 25px rgba(0,0,0,0.10)' }}
      className={`card cursor-default transition-shadow duration-150 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            {title}
          </p>
          <p className="text-2xl font-extrabold text-primary leading-none mb-1 animate-count">
            {displayValue}
          </p>
          {trend && (
            <p className={`text-xs font-medium mt-1.5 ${trendUp ? 'text-green-600' : 'text-red-500'}`}>
              {trendUp ? '▲' : '▼'} {trend}
            </p>
          )}
        </div>
        {/* Gold icon circle */}
        <div className="stat-icon ml-3">
          {icon}
        </div>
      </div>
    </motion.div>
  );
};

export default StatCard;
