/** Windows registry of IANA zones that a proxy country can be matched to. */
export interface ZoneHint {
  country: string;
  code: string;
  timezone: string;
  locale: string;
  langs: string[];
  lat: string;
  lng: string;
}

/**
 * A small, deliberate table. A profile's clock, locale and language must agree with the exit
 * country of its proxy: disagreement between the IP and the timezone is one of the cheapest
 * tells a fingerprint checker looks for, and it is the one no amount of canvas noise fixes.
 */
export const ZONES: ZoneHint[] = [
  { country: 'United States', code: 'US', timezone: 'America/New_York', locale: 'en-US', langs: ['en-US', 'en'], lat: '40.7128', lng: '-74.0060' },
  { country: 'United States', code: 'US', timezone: 'America/Chicago', locale: 'en-US', langs: ['en-US', 'en'], lat: '41.8781', lng: '-87.6298' },
  { country: 'United States', code: 'US', timezone: 'America/Los_Angeles', locale: 'en-US', langs: ['en-US', 'en'], lat: '34.0522', lng: '-118.2437' },
  { country: 'United Kingdom', code: 'GB', timezone: 'Europe/London', locale: 'en-GB', langs: ['en-GB', 'en'], lat: '51.5072', lng: '-0.1276' },
  { country: 'Germany', code: 'DE', timezone: 'Europe/Berlin', locale: 'de-DE', langs: ['de-DE', 'de', 'en'], lat: '52.5200', lng: '13.4050' },
  { country: 'France', code: 'FR', timezone: 'Europe/Paris', locale: 'fr-FR', langs: ['fr-FR', 'fr', 'en'], lat: '48.8566', lng: '2.3522' },
  { country: 'Netherlands', code: 'NL', timezone: 'Europe/Amsterdam', locale: 'nl-NL', langs: ['nl-NL', 'nl', 'en'], lat: '52.3676', lng: '4.9041' },
  { country: 'Spain', code: 'ES', timezone: 'Europe/Madrid', locale: 'es-ES', langs: ['es-ES', 'es', 'en'], lat: '40.4168', lng: '-3.7038' },
  { country: 'Italy', code: 'IT', timezone: 'Europe/Rome', locale: 'it-IT', langs: ['it-IT', 'it', 'en'], lat: '41.9028', lng: '12.4964' },
  { country: 'Poland', code: 'PL', timezone: 'Europe/Warsaw', locale: 'pl-PL', langs: ['pl-PL', 'pl', 'en'], lat: '52.2297', lng: '21.0122' },
  { country: 'Sweden', code: 'SE', timezone: 'Europe/Stockholm', locale: 'sv-SE', langs: ['sv-SE', 'sv', 'en'], lat: '59.3293', lng: '18.0686' },
  { country: 'Turkey', code: 'TR', timezone: 'Europe/Istanbul', locale: 'tr-TR', langs: ['tr-TR', 'tr', 'en'], lat: '41.0082', lng: '28.9784' },
  { country: 'United Arab Emirates', code: 'AE', timezone: 'Asia/Dubai', locale: 'en-AE', langs: ['en-AE', 'en', 'ar'], lat: '25.2048', lng: '55.2708' },
  { country: 'India', code: 'IN', timezone: 'Asia/Kolkata', locale: 'en-IN', langs: ['en-IN', 'en', 'hi'], lat: '22.5726', lng: '88.3639' },
  { country: 'Singapore', code: 'SG', timezone: 'Asia/Singapore', locale: 'en-SG', langs: ['en-SG', 'en'], lat: '1.3521', lng: '103.8198' },
  { country: 'Japan', code: 'JP', timezone: 'Asia/Tokyo', locale: 'ja-JP', langs: ['ja-JP', 'ja', 'en'], lat: '35.6762', lng: '139.6503' },
  { country: 'South Korea', code: 'KR', timezone: 'Asia/Seoul', locale: 'ko-KR', langs: ['ko-KR', 'ko', 'en'], lat: '37.5665', lng: '126.9780' },
  { country: 'Australia', code: 'AU', timezone: 'Australia/Sydney', locale: 'en-AU', langs: ['en-AU', 'en'], lat: '-33.8688', lng: '151.2093' },
  { country: 'Brazil', code: 'BR', timezone: 'America/Sao_Paulo', locale: 'pt-BR', langs: ['pt-BR', 'pt', 'en'], lat: '-23.5505', lng: '-46.6333' },
  { country: 'Canada', code: 'CA', timezone: 'America/Toronto', locale: 'en-CA', langs: ['en-CA', 'en', 'fr'], lat: '43.6532', lng: '-79.3832' },
  { country: 'Mexico', code: 'MX', timezone: 'America/Mexico_City', locale: 'es-MX', langs: ['es-MX', 'es'], lat: '19.4326', lng: '-99.1332' },
  { country: 'South Africa', code: 'ZA', timezone: 'Africa/Johannesburg', locale: 'en-ZA', langs: ['en-ZA', 'en'], lat: '-26.2041', lng: '28.0473' },
  { country: 'Nigeria', code: 'NG', timezone: 'Africa/Lagos', locale: 'en-NG', langs: ['en-NG', 'en'], lat: '6.5244', lng: '3.3792' },
  { country: 'Indonesia', code: 'ID', timezone: 'Asia/Jakarta', locale: 'id-ID', langs: ['id-ID', 'id', 'en'], lat: '-6.2088', lng: '106.8456' },
  { country: 'Vietnam', code: 'VN', timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', langs: ['vi-VN', 'vi', 'en'], lat: '10.8231', lng: '106.6297' },
  { country: 'Thailand', code: 'TH', timezone: 'Asia/Bangkok', locale: 'th-TH', langs: ['th-TH', 'th', 'en'], lat: '13.7563', lng: '100.5018' },
  { country: 'Philippines', code: 'PH', timezone: 'Asia/Manila', locale: 'en-PH', langs: ['en-PH', 'en'], lat: '14.5995', lng: '120.9842' },
  { country: 'Pakistan', code: 'PK', timezone: 'Asia/Karachi', locale: 'en-PK', langs: ['en-PK', 'en', 'ur'], lat: '24.8607', lng: '67.0011' },
  { country: 'Bangladesh', code: 'BD', timezone: 'Asia/Dhaka', locale: 'en-BD', langs: ['en-BD', 'en', 'bn'], lat: '23.8103', lng: '90.4125' },
  { country: 'Egypt', code: 'EG', timezone: 'Africa/Cairo', locale: 'ar-EG', langs: ['ar-EG', 'ar', 'en'], lat: '30.0444', lng: '31.2357' },
  { country: 'Saudi Arabia', code: 'SA', timezone: 'Asia/Riyadh', locale: 'ar-SA', langs: ['ar-SA', 'ar', 'en'], lat: '24.7136', lng: '46.6753' },
  { country: 'Argentina', code: 'AR', timezone: 'America/Argentina/Buenos_Aires', locale: 'es-AR', langs: ['es-AR', 'es'], lat: '-34.6037', lng: '-58.3816' },
];

export const BY_CODE = new Map(ZONES.map((z) => [z.code, z]));
