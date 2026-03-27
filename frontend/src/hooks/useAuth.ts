"use client";

import { useState, useCallback } from "react";

interface User {
  id: string;
  name: string;
  email: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>({
    id: "1",
    name: "Demo User",
    email: "demo@trendsupply.com",
  });
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email: string, _password: string) => {
    setLoading(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setUser({ id: "1", name: "Demo User", email });
    setLoading(false);
    return true;
  }, []);

  const register = useCallback(async (name: string, email: string, _password: string) => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setUser({ id: "1", name, email });
    setLoading(false);
    return true;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
  }, []);

  return { user, loading, login, register, logout, isAuthenticated: !!user };
}
