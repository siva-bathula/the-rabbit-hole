import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported, logEvent } from 'firebase/analytics';

function envString(name) {
  const v = import.meta.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

const measurementId = envString('VITE_FIREBASE_MEASUREMENT_ID');

const firebaseConfig = {
  apiKey: envString('VITE_FIREBASE_API_KEY'),
  authDomain: envString('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: envString('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: envString('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: envString('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: envString('VITE_FIREBASE_APP_ID'),
  ...(measurementId ? { measurementId } : {}),
};

export const app = initializeApp(firebaseConfig);

/** Set after `initFirebaseAnalytics()`; used by track helpers. */
export let analytics = null;

let initPromise = null;

function hasAnalyticsConfig() {
  return Boolean(measurementId && firebaseConfig.apiKey && firebaseConfig.appId);
}

/**
 * Start GA4 via the Firebase Web SDK (browser only).
 * Call once at app bootstrap — keeps analytics from being dropped by the bundler.
 */
export function initFirebaseAnalytics() {
  if (initPromise) return initPromise;
  if (typeof window === 'undefined') {
    initPromise = Promise.resolve(null);
    return initPromise;
  }
  if (!hasAnalyticsConfig()) {
    if (import.meta.env.DEV) {
      console.warn(
        '[firebase] Analytics disabled — set VITE_FIREBASE_MEASUREMENT_ID, VITE_FIREBASE_API_KEY, and VITE_FIREBASE_APP_ID in client/.env before build.',
      );
    }
    initPromise = Promise.resolve(null);
    return initPromise;
  }

  initPromise = isSupported()
    .then((supported) => {
      if (!supported) {
        console.warn('[firebase] Analytics is not supported in this browser.');
        return null;
      }
      try {
        analytics = getAnalytics(app);
        return analytics;
      } catch (err) {
        console.warn('[firebase] Analytics init failed:', err);
        return null;
      }
    })
    .catch((err) => {
      console.warn('[firebase] Analytics support check failed:', err);
      return null;
    });

  return initPromise;
}

/** SPA navigation / screen change (supplements the initial automatic page_view). */
export async function trackScreenView(screenName, params = {}) {
  const a = analytics ?? (await initFirebaseAnalytics());
  if (!a) return;
  logEvent(a, 'screen_view', {
    firebase_screen: screenName,
    firebase_screen_class: 'app',
    ...params,
  });
}

export async function trackAnalyticsEvent(name, params = {}) {
  const a = analytics ?? (await initFirebaseAnalytics());
  if (!a) return;
  logEvent(a, name, params);
}