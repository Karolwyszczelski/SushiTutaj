// app/api/distance/route.ts
import { NextResponse } from 'next/server';

const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const origin = searchParams.get('origin');
  const destination = searchParams.get('destination');

  if (!origin || !destination) {
    return NextResponse.json(
      { error: 'Missing origin or destination' },
      { status: 400 }
    );
  }

  // zbuduj URL dla Distance Matrix
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(
    origin
  )}&destinations=${encodeURIComponent(
    destination
  )}&key=${GOOGLE_KEY}`;

  // wywołanie
  const res = await fetch(url);
  if (!res.ok) {
    return NextResponse.json(
      { error: `Google API returned ${res.status}` },
      { status: 502 }
    );
  }

  const data = await res.json();

  if (data.status !== 'OK') {
    return NextResponse.json(
      { error: data.error_message || data.status },
      { status: 500 }
    );
  }

  const element = data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== 'OK') {
    return NextResponse.json(
      { error: element?.status || 'No route found' },
      { status: 500 }
    );
  }

  const distance_km = element.distance.value / 1000;
  const duration_sec = element.duration.value;

  return NextResponse.json({ distance_km, duration_sec });
}
