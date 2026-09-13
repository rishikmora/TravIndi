'use client';

import { type DependencyList, useEffect, useState } from 'react';

/**
 * Creates GPU resources in an effect and disposes them on cleanup. Unlike
 * `useMemo` + cleanup, a resource is never used after being disposed — which
 * matters under Strict Mode's simulated unmount/remount. Returns null until
 * the first resource exists.
 */
export function useDisposable<T>(create: () => T, dispose: (value: T) => void, deps: DependencyList): T | null {
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    const created = create();
    setValue(created);
    return () => {
      dispose(created);
      setValue((current) => (current === created ? null : current));
    };
    // The caller controls identity through `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}
