import { Suspense } from "react";
import { AuthGate } from "@/components/AuthGate";
import { PageFallback } from "@/components/shared/PageFallback";

// Auth runs on the client (localStorage bearer tokens). The shell renders
// immediately and the session check runs on mount, so navigations only block
// on the layout itself — opt it out of instant-navigation validation.
export const instant = false;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      {/* Must live in the server tree: dynamic detail pages call useParams(),
          which suspends during flight prerender (no generateStaticParams).
          AuthGate places this boundary inside <main>, so the shell stays put. */}
      <Suspense fallback={<PageFallback />}>{children}</Suspense>
    </AuthGate>
  );
}
