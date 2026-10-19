import { useState, useEffect, useRef } from 'react';

const MAX_CONCURRENT_BUILDS = 6;

class BuildQueueManager {
  private active = new Set<string>();
  private waiting: string[] = [];
  private listeners = new Set<() => void>();

  public requestBuild(id: string): boolean {
    if (this.active.has(id)) return true;
    if (this.active.size < MAX_CONCURRENT_BUILDS && !this.waiting.includes(id)) {
      this.active.add(id);
      this.notify();
      return true;
    }
    if (!this.waiting.includes(id) && !this.active.has(id)) {
      this.waiting.push(id);
    }
    return false;
  }

  public finishBuild(id: string): void {
    let changed = false;
    if (this.active.delete(id)) {
      changed = true;
    }
    const waitIdx = this.waiting.indexOf(id);
    if (waitIdx !== -1) {
      this.waiting.splice(waitIdx, 1);
    }
    while (this.active.size < MAX_CONCURRENT_BUILDS && this.waiting.length > 0) {
      const nextId = this.waiting.shift();
      if (nextId) {
        this.active.add(nextId);
        changed = true;
      }
    }
    if (changed) {
      this.notify();
    }
  }

  public canBuild(id: string): boolean {
    return this.active.has(id);
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const globalBuildQueue = new BuildQueueManager();

export function useBuildSlot(id: string, wantsToBuild: boolean): boolean {
  const [canAnimate, setCanAnimate] = useState<boolean>(() => {
    if (!wantsToBuild) return false;
    return globalBuildQueue.requestBuild(id);
  });

  const wantsRef = useRef(wantsToBuild);
  wantsRef.current = wantsToBuild;

  useEffect(() => {
    if (!wantsToBuild) {
      globalBuildQueue.finishBuild(id);
      setCanAnimate(false);
      return;
    }

    const granted = globalBuildQueue.requestBuild(id);
    setCanAnimate(granted);

    const unsubscribe = globalBuildQueue.subscribe(() => {
      if (wantsRef.current) {
        setCanAnimate(globalBuildQueue.canBuild(id));
      }
    });

    return () => {
      unsubscribe();
      globalBuildQueue.finishBuild(id);
    };
  }, [id, wantsToBuild]);

  return canAnimate;
}
