'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface SearchResult {
  vehicles: { id: string; registrationNumber: string; make: string; model: string; status: string }[];
  drivers: { id: string; firstName: string; lastName: string; mobileNumber: string; status: string }[];
  fleets: { id: string; name: string; code: string | null; status: string; vehicleCount: number }[];
  incidents: { id: string; incidentNumber: string; description: string; incidentDate: string; severity: string }[];
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const debouncedQuery = useDebounce(query, 300);

  const { data } = useQuery<{ data: SearchResult }>({
    queryKey: ['search', debouncedQuery],
    queryFn: () => api.get(`/search?q=${encodeURIComponent(debouncedQuery)}&limit=3`),
    enabled: debouncedQuery.length >= 2,
  });

  const results = data?.data;
  const allResults: { label: string; sub: string; href: string; section: string }[] = [];
  if (results) {
    for (const v of results.vehicles) allResults.push({ section: 'Vehicles', label: `${v.registrationNumber} — ${v.make} ${v.model}`, sub: v.status, href: `/vehicles/${v.id}` });
    for (const d of results.drivers) allResults.push({ section: 'Drivers', label: `${d.firstName} ${d.lastName}`, sub: d.mobileNumber, href: `/drivers/${d.id}` });
    for (const f of results.fleets) allResults.push({ section: 'Fleets', label: f.name, sub: `${f.vehicleCount} vehicles`, href: `/fleets/${f.id}` });
    for (const i of results.incidents) allResults.push({ section: 'Incidents', label: i.incidentNumber, sub: i.description.slice(0, 50), href: `/incidents/${i.id}` });
  }

  const hasResults = allResults.length > 0;

  // Keyboard shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') { setOpen(false); setFocused(-1); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFocused(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const navigate = useCallback((href: string) => {
    setOpen(false);
    setQuery('');
    setFocused(-1);
    router.push(href);
  }, [router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocused((f) => Math.min(f + 1, allResults.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocused((f) => Math.max(f - 1, -1)); }
    else if (e.key === 'Enter' && focused >= 0) { navigate(allResults[focused].href); }
    else if (e.key === 'Enter' && focused === -1 && allResults.length > 0) { navigate(allResults[0].href); }
  };

  // Group results by section
  const sections: Record<string, typeof allResults> = {};
  for (const r of allResults) {
    if (!sections[r.section]) sections[r.section] = [];
    sections[r.section].push(r);
  }

  let globalIdx = 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setFocused(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search… (Ctrl+K)"
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {open && query.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
          {!hasResults && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">No results for &ldquo;{query}&rdquo;</div>
          )}
          {Object.entries(sections).map(([section, items]) => (
            <div key={section}>
              <div className="border-t border-gray-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">{section}</div>
              {items.map((item) => {
                const idx = globalIdx++;
                return (
                  <button key={item.href} onClick={() => navigate(item.href)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 ${focused === idx ? 'bg-blue-50' : ''}`}>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.label}</p>
                      <p className="text-xs text-gray-400 truncate max-w-xs">{item.sub}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
