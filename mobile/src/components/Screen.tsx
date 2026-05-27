import React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "../theme/colors";

export function Screen({ children, style, ...props }: ViewProps) {
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
      <View {...props} style={[styles.body, style]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background
  },
  body: {
    flex: 1,
    backgroundColor: colors.background
  }
});
