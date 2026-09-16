import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/profile.css";
import "./styles/pillars.css";
import "./styles/history.css";
import "./styles/stats.css";
import "./styles/settings.css";
import "./styles/overlays.css";

import { App } from "./ui/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
