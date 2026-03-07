import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  id?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', id, onClick }: CardProps) {
  return (
    <div
      id={id}
      onClick={onClick}
      className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
