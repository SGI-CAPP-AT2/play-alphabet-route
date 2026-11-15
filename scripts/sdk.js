function getYt() {
  if (typeof ytgame !== "undefined" && ytgame && ytgame.IN_PLAYABLES_ENV) {
    return ytgame;
  }
  if (typeof window !== "undefined" && window.ytgame?.IN_PLAYABLES_ENV) {
    return window.ytgame;
  }
  return null;
}

let hasCompletedInitialLoad = false;

export const sdk = {
  get yt() {
    return getYt();
  },

  get isPlayables() {
    return Boolean(getYt());
  },

  firstFrame: () => {
    const yt = getYt();
    if (yt?.game?.firstFrameReady) {
      try {
        yt.game.firstFrameReady();
      } catch (err) {
        console.warn("[Playables SDK] firstFrameReady error:", err);
      }
    } else {
      console.log("[Playables SDK (dev)] firstFrameReady called");
    }
  },

  ready: () => {
    const yt = getYt();
    if (yt?.game?.gameReady) {
      try {
        yt.game.gameReady();
      } catch (err) {
        console.warn("[Playables SDK] gameReady error:", err);
      }
    } else {
      console.log("[Playables SDK (dev)] gameReady called");
    }
  },

  load: async () => {
    const yt = getYt();
    if (yt?.game?.loadData) {
      try {
        const raw = await yt.game.loadData();
        hasCompletedInitialLoad = true;
        if (!raw) return null;
        return typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch (err) {
        console.warn("[Playables SDK] loadData error:", err);
        hasCompletedInitialLoad = true;
        return null;
      }
    }

    hasCompletedInitialLoad = true;
    try {
      const saved = localStorage.getItem("save");
      return saved ? JSON.parse(saved) : null;
    } catch (err) {
      console.warn("[Playables SDK] localStorage load failed:", err);
      return null;
    }
  },

  save: async (obj) => {
    // YouTube Playables requirement: loadData must be completed before saveData is called
    if (!hasCompletedInitialLoad) {
      await sdk.load();
    }

    const yt = getYt();
    const serialized = JSON.stringify(obj);

    if (yt?.game?.saveData) {
      try {
        await yt.game.saveData(serialized);
      } catch (err) {
        console.warn("[Playables SDK] saveData error:", err);
      }
      return;
    }

    try {
      localStorage.setItem("save", serialized);
    } catch (err) {
      console.warn("[Playables SDK] localStorage save failed:", err);
    }
  },

  score: async (n) => {
    const yt = getYt();
    const integerScore = Math.round(Number(n) || 0);

    if (yt?.engagement?.sendScore) {
      try {
        await yt.engagement.sendScore({ value: integerScore });
      } catch (err) {
        console.warn("[Playables SDK] sendScore error:", err);
      }
    } else {
      console.log("[Playables SDK (dev)] sendScore:", integerScore);
    }
  },

  isAudioEnabled: () => {
    const yt = getYt();
    if (yt?.system?.isAudioEnabled) {
      try {
        return Boolean(yt.system.isAudioEnabled());
      } catch (err) {
        console.warn("[Playables SDK] isAudioEnabled error:", err);
        return true;
      }
    }
    return true;
  },

  onAudioEnabledChange: (fn) => {
    const yt = getYt();
    if (yt?.system?.onAudioEnabledChange) {
      try {
        yt.system.onAudioEnabledChange(fn);
      } catch (err) {
        console.warn("[Playables SDK] onAudioEnabledChange error:", err);
      }
    }
  },

  onPause: (fn) => {
    const yt = getYt();
    if (yt?.system?.onPause) {
      try {
        yt.system.onPause(fn);
      } catch (err) {
        console.warn("[Playables SDK] onPause error:", err);
      }
    }
  },

  onResume: (fn) => {
    const yt = getYt();
    if (yt?.system?.onResume) {
      try {
        yt.system.onResume(fn);
      } catch (err) {
        console.warn("[Playables SDK] onResume error:", err);
      }
    }
  },

  hasRewardedAd: () => {
    const yt = getYt();
    return Boolean(yt?.ads?.requestRewardedAd);
  },

  requestRewardedAd: async (rewardId = "reveal-best-route") => {
    const yt = getYt();
    if (yt?.ads?.requestRewardedAd) {
      try {
        return await yt.ads.requestRewardedAd(rewardId);
      } catch (err) {
        console.warn("[Playables SDK] requestRewardedAd error:", err);
        return false;
      }
    }
    // In local development or environments without ad provider, allow reward
    console.log("[Playables SDK (dev)] requestRewardedAd called for:", rewardId);
    return true;
  },

  requestInterstitialAd: async () => {
    const yt = getYt();
    if (yt?.ads?.requestInterstitialAd) {
      try {
        await yt.ads.requestInterstitialAd();
      } catch (err) {
        console.warn("[Playables SDK] requestInterstitialAd error:", err);
      }
    } else {
      console.log("[Playables SDK (dev)] requestInterstitialAd called");
    }
  },

  getLanguage: () => {
    const yt = getYt();
    if (yt?.system?.getLanguage) {
      try {
        return yt.system.getLanguage();
      } catch (err) {
        console.warn("[Playables SDK] getLanguage error:", err);
      }
    }
    return typeof navigator !== "undefined" && navigator.language
      ? navigator.language
      : "en-US";
  },
};
