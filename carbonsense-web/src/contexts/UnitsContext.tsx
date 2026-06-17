import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { UnitSystem } from "@/utils/units";

const STORAGE_KEY = "carbonsense_units";

interface UnitsContextValue {
  unitSystem: UnitSystem;
  setUnitSystem: (system: UnitSystem) => void;
}

const UnitsContext = createContext<UnitsContextValue | null>(null);

function readStoredUnitSystem(): UnitSystem {
  if (typeof window === "undefined") return "metric";
  return window.localStorage.getItem(STORAGE_KEY) === "imperial" ? "imperial" : "metric";
}

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [unitSystem, setUnitSystemState] = useState<UnitSystem>(readStoredUnitSystem);

  const setUnitSystem = useCallback((system: UnitSystem) => {
    setUnitSystemState(system);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, system);
    }
  }, []);

  const value = useMemo(
    () => ({ unitSystem, setUnitSystem }),
    [unitSystem, setUnitSystem],
  );

  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits() {
  const context = useContext(UnitsContext);
  if (!context) {
    throw new Error("useUnits must be used within UnitsProvider");
  }
  return context;
}
