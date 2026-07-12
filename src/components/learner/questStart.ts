import { captureNonCritical } from "@/lib/capture";

export async function activateOfferedQuest({
  id,
  href,
  activate,
  navigate,
}: {
  id: string;
  href: string | null;
  activate: (id: string) => Promise<void>;
  navigate: (href: string) => void;
}): Promise<boolean> {
  try {
    await activate(id);
    if (href) navigate(href);
    return true;
  } catch (error) {
    captureNonCritical("Quest activation failed", error);
    return false;
  }
}
