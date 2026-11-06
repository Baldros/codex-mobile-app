import { isNearBottom } from "../src/screens/home/useStickyChatScroll";
import type { NativeScrollEvent } from "react-native";

function event(distance: number): NativeScrollEvent {
  return { contentOffset: { x: 0, y: 1000 - 400 - distance }, contentSize: { width: 0, height: 1000 },
    layoutMeasurement: { width: 0, height: 400 }, contentInset: { top: 0, left: 0, right: 0, bottom: 0 }, zoomScale: 1 };
}

test("follows only when within 64 pixels of the end", () => {
  expect(isNearBottom(event(64))).toBe(true);
  expect(isNearBottom(event(65))).toBe(false);
});
