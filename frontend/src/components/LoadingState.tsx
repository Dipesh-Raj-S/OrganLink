import React from 'react';

interface LoadingStateProps {
  message?: string;
  rows?: number;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading records...',
  rows = 5,
}) => {
  return (
    <div className="w-full py-10 px-4 flex flex-col items-center justify-center space-y-4">
      <div className="flex items-center space-x-2 text-xs text-slate-500">
        <div className="w-3 h-3 border-2 border-slate-200 border-t-brand rounded-full animate-spin"></div>
        <span>{message}</span>
      </div>
      <div className="w-full max-w-4xl space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-9 bg-slate-100 rounded-md animate-pulse"
            style={{ animationDelay: `${i * 75}ms` }}
          />
        ))}
      </div>
    </div>
  );
};
