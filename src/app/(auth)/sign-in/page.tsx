import type { Metadata } from "next";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Kaelyn's Academy parent account.",
};

export default function SignInPage() {
  return <AuthForm mode="sign-in" />;
}
