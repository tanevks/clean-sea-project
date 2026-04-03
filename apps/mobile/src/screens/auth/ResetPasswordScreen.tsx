import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { signOut, updatePassword } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { authStyles } from "./styles";

type Props = {
  onDone: () => void;
};

export function ResetPasswordScreen({ onDone }: Props) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function onSubmit() {
    setErrorMessage("");
    setMessage("");

    if (password.length < 8) {
      setErrorMessage(t.auth.passwordTooShort);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage(t.auth.passwordsDoNotMatch);
      return;
    }

    setIsSubmitting(true);
    const error = await updatePassword(password);
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage(t.auth.passwordUpdated);
    await signOut();
    onDone();
  }

  return (
    <View style={authStyles.container}>
      <Text style={authStyles.title}>{t.auth.resetTitle}</Text>
      {errorMessage ? (
        <Text style={authStyles.messageError}>{errorMessage}</Text>
      ) : null}
      {message ? <Text style={authStyles.messageSuccess}>{message}</Text> : null}

      <View style={authStyles.fieldGroup}>
        <Text style={authStyles.label}>{t.auth.newPasswordLabel}</Text>
        <View style={authStyles.passwordRow}>
          <TextInput
            secureTextEntry={!showPassword}
            placeholder={t.auth.newPasswordPlaceholder}
            style={authStyles.passwordInput}
            value={password}
            onChangeText={setPassword}
          />
          <Pressable
            style={authStyles.passwordToggle}
            onPress={() => setShowPassword((value) => !value)}
          >
            <Text style={authStyles.passwordToggleText}>
              {showPassword ? t.common.hide : t.common.show}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={authStyles.fieldGroup}>
        <Text style={authStyles.label}>{t.auth.confirmPasswordLabel}</Text>
        <View style={authStyles.passwordRow}>
          <TextInput
            secureTextEntry={!showConfirmPassword}
            placeholder={t.auth.confirmPasswordPlaceholder}
            style={authStyles.passwordInput}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
          <Pressable
            style={authStyles.passwordToggle}
            onPress={() => setShowConfirmPassword((value) => !value)}
          >
            <Text style={authStyles.passwordToggleText}>
              {showConfirmPassword ? t.common.hide : t.common.show}
            </Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={[
          authStyles.button,
          isSubmitting ? authStyles.buttonDisabled : null
        ]}
        onPress={() => void onSubmit()}
        disabled={isSubmitting}
      >
        <Text style={authStyles.buttonText}>{t.auth.resetButton}</Text>
      </Pressable>
    </View>
  );
}
