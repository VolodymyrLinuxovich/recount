// Lupa, Recount's assistant: a refined lens avatar, no face. Ported from the web Lupa.tsx.
// Idle is still; "think" pulses the ring slowly (the web glint sweep is left out on mobile).
import { useEffect, useId, useState } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from "react-native-svg";
import { C } from "./theme";

export function Lupa({ mood = "idle", size = 40 }) {
  const clip = `rc-lupa-${useId().replace(/:/g, "")}`;
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (mood !== "think") {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [mood, pulse]);
  return (
    <Animated.View style={{ width: size, height: size, opacity: pulse }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg viewBox="0 0 48 48" width={size} height={size}>
        <Defs>
          <ClipPath id={clip}>
            <Circle cx={21} cy={21} r={12.5} />
          </ClipPath>
        </Defs>
        <Path d="M30.5 30.5 L38 38" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
        <Circle cx={21} cy={21} r={12.5} fill={C.brandTint} />
        <G clipPath={`url(#${clip})`}>
          <Rect x={2} y={-6} width={6} height={60} fill="#ffffff" opacity={0} transform="rotate(35 21 21)" />
        </G>
        <Circle cx={21} cy={21} r={12.5} stroke={C.brand} strokeWidth={3.5} fill="none" />
        <Path d="M21 15.5 L22.4 19.6 L26.5 21 L22.4 22.4 L21 26.5 L19.6 22.4 L15.5 21 L19.6 19.6 Z" fill={C.brand} />
      </Svg>
    </Animated.View>
  );
}
