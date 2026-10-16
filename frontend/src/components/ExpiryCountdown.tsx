import React, { useState, useEffect } from 'react';

interface ExpiryCountdownProps {
  expiresAt: string;
  isExpired?: boolean;
}

export const ExpiryCountdown: React.FC<ExpiryCountdownProps> = ({ expiresAt, isExpired }) => {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    totalMs: number;
  }>({ hours: 0, minutes: 0, seconds: 0, totalMs: 0 });

  useEffect(() => {
    const calculate = () => {
      const target = new Date(expiresAt).getTime();
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0 || isExpired) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, totalMs: 0 });
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ hours, minutes, seconds, totalMs: diff });
    };

    calculate();
    const interval = setInterval(calculate, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, isExpired]);

  if (timeLeft.totalMs <= 0 || isExpired) {
    return (
      <span className="font-mono text-xs text-red-400 font-bold tracking-tight inline-flex items-center gap-1">
        <span className="w-1.5 h-1.5 bg-red-500 rounded-xs"></span>
        EXPIRED
      </span>
    );
  }

  const hours = String(timeLeft.hours).padStart(2, '0');
  const mins = String(timeLeft.minutes).padStart(2, '0');
  const secs = String(timeLeft.seconds).padStart(2, '0');

  // Urgency color coding:
  // Under 4 hours: Critical red
  // Under 12 hours: Warning amber
  // Over 12 hours: Normal teal/white
  let textClass = 'text-slate-300';
  let indicatorClass = 'bg-cyan-500';

  if (timeLeft.totalMs < 4 * 60 * 60 * 1000) {
    textClass = 'text-red-400 font-bold';
    indicatorClass = 'bg-red-500';
  } else if (timeLeft.totalMs < 12 * 60 * 60 * 1000) {
    textClass = 'text-amber-400 font-semibold';
    indicatorClass = 'bg-amber-500';
  }

  return (
    <div className={`font-mono text-xs tabular-nums flex items-center gap-1.5 ${textClass}`}>
      <span className={`w-1.5 h-1.5 rounded-xs ${indicatorClass}`}></span>
      <span>
        {hours}h {mins}m {secs}s
      </span>
    </div>
  );
};
