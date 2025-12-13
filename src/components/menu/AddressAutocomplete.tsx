"use client";

import { useEffect, useRef, useState } from "react";
import { useLoadScript } from "@react-google-maps/api";

declare global {
  interface Window {
    google: any;
  }
}

const libraries: ("places")[] = ["places"];

type Props = {
  onAddressSelect: (address: string, lat: number, lng: number) => void;
  setCity: (v: string) => void;
  setPostalCode: (v: string) => void;
  setFlatNumber?: (v: string) => void;
  placeholder?: string;
};

const inputCls =
  "w-full px-3 py-2 border border-black/15 rounded-md bg-white text-black placeholder-black/50 outline-none focus:ring-2 focus:ring-black/20";

export default function AddressAutocomplete({
  onAddressSelect,
  setCity,
  setPostalCode,
  setFlatNumber,
  placeholder = "Wpisz swój adres",
}: Props) {
  const [val, setVal] = useState("");
  useEffect(() => {
  if (typeof window === "undefined") return;

  const raf = window.requestAnimationFrame;
  if (typeof raf !== "function") return;

  const id = raf(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
  });

  return () => window.cancelAnimationFrame?.(id);
}, []);
  const inputRef = useRef<HTMLInputElement>(null);
  const listenerRef = useRef<any>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || "",
    libraries,
    language: "pl",
    region: "PL",
    id: "gmaps-places",
  });

  useEffect(() => {
    if (!isLoaded || !inputRef.current || !window.google?.maps?.places) return;

    // Minimalne pola żeby zmniejszyć payload
    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      fields: ["address_components", "formatted_address", "geometry"],
      types: ["address"],
      componentRestrictions: { country: "pl" },
    });

    listenerRef.current = ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place || !place.address_components) return;

      const find = (t: string) =>
        place.address_components.find((c: any) => c.types.includes(t))?.long_name;

      const subpremise = find("subpremise");
      const route = find("route");
      const streetNumber = find("street_number");
      const postal = find("postal_code");
      const locality =
        find("locality") || find("postal_town") || find("administrative_area_level_2");

      let finalStreet = place.formatted_address || "";
      if (route) finalStreet = streetNumber ? `${route} ${streetNumber}` : route;

      const lat = place.geometry?.location?.lat?.();
      const lng = place.geometry?.location?.lng?.();
      if (typeof lat === "number" && typeof lng === "number") {
        onAddressSelect(finalStreet, lat, lng);
      }

      if (postal) setPostalCode(postal);
      if (locality) setCity(locality);
      if (setFlatNumber && subpremise) setFlatNumber(subpremise);

      setVal(place.formatted_address || finalStreet);
    });

    return () => {
      try {
        if (listenerRef.current) listenerRef.current.remove();
      } catch {}
    };
  }, [isLoaded, onAddressSelect, setCity, setPostalCode, setFlatNumber]);

  if (!apiKey) {
    return (
      <div className="space-y-2">
        <input
          ref={inputRef}
          className={inputCls}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={placeholder}
        />
        <p className="text-xs text-red-600">
          Brak <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>. Uzupełnij w <code>.env.local</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        className={inputCls}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {loadError && (
        <p className="text-xs text-red-600">Nie udało się załadować Google Maps API.</p>
      )}
      {isLoaded && (
        <p className="text-xs text-black/60">Wybierz adres z listy podpowiedzi Google.</p>
      )}
    </div>
  );
}
