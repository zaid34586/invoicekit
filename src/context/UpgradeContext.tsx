import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import UpgradeModal from "../components/UpgradeModal";

interface UpgradeContextValue {
  openUpgrade: () => void;
  closeUpgrade: () => void;
}

const UpgradeContext = createContext<UpgradeContextValue | undefined>(undefined);

export function UpgradeProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <UpgradeContext.Provider
      value={{
        openUpgrade: () => setIsOpen(true),
        closeUpgrade: () => setIsOpen(false),
      }}
    >
      {children}
      <UpgradeModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </UpgradeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUpgrade() {
  const ctx = useContext(UpgradeContext);
  if (!ctx) throw new Error("useUpgrade must be used within UpgradeProvider");
  return ctx;
}
