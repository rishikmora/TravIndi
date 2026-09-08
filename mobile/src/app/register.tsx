import { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth, isApiError } from "@/lib/auth-context";
import type { AccountType } from "@/lib/api";
import { colors } from "@/lib/theme";

const ACCOUNT_TYPES: AccountType[] = ["tourist", "guide", "business"];

export default function RegisterScreen() {
  const { register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("tourist");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password, accountType);
      router.replace("/trips");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="you@example.com"
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.label}>Password (min 8 characters)</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.label}>Account type</Text>
      <View style={styles.segmented}>
        {ACCOUNT_TYPES.map((type) => (
          <Pressable
            key={type}
            style={[styles.segment, accountType === type && styles.segmentActive]}
            onPress={() => setAccountType(type)}
          >
            <Text style={[styles.segmentText, accountType === type && styles.segmentTextActive]}>
              {type[0].toUpperCase() + type.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={onSubmit}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>{submitting ? "Creating account…" : "Create account"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20, gap: 8 },
  label: { color: colors.foreground, fontSize: 14, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    color: colors.foreground,
    fontSize: 15,
  },
  segmented: { flexDirection: "row", gap: 8 },
  segment: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  segmentActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  segmentText: { color: colors.foreground, fontSize: 13 },
  segmentTextActive: { color: colors.accentText, fontWeight: "500" },
  error: { color: colors.danger, fontSize: 14, marginTop: 4 },
  button: {
    marginTop: 16,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.accentText, fontWeight: "500", fontSize: 15 },
});
