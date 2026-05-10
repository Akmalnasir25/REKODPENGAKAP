import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, CheckCircle, HelpCircle } from 'lucide-react';

interface TutorialStep {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Selamat Datang!',
    description: 'Sistem ini membantu anda mendaftar dan mengurus data peserta pengakap. Mari kita lihat cara penggunaannya.',
  },
  {
    title: 'Dashboard',
    description: 'Di Dashboard, anda boleh melihat semua data peserta yang telah didaftarkan, menapis mengikut tahun dan lencana, serta mengeksport data.',
  },
  {
    title: 'Pendaftaran Baru',
    description: 'Klik butang "Pendaftaran Baru" untuk mendaftar peserta. Isi maklumat sekolah, pilih lencana, dan masukkan data peserta.',
  },
  {
    title: 'Kategori Peserta',
    description: 'Setiap peserta boleh dikategorikan sebagai Perdana, Udara, Laut, PPKI, atau PPKI Udara mengikut unit masing-masing.',
  },
  {
    title: 'Eksport & Laporan',
    description: 'Gunakan butang Excel atau PDF untuk menjana laporan. Anda juga boleh mencetak senarai terus dari sistem.',
  },
  {
    title: 'Profil & Keselamatan',
    description: 'Kemaskini profil sekolah anda dan tukar kata laluan secara berkala untuk keselamatan akaun.',
  },
];

const STORAGE_KEY = 'ONBOARDING_COMPLETED';

export const OnboardingTutorial: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      // Show tutorial for first-time users after a short delay
      const timer = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsOpen(false);
  };

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsOpen(false);
  };

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(s => s + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(s => s - 1);
  };

  if (!isOpen) return null;

  const step = TUTORIAL_STEPS[currentStep];
  const isLast = currentStep === TUTORIAL_STEPS.length - 1;
  const progress = ((currentStep + 1) / TUTORIAL_STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-gray-100 dark:bg-gray-700">
          <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step indicator */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold text-gray-400 uppercase">
              Langkah {currentStep + 1} / {TUTORIAL_STEPS.length}
            </span>
            <button onClick={handleSkip} className="text-xs text-gray-400 hover:text-gray-600 transition">
              Langkau
            </button>
          </div>

          {/* Step content */}
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              {isLast ? (
                <CheckCircle size={32} className="text-blue-600" />
              ) : (
                <HelpCircle size={32} className="text-blue-600" />
              )}
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{step.title}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{step.description}</p>
          </div>

          {/* Dots */}
          <div className="flex justify-center gap-1.5 my-4">
            {TUTORIAL_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={`w-2 h-2 rounded-full transition ${i === currentStep ? 'bg-blue-600 w-6' : 'bg-gray-300 dark:bg-gray-600'}`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="flex items-center gap-1 px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} /> Sebelum
            </button>
            <button
              onClick={handleNext}
              className="flex items-center gap-1 px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition shadow-sm"
            >
              {isLast ? 'Mula!' : 'Seterusnya'} {!isLast && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Help button to re-trigger tutorial
 */
export const TutorialHelpButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [showTutorial, setShowTutorial] = useState(false);

  const handleClick = () => {
    localStorage.removeItem(STORAGE_KEY);
    setShowTutorial(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-gray-500 dark:text-gray-400 ${className}`}
        title="Panduan Penggunaan"
      >
        <HelpCircle size={18} />
      </button>
      {showTutorial && <OnboardingTutorial />}
    </>
  );
};
