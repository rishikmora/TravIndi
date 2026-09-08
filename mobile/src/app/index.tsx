import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { colors } from "@/lib/theme";

export default function Home() {
  const { token, me, loading } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Plan safer trips across India</Text>
      <Text style={styles.body}>
        AI-powered trip planning, crowd-aware safe routing, and a direct line to
        authorities when it matters. This is the Phase 11 mobile shell — built
        against the real Phase 8-10 backend (destination discovery and trip
        planning are live; AI planning, safe routing, and SOS land in later
        phases).
      </Text>

      {!loading && token && (
        <Text style={styles.muted}>Signed in as {me?.email ?? "…"}</Text>
      )}

      <View style={styles.actions}>
        <Link href="/destinations" asChild>
          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Explore destinations</Text>
          </Pressable>
        </Link>
        {!loading && token ? (
          <Link href="/trips" asChild>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>My trips</Text>
            </Pressable>
          </Link>
        ) : (
          <Link href="/register" asChild>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Create an account</Text>
            </Pressable>
          </Link>
        )}
      </View>
    </View>
  );
}

const buttonBase = { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999 } as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20, gap: 20 },
  title: { color: colors.foreground, fontSize: 26, fontWeight: "600" },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 14 },
  actions: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  primaryButton: { ...buttonBase, backgroundColor: colors.accent },
  primaryButtonText: { color: colors.accentText, fontWeight: "500", fontSize: 14 },
  secondaryButton: { ...buttonBase, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.foreground, fontSize: 14 },
});
