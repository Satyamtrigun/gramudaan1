export interface Location {
  id: string;
  name: string;
  district: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  type: "village" | "town" | "block" | "city" | "locality";
  population: number;
  households: number;
  /** Optional postal/administrative context (directory records). */
  region?: string;
  division?: string;
  officeType?: string;
  /** Display label override for the result list chip. */
  placeLabel?: string;
  /** Where this record came from. */
  source?: "curated" | "india-post-directory";
}

// ─── Calibrated baseline dataset ───
// These towns power the detailed demo flows. Population / household figures
// are calibrated baselines used by the (estimated) market model.
export const locations: Location[] = [
  { id: "loc-1", name: "Rampur", district: "Rampur", state: "Uttar Pradesh", pincode: "244901", lat: 28.79, lng: 79.02, type: "town", population: 32500, households: 4700, source: "curated" },
  { id: "loc-2", name: "Bisalpur", district: "Pilibhit", state: "Uttar Pradesh", pincode: "262121", lat: 28.21, lng: 79.8, type: "town", population: 22100, households: 3300, source: "curated" },
  { id: "loc-3", name: "Shahjahanpur", district: "Shahjahanpur", state: "Uttar Pradesh", pincode: "242001", lat: 27.88, lng: 79.91, type: "town", population: 42000, households: 6200, source: "curated" },
  { id: "loc-4", name: "Budaun", district: "Budaun", state: "Uttar Pradesh", pincode: "243001", lat: 28.03, lng: 79.12, type: "town", population: 45000, households: 6600, source: "curated" },
  { id: "loc-5", name: "Hardoi", district: "Hardoi", state: "Uttar Pradesh", pincode: "241001", lat: 27.42, lng: 80.13, type: "town", population: 31000, households: 4500, source: "curated" },
  { id: "loc-6", name: "Etawah", district: "Etawah", state: "Uttar Pradesh", pincode: "206001", lat: 26.78, lng: 79.02, type: "town", population: 38500, households: 5600, source: "curated" },
  { id: "loc-7", name: "Kannauj", district: "Kannauj", state: "Uttar Pradesh", pincode: "209727", lat: 27.05, lng: 79.92, type: "town", population: 25800, households: 3800, source: "curated" },
  { id: "loc-8", name: "Farrukhabad", district: "Farrukhabad", state: "Uttar Pradesh", pincode: "209625", lat: 27.39, lng: 79.58, type: "town", population: 29400, households: 4300, source: "curated" },
  { id: "loc-9", name: "Mainpuri", district: "Mainpuri", state: "Uttar Pradesh", pincode: "205001", lat: 27.23, lng: 79.02, type: "town", population: 27600, households: 4000, source: "curated" },
  { id: "loc-10", name: "Kasganj", district: "Kasganj", state: "Uttar Pradesh", pincode: "207123", lat: 27.81, lng: 78.64, type: "town", population: 35200, households: 5100, source: "curated" },
  { id: "loc-11", name: "Bareilly", district: "Bareilly", state: "Uttar Pradesh", pincode: "243001", lat: 28.37, lng: 79.43, type: "town", population: 58000, households: 8400, source: "curated" },
  { id: "loc-12", name: "Moradabad", district: "Moradabad", state: "Uttar Pradesh", pincode: "244001", lat: 28.84, lng: 78.77, type: "town", population: 52000, households: 7500, source: "curated" },
  { id: "loc-13", name: "Agra", district: "Agra", state: "Uttar Pradesh", pincode: "282001", lat: 27.18, lng: 78.02, type: "town", population: 65000, households: 9400, source: "curated" },
  { id: "loc-14", name: "Lucknow", district: "Lucknow", state: "Uttar Pradesh", pincode: "226001", lat: 26.85, lng: 80.95, type: "town", population: 72000, households: 10500, source: "curated" },
  { id: "loc-15", name: "Varanasi", district: "Varanasi", state: "Uttar Pradesh", pincode: "221001", lat: 25.32, lng: 83.01, type: "town", population: 68000, households: 9800, source: "curated" },
  { id: "loc-16", name: "Gorakhpur", district: "Gorakhpur", state: "Uttar Pradesh", pincode: "273001", lat: 26.76, lng: 83.37, type: "town", population: 55000, households: 7900, source: "curated" },
  { id: "loc-17", name: "Meerut", district: "Meerut", state: "Uttar Pradesh", pincode: "250001", lat: 28.98, lng: 77.71, type: "town", population: 60000, households: 8600, source: "curated" },
  { id: "loc-18", name: "Aligarh", district: "Aligarh", state: "Uttar Pradesh", pincode: "202001", lat: 27.9, lng: 78.08, type: "town", population: 48000, households: 6900, source: "curated" },
  { id: "loc-19", name: "Kanpur", district: "Kanpur Nagar", state: "Uttar Pradesh", pincode: "208001", lat: 26.45, lng: 80.35, type: "town", population: 70000, households: 10100, source: "curated" },
  { id: "loc-20", name: "Prayagraj", district: "Prayagraj", state: "Uttar Pradesh", pincode: "211001", lat: 25.43, lng: 81.85, type: "town", population: 56000, households: 8000, source: "curated" },
];

// ─── Location registry ───
// The location screen can register any India-wide place (from the pincode
// directory) so that downstream analysis resolves it by id. There is one
// source of truth for a selected location's record.
const registry = new Map<string, Location>(locations.map((l) => [l.id, l]));

/** Register (or update) a location so id-based lookups work everywhere. */
export function upsertLocation(loc: Location): void {
  registry.set(loc.id, loc);
  const idx = locations.findIndex((l) => l.id === loc.id);
  if (idx >= 0) locations[idx] = loc;
  else locations.push(loc);
}

/** Find a registered location by id. */
export function findLocationById(id: string): Location | null {
  return registry.get(id) ?? null;
}

// ─── UP district names (kept for legacy SVG map support / reference) ───
export const UP_DISTRICTS = [
  "Agra", "Aligarh", "Ambedkar Nagar", "Amethi", "Amroha", "Auraiya",
  "Azamgarh", "Badaun", "Baghpat", "Bahraich", "Ballia", "Balrampur",
  "Banda", "Barabanki", "Bareilly", "Basti", "Bhadohi", "Bijnor",
  "Budaun", "Bulandshahr", "Chandauli", "Chitrakoot", "Deoria",
  "Etah", "Etawah", "Faizabad", "Farrukhabad", "Fatehpur", "Firozabad",
  "Gautam Buddh Nagar", "Ghaziabad", "Ghazipur", "Gonda", "Gorakhpur",
  "Hamirpur", "Hapur", "Hardoi", "Hathras", "Jalaun", "Jaunpur",
  "Jhansi", "Kannauj", "Kanpur Dehat", "Kanpur Nagar", "Kasganj",
  "Kaushambi", "Kushinagar", "Lakhimpur Kheri", "Lucknow", "Mahoba",
  "Mahrajganj", "Mainpuri", "Mathura", "Mau", "Meerut", "Mirzapur",
  "Moradabad", "Muzaffarnagar", "Pilibhit", "Pratapgarh", "Prayagraj",
  "Raebareli", "Rampur", "Saharanpur", "Sambhal", "Sant Kabir Nagar",
  "Shahjahanpur", "Shamli", "Shravasti", "Siddharthnagar", "Sitapur",
  "Sonbhadra", "Sultanpur", "Unnao", "Varanasi",
];

/** Approximate SVG coordinates for UP districts (legacy stylized map). */
export const districtCoordinates: Record<string, { x: number; y: number }> = {
  "Agra": { x: 480, y: 380 },
  "Aligarh": { x: 420, y: 340 },
  "Ambedkar Nagar": { x: 290, y: 320 },
  "Amethi": { x: 260, y: 330 },
  "Amroha": { x: 370, y: 200 },
  "Auraiya": { x: 370, y: 360 },
  "Azamgarh": { x: 270, y: 270 },
  "Badaun": { x: 400, y: 260 },
  "Baghpat": { x: 340, y: 160 },
  "Bahraich": { x: 170, y: 270 },
  "Ballia": { x: 270, y: 220 },
  "Balrampur": { x: 170, y: 310 },
  "Banda": { x: 330, y: 420 },
  "Barabanki": { x: 220, y: 310 },
  "Bareilly": { x: 380, y: 240 },
  "Basti": { x: 230, y: 280 },
  "Bhadohi": { x: 270, y: 310 },
  "Bijnor": { x: 350, y: 190 },
  "Budaun": { x: 400, y: 270 },
  "Bulandshahr": { x: 380, y: 200 },
  "Chandauli": { x: 300, y: 270 },
  "Chitrakoot": { x: 320, y: 430 },
  "Deoria": { x: 260, y: 250 },
  "Etah": { x: 430, y: 290 },
  "Etawah": { x: 370, y: 370 },
  "Faizabad": { x: 250, y: 300 },
  "Farrukhabad": { x: 390, y: 310 },
  "Fatehpur": { x: 310, y: 370 },
  "Firozabad": { x: 430, y: 350 },
  "Gautam Buddh Nagar": { x: 410, y: 190 },
  "Ghaziabad": { x: 380, y: 170 },
  "Ghazipur": { x: 290, y: 250 },
  "Gonda": { x: 190, y: 290 },
  "Gorakhpur": { x: 240, y: 260 },
  "Hamirpur": { x: 340, y: 400 },
  "Hapur": { x: 380, y: 180 },
  "Hardoi": { x: 290, y: 310 },
  "Hathras": { x: 440, y: 350 },
  "Jalaun": { x: 350, y: 380 },
  "Jaunpur": { x: 290, y: 300 },
  "Jhansi": { x: 340, y: 420 },
  "Kannauj": { x: 380, y: 320 },
  "Kanpur Dehat": { x: 340, y: 360 },
  "Kanpur Nagar": { x: 350, y: 350 },
  "Kasganj": { x: 420, y: 290 },
  "Kaushambi": { x: 300, y: 370 },
  "Kushinagar": { x: 250, y: 240 },
  "Lakhimpur Kheri": { x: 270, y: 250 },
  "Lucknow": { x: 250, y: 320 },
  "Mahoba": { x: 330, y: 430 },
  "Mahrajganj": { x: 220, y: 250 },
  "Mainpuri": { x: 410, y: 310 },
  "Mathura": { x: 460, y: 360 },
  "Mau": { x: 270, y: 260 },
  "Meerut": { x: 360, y: 170 },
  "Mirzapur": { x: 300, y: 320 },
  "Moradabad": { x: 370, y: 210 },
  "Muzaffarnagar": { x: 340, y: 170 },
  "Pilibhit": { x: 380, y: 230 },
  "Pratapgarh": { x: 260, y: 330 },
  "Prayagraj": { x: 300, y: 350 },
  "Raebareli": { x: 240, y: 330 },
  "Rampur": { x: 370, y: 220 },
  "Saharanpur": { x: 330, y: 140 },
  "Sambhal": { x: 380, y: 220 },
  "Sant Kabir Nagar": { x: 230, y: 270 },
  "Shahjahanpur": { x: 370, y: 250 },
  "Shamli": { x: 340, y: 160 },
  "Shravasti": { x: 170, y: 290 },
  "Siddharthnagar": { x: 210, y: 270 },
  "Sitapur": { x: 300, y: 280 },
  "Sonbhadra": { x: 300, y: 350 },
  "Sultanpur": { x: 250, y: 320 },
  "Unnao": { x: 280, y: 330 },
  "Varanasi": { x: 290, y: 290 },
};
