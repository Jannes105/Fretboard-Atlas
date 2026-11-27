import { useEffect, useRef } from 'react';

/**
 * Lets the phone's back button close an open sheet instead of leaving the app.
 *
 * Opening a sheet adds one history entry; going back from it closes the sheet.
 * Closing it any other way („Fertig", the tab, Escape, a swipe) takes that entry
 * back out, so the back button never has to be pressed twice. Switching from one
 * sheet to another leaves the history alone: it is still one sheet up.
 *
 * The app keeps its state in the URL with replaceState, which writes onto the
 * sheet's entry. Stepping back would land on the entry below with an older URL,
 * so after every step back the current URL is written again.
 */
export function useSheetHistory(open: boolean, close: () => void, currentUrl: () => string) {
  const pushed = useRef(false);
  // A step back we took ourselves, not the user's back button.
  const ownBack = useRef(false);

  const closeRef = useRef(close);
  const urlRef = useRef(currentUrl);
  useEffect(() => {
    closeRef.current = close;
    urlRef.current = currentUrl;
  });

  useEffect(() => {
    if (open && !pushed.current) {
      window.history.pushState({ sheet: true }, '', urlRef.current());
      pushed.current = true;
    } else if (!open && pushed.current) {
      pushed.current = false;
      ownBack.current = true;
      window.history.back();
    }
  }, [open]);

  useEffect(() => {
    const onPop = () => {
      if (ownBack.current) {
        ownBack.current = false;
      } else if (pushed.current) {
        pushed.current = false;
        closeRef.current();
      }
      window.history.replaceState(null, '', urlRef.current());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}
