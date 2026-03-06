'use client';

import { useEffect, useCallback, useState } from 'react';

function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export function SessionWatcher() {
  const [showWarning, setShowWarning] = useState(false);
  const [remaining, setRemaining] = useState(0);

  const checkExpiry = useCallback(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const payload = decodeJwtPayload(token);
    if (!payload?.exp) return;

    const now = Math.floor(Date.now() / 1000);
    const secondsLeft = payload.exp - now;

    if (secondsLeft <= 0) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login?expired=true';
      return;
    }

    if (secondsLeft <= 300) {
      setShowWarning(true);
      setRemaining(Math.ceil(secondsLeft / 60));
    } else {
      setShowWarning(false);
    }
  }, []);

  useEffect(() => {
    checkExpiry();
    const interval = setInterval(checkExpiry, 30000);
    return () => clearInterval(interval);
  }, [checkExpiry]);

  if (!showWarning) return null;

  return (
    <div className="fixed top-4 right-4 z-50 rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 shadow-lg">
      <div className="flex items-center gap-3">
        <svg className="h-5 w-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-orange-800">Session expiring soon</p>
          <p className="text-xs text-orange-600">
            Your session expires in ~{remaining} min. Save your work and{' '}
            <button onClick={() => window.location.reload()} className="underline font-medium">
              refresh to extend
            </button>.
          </p>
        </div>
      </div>
    </div>
  );
}
