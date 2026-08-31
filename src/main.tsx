import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";

import { AuthProvider } from "./context/AuthContext";
import { UpgradeProvider } from "./context/UpgradeContext";
import { RegionProvider } from "./context/RegionContext";
import ErrorBoundary from "./components/ErrorBoundary";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <BrowserRouter>
      <RegionProvider>
        <AuthProvider>
          <UpgradeProvider>
            <App />
          </UpgradeProvider>
        </AuthProvider>
      </RegionProvider>
    </BrowserRouter>
  </ErrorBoundary>
);