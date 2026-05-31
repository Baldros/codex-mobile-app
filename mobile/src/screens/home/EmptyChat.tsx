import { ActivityIndicator, Text, View } from "react-native";

import { colors } from "../../theme/colors";
import { styles } from "./styles";

export function EmptyChat({
  isLoading,
  hasSelectedThread,
  hasWorkspace
}: {
  isLoading: boolean;
  hasSelectedThread: boolean;
  hasWorkspace: boolean;
}) {
  const title = isLoading ? "Loading conversation" : hasSelectedThread ? "No readable messages" : "New conversation";
  const text = isLoading
    ? "Fetching this thread history."
    : hasSelectedThread
      ? "This thread opened, but no text turns were returned by the bridge."
      : hasWorkspace
        ? "Send a message to create this conversation."
        : "Choose a repository and start a conversation.";

  return (
    <View style={styles.empty}>
      {isLoading ? <ActivityIndicator color={colors.accent} /> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}
