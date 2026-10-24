// Recount mark: Lupa's lens, whose rim is a "count it again" return arrow (money coming back),
// held over a bill whose total line is struck through. Ported from the web Logo.tsx.
import Svg, { Circle, G, Path } from "react-native-svg";
import { Text, View } from "react-native";
import { C, F } from "./theme";

export function RecountMark({ size = 40 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* handle */}
      <Path d="M41 41 L55 55" stroke={C.gold} strokeWidth={9} strokeLinecap="round" />
      {/* lens glass */}
      <Circle cx={27} cy={27} r={19} fill={C.brandTint} />
      {/* bill lines inside the lens */}
      <G stroke={C.ink} strokeLinecap="round" strokeWidth={3.2}>
        <Path d="M18 20.5 H36" />
        <Path d="M18 27 H31" />
        <Path d="M18 33.5 H36" />
      </G>
      {/* the total, crossed out */}
      <Path d="M15.5 37.5 L38.5 29.5" stroke={C.flag} strokeWidth={3.6} strokeLinecap="round" />
      {/* rim = return arrow */}
      <Path d="M39.2 12.45 A19 19 0 1 1 20.5 9.15" fill="none" stroke={C.brand} strokeWidth={5} strokeLinecap="round" />
      <Path d="M27 7 L21.6 15.2 L17.4 4.2 Z" fill={C.brand} stroke={C.brand} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}

/** Mark + "Recount" wordmark, as in the web RecountLogo. */
export function RecountLogo({ size = 40, label = "Recount" }) {
  const fontSize = Math.round(size * 0.62);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: Math.round(fontSize * 0.3) }} accessible accessibilityRole="header" accessibilityLabel={label}>
      <RecountMark size={size} />
      <Text style={{ fontFamily: F.display800, fontSize, lineHeight: Math.round(fontSize * 1.15), letterSpacing: -0.03 * fontSize, color: C.ink }}>{label}</Text>
    </View>
  );
}
