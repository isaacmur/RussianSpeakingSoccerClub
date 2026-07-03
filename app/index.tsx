import { ActivityIndicator, View } from "react-native";

// Entry route. The RouteGuard in _layout.tsx immediately redirects to the
// correct group based on session + profile status, so this just holds a
// spinner for the moment before that runs.
export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-chalk">
      <ActivityIndicator color="#1F7A46" />
    </View>
  );
}
