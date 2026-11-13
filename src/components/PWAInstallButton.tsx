import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        title="Install Xtreme App"
        className="min-h-[38px] px-3 py-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/12 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          title="Install on iPhone / iPad"
          className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] hover:border-emerald-500/40 text-[var(--text-page)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span className="hidden sm:inline">Install</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl border border-[var(--card-border)] bg-[var(--modal-bg)] text-[var(--text-page)] p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold">Install Xtreme on iOS</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-page)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2.5 text-xs text-[var(--text-muted)] leading-relaxed">
                <div className="p-3 rounded-xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)] flex items-center gap-2.5">
                  <Share className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>1. Tap the <strong>Share</strong> icon in your Safari toolbar.</span>
                </div>
                <div className="p-3 rounded-xl bg-[var(--card-bg-elevated)] border border-[var(--card-border)]">
                  2. Scroll down and tap <strong>Add to Home Screen</strong>.
                </div>
                <p className="text-[11px] text-[var(--text-subtle)]">
                  Once installed on your Home Screen, you get instant full-screen launch and iOS push notifications.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold cursor-pointer transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
