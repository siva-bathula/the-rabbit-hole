import { useCallback, useState } from 'react';

const DISMISS_KEY = 'rabbit-hole-feedback-banner-dismissed';

function isDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function useFeedbackBanner() {
  const [visible, setVisible] = useState(() => !isDismissed());

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore quota / private mode
    }
    setVisible(false);
  }, []);

  return { visible, dismiss };
}
