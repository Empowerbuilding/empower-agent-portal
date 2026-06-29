'use client';
import { createContext, useContext, useState, ReactNode } from 'react';

type ToolbarContextType = {
  toolbar: ReactNode;
  setToolbar: (node: ReactNode) => void;
};

const MobileToolbarContext = createContext<ToolbarContextType>({
  toolbar: null,
  setToolbar: () => {},
});

export function MobileToolbarProvider({ children }: { children: ReactNode }) {
  const [toolbar, setToolbar] = useState<ReactNode>(null);
  return (
    <MobileToolbarContext.Provider value={{ toolbar, setToolbar }}>
      {children}
    </MobileToolbarContext.Provider>
  );
}

export function useMobileToolbar() {
  return useContext(MobileToolbarContext);
}
