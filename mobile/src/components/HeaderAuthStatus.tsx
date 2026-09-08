import { Pressable, Text } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { colors } from "@/lib/theme";

export function HeaderAuthStatus() {
  const { token, logout, loading } = useAuth();

  if (loading || !token) return null;

  return (
    <Pressable onPress={logout} hitSlop={8}>
      <Text style={{ color: colors.foreground, fontSize: 14 }}>Log out</Text>
    </Pressable>
  );
}
