"use client";

import * as React from "react";
import { fmtDate } from "@/lib/format";

export function CurrentDateIST() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return `${fmtDate(new Date())} (IST)`;
}