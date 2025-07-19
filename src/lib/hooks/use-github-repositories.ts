import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";

export type Repository = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description?: string;
  private: boolean;
  fork: boolean;
  created_at: string;
  updated_at: string;
  language?: string;
  stargazers_count: number;
  forks_count: number;
};

export function useGitHubRepositories() {
  const listRepositories = useAction(api.github.listRepositories);

  return useQuery({
    queryKey: ["github-repositories"],
    queryFn: async () => {
      try {
        return await listRepositories({});
      } catch (error) {
        throw error instanceof Error
          ? error
          : new Error("Failed to fetch repositories");
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
