import React, { createContext, useContext, useMemo, useState } from 'react';

export type LayoutMode = 'auto' | 'two-column' | 'single-column';

type LayoutContextValue = {
  layout: LayoutMode;
  setLayout: (m: LayoutMode) => void;
};

const LayoutContext = createContext<LayoutContextValue | undefined>(undefined);

export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [layout, setLayout] = useState<LayoutMode>(() => (localStorage.getItem('layout') as LayoutMode) || 'auto');

  const value = useMemo(() => ({ layout, setLayout: (m: LayoutMode) => {
    localStorage.setItem('layout', m);
    setLayout(m);
  }}), [layout]);

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
};

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used within LayoutProvider');
  return ctx;
}

