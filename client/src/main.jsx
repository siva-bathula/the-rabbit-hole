import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { initFirebaseAnalytics } from './firebase.js';
import { prefetchRhTurnstileSession } from './lib/turnstileSession.js';
import App from './App.jsx';

initFirebaseAnalytics();
prefetchRhTurnstileSession();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
