import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import UpgradeModal from "../components/UpgradeModal";
import { useAuth } from "./AuthContext";

interface UpgradeContextValue {
  openUpgrade: () => void;
  closeUpgrade: () => void;

  isFree: boolean;
  isPro: boolean;
  isBusiness: boolean;
}

const UpgradeContext = createContext<UpgradeContextValue | undefined>(undefined);

export function UpgradeProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const { profile } = useAuth();

const isFree = profile?.plan === "free";
const isPro = profile?.plan === "pro";
const isBusiness = profile?.plan === "business";
  return (
    <UpgradeContext.Provider
      value={{
  openUpgrade: () => setIsOpen(true),
  closeUpgrade: () => setIsOpen(false),

  isFree,
  isPro,
  isBusiness,
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
