/**
 * TanStack route module for CarbonSense web screens. Defines route metadata and page-level UI composition.
 */
import { createFileRoute } from "@tanstack/react-router";
import LoginPage from "@/pages/LoginPage";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — CarbonSense" },
      {
        name: "description",
        content: "Log in to CarbonSense and continue your climate streak.",
      },
    ],
  }),
  component: LoginPage,
});
