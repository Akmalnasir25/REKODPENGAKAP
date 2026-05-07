// Design System Tokens
export const colors = {
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    900: '#1e3a8a',
  },
  success: {
    50: '#f0fdf4',
    500: '#22c55e',
    600: '#16a34a',
  },
  error: {
    50: '#fef2f2',
    500: '#ef4444',
    600: '#dc2626',
  },
  warning: {
    50: '#fffbeb',
    500: '#f59e0b',
    600: '#d97706',
  },
  info: {
    50: '#f0f9ff',
    500: '#0ea5e9',
    600: '#0284c7',
  },
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
};

export const spacing = {
  xs: '0.25rem',  // 4px
  sm: '0.5rem',   // 8px
  md: '1rem',     // 16px
  lg: '1.5rem',   // 24px
  xl: '2rem',     // 32px
  '2xl': '3rem',  // 48px
};

export const typography = {
  heading: {
    h1: { fontSize: '2rem', fontWeight: 700, lineHeight: 1.2 },      // 32px
    h2: { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.3 },    // 24px
    h3: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.4 },   // 20px
    h4: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.5 },      // 16px
  },
  body: {
    lg: { fontSize: '1rem', fontWeight: 400, lineHeight: 1.5 },      // 16px
    base: { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.5 }, // 14px
    sm: { fontSize: '0.75rem', fontWeight: 400, lineHeight: 1.5 },   // 12px
    xs: { fontSize: '0.625rem', fontWeight: 400, lineHeight: 1.4 },  // 10px
  },
};

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
};

export const borderRadius = {
  sm: '0.375rem',   // 6px
  md: '0.5rem',     // 8px
  lg: '0.75rem',    // 12px
  xl: '1rem',       // 16px
  '2xl': '1.5rem',  // 24px
  full: '9999px',
};

export const transitions = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
};

// Button variants
export const buttonVariants = {
  primary: {
    base: `px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 
           bg-blue-600 text-white hover:bg-blue-700 active:scale-95 
           disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600`,
    small: `px-3 py-1.5 rounded-md font-medium text-xs`,
    large: `px-6 py-3 rounded-xl font-semibold text-base`,
  },
  secondary: {
    base: `px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 
           bg-gray-100 text-gray-900 hover:bg-gray-200 active:scale-95 
           disabled:opacity-50 disabled:cursor-not-allowed`,
    small: `px-3 py-1.5 rounded-md font-medium text-xs`,
    large: `px-6 py-3 rounded-xl font-semibold text-base`,
  },
  danger: {
    base: `px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 
           bg-red-600 text-white hover:bg-red-700 active:scale-95 
           disabled:opacity-50 disabled:cursor-not-allowed`,
    small: `px-3 py-1.5 rounded-md font-medium text-xs`,
    large: `px-6 py-3 rounded-xl font-semibold text-base`,
  },
  ghost: {
    base: `px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 
           text-gray-700 hover:bg-gray-100 active:scale-95 
           disabled:opacity-50 disabled:cursor-not-allowed`,
    small: `px-3 py-1.5 rounded-md font-medium text-xs`,
    large: `px-6 py-3 rounded-xl font-semibold text-base`,
  },
};

// Card variants
export const cardVariants = {
  elevated: `bg-white rounded-xl shadow-md border border-gray-100 
             hover:shadow-lg transition-shadow duration-200`,
  outlined: `bg-white rounded-xl border-2 border-gray-200 
             hover:border-gray-300 transition-colors duration-200`,
  flat: `bg-gray-50 rounded-xl border border-gray-100`,
};

// Input variants
export const inputVariants = {
  base: `w-full px-3 py-2.5 rounded-lg border border-gray-300 
         bg-white text-gray-900 text-sm
         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
         disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
         transition-all duration-200`,
  error: `border-red-300 focus:ring-red-500`,
  success: `border-green-300 focus:ring-green-500`,
};
