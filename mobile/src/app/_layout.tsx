import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { HeaderAuthStatus } from "@/components/HeaderAuthStatus";
import { colors } from "@/lib/theme";

function RootNavigator() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        contentStyle: { backgroundColor: colors.background },
        headerRight: () => <HeaderAuthStatus />,
      }}
    >
      <Stack.Screen name="index" options={{ title: "TravIndi" }} />
      <Stack.Screen name="login" options={{ title: "Log in" }} />
      <Stack.Screen name="register" options={{ title: "Create account" }} />
      <Stack.Screen name="destinations/index" options={{ title: "Destinations" }} />
      <Stack.Screen name="destinations/[id]" options={{ title: "Destination" }} />
      <Stack.Protected guard={!!token}>
        <Stack.Screen name="trips/index" options={{ title: "My trips" }} />
        <Stack.Screen name="trips/new" options={{ title: "New trip" }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
        <StatusBar style="light" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
