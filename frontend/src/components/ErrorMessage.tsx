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
  title = 'Request failed',
}) => {
  if (!error) return null;

  const isApiError = error instanceof ApiError;
  const message = typeof error === 'string' ? error : error.message;
  const code = isApiError ? error.code : 'CLIENT_EXCEPTION';
  const status = isApiError ? error.status : null;
  const details = isApiError ? error.details : null;

  return (
    <div className="border border-red-200 bg-red-50 p-4 rounded-lg text-red-800 my-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-red-700">
            [{code}] {title}
            {status ? ` (HTTP ${status})` : ''}
          </span>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="btn !px-2.5 !py-1 shrink-0 bg-white text-red-700 border border-red-300 hover:bg-red-100"
          >
            Retry Request
          </button>
        )}
      </div>
      <p className="text-xs text-red-700 leading-relaxed">{message}</p>
      {details && Object.keys(details).length > 0 && (
        <pre className="text-[11px] bg-white p-2 rounded-md border border-red-100 overflow-x-auto text-red-600">
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  );
};
