export const initMotionDebug = () => {
  if (!import.meta.env.DEV || !window.location.search.includes('motiondebug=1')) {
    return;
  }

  let frames: number[] = [];
  let lastTime: number = 0;
  let rafId: number = 0;
  let isRecording = false;
  let runCount = 0;
  const maxRuns = 4; // 1 for splash, 3 for section changes

  const loop = (time: number) => {
    if (lastTime > 0) {
      frames.push(time - lastTime);
    }
    lastTime = time;
    if (isRecording) {
      rafId = requestAnimationFrame(loop);
    }
  };

  const start = () => {
    if (isRecording || runCount >= maxRuns) return;
    isRecording = true;
    frames = [];
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
  };

  const stop = (name: string) => {
    if (!isRecording) return;
    isRecording = false;
    cancelAnimationFrame(rafId);
    lastTime = 0;
    
    if (frames.length > 0) {
      let sum = 0;
      let worst = 0;
      let over34 = 0;
      
      frames.forEach(f => {
        sum += f;
        if (f > worst) worst = f;
        if (f > 34) over34++;
      });
      
      const avgFps = Math.round(1000 / (sum / frames.length));
      console.log(`%c[Motion Debug] ${name}`, 'color: #0ea5e9; font-weight: bold;');
      console.log(`avg fps: ${avgFps} | worst frame: ${Math.round(worst)}ms | frames > 34ms: ${over34}`);
    }
    runCount++;
  };

  (window as any).__startMotionDebug = start;
  (window as any).__stopMotionDebug = stop;
};
