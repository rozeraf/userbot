import { useState, useEffect, useRef } from "react";

export function usePoll<T>(queryFn: () => T | Promise<T>, intervalMs: number | null, initialValue: T): T {
  const [data, setData] = useState<T>(initialValue);
  const queryRef = useRef(queryFn);
  queryRef.current = queryFn;

  useEffect(() => {
    // Keep the last successful value while polling is paused.
    if (intervalMs == null || intervalMs <= 0) return;
    let active = true;

    const execute = async () => {
      try {
        const result = await queryRef.current();
        if (active) {
          setData(result);
        }
      } catch (err) {
        // Silently catch errors in polling to avoid crashing the TUI
      }
    };

    execute();
    const interval = setInterval(execute, intervalMs);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [intervalMs]);

  return data;
}
