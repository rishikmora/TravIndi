import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * expo-secure-store has no web implementation (it throws), so the auth
 * token persistence needs a platform split: SecureStore's Keychain/Keystore
 * backing on native, localStorage when running under `expo start --web`.
 */
export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      return window.localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      window.localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      window.localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
