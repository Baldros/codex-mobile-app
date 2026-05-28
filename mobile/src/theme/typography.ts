import { Text, TextInput } from "react-native";

export const fontFamily = "Inter";

export const fontWeights = {
  body: "400",
  label: "500",
  subtitle: "600",
  action: "700",
  title: "700"
} as const;

let defaultsApplied = false;

export function applyDefaultTypography() {
  if (defaultsApplied) {
    return;
  }
  defaultsApplied = true;
  applyDefaultStyle(Text as unknown as DefaultStyleComponent, { fontFamily });
  applyDefaultStyle(TextInput as unknown as DefaultStyleComponent, { fontFamily });
}

type DefaultStyleComponent = {
  defaultProps?: Record<string, unknown>;
};

function applyDefaultStyle(component: DefaultStyleComponent, style: Record<string, unknown>) {
  component.defaultProps = component.defaultProps ?? {};
  const currentStyle = component.defaultProps.style;
  component.defaultProps.style = currentStyle ? [style, currentStyle] : style;
}
