import { useEffect } from 'react';
import { useLocation } from '@tanstack/react-router';
import { usePageContextStore } from '@/stores/page-context-store';

export function usePageContext(
  pageTitle?: string,
  pageData?: Record<string, unknown>
) {
  const location = useLocation();
  const setContext = usePageContextStore((state) => state.setContext);

  useEffect(() => {
    setContext({
      pathname: location.pathname,
      pageTitle: pageTitle || document.title,
      pageData,
    });
  }, [location.pathname, pageTitle, pageData, setContext]);
}
