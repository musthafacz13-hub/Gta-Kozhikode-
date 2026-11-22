import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import { Download, Smartphone, Share, PlusSquare, X } from 'lucide-react';

export const PWAInstallPrompt: React.FC<{ onUiClick?: () => void }> = ({ onUiClick }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={() => {
          onUiClick?.();
          install();
        }}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-4 py-2 text-xs font-bold text-white shadow-lg hover:from-amber-500 hover:to-amber-400 active:scale-95 transition"
        title="Install Kozhikode Life PWA"
      >
        <Download className="w-4 h-4" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => {
            onUiClick?.();
            setShowIOSModal(true);
          }}
          className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-slate-900/80 px-3 py-2 text-xs font-bold text-amber-300 shadow-md hover:bg-slate-800 active:scale-95 transition backdrop-blur-sm"
          title="Install on iPhone Home Screen"
        >
          <Smartphone className="w-4 h-4 text-amber-400" />
          <span>Add to iPhone</span>
        </button>

        {showIOSModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
            <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-slate-900 p-6 text-slate-100 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-amber-400">
                  <Smartphone className="w-5 h-5" />
                  <h3 className="text-base font-bold tracking-wide">Install Kozhikode Life on iOS</h3>
                </div>
                <button
                  onClick={() => setShowIOSModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="my-4 space-y-4 text-sm text-slate-300">
                <p className="leading-relaxed">
                  Experience Kozhikode Life like a native standalone app with full-screen immersive rendering, hidden browser UI, and smooth 60fps touch performance:
                </p>
                <div className="flex items-start gap-3 rounded-xl bg-slate-800/80 p-3 border border-slate-700">
                  <div className="rounded-lg bg-blue-600/20 p-2 text-blue-400">
                    <Share className="w-5 h-5" />
                  </div>
                  <div>
                    <strong className="text-white block mb-0.5">Step 1</strong>
                    <span>Tap the <span className="text-amber-400 font-semibold">Share</span> button in your Safari toolbar at the bottom of the screen.</span>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl bg-slate-800/80 p-3 border border-slate-700">
                  <div className="rounded-lg bg-amber-600/20 p-2 text-amber-400">
                    <PlusSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <strong className="text-white block mb-0.5">Step 2</strong>
                    <span>Scroll down the action sheet and tap <span className="text-amber-400 font-semibold">Add to Home Screen</span>.</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSModal(false)}
                className="w-full rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white shadow hover:bg-amber-500 active:scale-98 transition"
              >
                Got It, Let's Play
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
