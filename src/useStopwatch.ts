import { useEffect, useRef, useState } from "react";

/**
 * A simple stopwatch hook that ticks elapsed seconds while `running` is true.
 * Resets to 0 each time it starts. Calls `onTick` with the elapsed time on
 * every tick (default interval: 200ms).
 */
export function useStopwatch(
  running: boolean,
  onTick?: (elapsed: number) => void,
) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const onTickRef = useRef(onTick);

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      const t = (Date.now() - startRef.current) / 1000;
      setElapsed(t);
      onTickRef.current?.(t);
    }, 200);
    return () => clearInterval(id);
  }, [running]);

  return elapsed;
}
