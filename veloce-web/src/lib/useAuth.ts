import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { api, getLoginUrl, User } from "./api";

export function useCurrentUser() {
  return useQuery<User | null>({
    queryKey: ["current-user"],
    queryFn: async () => {
      try {
        return await api.getCurrentUser();
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
}

export function useRequireAuth(redirectTo?: string) {
  const router = useRouter();
  const { data: user, isLoading, refetch } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && !user) {
      const target = redirectTo || router.asPath || "/apps";
      if (typeof window !== "undefined") {
        window.location.href = getLoginUrl(target);
      }
    }
  }, [user, isLoading, redirectTo, router.asPath]);

  return { user, isLoading, isAuthenticated: !!user, refetch };
}
