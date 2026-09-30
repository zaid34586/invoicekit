import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";

import { AuthProvider } from "./context/AuthContext";
import { UpgradeProvider } from "./context/UpgradeContext";
import { RegionProvider } from "./context/RegionContext";
import { AffitorProvider } from "@affitor/sdk/react";
import ErrorBoundary from "./components/ErrorBoundary";
import { initErrorCapture } from "./lib/errorCapture";

import "./index.css";

initErrorCapture();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <BrowserRouter>
      <RegionProvider>
        <AffitorProvider programId="1156">
          <AuthProvider>
            <UpgradeProvider>
              <App />
            </UpgradeProvider>
          </AuthProvider>
        </AffitorProvider>
      </RegionProvider>
    </BrowserRouter>
  </ErrorBoundary>
);