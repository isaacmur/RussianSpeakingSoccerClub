import { Alert, Platform } from "react-native";

// RN's Alert is a silent no-op on react-native-web, so admin actions on the
// web build showed no dialogs and destructive confirms never fired. Fall back
// to the browser's native alert/confirm there.
export function notify(title: string, message: string) {
  if (Platform.OS === "web") window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void
) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Keep", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}
