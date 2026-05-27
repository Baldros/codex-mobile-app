import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { BridgeProvider } from "../src/state/BridgeProvider";
import { colors } from "../src/theme/colors";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <BridgeProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: colors.background
            }
          }}
        />
      </BridgeProvider>
    </SafeAreaProvider>
  );
}
