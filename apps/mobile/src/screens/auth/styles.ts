import { StyleSheet } from "react-native";

export const authStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f5f6f8"
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 20
  },
  fieldGroup: {
    marginBottom: 12
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 6
  },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0",
    borderRadius: 12
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  passwordToggle: {
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  passwordToggleText: {
    color: "#0b6bcb",
    fontWeight: "700",
    fontSize: 13
  },
  button: {
    backgroundColor: "#0b6bcb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10
  },
  buttonSecondary: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7dbe0"
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16
  },
  buttonTextSecondary: {
    color: "#111827"
  },
  buttonDisabled: {
    opacity: 0.6
  },
  link: {
    marginTop: 8,
    color: "#0b6bcb",
    textAlign: "center"
  },
  messageError: {
    color: "#b91c1c",
    marginBottom: 10
  },
  messageSuccess: {
    color: "#166534",
    marginBottom: 10
  }
});
