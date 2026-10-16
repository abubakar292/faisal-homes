import React from 'react';
import { BrandMark } from './brand';

interface LogoProps {
  size?: number;
  className?: string;
  variant?: 'light' | 'dark'; // kept for backward compatibility but unused
}

const Logo: React.FC<LogoProps> = ({ size = 36, className = '' }) => {
  return (
    <BrandMark size={size} className={className} />
  );
};

export default Logo;
