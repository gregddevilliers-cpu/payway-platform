'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface SearchableDropdownProps {
  /** API path relative to base, e.g. "/vehicles" */
  apiEndpoint: string;
  /** Render display text from an item */
  displayFormat: (item: any) => string;
  /** Field to use as value (default "id") */
  valueField?: string;
  placeholder?: string;
  label?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  /** Called when the user selects an item */
  onChange: (value: string, item: any) => void;
  /** Pre-selected value (ID) for edit forms */
  initialValue?: string;
  /** Extra query params, e.g. { fleetId: "xxx" } */
  filterParams?: Record<string, string>;
}

interface ApiListResponse {
  success: boolean;
  data: any[];
}

export function SearchableDropdown({
  apiEndpoint,
  displayFormat,
  valueField = 'id',
  placeholder = 'Search...',
  label,
  required,
  error,
  disabled,
  onChange,
  initialValue,
  filterParams,
}: SearchableDropdownProps) {
  const [query, setQuery] = useState('');
  const [displayText, setDisplayText] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [selectedId, setSelectedId] = useState(initialValue ?? '');

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve initialValue to display text on mount
  useEffect(() => {
    if (!initialValue) return;
    (async () => {
      try {
        const res = await api.get<{ success: boolean; data: any }>(`${apiEndpoint}/${initialValue}`);
        if (res.success && res.data) {
          setDisplayText(displayFormat(res.data));
        }
      } catch {
        /* item not found — leave blank */
      }
    })();
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchResults = useCallback(
    async (search: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ search, limit: '10' });
        if (filterParams) {
          Object.entries(filterParams).forEach(([k, v]) => {
            if (v) params.set(k, v);
          });
        }
        const res = await api.get<ApiListResponse>(`${apiEndpoint}?${params}`);
        setResults(res.data ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [apiEndpoint, filterParams],
  );

  const handleInputChange = (value: string) => {
    setQuery(value);
    setDisplayText(value);
    setSelectedId('');
    setHighlightIdx(-1);
    if (!isOpen) setIsOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(value), 300);
  };

  const handleSelect = (item: any) => {
    const id = item[valueField];
    const text = displayFormat(item);
    setSelectedId(id);
    setDisplayText(text);
    setQuery('');
    setIsOpen(false);
    setHighlightIdx(-1);
    onChange(id, item);
  };

  const handleClear = () => {
    setSelectedId('');
    setDisplayText('');
    setQuery('');
    setResults([]);
    setIsOpen(false);
    onChange('', null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        fetchResults(query || '');
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIdx >= 0 && highlightIdx < results.length) {
          handleSelect(results[highlightIdx]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightIdx(-1);
        break;
    }
  };

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHighlightIdx(-1);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleFocus = () => {
    if (!selectedId) {
      setIsOpen(true);
      fetchResults(query || '');
    }
  };

  const inputCls =
    'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none' +
    (error ? ' border-red-400' : '') +
    (disabled ? ' bg-gray-100 cursor-not-allowed' : '');

  return (
    <div ref={wrapperRef} className="relative">
      {label && (
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          className={inputCls}
          placeholder={placeholder}
          value={displayText}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoComplete="off"
        />

        {/* Clear button */}
        {selectedId && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Loading spinner */}
        {loading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded border border-gray-200 bg-white shadow-lg">
          {results.length === 0 && !loading && (
            <li className="px-3 py-2 text-sm text-gray-500">No results found</li>
          )}
          {results.map((item, i) => (
            <li
              key={item[valueField]}
              className={
                'cursor-pointer px-3 py-2 text-sm' +
                (i === highlightIdx ? ' bg-blue-50 text-blue-700' : ' text-gray-700 hover:bg-gray-50')
              }
              onMouseEnter={() => setHighlightIdx(i)}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur before click registers
                handleSelect(item);
              }}
            >
              {displayFormat(item)}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
