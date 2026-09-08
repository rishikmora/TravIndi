import { useEffect, useState } from "react";
import { Link } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { api, type Destination } from "@/lib/api";
import { colors } from "@/lib/theme";

export default function DestinationsScreen() {
  const [destinations, setDestinations] = useState<Destination[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listDestinations()
      .then(setDestinations)
      .catch(() => setError("Could not load destinations."));
  }, []);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (destinations === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={destinations}
      keyExtractor={(d) => d.id}
      ListEmptyComponent={<Text style={styles.muted}>No destinations yet.</Text>}
      contentContainerStyle={{ gap: 12 }}
      renderItem={({ item }) => (
        <Link href={`/destinations/${item.id}`} asChild>
          <Pressable style={styles.card}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.muted}>{[item.city, item.state].filter(Boolean).join(", ")}</Text>
          </Pressable>
        </Link>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  muted: { color: colors.muted, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 16 },
  cardTitle: { color: colors.foreground, fontSize: 16, fontWeight: "500", marginBottom: 4 },
});
