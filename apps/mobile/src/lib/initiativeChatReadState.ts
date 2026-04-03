import * as FileSystem from "expo-file-system/legacy";

const storagePath = `${FileSystem.documentDirectory ?? ""}cleansea-initiative-chat-read-state.json`;

export type InitiativeChatReadState = Record<string, string>;

async function readState(): Promise<InitiativeChatReadState> {
  if (!FileSystem.documentDirectory) {
    return {};
  }

  try {
    const file = await FileSystem.readAsStringAsync(storagePath);
    return JSON.parse(file) as InitiativeChatReadState;
  } catch {
    return {};
  }
}

async function writeState(state: InitiativeChatReadState) {
  if (!FileSystem.documentDirectory) {
    return;
  }

  await FileSystem.writeAsStringAsync(storagePath, JSON.stringify(state));
}

export async function getInitiativeChatReadState() {
  return readState();
}

export async function markInitiativeChatRead(
  initiativeId: string,
  timestamp: string
) {
  const state = await readState();
  state[initiativeId] = timestamp;
  await writeState(state);
  return state;
}
