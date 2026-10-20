"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import Link from "next/link";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fmtPct } from "@/lib/format";

interface Centre {
  id: string;
  lat?: number;
  lng?: number;
  name: string;
  code: string;
  district: string;
  risk_score: number;
}

function riskColor(score: number) {
  if (score > 60) return "var(--sev-critical)";
  if (score >= 25) return "var(--sev-medium)";
  return "var(--success)";
}

/** 10 px dot + 2 px white ring (plan 8B.12). */
function pinIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:10px;height:10px;border-radius:999px;background:${color};box-shadow:0 0 0 2px #ffffff"></span>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}

export default function MapComponent({ centres }: { centres: Centre[] }) {
  const valid = centres.filter(
    (c): c is Centre & { lat: number; lng: number } => typeof c.lat === "number" && typeof c.lng === "number"
  );

  if (valid.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        No centres with mapped coordinates yet. Locations appear here once a centre submits its address.
      </div>
    );
  }

  return (
    <MapContainer center={[22.5, 88.3]} zoom={6} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {valid.map((c) => (
        <Marker key={c.id} position={[c.lat, c.lng]} icon={pinIcon(riskColor(c.risk_score))}>
          <Popup>
            <div className="min-w-44 space-y-1 bg-popover p-1 text-sm text-popover-foreground">
              <p className="font-medium">{c.name}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {c.code} · {c.district}
              </p>
              <p className="tabular text-xs">
                Risk <span className="font-semibold">{fmtPct(c.risk_score)}</span>
              </p>
              <Link href={`/centres/${c.id}`} className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
                Open centre →
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
