'use client';

import { useEffect, useState } from 'react';
import { apiCall, markLoggedIn } from '../lib/api';

export default function RequireAuth({ children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    apiCall('me')
      .then(() => {
        if (!active) return;
        markLoggedIn();
        setReady(true);
      })
      .catch(() => {
        if (active) window.location.assign('/login');
      });
    return () => {
      active = false;
    };
  }, []);

  if (!ready) return null;
  return children;
}
