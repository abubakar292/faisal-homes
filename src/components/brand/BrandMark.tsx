import React from 'react';

interface BrandMarkProps {
  size?: number;
  className?: string;
}

const BrandMark: React.FC<BrandMarkProps> = ({ size = 92, className = '' }) => {
  return (
    <img
      src="/brand/faisal-mark.png"
      alt="Faisal Homes"
      width={size}
      height={size}
      draggable={false}
      decoding="async"
      className={className}
    />
  );
};

export default BrandMark;
