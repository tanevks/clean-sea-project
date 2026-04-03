import { NativeEventEmitter, NativeModules, Platform } from "react-native";

type ShareIntentPayload = {
  text: string;
};

type ShareIntentModuleShape = {
  getInitialSharedText: () => Promise<string | null>;
  clearSharedText: () => void;
};

const shareIntentModule = NativeModules.ShareIntentModule as
  | ShareIntentModuleShape
  | undefined;

const shareIntentEmitter =
  Platform.OS === "android" && shareIntentModule
    ? new NativeEventEmitter(NativeModules.ShareIntentModule)
    : null;

export async function getInitialSharedText() {
  if (Platform.OS !== "android" || !shareIntentModule) {
    return null;
  }

  return shareIntentModule.getInitialSharedText();
}

export function clearSharedText() {
  if (Platform.OS !== "android" || !shareIntentModule) {
    return;
  }

  shareIntentModule.clearSharedText();
}

export function subscribeToSharedText(listener: (text: string) => void) {
  if (!shareIntentEmitter) {
    return () => undefined;
  }

  const subscription = shareIntentEmitter.addListener(
    "ShareIntentReceived",
    (payload: ShareIntentPayload) => {
      if (payload?.text) {
        listener(payload.text);
      }
    }
  );

  return () => subscription.remove();
}
