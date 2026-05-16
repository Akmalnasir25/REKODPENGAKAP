import { useState, useEffect } from 'react';
import { resolveLogoUrl } from '../services/logoService';
import { LOGO_URL } from '../constants';

/**
 * Hook to resolve the correct logo based on priority:
 * 1. Daerah logo (if uploaded)
 * 2. Negeri logo (if uploaded)  
 * 3. Default logo (LOGO_URL from constants)
 */
export const useResolvedLogo = (negeriCode?: string, daerahCode?: string): string => {
  const [logo, setLogo] = useState(LOGO_URL);

  useEffect(() => {
    let cancelled = false;
    resolveLogoUrl(negeriCode, daerahCode)
      .then(url => {
        if (!cancelled) setLogo(url);
      })
      .catch(() => {
        if (!cancelled) setLogo(LOGO_URL);
      });
    return () => { cancelled = true; };
  }, [negeriCode, daerahCode]);

  return logo;
};
