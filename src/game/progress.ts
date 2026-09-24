const STORAGE_KEY = "turbotale-progress-v1";

export interface SavedProgress {
  unlockedBridge: number;
  audioEnabled: boolean;
  textSpeed: number;
}

export const defaultProgress: SavedProgress = {
  unlockedBridge: 0,
  audioEnabled: true,
  textSpeed: 34
};

export function loadProgress(): SavedProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...defaultProgress };
    }
    return { ...defaultProgress, ...JSON.parse(raw) } as SavedProgress;
  } catch {
    return { ...defaultProgress };
  }
}

export function saveProgress(progress: SavedProgress): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}
