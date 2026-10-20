"use client";

import * as React from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// default marker icons break under bundlers — use a plain div icon
const pinIcon = L.divIcon({
  className: "",
  html: `<svg width="28" height="40" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z" fill="#0E7C6B"/><circle cx="14" cy="14" r="5" fill="#fff"/></svg>`,
  iconSize: [28, 40],
  iconAnchor: [14, 40],
});

function DraggablePin({
  position,
  onMove,
}: {
  position: [number, number];
  onMove: (p: [number, number]) => void;
}) {
  useMapEvents({
    click(e) {
      onMove([Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5))]);
    },
  });
  return (
    <Marker
      position={position}
      draggable
      icon={pinIcon}
      eventHandlers={{
        dragend: (e) => {
          const ll = (e.target as L.Marker).getLatLng();
          onMove([Number(ll.lat.toFixed(5)), Number(ll.lng.toFixed(5))]);
        },
      }}
    />
  );
}

export default function LocationMap({
  lat,
  lng,
  onMove,
}: {
  lat: number;
  lng: number;
  onMove: (p: [number, number]) => void;
}) {
  const center: [number, number] = [lat, lng];
  return (
    <MapContainer
      center={center}
      zoom={13}
      style={{ height: 280, width: "100%", borderRadius: 16 }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <DraggablePin position={[lat, lng]} onMove={onMove} />
    </MapContainer>
  );
}
