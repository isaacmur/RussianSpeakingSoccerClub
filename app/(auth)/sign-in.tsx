import { Link } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { ParachuteJump } from "@/components/motif";
import { Button, Field, Heading, Screen, Subtle } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { palette } from "@/lib/theme";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    // On success the root layout redirects based on profile status; nothing
    // else to do here.
    if (error) Alert.alert("Sign in failed", error.message);
  };

  return (
    <Screen>
      <View className="flex-1 justify-center gap-7">
        {/* Coney Island's derelict tower. The one place the club's name appears. */}
        <View className="items-center">
          <ParachuteJump height={110} color={palette.line} />
        </View>

        <Heading kicker="Russian Speaking Soccer Club">Welcome back</Heading>

        <View className="gap-4">
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
            autoComplete="password"
            placeholder="••••••••"
          />
          <Button title="Sign in" onPress={onSubmit} loading={loading} />
        </View>

        <View className="flex-row justify-center gap-1">
          <Subtle>No account?</Subtle>
          <Link href="/(auth)/sign-up" className="font-body-semi text-base text-wonder">
            Create one
          </Link>
        </View>
      </View>
    </Screen>
  );
}
