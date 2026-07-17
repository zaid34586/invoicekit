import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

export type Region = "india" | "global";

const hostname = window.location.hostname;
const isIndia = hostname.endsWith(".in");

const defaultRegion: Region = isIndia ? "india" : "global";

const RegionContext = createContext<Region>(defaultRegion);

export function RegionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const region = useMemo(() => defaultRegion, []);

  return (
    <RegionContext.Provider value={region}>
      {children}
    </RegionContext.Provider>
  );
}

export function useRegion() {
  return useContext(RegionContext);
}