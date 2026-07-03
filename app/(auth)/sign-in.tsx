import { Link } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { Button, Field, Heading, Screen, Subtle } from "@/components/ui";
import { supabase } from "@/lib/supabase";

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
      <View className="flex-1 justify-center gap-6">
        <View className="gap-1">
          <Heading>Weekend League</Heading>
          <Subtle>Sign in to your account</Subtle>
        </View>

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
          <Link href="/(auth)/sign-up" className="text-base font-semibold text-pitch">
            Create one
          </Link>
        </View>
      </View>
    </Screen>
  );
}
