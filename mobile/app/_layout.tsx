import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { BridgeProvider } from "../src/state/BridgeProvider";
import { colors } from "../src/theme/colors";
import { applyDefaultTypography } from "../src/theme/typography";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter: Inter_400Regular,
    "Inter-500": Inter_500Medium,
    "Inter-600": Inter_600SemiBold,
    "Inter-700": Inter_700Bold
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  applyDefaultTypography();

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
