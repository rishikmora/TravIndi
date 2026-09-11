"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { TouristGuideChat } from "@/components/TouristGuideChat";

export default function TouristGuidePage() {
  return (
    <RequireAuth>
      <TouristGuideChat />
    </RequireAuth>
  );
}
