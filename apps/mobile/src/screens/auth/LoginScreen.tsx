import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { signInWithEmail, signInWithGoogle, signOut } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { fetchProfile } from "../../lib/profileApi";
import { authStyles } from "./styles";

type Props = {
  onOpenSignUp: () => void;
  onOpenForgotPassword: () => void;
  onLoggedIn: () => void;
  noticeMessage?: string;
};

export function LoginScreen({
  onOpenSignUp,
  onOpenForgotPassword,
  onLoggedIn,
  noticeMessage
}: Props) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function ensureApprovedAccess() {
    try {
      await fetchProfile();
      return null;
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes("Account approval is pending.")
          ? "Профилът ви очаква одобрение от администратор."
          : error instanceof Error && error.message.includes("Account access was rejected.")
            ? "Достъпът до профила ви не е одобрен."
            : error instanceof Error && error.message.includes("Account is inactive.")
              ? "Профилът е деактивиран."
              : error instanceof Error
                ? error.message
                : "Профилът не може да бъде използван в момента.";

      await signOut();
      return message;
    }
  }

  async function onEmailLogin() {
    setErrorMessage("");
    if (!email.trim() || !password) {
      setErrorMessage(t.auth.emailPasswordRequired);
      return;
    }

    setIsSubmitting(true);
    const { error } = await signInWithEmail(email.trim(), password);
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const blockedMessage = await ensureApprovedAccess();
    if (blockedMessage) {
      setErrorMessage(blockedMessage);
      return;
    }
    onLoggedIn();
  }

  async function onGoogleLogin() {
    setErrorMessage("");
    setIsSubmitting(true);
    const { user, error, pendingExternalAuth } = await signInWithGoogle();
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }
    if (pendingExternalAuth) {
      return;
    }
    if (!user) {
      setErrorMessage(t.auth.googleCanceled);
      return;
    }

    const blockedMessage = await ensureApprovedAccess();
    if (blockedMessage) {
      setErrorMessage(blockedMessage);
      return;
    }

    onLoggedIn();
  }

  return (
    <View style={authStyles.container}>
      <Text style={authStyles.title}>{t.auth.loginTitle}</Text>
      {noticeMessage ? (
        <Text style={authStyles.messageSuccess}>{noticeMessage}</Text>
      ) : null}
      {errorMessage ? (
        <Text style={authStyles.messageError}>{errorMessage}</Text>
      ) : null}

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

      <View style={authStyles.fieldGroup}>
        <Text style={authStyles.label}>{t.auth.passwordLabel}</Text>
        <View style={authStyles.passwordRow}>
          <TextInput
            secureTextEntry={!showPassword}
            placeholder={t.auth.passwordPlaceholder}
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

      <Pressable
        style={[authStyles.button, isSubmitting ? authStyles.buttonDisabled : null]}
        onPress={() => void onEmailLogin()}
        disabled={isSubmitting}
      >
        <Text style={authStyles.buttonText}>{t.auth.loginButton}</Text>
      </Pressable>

      <Pressable
        style={[
          authStyles.button,
          authStyles.buttonSecondary,
          isSubmitting ? authStyles.buttonDisabled : null
        ]}
        onPress={() => void onGoogleLogin()}
        disabled={isSubmitting}
      >
        <Text style={[authStyles.buttonText, authStyles.buttonTextSecondary]}>
          {t.auth.googleButton}
        </Text>
      </Pressable>

      <Text style={authStyles.link} onPress={onOpenForgotPassword}>
        {t.auth.forgotLink}
      </Text>
      <Text style={authStyles.link} onPress={onOpenSignUp}>
        {t.auth.createAccountLink}
      </Text>
    </View>
  );
}
