/**
 * Lightweight URL Router - syncs view state with URL hash
 * Supports: back button, bookmarks, deep linking
 * No external dependencies required.
 */

type ViewName = 'auth' | 'user_dashboard' | 'user_form' | 'admin' | 'developer' | 'developer_admin' | 'developer_hierarchy';

const ROUTE_MAP: Record<string, ViewName> = {
  '/': 'auth',
  '/login': 'auth',
  '/dashboard': 'user_dashboard',
  '/form': 'user_form',
  '/admin': 'admin',
  '/developer': 'developer',
  '/developer/admin': 'developer_admin',
  '/developer/hierarchy': 'developer_hierarchy',
};

const VIEW_TO_ROUTE: Record<ViewName, string> = {
  'auth': '/login',
  'user_dashboard': '/dashboard',
  'user_form': '/form',
  'admin': '/admin',
  'developer': '/developer',
  'developer_admin': '/developer/admin',
  'developer_hierarchy': '/developer/hierarchy',
};

const VIEW_TITLES: Record<ViewName, string> = {
  'auth': 'Log Masuk - Pengakap',
  'user_dashboard': 'Dashboard - Pengakap',
  'user_form': 'Borang Pendaftaran - Pengakap',
  'admin': 'Panel Admin - Pengakap',
  'developer': 'Developer Panel - Pengakap',
  'developer_admin': 'Developer Admin - Pengakap',
  'developer_hierarchy': 'Hierarki - Pengakap',
};

/**
 * Get current view from URL hash
 */
export const getViewFromHash = (): ViewName | null => {
  const hash = window.location.hash.replace('#', '') || '/';
  return ROUTE_MAP[hash] || null;
};

/**
 * Update URL hash when view changes (without triggering popstate)
 */
export const pushViewToHash = (view: ViewName): void => {
  const route = VIEW_TO_ROUTE[view] || '/';
  const currentHash = window.location.hash.replace('#', '') || '/';
  
  if (currentHash !== route) {
    window.history.pushState({ view }, '', `#${route}`);
  }
  
  // Update page title
  document.title = VIEW_TITLES[view] || 'Pengakap - Pengurusan Data';
};

/**
 * Replace current URL hash (for redirects, no history entry)
 */
export const replaceViewInHash = (view: ViewName): void => {
  const route = VIEW_TO_ROUTE[view] || '/';
  window.history.replaceState({ view }, '', `#${route}`);
  document.title = VIEW_TITLES[view] || 'Pengakap - Pengurusan Data';
};

/**
 * Listen for back/forward navigation
 */
export const onHashNavigation = (callback: (view: ViewName) => void): (() => void) => {
  const handler = (event: PopStateEvent) => {
    const view = event.state?.view || getViewFromHash();
    if (view) {
      callback(view);
    }
  };

  window.addEventListener('popstate', handler);
  return () => window.removeEventListener('popstate', handler);
};
