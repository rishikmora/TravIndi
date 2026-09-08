import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { api, type Trip } from "@/lib/api";
import { colors } from "@/lib/theme";

export default function TripsScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .listTrips(token)
      .then(setTrips)
      .catch(() => setError("Could not load your trips."));
  }, [token]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My trips</Text>
        <Pressable style={styles.newButton} onPress={() => router.push("/trips/new")}>
          <Text style={styles.newButtonText}>New trip</Text>
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {trips === null && !error && <Text style={styles.muted}>Loading…</Text>}
      <FlatList
        data={trips ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ gap: 12 }}
        ListEmptyComponent={
          trips !== null ? <Text style={styles.muted}>No trips yet — create your first one.</Text> : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardTitle}>{item.title ?? "Untitled trip"}</Text>
              <Text style={styles.status}>{item.status}</Text>
            </View>
            {item.budget != null && (
              <Text style={styles.muted}>
                Budget: {item.currency} {item.budget}
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.foreground, fontSize: 22, fontWeight: "600" },
  newButton: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16 },
  newButtonText: { color: colors.accentText, fontSize: 14, fontWeight: "500" },
  muted: { color: colors.muted, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 16 },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { color: colors.foreground, fontSize: 15, fontWeight: "500" },
  status: { color: colors.muted, fontSize: 11, textTransform: "uppercase" },
});
