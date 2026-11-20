"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const SHOWN_KEY = "carepurse:add-to-home-screen-shown";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function markShown() {
  try {
    localStorage.setItem(SHOWN_KEY, "1");
  } catch {
    // Some private browsing modes do not allow persistent storage.
  }
}

function dismiss(setVisible: (visible: boolean) => void) {
  setVisible(false);
}

function wasShown() {
  try {
    return Boolean(localStorage.getItem(SHOWN_KEY));
  } catch {
    return false;
  }
}

export default function AddToHomeScreen() {
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || wasShown()) return;

    const userAgent = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const frame = window.requestAnimationFrame(() => {
      setIos(isIos);
      if (isIos) {
        markShown();
        setVisible(true);
      }
    });

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      markShown();
      setInstallPrompt(event as InstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => dismiss(setVisible);

    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) return null;

  return (
    <aside
      aria-label="Add CarePurse to your home screen"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
    >
      <div className="flex items-start gap-3">
        <Image src="/icon.svg" alt="" width={44} height={44} className="h-11 w-11 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Keep CarePurse on your home screen</p>
          <p className="mt-1 text-sm leading-relaxed text-secondary">
            {ios ? "Tap Share, then Add to Home Screen. It will open straight into your chat." : "Add the CarePurse icon so it opens straight into your chat."}
          </p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={() => dismiss(setVisible)} className="rounded-[10px] px-4 py-2 text-sm font-medium text-muted hover:bg-surface">
          Not now
        </button>
        {!ios && installPrompt && (
          <button
            type="button"
            className="rounded-[10px] bg-foreground px-4 py-2 text-sm font-medium text-background"
            onClick={async () => {
              await installPrompt.prompt();
              await installPrompt.userChoice;
              dismiss(setVisible);
            }}
          >
            Add to home screen
          </button>
        )}
      </div>
    </aside>
  );
}
