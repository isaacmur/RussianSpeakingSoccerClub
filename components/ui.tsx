import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Warm-paper screen wrapper used by every route.
export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={["top", "left", "right"]}>
      <View className="flex-1 px-5">{children}</View>
    </SafeAreaView>
  );
}

// Condensed uppercase scoreboard heading.
export function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Text className="font-display text-3xl uppercase tracking-wide text-ink">
      {children}
    </Text>
  );
}

export function Subtle({ children }: { children: React.ReactNode }) {
  return <Text className="text-base text-mute">{children}</Text>;
}

type ButtonProps = PressableProps & {
  title: string;
  loading?: boolean;
  variant?: "primary" | "ghost";
};

export function Button({
  title,
  loading,
  variant = "primary",
  disabled,
  ...rest
}: ButtonProps) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      disabled={disabled || loading}
      className={[
        "h-12 items-center justify-center rounded-xl px-4",
        isPrimary ? "bg-pitch" : "border border-line bg-card",
        disabled || loading ? "opacity-50" : "",
      ].join(" ")}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? "#FFFFFF" : "#111A2E"} />
      ) : (
        <Text
          className={[
            "font-display text-lg uppercase tracking-wide",
            isPrimary ? "text-white" : "text-ink",
          ].join(" ")}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & { label: string };

export function Field({ label, ...rest }: FieldProps) {
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium uppercase tracking-wide text-mute">
        {label}
      </Text>
      <TextInput
        className="h-12 rounded-xl border border-line bg-card px-3 text-base text-ink"
        placeholderTextColor="#9CA3AF"
        {...rest}
      />
    </View>
  );
}
