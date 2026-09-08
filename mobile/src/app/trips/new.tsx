import { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth, isApiError } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { colors } from "@/lib/theme";

export default function NewTripScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [budget, setBudget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.createTrip(
        { title: title || undefined, budget: budget ? Number(budget) : undefined },
        token
      );
      router.replace("/trips");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Could not create the trip.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Delhi weekend"
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.label}>Budget (INR, optional)</Text>
      <TextInput
        style={styles.input}
        value={budget}
        onChangeText={setBudget}
        keyboardType="numeric"
        placeholderTextColor={colors.muted}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={onSubmit}
        disabled={submitting}
      >
        <Text style={styles.buttonText}>{submitting ? "Creating…" : "Create trip"}</Text>
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
