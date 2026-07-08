import { Link } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { ParachuteJump } from "@/components/motif";
import { Button, Field, Heading, Screen, Subtle } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { palette } from "@/lib/theme";

export default function SignUp() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!displayName.trim()) {
      Alert.alert("Name required", "Enter the name your teammates will see.");
      return;
    }
    setLoading(true);
    // display_name is read by the handle_new_user trigger to seed the profile.
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    setLoading(false);

    if (error) {
      Alert.alert("Sign up failed", error.message);
      return;
    }
    // With email confirmations off (local dev) a session is returned and the
    // root layout routes to the pending screen. With confirmations on, no
    // session yet — tell the user to check their inbox.
    if (!data.session) {
      Alert.alert(
        "Check your email",
        "Confirm your address, then sign in. An admin will review your request to join."
      );
    }
  };

  return (
    <Screen>
      <View className="flex-1 justify-center gap-7">
        <View className="items-center">
          <ParachuteJump height={110} color={palette.line} />
        </View>

        <Heading kicker="Admission by approval">Join the club</Heading>

        <View className="gap-4">
          <Field
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            placeholder="Alex Ivanov"
          />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            placeholder="At least 6 characters"
          />
          <Button title="Create account" onPress={onSubmit} loading={loading} />
        </View>

        <View className="flex-row justify-center gap-1">
          <Subtle>Already have an account?</Subtle>
          <Link href="/(auth)/sign-in" className="font-body-semi text-base text-wonder">
            Sign in
          </Link>
        </View>
      </View>
    </Screen>
  );
}
