import { createFileRoute } from "@tanstack/react-router";
import SignupPage from "@/pages/SignupPage";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign up — CarbonSense" },
      {
        name: "description",
        content: "Create your CarbonSense account and start cutting carbon daily.",
      },
    ],
  }),
  component: SignupPage,
});
