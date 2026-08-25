import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installGlobalCapture, logBoot } from "./logging";

// Installed before React mounts so a crash during the first render is captured.
installGlobalCapture();
logBoot();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
