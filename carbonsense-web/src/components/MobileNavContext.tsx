import { createContext, useContext } from "react";

interface MobileNavContextValue {
  openMobileNav: () => void;
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export function MobileNavProvider({
  children,
  openMobileNav,
}: {
  children: React.ReactNode;
  openMobileNav: () => void;
}) {
  return (
    <MobileNavContext.Provider value={{ openMobileNav }}>
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav() {
  return useContext(MobileNavContext);
}
