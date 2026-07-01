import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

export type Region = "india" | "global";

const isIndia =
  window.location.hostname.endsWith(".in") ||
  window.location.hostname === "localhost";

const RegionContext = createContext<Region>(
  isIndia ? "india" : "global"
);

export function RegionProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <RegionContext.Provider
      value={isIndia ? "india" : "global"}
    >
      {children}
    </RegionContext.Provider>
  );
}

export function useRegion() {
  return useContext(RegionContext);
}