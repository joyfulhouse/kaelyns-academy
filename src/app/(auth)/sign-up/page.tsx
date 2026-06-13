import type { Metadata } from "next";
import { AuthForm } from "../AuthForm";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a Kaelyn's Academy parent account.",
};

export default function SignUpPage() {
  return <AuthForm mode="sign-up" />;
}
