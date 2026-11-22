import React, { useEffect, useState } from 'react';
import { RotateCw, Smartphone } from 'lucide-react';

export const LandscapeOrientationGuard: React.FC = () => {
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      const isMobile = window.innerWidth <= 900 || /iphone|ipad|ipod|android/.test(navigator.userAgent.toLowerCase());
      const isPortrait = window.innerHeight > window.innerWidth;
      setIsPortraitMobile(isMobile && isPortrait);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isPortraitMobile) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/95 p-6 text-center text-slate-100 backdrop-blur-xl">
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-3xl border border-amber-500/40 bg-slate-900 shadow-2xl">
        <Smartphone className="h-12 w-12 text-amber-400 animate-pulse" />
        <div className="absolute -bottom-2 -right-2 rounded-xl bg-amber-600 p-2 text-white shadow-lg animate-spin" style={{ animationDuration: '6s' }}>
          <RotateCw className="h-5 w-5" />
        </div>
      </div>
      <h2 className="text-2xl font-black tracking-wider text-amber-400 uppercase mb-2">Rotate to Landscape</h2>
      <p className="max-w-sm text-sm text-slate-300 leading-relaxed mb-6">
        Kozhikode Life is optimized for widescreen landscape gameplay with virtual driving controls, camera joysticks, and open-world delivery HUD.
      </p>
      <button
        onClick={() => setIsPortraitMobile(false)}
        className="rounded-xl border border-amber-500/40 bg-slate-900 px-6 py-2.5 text-xs font-bold text-amber-300 shadow hover:bg-slate-800 transition"
      >
        Dismiss & Continue in Portrait
      </button>
    </div>
  );
};
