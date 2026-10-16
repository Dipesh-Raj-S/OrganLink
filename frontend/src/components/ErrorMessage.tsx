import React from 'react';
import { ApiError } from '../api/client';

interface ErrorMessageProps {
  error: Error | ApiError | string | null;
  onRetry?: () => void;
  title?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  error,
  onRetry,
  title = 'API Operation Failed',
}) => {
  if (!error) return null;

  const isApiError = error instanceof ApiError;
  const message = typeof error === 'string' ? error : error.message;
  const code = isApiError ? error.code : 'CLIENT_EXCEPTION';
  const status = isApiError ? error.status : null;
  const details = isApiError ? error.details : null;

  return (
    <div className="border border-red-900/80 bg-red-950/40 p-4 rounded-xs text-red-200 my-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-red-400">
            [{code}] {title} {status ? `(HTTP ${status})` : ''}
          </span>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-2.5 py-1 text-xs font-mono font-medium uppercase tracking-wider bg-red-900/60 hover:bg-red-800 text-white border border-red-700/50 rounded-xs transition-colors"
          >
            Retry Request
          </button>
        )}
      </div>
      <p className="text-xs text-red-300 font-sans leading-relaxed">{message}</p>
      {details && Object.keys(details).length > 0 && (
        <pre className="text-[10px] font-mono bg-black/50 p-2 rounded-xs border border-red-900/50 overflow-x-auto text-red-400">
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  );
};
