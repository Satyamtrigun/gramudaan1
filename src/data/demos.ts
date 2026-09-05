import type { Location } from "./locations";
import type { BusinessCategory } from "./businesses";

export interface DemoScenario {
  id: string;
  title: string;
  titleHi: string;
  description: string;
  icon: string;
  verdict: "good" | "caution" | "rethink";
  locationId: string;
  businessId: string;
  capital: number;
  highlight: string;
}

export const demoScenarios: DemoScenario[] = [
  {
    id: "demo-dairy-strong",
    title: "Dairy — Strong Opportunity",
    titleHi: "डेयरी — अच्छा अवसर",
    description: "A dairy business in a town with moderate competition and good market reach. Shows what a strong opportunity looks like.",
    icon: "🐄",
    verdict: "good",
    locationId: "loc-1",
    businessId: "dairy",
    capital: 100000,
    highlight: "Good potential with manageable competition",
  },
  {
    id: "demo-grocery-competition",
    title: "Grocery — High Competition",
    titleHi: "किराना — अधिक प्रतिस्पर्धा",
    description: "A grocery store in a densely populated area with many existing competitors. Demonstrates how the system handles saturated markets.",
    icon: "🏪",
    verdict: "caution",
    locationId: "loc-4",
    businessId: "grocery",
    capital: 50000,
    highlight: "Moderate potential despite high competition",
  },
  {
    id: "demo-poultry-underserved",
    title: "Poultry Feed — Underserved Market",
    titleHi: "मुर्गी चारा — कम सेवा वाला बाज़ार",
    description: "Poultry feed supply in an area with many poultry farms but very few suppliers. Shows a market gap opportunity.",
    icon: "🌾",
    verdict: "good",
    locationId: "loc-1",
    businessId: "poultry-feed",
    capital: 200000,
    highlight: "Clear market gap with low competition",
  },
  {
    id: "demo-scheme-edge",
    title: "₹6L — Scheme Limit Edge Case",
    titleHi: "₹6 लाख — योजना सीमा",
    description: "A ₹6 lakh contribution creates a ₹60 lakh project cost that exceeds the ₹50 lakh scheme limit. Tests the edge case handling.",
    icon: "⚠️",
    verdict: "caution",
    locationId: "loc-1",
    businessId: "dairy",
    capital: 600000,
    highlight: "Demonstrates scheme limit exceeded handling",
  },
];
