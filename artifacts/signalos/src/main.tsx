import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

pendo.initialize({
  visitor: {
    id: ''
  }
});

createRoot(document.getElementById("root")!).render(<App />);
