import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { sendPasswordReset } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { authStyles } from "./styles";

type Props = {
  onBackToLogin: () => void;
};

export function ForgotPasswordScreen({ onBackToLogin }: Props) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit() {
    setErrorMessage("");
    setMessage("");

    if (!email.trim()) {
      setErrorMessage(t.auth.emailRequired);
      return;
    }

    setIsSubmitting(true);
    const error = await sendPasswordReset(email.trim());
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setMessage(t.auth.resetLinkSent);
  }

  return (
    <View style={authStyles.container}>
      <Text style={authStyles.title}>{t.auth.forgotTitle}</Text>
      {errorMessage ? (
        <Text style={authStyles.messageError}>{errorMessage}</Text>
      ) : null}
      {message ? <Text style={authStyles.messageSuccess}>{message}</Text> : null}

      <View style={authStyles.fieldGroup}>
        <Text style={authStyles.label}>{t.auth.emailLabel}</Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder={t.auth.emailPlaceholder}
          style={authStyles.input}
          value={email}
          onChangeText={setEmail}
        />
      </View>

      <Pressable
        style={[authStyles.button, isSubmitting ? authStyles.buttonDisabled : null]}
        onPress={() => void onSubmit()}
        disabled={isSubmitting}
      >
        <Text style={authStyles.buttonText}>{t.auth.forgotButton}</Text>
      </Pressable>

      <Text style={authStyles.link} onPress={onBackToLogin}>
        {t.auth.backToLogin}
      </Text>
    </View>
  );
}
