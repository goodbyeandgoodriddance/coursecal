import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Self-hosted fonts (OFL-1.1) — bundled rather than fetched, so the app has no
// network dependency and renders identically on every machine.
// Inter as a variable font: one file covers every weight the UI uses.
import '@fontsource-variable/inter/wght.css';
// JetBrains Mono only in the two weights the UI actually uses, latin only.
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';

import './styles/theme.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root missing from index.html');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
