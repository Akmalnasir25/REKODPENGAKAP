import React from 'react';
import { LOGO_URL } from '../constants';

export const MaintenancePage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 text-center p-4">
      <img src={LOGO_URL} alt="Logo" className="h-24 w-auto mb-8 animate-pulse" />
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Sistem Sedang Diselenggara</h1>
      <p className="text-gray-600">Kami akan kembali tidak lama lagi dengan wajah baru.</p>
    </div>
  );
};
