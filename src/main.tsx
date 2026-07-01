import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";

import { AuthProvider } from "./context/AuthContext";
import { UpgradeProvider } from "./context/UpgradeContext";
import { RegionProvider } from "./context/RegionContext";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <RegionProvider>
      <AuthProvider>
        <UpgradeProvider>
          <App />
        </UpgradeProvider>
      </AuthProvider>
    </RegionProvider>
  </BrowserRouter>
);