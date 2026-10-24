// Recount design tokens, mirrored from the web (recount-ui lab/b tokens.css).
// green = ONLY money saved / success. flag (red) = ONLY a problem on the bill. gold = only the logo handle.
import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { Lexend_400Regular, Lexend_500Medium, Lexend_600SemiBold } from "@expo-google-fonts/lexend";

export const C = {
  bg: "#ffffff",
  bg2: "#f6f3ff",
  surface: "#ffffff",
  line: "#e6e0f5",
  ink: "#2a004d",
  ink2: "#4f4566",
  brand: "#5b21b6",
  brandPressed: "#4a1a96",
  brandTint: "#eee9ff",
  onBrand: "#ffffff",
  lilac: "#b3a4ff",
  green: "#58cc02",
  greenDeep: "#46a302",
  greenTint: "#e5f9d4",
  greenInk: "#2b7000",
  flag: "#ff4b4b",
  flagTint: "#ffe6e6",
  flagInk: "#b3001b",
  gold: "#ffc800",
  secondaryEdge: "#d9cff5",
  disabled: "#cfc6e6",
};

export const FONTS = {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  Lexend_400Regular,
  Lexend_500Medium,
  Lexend_600SemiBold,
};

// Custom fonts carry their own weight: don't also set fontWeight (Android picks the wrong face).
export const F = {
  display600: "PlusJakartaSans_600SemiBold",
  display700: "PlusJakartaSans_700Bold",
  display800: "PlusJakartaSans_800ExtraBold",
  body: "Lexend_400Regular",
  body500: "Lexend_500Medium",
  body600: "Lexend_600SemiBold",
};
