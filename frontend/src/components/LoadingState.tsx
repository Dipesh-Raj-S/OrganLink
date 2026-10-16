import React from 'react';

interface LoadingStateProps {
  message?: string;
  rows?: number;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Retrieving clinical records...',
  rows = 5,
}) => {
  return (
    <div className="w-full py-8 px-4 flex flex-col items-center justify-center space-y-4">
      <div className="flex items-center space-x-2 text-slate-400 font-mono text-xs uppercase tracking-wider">
        <div className="w-3 h-3 border-2 border-slate-600 border-t-cyan-400 rounded-full animate-spin"></div>
        <span>{message}</span>
      </div>
      <div className="w-full max-w-4xl space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-9 bg-slate-900/60 border border-slate-800 rounded-xs animate-pulse"
            style={{ animationDelay: `${i * 75}ms` }}
          />
        ))}
      </div>
    </div>
  );
};
