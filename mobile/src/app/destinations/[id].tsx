import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { api, ApiError, type Attraction, type Destination } from "@/lib/api";
import { colors } from "@/lib/theme";

export default function DestinationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [destination, setDestination] = useState<Destination | null>(null);
  const [attractions, setAttractions] = useState<Attraction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getDestination(id)
      .then(setDestination)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setError("Destination not found.");
          return;
        }
        setError("Could not load this destination.");
      });
    api.listAttractions(id).then(setAttractions).catch(() => {});
  }, [id]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!destination) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={attractions}
      keyExtractor={(a) => a.id}
      contentContainerStyle={{ gap: 8, paddingBottom: 20 }}
      ListHeaderComponent={
        <View style={{ marginBottom: 16 }}>
          <Text style={styles.title}>{destination.name}</Text>
          <Text style={styles.muted}>{[destination.city, destination.state].filter(Boolean).join(", ")}</Text>
          <Text style={styles.sectionTitle}>Attractions</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.muted}>No attractions listed yet for this destination.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          {item.category && <Text style={styles.muted}>{item.category}</Text>}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  title: { color: colors.foreground, fontSize: 22, fontWeight: "600", marginBottom: 4 },
  sectionTitle: { color: colors.foreground, fontSize: 16, fontWeight: "500", marginTop: 20 },
  muted: { color: colors.muted, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 },
  cardTitle: { color: colors.foreground, fontSize: 15, fontWeight: "500", marginBottom: 2 },
});
