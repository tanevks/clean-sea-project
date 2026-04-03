import * as FileSystem from "expo-file-system/legacy";

const storagePath = `${FileSystem.documentDirectory ?? ""}cleansea-chat-read-state.json`;

export type ChatReadState = Record<string, string>;

async function readState(): Promise<ChatReadState> {
  if (!FileSystem.documentDirectory) {
    return {};
  }

  try {
    const file = await FileSystem.readAsStringAsync(storagePath);
    return JSON.parse(file) as ChatReadState;
  } catch {
    return {};
  }
}

async function writeState(state: ChatReadState) {
  if (!FileSystem.documentDirectory) {
    return;
  }

  await FileSystem.writeAsStringAsync(storagePath, JSON.stringify(state));
}

export async function getChatReadState() {
  return readState();
}

export async function markReportChatRead(reportId: string, timestamp: string) {
  const state = await readState();
  state[reportId] = timestamp;
  await writeState(state);
  return state;
}
